// Point-in-time gross-profits-to-assets, built from SEC XBRL company facts.
//
// WHY THIS FACTOR: momentum failed for three compounding reasons the literature already priced —
// long-only keeps ~half of it (Israel & Moskowitz 2013), publication removed ~58% (McLean & Pontiff
// 2016), and our 306%/month turnover is 6x the level above which anomalies stop surviving costs
// (Novy-Marx & Velikov 2016). Gross profitability inverts all three: it works on the long side, it
// turns over "only once every four years", and its study universe is "the 500 largest non-financial
// stocks" — close to the Sharia universe by construction, and Novy-Marx measures that EXCLUDING
// financials strengthens the spread rather than weakening it.
//
// THE POINT-IN-TIME RULE, which is the whole reason this file is careful: every XBRL fact carries
// `end` (the fiscal period it describes) and `filed` (when it became public). A decision on date D
// may only use facts with `filed <= D`. Filtering on `end <= D` is the classic look-ahead — a
// fiscal year ending in December is not public until the 10-K lands the following February or
// March. Both dates are preserved here so the consumer cannot get this wrong by accident.
//
// COVERAGE IS THE OTHER HALF: the panel deliberately includes names SPUS has since dropped. A
// factor measured only on companies that still exist repeats exactly the survivorship error this
// program just spent a day removing from its price data, so an unresolved symbol is reported
// loudly, never silently skipped.
//
// Writes to a compressed archive, not Postgres — same reasoning as the bar archive (382 bytes/row
// in Postgres against ~19 gzipped, on a 500MB free tier).
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const FUNDAMENTALS_ARCHIVE = path.join(process.cwd(), 'data', 'fundamentals', 'gross-profitability.json.gz');
const SEC_HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
/** SEC asks for <=10 requests/second. Stay clearly under it. */
const REQUEST_SPACING_MS = 130;

/** One annual observation, with BOTH dates kept so the PIT rule cannot be applied to the wrong one. */
export interface AnnualFact {
  /** Fiscal period end, YYYY-MM-DD. NOT usable as the point-in-time key. */
  end: string;
  /** EDGAR filing date, YYYY-MM-DD. THIS is the point-in-time key. */
  filed: string;
  grossProfit: number;
  assets: number;
  /** revenue - cogs when the filer did not tag GrossProfit directly. */
  derived: boolean;
}

export interface SymbolFundamentals {
  symbol: string;
  cik: string;
  name: string;
  annual: AnnualFact[];
}

