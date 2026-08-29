// W2 — every US spinoff 2016-2026, from SEC filings, with the date each became public.
//
// WHY FORM 10-12B: a spinoff distributes shares of a subsidiary to the parent's holders. The
// subsidiary must register those shares for exchange listing, and it does that on Form 10-12B. The
// form is filed by the SPINCO ITSELF, weeks to months before the distribution. So the registrant is
// the company we would buy, and `Date Filed` is a hard point-in-time stamp — this calendar cannot
// leak future information, because it is built from the date the market learned.
//
// WHY THE EDGAR FULL INDEX rather than full-text search: the quarterly index is the COMPLETE record
// of every filing made in that quarter. Full-text search is ranked and capped, which would silently
// bias the sample toward well-known names — the exact defect this program keeps finding.
//
// HONEST PRIOR, recorded before any result: Cusatis/Miles/Woolridge (1993) found spinoffs beating
// matched controls by ~76% over 36 months, but McConnell & Ovtchinnikov (2004) showed the effect is
// driven by a small number of outliers, and post-2000 replications find it much weaker or absent as
// the trade became known. SNDK (+4,065%) is ONE event and proves nothing on its own. This calendar
// exists to test the population, not to confirm the anecdote.
//
// Network: SEC only (public, no key). Writes data/events/spinoffs.json. No DB writes.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
const SPACING_MS = 130; // SEC asks for <10 req/s; this is ~7.7/s
const OUT_DIR = path.join(process.cwd(), 'data', 'events');
const OUT = path.join(OUT_DIR, 'spinoffs.json');
/** Registration of a class of securities for listing on a national exchange — the spinoff form. */
const FORMS = new Set(['10-12B', '10-12B/A']);

export interface SpinoffFiling {
  cik: string;
  company: string;
  form: string;
  /** The point-in-time stamp. Everything downstream keys off this, never off a distribution date. */
  filed: string;
  accession: string;
  /** Resolved later from SEC submissions; null when the registrant never got a ticker we can map. */
  ticker: string | null;
  exchange: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function quarterIndex(year: number, q: number): Promise<SpinoffFiling[]> {
  const url = `https://www.sec.gov/Archives/edgar/full-index/${year}/QTR${q}/master.idx`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(120_000) });
  if (res.status === 403 || res.status === 404) return [];
  if (!res.ok) throw new Error(`${year}Q${q}: HTTP ${res.status}`);
  const text = await res.text();
  const out: SpinoffFiling[] = [];
  for (const line of text.split('\n')) {
    // CIK|Company Name|Form Type|Date Filed|Filename
    const parts = line.split('|');
    if (parts.length < 5) continue;
    const [cik, company, form, filed, filename] = parts;
    if (!FORMS.has(form.trim())) continue;
    out.push({
      cik: cik.trim().padStart(10, '0'),
      company: company.trim(),
      form: form.trim(),
      filed: filed.trim(),
      accession: filename.trim().split('/').pop()?.replace('.txt', '') ?? '',
      ticker: null,
      exchange: null,
    });
  }
  return out;
}

/**
 * CIK -> ticker via the submissions endpoint. Deliberately NOT via company_tickers.json: that file
 * lists only CURRENTLY listed companies, so every spinco later acquired or delisted would resolve to
 * null — reintroducing survivorship bias into the event list itself. `submissions` keeps the tickers
 * of dead registrants.
 */
