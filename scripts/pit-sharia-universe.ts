// The compliant universe at any past date, screened by us rather than copied from an index.
//
// This replaces SPUS's N-PORT holdings as the point-in-time membership source, which removes the
// 60+ day quarterly publication lag every book measured today was penalised by, lets the window
// start in 2016 instead of 2020-11, and frees the universe from S&P 500 membership.
//
// POINT-IN-TIME, PER INPUT. Each of the five screening inputs is independently the latest fact whose
// `filed <= asOf`, taken from whichever filing supplied it. The earlier per-FILING assembly nulled
// an entire row when a filer stopped tagging one line item — Microsoft reports debt in its 2025 10-K
// and not its 2026 one, and the 2026 row came back with no debt at all even though a public 2025
// figure existed. `Tier2Inputs.asOf` is then the OLDEST contributing fact's period end, which is
// what the screener ages for staleness: "a screen is only as fresh as its weakest input."
//
// DEBT IS ASSEMBLED CAREFULLY. US-GAAP `LongTermDebt` is the total carrying amount INCLUDING current
// maturities, while `LongTermDebtNoncurrent` excludes them, so summing a total concept with a
// current one double-counts. 5 of 30 sampled symbols tag both. The rules below never sum a total
// with a current portion.
//
// The 30/30/5 arithmetic and the SIC sector exclusions are `computeAaoifiScreen`, imported
// unchanged. Nothing here re-implements a Sharia judgement.
import { computeAaoifiScreen, type Tier2Inputs } from '../src/quant/universe/tier2AaoifiScreener';
import { readFactsCache, type FactsCache, type SymbolFacts, type Fact } from './backfill-sharia-facts';

export interface PriceLookup { closeAt(symbol: string, date: string): number | null }

/** Latest fact already public at `asOf`. Facts arrive sorted by period end. */
export function factAt(facts: readonly Fact[] | undefined, asOf: string): Fact | null {
  if (!facts?.length) return null;
  let best: Fact | null = null;
  for (const f of facts) {
    if (f.filed > asOf) continue; // not public yet at the decision date
    if (!best || f.end > best.end) best = f;
  }
  return best;
}

const val = (f: Fact | null) => (f ? f.val : null);

/**
 * Interest-bearing debt, without double counting.
 *  1. a single combined total, used alone;
 *  2. otherwise a NONCURRENT long-term figure plus the current portion;
 *  3. otherwise a TOTAL long-term figure alone (it already contains current maturities);
 *  4. otherwise the current portion alone.
 */
export function debtAt(sf: SymbolFacts, asOf: string): { value: number | null; contributing: Fact[] } {
  const total = factAt(sf.groups.totalDebt?.facts, asOf);
  if (total) return { value: total.val, contributing: [total] };

  const ltnc = factAt(sf.groups.ltDebtNoncurrent?.facts, asOf);
  const cur = factAt(sf.groups.currentDebt?.facts, asOf);
  if (ltnc) return { value: ltnc.val + (cur?.val ?? 0), contributing: cur ? [ltnc, cur] : [ltnc] };

  const ltTotal = factAt(sf.groups.ltDebtTotal?.facts, asOf);
  if (ltTotal) return { value: ltTotal.val, contributing: [ltTotal] };

  if (cur) return { value: cur.val, contributing: [cur] };
  return { value: null, contributing: [] };
}

export interface ScreenOutcome { symbol: string; compliant: boolean; reasonCodes: string[] }

/** Screen one symbol at one date. Null when nothing was public yet or no price exists. */
export function screenSymbolAt(
  cache: FactsCache, prices: PriceLookup, symbol: string, asOf: string,
): ScreenOutcome | null {
  const sf = cache.symbols[symbol];
  if (!sf) return null;
  const close = prices.closeAt(symbol, asOf);
  if (close === null) return null;

  const debt = debtAt(sf, asOf);
  const cash = factAt(sf.groups.cash?.facts, asOf);
  const sec = factAt(sf.groups.shortTermSecurities?.facts, asOf);
  const revenue = factAt(sf.groups.revenue?.facts, asOf);
  const interest = factAt(sf.groups.interestIncome?.facts, asOf);
  const shares = factAt(sf.shares, asOf);

  const contributing = [...debt.contributing, cash, sec, revenue, interest, shares]
    .filter((f): f is Fact => Boolean(f));
  if (contributing.length === 0) return null;
  // The screen is only as fresh as its weakest input, so staleness is judged on the OLDEST fact.
  const oldestEnd = contributing.reduce((min, f) => (f.end < min ? f.end : min), contributing[0].end);

  const inputs: Tier2Inputs = {
    symbol,
    name: sf.name,
    sic: sf.sic,
    interestBearingDebtUsd: debt.value,
    cashAndInterestSecuritiesUsd: cash || sec ? (cash?.val ?? 0) + (sec?.val ?? 0) : null,
    marketCapUsd: shares && shares.val > 0 ? shares.val * close : null,
    nonCompliantIncomeUsd: val(interest),
    totalRevenueUsd: val(revenue),
    asOf: oldestEnd,
  };
  const r = computeAaoifiScreen(inputs, { referenceDate: new Date(`${asOf}T00:00:00.000Z`) });
  return { symbol, compliant: r.compliant, reasonCodes: r.reasonCodes };
}

/** Every symbol passing the screen at `asOf`. Fail-closed: unknown never means compliant. */
export function compliantUniverseAt(cache: FactsCache, prices: PriceLookup, asOf: string): string[] {
  const out: string[] = [];
  for (const symbol of Object.keys(cache.symbols)) {
    if (screenSymbolAt(cache, prices, symbol, asOf)?.compliant) out.push(symbol);
  }
  return out.sort();
}

/** Why names failed — a screen nobody inspects is a screen nobody trusts. */
export function screenBreakdownAt(cache: FactsCache, prices: PriceLookup, asOf: string) {
  const counts = new Map<string, number>();
  let compliant = 0; let noData = 0;
  for (const symbol of Object.keys(cache.symbols)) {
    const r = screenSymbolAt(cache, prices, symbol, asOf);
    if (!r) { noData += 1; continue; }
    if (r.compliant) { compliant += 1; continue; }
    for (const code of r.reasonCodes) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return { compliant, noData, reasons: Array.from(counts.entries()).sort((a, b) => b[1] - a[1]) };
}

export function loadFactsCacheOrExit(): FactsCache {
  const c = readFactsCache();
  if (!c) {
    console.error('No XBRL facts cache. Run: npx tsx scripts/backfill-sharia-facts.ts');
    process.exit(1);
  }
  return c;
}
