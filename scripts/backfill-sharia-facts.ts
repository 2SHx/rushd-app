// Raw XBRL fact cache for Sharia screening — fetch once, re-extract for free.
//
// WHY A CACHE: the previous archive baked one extraction into the fetch, so discovering that the
// concept aliases were too narrow meant re-downloading 315 companies to test a fix. This stores the
// candidate facts themselves, so alias and assembly changes become a local re-run.
//
// TWO DEFECTS THIS EXISTS TO FIX, both measured on a 30-symbol probe:
//
//   1. NARROW ALIASES. Production maps long-term debt to exactly ['LongTermDebt'] and current debt
//      to ['DebtCurrent']. Filers use LongTermDebtNoncurrent, DebtLongtermAndShorttermCombinedAmount,
//      ShortTermBorrowings and others. Widening recovered 24 of 30 symbols that previously had null
//      debt, and an interest-income concept for 9 of 12.
//
//   2. PER-FILING ASSEMBLY. Every input had to come from the SAME filing, so when a filer stops
//      tagging one line item the entire row nulls — Microsoft reports debt in its 2025 10-K and not
//      its 2026 one, and the 2026 row came back with no debt at all. Inputs are point-in-time
//      independent facts; each should be the latest one PUBLIC at the decision date, from whichever
//      filing supplied it. The screener already assumes this: `Tier2Inputs.asOf` is documented as
//      "the OLDEST contributing XBRL fact ... a screen is only as fresh as its weakest input".
//
// A THIRD DEFECT IS RECORDED BUT NOT FIXED HERE: US-GAAP `LongTermDebt` is the total carrying amount
// INCLUDING current maturities, while `LongTermDebtNoncurrent` excludes them. Summing `LongTermDebt`
// with `DebtCurrent` double-counts the current portion, and 5 of 30 sampled symbols tag both. The
// extraction below therefore prefers a single total-debt concept and only falls back to summing a
// NONCURRENT concept with a current one — it never sums a total with a current.
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveCik } from './backfill-gross-profitability';

export const FACTS_CACHE = path.join(process.cwd(), 'data', 'fundamentals', 'sharia-facts.json.gz');
const HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
const SPACING_MS = 130;

/** One annual fact: the period it describes, when it became public, and its value. */
export interface Fact { end: string; filed: string; val: number }

/** Concepts kept per symbol. Order inside each list is preference order. */
export const CONCEPTS = {
  totalDebt: ['DebtLongtermAndShorttermCombinedAmount'],
  ltDebtNoncurrent: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligationsNoncurrent'],
  ltDebtTotal: ['LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations'],
  currentDebt: ['DebtCurrent', 'LongTermDebtCurrent', 'ShortTermBorrowings', 'OtherShortTermBorrowings',
    'LongTermDebtAndCapitalLeaseObligationsCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  shortTermSecurities: ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesCurrent'],
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet',
    'RevenueFromContractWithCustomerIncludingAssessedTax'],
  interestIncome: ['InterestIncomeOther', 'InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend',
    'InvestmentIncomeNet', 'InterestAndDividendIncomeOperating', 'InterestIncomeOperating'],
} as const;

export type ConceptGroup = keyof typeof CONCEPTS;

export interface SymbolFacts {
  symbol: string;
  cik: string;
  name: string;
  sic: string | null;
  /** group -> the concept that supplied it -> its annual facts, oldest first. */
  groups: Partial<Record<ConceptGroup, { concept: string; facts: Fact[] }>>;
  shares: Fact[];
}

export interface FactsCache {
  fetchedAt: string;
  symbols: Record<string, SymbolFacts>;
  unresolved: { symbol: string; reason: string }[];
}