async function resolveTicker(cik: string): Promise<{ ticker: string | null; exchange: string | null }> {
  try {
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`,
      { headers: HEADERS, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return { ticker: null, exchange: null };
    const body = await res.json() as { tickers?: string[]; exchanges?: string[] };
    return {
      ticker: body.tickers?.[0]?.toUpperCase() ?? null,
      exchange: body.exchanges?.[0] ?? null,
    };
  } catch {
    // Never throw: one unresolvable registrant must not discard an entire quarter's work. This is
    // the same failure that killed a 324-symbol fetch at symbol 94 earlier in this program.
    return { ticker: null, exchange: null };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const startYear = 2016;
  const endYear = new Date().getUTCFullYear();

  // Resume support: re-running must not re-download 40 quarters.
  const existing: SpinoffFiling[] = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8')).filings ?? [] : [];
  const seen = new Set(existing.map((f) => f.accession));
  const filings: SpinoffFiling[] = [...existing];

  console.log(`EDGAR full-index sweep for ${Array.from(FORMS).join(', ')}  ${startYear}..${endYear}`);
  if (existing.length) console.log(`resuming with ${existing.length} filings already collected\n`);

  for (let y = startYear; y <= endYear; y += 1) {
    for (let q = 1; q <= 4; q += 1) {
      let found: SpinoffFiling[] = [];
      try {
        found = await quarterIndex(y, q);
      } catch (err) {
        console.log(`  ${y}Q${q}  FAILED ${err instanceof Error ? err.message : err}`);
        await sleep(SPACING_MS);
        continue;
      }
      const fresh = found.filter((f) => !seen.has(f.accession));
      for (const f of fresh) { seen.add(f.accession); filings.push(f); }
      if (found.length) console.log(`  ${y}Q${q}  ${String(found.length).padStart(3)} filings  (${fresh.length} new)`);
      await sleep(SPACING_MS);
    }
  }

  // Resolve tickers only for registrants we have not resolved yet.
  const needTicker = filings.filter((f) => f.ticker === null);
  const byCik = new Map<string, SpinoffFiling[]>();
  for (const f of needTicker) {
    if (!byCik.has(f.cik)) byCik.set(f.cik, []);
    byCik.get(f.cik)!.push(f);
  }
  console.log(`\nresolving tickers for ${byCik.size} distinct registrants`);
  let i = 0;
  for (const [cik, group] of Array.from(byCik.entries())) {
    const r = await resolveTicker(cik);
    for (const f of group) { f.ticker = r.ticker; f.exchange = r.exchange; }
    i += 1;
    if (i % 50 === 0) {
      console.log(`  ${i}/${byCik.size}`);
      // Checkpoint: a crash at registrant 300 must not discard 300 resolutions.
      writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), filings }, null, 0));
    }
    await sleep(SPACING_MS);
  }

  writeFileSync(OUT, JSON.stringify({ builtAt: new Date().toISOString(), filings }, null, 0));

  // Deduplicate to EVENTS: a spinco filing 10-12B then three amendments is one event, and the
  // ORIGINAL filing date is the one the market saw first.
  const events = new Map<string, SpinoffFiling>();
  for (const f of filings.slice().sort((a, b) => (a.filed < b.filed ? -1 : 1))) {
    if (!events.has(f.cik)) events.set(f.cik, f);
  }
  const withTicker = Array.from(events.values()).filter((e) => e.ticker);
  const nasdaq = withTicker.filter((e) => (e.exchange ?? '').toUpperCase().includes('NASDAQ'));

  console.log(`\nfilings           ${filings.length}`);
  console.log(`distinct events   ${events.size}`);
  console.log(`with a ticker     ${withTicker.length}`);
  console.log(`NASDAQ-listed     ${nasdaq.length}`);
  const byYear = new Map<string, number>();
  for (const e of Array.from(events.values())) {
    const y = e.filed.slice(0, 4);
    byYear.set(y, (byYear.get(y) ?? 0) + 1);
  }
  console.log('\nevents per year (by first 10-12B filing date)');
  for (const y of Array.from(byYear.keys()).sort()) console.log(`  ${y}  ${byYear.get(y)}`);
  console.log(`\nwritten -> ${OUT}`);

  const sndk = Array.from(events.values()).find((e) => e.ticker === 'SNDK');
  console.log(`\nSNDK in the calendar: ${sndk ? `YES — filed ${sndk.filed}, ${sndk.company}` : 'NO'}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
