// D2 input — quarterly revenue for every US filer, via SEC's XBRL frames API.
//
// WHY FRAMES: the per-company `companyfacts` endpoint would need 6,786 requests returning tens of
// megabytes each. `frames` inverts the query — one request returns ONE concept for ONE quarter
// across ALL filers (~2,000-2,700 companies). Forty-two quarters times a handful of revenue concepts
// is under 200 requests for the entire panel.
//
// TWO LIMITATIONS, both stated because they bound what the result can mean:
//
//   1. NOT AS-FIRST-REPORTED. Frames returns the value from the most recent filing covering that
//      period, so a restatement overwrites the original. Verified: ACME UNITED's CY2024Q1 revenue
//      carries accession 0000950170-25-065598 — a 2025 filing. The original number is not
//      recoverable from this endpoint.
//   2. NO FILING DATE. Frames gives `accn` but not `filed`, so true point-in-time availability is
//      not directly observable.
//
// The mitigation for (2) is a conservative fixed lag: a quarter ending E is treated as unavailable
// until E + AVAILABILITY_LAG_DAYS. 90 days exceeds the SEC's own 10-Q deadline (40-45 days), so the
// approximation delays the signal rather than advancing it.
//
// The mitigation for (1) is INTERPRETIVE, and it is the important one: both defects bias the test in
// FAVOUR of the strategy. A restated number is a cleaner number than the market had. So a
// FAILURE under these conditions is conclusive, and a SUCCESS is not — it would need re-testing on
// as-filed data before anyone acts on it. That asymmetry is why running the cheap version first is
// the right order of work.
//
// Network: SEC only. Writes data/fundamentals/revenue-frames.json.gz. No DB writes.
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
const SPACING_MS = 140;
export const REVENUE_CACHE = path.join(process.cwd(), 'data', 'fundamentals', 'revenue-frames.json.gz');
export const AVAILABILITY_LAG_DAYS = 90;

/**
 * Preference order. A filer tagging several of these in the same quarter is resolved by taking the
 * FIRST present, never by summing — these are alternative totals, not components, and adding them
 * would double-count revenue.
 */
const CONCEPTS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'Revenues',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'SalesRevenueNet',
];

/** cik -> 'YYYYQn' -> revenue */
export type RevenuePanel = Record<string, Record<string, number>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function frame(concept: string, cy: string): Promise<{ cik: number; val: number }[]> {
  const url = `https://data.sec.gov/api/xbrl/frames/us-gaap/${concept}/USD/${cy}.json`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(90_000) });
    if (res.status === 404) return []; // concept not reported in that frame at all
    if (res.status === 429) { await sleep(20_000); return frame(concept, cy); }
    if (!res.ok) return [];
    const body = await res.json() as { data?: { cik: number; val: number }[] };
    return body.data ?? [];
  } catch {
    return []; // never throw: one bad frame must not discard the sweep
  }
}

async function main() {
  mkdirSync(path.dirname(REVENUE_CACHE), { recursive: true });
  const panel: RevenuePanel = existsSync(REVENUE_CACHE)
    ? JSON.parse(gunzipSync(readFileSync(REVENUE_CACHE)).toString('utf8'))
    : {};

  const quarters: string[] = [];
  for (let y = 2015; y <= 2026; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      const label = `CY${y}Q${q}`;
      // Frames lag the calendar; anything past the current quarter simply 404s and is skipped.
      quarters.push(label);
    }
  }

  let filled = 0;
  for (const cy of quarters) {
    let newInQuarter = 0;
    for (const concept of CONCEPTS) {
      const rows = await frame(concept, cy);
      for (const r of rows) {
        const cik = String(r.cik);
        if (!panel[cik]) panel[cik] = {};
        // First concept in preference order wins; later ones never overwrite.
        const key = cy.slice(2); // 'CY2024Q1' -> '2024Q1'
        if (panel[cik][key] === undefined && Number.isFinite(r.val)) {
          panel[cik][key] = r.val;
          newInQuarter += 1;
        }
      }
      await sleep(SPACING_MS);
    }
    filled += newInQuarter;
    if (newInQuarter) console.log(`  ${cy}  +${newInQuarter} facts   (${Object.keys(panel).length} filers so far)`);
    writeFileSync(REVENUE_CACHE, gzipSync(Buffer.from(JSON.stringify(panel), 'utf8'), { level: 9 }));
  }

  const sizes = Object.values(panel).map((q) => Object.keys(q).length);
  console.log(`\nfilers            ${Object.keys(panel).length}`);
  console.log(`facts             ${filled}`);
  console.log(`median quarters   ${sizes.sort((a, b) => a - b)[Math.floor(sizes.length / 2)]}`);
  console.log(`cache             ${REVENUE_CACHE}`);
}

if (process.argv[1]?.includes('backfill-revenue-frames')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