export function readFactsCache(): FactsCache | null {
  if (!existsSync(FACTS_CACHE)) return null;
  return JSON.parse(gunzipSync(readFileSync(FACTS_CACHE)).toString('utf8')) as FactsCache;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Annual (10-K/FY) USD facts for one concept, earliest filing per period end kept. */
function annualFacts(node: any, unit: 'USD' | 'shares' = 'USD'): Fact[] {
  const rows = node?.units?.[unit];
  if (!Array.isArray(rows)) return [];
  const byEnd = new Map<string, Fact>();
  for (const r of rows) {
    if (r.form !== '10-K' || r.fp !== 'FY') continue;
    if (typeof r.val !== 'number' || !r.end || !r.filed) continue;
    const prior = byEnd.get(r.end);
    // Earliest filing wins: a later restatement was not public at the time.
    if (!prior || r.filed < prior.filed) byEnd.set(r.end, { end: r.end, filed: r.filed, val: r.val });
  }
  return Array.from(byEnd.values()).sort((a, b) => a.end.localeCompare(b.end));
}

/**
 * Facts for a group, MERGED ACROSS EVERY ALIAS and keyed by period end.
 *
 * Picking a single winning concept is wrong and measurably so: filers migrate between tags, so an
 * alias abandoned in 2011 would be selected and then frozen there forever. That defect put Home
 * Depot's debt 4,898 days stale and Equity Residential's interest income 5,293 days stale, and
 * widening the alias lists made it WORSE because more aliases mean more chances to latch onto a
 * dead one. Merging by period end lets each year be supplied by whichever tag the filer actually
 * used that year, with earlier aliases winning only when several cover the same end.
 */
function pickGroup(gaap: any, keys: readonly string[]): { concept: string; facts: Fact[] } | undefined {
  const byEnd = new Map<string, Fact>();
  const used: string[] = [];
  for (const k of keys) {
    const facts = annualFacts(gaap?.[k]);
    if (!facts.length) continue;
    used.push(k);
    for (const f of facts) if (!byEnd.has(f.end)) byEnd.set(f.end, f); // earlier alias wins per end
  }
  if (byEnd.size === 0) return undefined;
  return {
    concept: used.join('+'),
    facts: Array.from(byEnd.values()).sort((a, b) => a.end.localeCompare(b.end)),
  };
}

async function main() {
  const { loadCapturedSpusNportSnapshots } = await import('../src/quant/universe/spusNport');
  const { nasdaqIngestRoster } = await import('../src/quant/universe/ingestRoster');

  const names = new Map<string, string>();
  for (const s of nasdaqIngestRoster()) names.set(s, '');
  for (const snap of loadCapturedSpusNportSnapshots() as any[]) {
    for (const h of snap.holdings ?? []) if (h.symbol) names.set(h.symbol, h.name ?? names.get(h.symbol) ?? '');
  }
  for (const skip of ['CASH&OTHER', 'SPUS', 'HLAL']) names.delete(skip);

  const tickers = await (await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS })).json() as any;
  const byTicker = new Map<string, { cik: number; title: string }>();
  for (const r of Object.values(tickers) as any[]) byTicker.set(r.ticker, { cik: r.cik_str, title: r.title });

  const symbols = Array.from(names.keys()).sort();
  const cache: FactsCache = readFactsCache() ?? { fetchedAt: new Date().toISOString(), symbols: {}, unresolved: [] };
  const have = new Set(Object.keys(cache.symbols));
  if (have.size) console.log(`resuming: ${have.size} already cached`);
  cache.unresolved = [];

  mkdirSync(path.dirname(FACTS_CACHE), { recursive: true });
  const flush = () => {
    cache.fetchedAt = new Date().toISOString();
    writeFileSync(FACTS_CACHE, gzipSync(Buffer.from(JSON.stringify(cache), 'utf8'), { level: 9 }));
  };

  console.log(`caching XBRL facts for ${symbols.length} symbols\n`);
  let done = 0;
  for (const symbol of symbols) {
    done += 1;
    const label = `${String(done).padStart(3)}/${symbols.length} ${symbol.padEnd(7)}`;
    if (have.has(symbol)) continue;
    try {
      const resolved = await resolveCik(symbol, names.get(symbol) ?? '', byTicker);
      await sleep(SPACING_MS);
      if (!resolved) { cache.unresolved.push({ symbol, reason: 'cik_unresolved' }); console.log(`${label} CIK UNRESOLVED`); continue; }

      const [factsRes, subRes] = await Promise.all([
        fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${resolved.cik}.json`, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }),
        fetch(`https://data.sec.gov/submissions/CIK${resolved.cik}.json`, { headers: HEADERS, signal: AbortSignal.timeout(60_000) }),
      ]);
      await sleep(SPACING_MS);
      if (!factsRes.ok) { cache.unresolved.push({ symbol, reason: `facts_http_${factsRes.status}` }); console.log(`${label} facts HTTP ${factsRes.status}`); continue; }
      const facts = await factsRes.json() as any;
      const sic = subRes.ok ? ((await subRes.json() as any)?.sic ?? null) : null;
      const gaap = facts?.facts?.['us-gaap'] ?? {};
      const dei = facts?.facts?.dei ?? {};

      const groups: SymbolFacts['groups'] = {};
      for (const g of Object.keys(CONCEPTS) as ConceptGroup[]) {
        const picked = pickGroup(gaap, CONCEPTS[g]);
        if (picked) groups[g] = picked;
      }
      const shares = annualFacts(dei.EntityCommonStockSharesOutstanding, 'shares').length
        ? annualFacts(dei.EntityCommonStockSharesOutstanding, 'shares')
        : annualFacts(gaap.CommonStockSharesOutstanding, 'shares');

      cache.symbols[symbol] = { symbol, cik: resolved.cik, name: resolved.name, sic: sic ? String(sic) : null, groups, shares };
      const present = Object.keys(groups).length;
      console.log(`${label} ${present}/8 groups  sic ${sic ?? '-'}  ${groups.revenue?.facts.length ?? 0} revenue yrs`);
      if (done % 25 === 0) flush();
    } catch (err) {
      cache.unresolved.push({ symbol, reason: String(err).slice(0, 50) });
      console.log(`${label} FAILED ${String(err).slice(0, 40)}`);
    }
  }
  flush();
  const size = readFileSync(FACTS_CACHE).byteLength;
  console.log(`\ncached ${Object.keys(cache.symbols).length}/${symbols.length}  ${(size / 1024).toFixed(0)}KB`);
  if (cache.unresolved.length) {
    console.log(`unresolved (${cache.unresolved.length}): ${cache.unresolved.map((u) => u.symbol).join(' ')}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