export interface FundamentalsArchive {
  fetchedAt: string;
  symbols: Record<string, SymbolFundamentals>;
  unresolved: { symbol: string; name: string; reason: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url: string, timeoutMs = 60_000): Promise<any> {
  const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Resolve a ticker to a CIK. Current filers come from the ticker map; delisted ones no longer
 * appear there at all, so they fall back to a company-name search against EDGAR. */
export async function resolveCik(
  symbol: string,
  name: string,
  byTicker: Map<string, { cik: number; title: string }>,
): Promise<{ cik: string; name: string } | null> {
  const direct = byTicker.get(symbol);
  if (direct) return { cik: String(direct.cik).padStart(10, '0'), name: direct.title };
  if (!name) return null;

  const query = encodeURIComponent(name.replace(/[^A-Za-z0-9 &]/g, ' ').trim());
  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${query}`
    + '&type=10-K&dateb=&owner=include&count=5&output=atom';
  // NEVER THROWS. A timeout here once killed a 324-symbol backfill at symbol 94 and discarded
  // every completed fetch. An unresolvable name is a counted hole, not a fatal error.
  let xml: string;
  try {
    const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null;
    xml = await res.text();
  } catch {
    return null;
  }
  // A single unambiguous hit renders <company-info> with one <cik>. A multi-hit result page has no
  // company-info block, and guessing among candidates is exactly how the wrong company's financials
  // get attributed to a ticker — so ambiguity is reported, never resolved by picking the first.
  const cik = /<cik>(\d+)<\/cik>/.exec(xml)?.[1];
  const conformed = /<conformed-name>([^<]*)<\/conformed-name>/.exec(xml)?.[1];
  if (!cik) return null;
  return { cik: cik.padStart(10, '0'), name: conformed ?? name };
}

type UnitRows = { end?: string; val?: number; filed?: string; form?: string; fp?: string; start?: string }[];

function annualRows(concept: any): UnitRows {
  const units = concept?.units?.USD;
  if (!Array.isArray(units)) return [];
  return units.filter((r: any) => r.form === '10-K' && r.fp === 'FY' && r.filed && r.end);
}

/** Latest-filed value per fiscal end, so a restatement in a later 10-K does not overwrite what was
 * public at the time — the ORIGINAL filing is what a decision back then could see. */
function firstFiledByEnd(rows: UnitRows): Map<string, { val: number; filed: string }> {
  const out = new Map<string, { val: number; filed: string }>();
  for (const r of rows) {
    if (typeof r.val !== 'number' || !r.end || !r.filed) continue;
    const prior = out.get(r.end);
    if (!prior || r.filed < prior.filed) out.set(r.end, { val: r.val, filed: r.filed });
  }
  return out;
}

export function extractAnnual(facts: any): AnnualFact[] {
  const g = facts?.facts?.['us-gaap'] ?? {};
  const assets = firstFiledByEnd(annualRows(g.Assets));
  const grossDirect = firstFiledByEnd(annualRows(g.GrossProfit));

  // Fallback chain for filers that do not tag GrossProfit: revenue minus cost of revenue. Concept
  // names vary by filer and by era, so several aliases are tried in preference order.
  const revenue = firstFiledByEnd([
    ...annualRows(g.RevenueFromContractWithCustomerExcludingAssessedTax),
    ...annualRows(g.Revenues),
    ...annualRows(g.SalesRevenueNet),
  ]);
  const cogs = firstFiledByEnd([
    ...annualRows(g.CostOfGoodsAndServicesSold),
    ...annualRows(g.CostOfRevenue),
    ...annualRows(g.CostOfGoodsSold),
  ]);

  const out: AnnualFact[] = [];
  for (const [end, a] of Array.from(assets.entries())) {
    if (!(a.val > 0)) continue;
    const direct = grossDirect.get(end);
    let gp: number | null = direct ? direct.val : null;
    let filed = direct?.filed ?? a.filed;
    let derived = false;
    if (gp === null) {
      const r = revenue.get(end); const c = cogs.get(end);
      if (!r || !c) continue;
      gp = r.val - c.val;
      // The fact is only public once BOTH inputs are, so the later filing date governs.
      filed = [r.filed, c.filed, a.filed].sort().at(-1)!;
      derived = true;
    } else {
      filed = [filed, a.filed].sort().at(-1)!;
    }
    if (!Number.isFinite(gp)) continue;
    out.push({ end, filed, grossProfit: gp, assets: a.val, derived });
  }
  return out.sort((x, y) => x.end.localeCompare(y.end));
}

export function readFundamentals(): FundamentalsArchive | null {
  if (!existsSync(FUNDAMENTALS_ARCHIVE)) return null;
  return JSON.parse(gunzipSync(readFileSync(FUNDAMENTALS_ARCHIVE)).toString('utf8')) as FundamentalsArchive;
}

/** GP/A as of a decision date, using ONLY filings already public then. Null when nothing qualifies. */
export function grossProfitsToAssetsAt(sym: SymbolFundamentals | undefined, asOf: string): number | null {
  if (!sym) return null;
  let best: AnnualFact | null = null;
  for (const f of sym.annual) {
    if (f.filed > asOf) continue; // NOT yet public at the decision date
    if (!best || f.end > best.end) best = f;
  }
  if (!best || !(best.assets > 0)) return null;
  return best.grossProfit / best.assets;
}

async function main() {
  const { loadCapturedSpusNportSnapshots } = await import('../src/quant/universe/spusNport');
  const { nasdaqIngestRoster } = await import('../src/quant/universe/ingestRoster');

  // The panel is every name SPUS has EVER disclosed holding, plus today's roster — deliberately
  // including the 108 it has since dropped.
  const names = new Map<string, string>();
  for (const s of nasdaqIngestRoster()) names.set(s, '');
  for (const snap of loadCapturedSpusNportSnapshots() as any[]) {
    for (const h of snap.holdings ?? []) if (h.symbol) names.set(h.symbol, h.name ?? names.get(h.symbol) ?? '');
  }
  // Not companies: a cash line and the two ETFs the engine holds as benchmark series.
  for (const skip of ['CASH&OTHER', 'SPUS', 'HLAL']) names.delete(skip);

  const tickerMap = await fetchJson('https://www.sec.gov/files/company_tickers.json');
  const byTicker = new Map<string, { cik: number; title: string }>();
  for (const r of Object.values(tickerMap) as any[]) byTicker.set(r.ticker, { cik: r.cik_str, title: r.title });

  const symbols = Array.from(names.keys()).sort();
  console.log(`resolving + fetching ${symbols.length} symbols from SEC XBRL\n`);

  const archive: FundamentalsArchive = { fetchedAt: new Date().toISOString(), symbols: {}, unresolved: [] };
  let done = 0;
  for (const symbol of symbols) {
    done += 1;
    const label = `${String(done).padStart(3)}/${symbols.length} ${symbol.padEnd(7)}`;
    try {
      const resolved = await resolveCik(symbol, names.get(symbol) ?? '', byTicker);
      await sleep(REQUEST_SPACING_MS);
      if (!resolved) {
        archive.unresolved.push({ symbol, name: names.get(symbol) ?? '', reason: 'cik_unresolved' });
        console.log(`${label} CIK UNRESOLVED`);
        continue;
      }
      const facts = await fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${resolved.cik}.json`);
      await sleep(REQUEST_SPACING_MS);
      const annual = extractAnnual(facts);
      if (annual.length === 0) {
        archive.unresolved.push({ symbol, name: resolved.name, reason: 'no_annual_gp_and_assets' });
        console.log(`${label} no usable annual facts (CIK ${resolved.cik})`);
        continue;
      }
      archive.symbols[symbol] = { symbol, cik: resolved.cik, name: resolved.name, annual };
      const last = annual[annual.length - 1];
      console.log(`${label} ${String(annual.length).padStart(2)} years  ${annual[0].end} .. ${last.end}`
        + `  GP/A ${(last.grossProfit / last.assets).toFixed(3)}${last.derived ? ' (derived)' : ''}`);
    } catch (err) {
      archive.unresolved.push({ symbol, name: names.get(symbol) ?? '', reason: String(err).slice(0, 60) });
      console.log(`${label} FAILED ${String(err).slice(0, 50)}`);
    }
  }

  mkdirSync(path.dirname(FUNDAMENTALS_ARCHIVE), { recursive: true });
  const gz = gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'), { level: 9 });
  writeFileSync(FUNDAMENTALS_ARCHIVE, gz);

  const covered = Object.keys(archive.symbols).length;
  console.log(`\ncovered ${covered}/${symbols.length} symbols  (${(covered / symbols.length * 100).toFixed(1)}%)`);
  console.log(`${(gz.byteLength / 1024).toFixed(0)}KB written to ${FUNDAMENTALS_ARCHIVE}`);
  if (archive.unresolved.length) {
    console.log(`\nUNRESOLVED (${archive.unresolved.length}) — each one is a hole that reintroduces survivorship:`);
    for (const u of archive.unresolved) console.log(`  ${u.symbol.padEnd(8)} ${u.reason.padEnd(28)} ${u.name}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
