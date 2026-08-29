// Measures how much of `halal-fast-momentum-core@v1`'s backtested return is survivorship bias.
//
// THE EXPERIMENT: run one identical rule over one identical window against two candidate universes.
//   A (BIASED, status quo) — today's roster at every past decision date. Every name in it survived
//       to 2026 by construction, so the backtest could only ever pick winners that still exist.
//   B (POINT-IN-TIME)      — SPUS's disclosed holdings as of the most recent N-PORT filing that was
//       PUBLIC at the decision date (`availableAt <= asOf`, never `reportDate <= asOf`: N-PORT is
//       accepted ~60 days after the period it covers, so filtering on reportDate would hand the
//       book a filing that did not exist yet — the classic look-ahead).
// The gap between them is the bias. Nothing else differs.
//
// The selection and sizing math is IMPORTED from the production strategy, not reimplemented, so
// this measures the real rule. Only `stdev` is copied, verbatim, because it is private there.
//
// Reads bars from the on-disk archive (scripts/backfill-alpaca-sip.ts) and touches no database.
// Alpaca's SIP feed supplies delisted names, which is what makes B possible at all — Yahoo, the
// current ingest source, returns "Not Found" for them.
//
// This is a BIAS MEASUREMENT, not a terminal card. It does not preregister, deflate, or promote
// anything, and its numbers must never be quoted as a strategy result.
import { dualMomentumMetrics } from '../src/quant/strategies/dualMomentumRotation';
import { inverseVolatilityWeights } from '../src/quant/strategies/halalRiskParityCore';
import { selectTopNByMomentum, HALAL_FAST_MOMENTUM_CORE_V1 as P } from '../src/quant/strategies/halalFastMomentumCore';
import { dailyReturns } from '../src/quant/portfolio/frontier';
import { loadCapturedSpusNportSnapshots } from '../src/quant/universe/spusNport';
import { nasdaqIngestRoster } from '../src/quant/universe/ingestRoster';
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

/** Sample (n-1) standard deviation — copied verbatim from halalFastMomentumCore.ts (private there). */
/**
 * WINDOW PARITY — currently holds BY CONSTRUCTION, not by assertion.
 *
 * The measurement calendar here is bounded by point-in-time SPUS N-PORT membership (first snapshot
 * public 2020-07-28), which begins LATER than SPUS itself started trading (2019-12-18). So the
 * benchmark covers every session the strategy arms are measured over, and the "vs SPUS" column is a
 * like-for-like comparison.
 *
 * That is an accident of the current universe source. `measure-nasdaq-wide-momentum.ts` built its
 * universe from the full bar archive instead, could therefore be asked for a window starting 2017-01,
 * and silently compared 116 months of strategy against 81 months of benchmark — the numbers reached
 * the owner before anyone noticed. If the universe source here is ever loosened past 2019-12-18, use
 * `assertWindowParity` from scripts/lib/research-assertions.ts.
 */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

const COST_PER_SIDE = 0.0015; // 15bps, the engine's frozen cost constant
const SLEEVE_MAX = P.maxNames; // 60, the C1-verified dollar-volume sleeve size
const DV_LOOKBACK = 20; // trailing sessions for the dollar-volume sleeve rank

interface Series { dates: string[]; close: number[]; dollarVol: number[]; index: Map<string, number> }

function loadSeries(): Map<string, Series> {
  const out = new Map<string, Series>();
  for (const symbol of listArchivedSymbols()) {
    const archive = readArchive(symbol);
    if (!archive || archive.bars.length === 0) continue;
    const bars: ArchivedBar[] = archive.bars;
    const index = new Map<string, number>();
    bars.forEach((b, i) => index.set(b.d, i));
    out.set(symbol, {
      dates: bars.map((b) => b.d),
      close: bars.map((b) => b.c),
      dollarVol: bars.map((b) => b.c * b.v),
      index,
    });
  }
  return out;
}

/** PIT membership: for each date, the holdings of the newest filing already public at that date. */
function buildPitMembership(): { availableAt: string; symbols: string[] }[] {
  const snaps = (loadCapturedSpusNportSnapshots() as any[]).map((s) => ({
    availableAt: (s.availableAt instanceof Date ? s.availableAt.toISOString() : String(s.availableAt)).slice(0, 10),
    symbols: (s.holdings ?? []).map((h: any) => h.symbol).filter(Boolean) as string[],
  }));
  return snaps.sort((a, b) => a.availableAt.localeCompare(b.availableAt));
}

function pitUniverseAt(timeline: { availableAt: string; symbols: string[] }[], date: string): string[] | null {
  let chosen: string[] | null = null;
  for (const entry of timeline) {
    if (entry.availableAt <= date) chosen = entry.symbols; else break;
  }
  return chosen;
}

/** Week-end rebalance dates: the last session of each ISO week present in the calendar. */
function weekEndDates(calendar: string[]): string[] {
  const lastOfWeek = new Map<string, string>();
  for (const d of calendar) {
    const dt = new Date(`${d}T00:00:00Z`);
    // ISO week key: Thursday of the same week determines the ISO year+week.
    const day = (dt.getUTCDay() + 6) % 7; // Mon=0
    const thursday = new Date(dt); thursday.setUTCDate(dt.getUTCDate() - day + 3);
    const key = `${thursday.getUTCFullYear()}-${thursday.toISOString().slice(5, 10)}`;
    lastOfWeek.set(key, d);
  }
  return Array.from(lastOfWeek.values()).sort();
}

interface RunResult {
  label: string;
  nav: { d: string; v: number }[];
  cagr: number; maxDD: number; sharpe: number;
  rebalances: number; distinctHeld: number; weeksInCash: number;
  turnoverSum: number; costDrag: number;
  heldEver: Set<string>;
}

function runBook(
  label: string,
  series: Map<string, Series>,
  calendar: string[],
  rebalDates: string[],
  universeAt: (date: string) => string[] | null,
  /** Overrides the strategy decision. The control uses it to hold a fixed book. */
  decider: (series: Map<string, Series>, universe: readonly string[], asOf: string) => Map<string, number> = decide,
): RunResult {
  let nav = 1;
  let weights = new Map<string, number>();
  const navPath: { d: string; v: number }[] = [];
  const heldEver = new Set<string>();
  let rebalances = 0; let weeksInCash = 0; let turnoverSum = 0; let costDrag = 0;
  const rebalSet = new Set(rebalDates);

  for (let t = 1; t < calendar.length; t += 1) {
    const prev = calendar[t - 1];
    const today = calendar[t];

    // 1. Drift yesterday's book forward one session.
    //    Weights are fractions of NAV, so after a day in which the book returns `growth`, position
    //    i's new weight is w_i(1+r_i)/(1+growth) — the (1+growth) divisor is what keeps the book
    //    (positions + cash) summing to 1. Omitting it lets weights inflate with NAV, which both
    //    breaks the cash residual and overstates turnover at the next rebalance.
    let growth = 0;
    const grown = new Map<string, number>();
    for (const [sym, w] of Array.from(weights.entries())) {
      const s = series.get(sym);
      const i = s?.index.get(today); const j = s?.index.get(prev);
      // A name with no bar today (halted, or delisted mid-week) holds its last value: no return,
      // no forced sale. It is dropped at the next rebalance when it fails the sleeve/rank tests.
      if (!s || i === undefined || j === undefined) { grown.set(sym, w); continue; }
      const r = s.close[i] / s.close[j] - 1;
      growth += w * r;
      grown.set(sym, w * (1 + r));
    }
    nav *= 1 + growth;
    weights = new Map();
    for (const [sym, v] of Array.from(grown.entries())) weights.set(sym, v / (1 + growth));

    // 2. Rebalance at week end.
    if (rebalSet.has(today)) {
      rebalances += 1;
      const universe = universeAt(today);
      const target = universe ? decider(series, universe, today) : new Map<string, number>();
      if (target.size === 0) weeksInCash += 1;
      for (const sym of Array.from(target.keys())) heldEver.add(sym);

      let turnover = 0;
      const names = new Set([...Array.from(weights.keys()), ...Array.from(target.keys())]);
      for (const sym of Array.from(names)) turnover += Math.abs((target.get(sym) ?? 0) - (weights.get(sym) ?? 0));
      turnoverSum += turnover;
      costDrag += turnover * COST_PER_SIDE;
      nav *= 1 - turnover * COST_PER_SIDE;
      weights = target;
    }
    navPath.push({ d: today, v: nav });
  }

  // Metrics.
  const years = navPath.length / 252;
  const cagr = years > 0 ? nav ** (1 / years) - 1 : 0;
  let peak = -Infinity; let maxDD = 0;
  for (const p of navPath) { peak = Math.max(peak, p.v); maxDD = Math.max(maxDD, 1 - p.v / peak); }
  const rets: number[] = [];
  for (let i = 1; i < navPath.length; i += 1) rets.push(navPath[i].v / navPath[i - 1].v - 1);
  const mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = stdev(rets);
  const sharpe = sd > 0 ? (mu / sd) * Math.sqrt(252) : 0;

  return { label, nav: navPath, cagr, maxDD, sharpe, rebalances, distinctHeld: heldEver.size, weeksInCash, heldEver, turnoverSum, costDrag };
}

/** The momentum-family parameters actually used by an already-preregistered setup in the catalog. */
export interface Variant { label: string; lookbackDays: number; skipRecentDays: number; topN: number; cashFloor: number }

/**
 * These are NOT a parameter search. Each row is a configuration that was already run and recorded in
 * the catalog on survivor-only data; re-measuring the SAME configurations on corrected data is
 * diagnosis of an existing family, not a new family of trials. No configuration outside this list is
 * tried, and nothing here is tuned on the result.
 */
export const CATALOG_VARIANTS: readonly Variant[] = Object.freeze([
  { label: 'fast-momentum-core      63d/skip2  top-5', lookbackDays: 63, skipRecentDays: 2, topN: 5, cashFloor: 2 },
  { label: 'concentrated-momentum  126d/skip5  top-10', lookbackDays: 126, skipRecentDays: 5, topN: 10, cashFloor: 3 },
]);

/** One decision: dollar-volume sleeve -> momentum rank -> absolute filter -> top-N -> inverse vol. */
function decide(
  series: Map<string, Series>,
  universe: readonly string[],
  asOf: string,
  v: Variant = { label: '', lookbackDays: P.lookbackDays, skipRecentDays: P.skipRecentDays, topN: P.topN, cashFloor: P.cashFloor },
): Map<string, number> {
  // Sleeve: top-60 by trailing 20-session average dollar volume, among names with a bar at asOf.
  const dv: { symbol: string; adv: number }[] = [];
  for (const symbol of universe) {
    const s = series.get(symbol);
    const i = s?.index.get(asOf);
    if (!s || i === undefined || i < DV_LOOKBACK) continue;
    let sum = 0;
    for (let k = i - DV_LOOKBACK + 1; k <= i; k += 1) sum += s.dollarVol[k];
    dv.push({ symbol, adv: sum / DV_LOOKBACK });
  }
  dv.sort((a, b) => b.adv - a.adv || a.symbol.localeCompare(b.symbol));
  const sleeve = dv.slice(0, SLEEVE_MAX);

  // Momentum rank over the sleeve.
  const rankable: { symbol: string; relative: number; absolute: number; closes: number[] }[] = [];
  for (const { symbol } of sleeve) {
    const s = series.get(symbol)!;
    const i = s.index.get(asOf)!;
    if (i < v.lookbackDays) continue;
    const closes = s.close.slice(i - v.lookbackDays, i + 1);
    const m = dualMomentumMetrics(closes, v.lookbackDays, v.skipRecentDays);
    if (!m) continue;
    rankable.push({ symbol, ...m, closes });
  }

  const eligible = rankable.filter((r) => r.absolute > P.absoluteThreshold);
  const selected = new Set(selectTopNByMomentum(eligible, v.topN, v.cashFloor));
  if (selected.size === 0) return new Map();

  const volBySymbol = new Map<string, number>();
  for (const row of rankable) {
    if (!selected.has(row.symbol)) continue;
    let rets: number[];
    try { rets = dailyReturns(row.closes); } catch { continue; }
    const sigma = stdev(rets);
    if (!(sigma > 0) || !Number.isFinite(sigma)) continue;
    volBySymbol.set(row.symbol, sigma);
  }
  return inverseVolatilityWeights(volBySymbol, P.perNameCap);
}

function main() {
  const series = loadSeries();
  console.log(`archive: ${series.size} symbols loaded\n`);

  const timeline = buildPitMembership();
  const firstPit = timeline[0]?.availableAt;
  // Union calendar across all symbols, so a delisted name's final sessions are still trading days.
  const allDates = new Set<string>();
  for (const s of Array.from(series.values())) for (const d of s.dates) allDates.add(d);
  // PIT membership only begins when the first N-PORT filing became public; add the momentum
  // lookback so the first decision has a full window. Anything earlier cannot be measured honestly.
  const start = new Date(new Date(`${firstPit}T00:00:00Z`).getTime() + (P.lookbackDays + 10) * 86_400_000 * 1.45)
    .toISOString().slice(0, 10);
  const calendar = Array.from(allDates).sort().filter((d) => d >= start);
  const rebalDates = weekEndDates(calendar);

  console.log(`first N-PORT public at ${firstPit} -> measurement window ${calendar[0]} .. ${calendar[calendar.length - 1]}`);
  console.log(`${calendar.length} sessions, ${rebalDates.length} weekly rebalances\n`);

  // CONTROL: buy and hold the SPUS ETF itself. Its real return over this window is externally
  // known, so if the harness cannot reproduce it the harness is wrong and nothing below means
  // anything. Uses the identical drift/NAV machinery, with the decision replaced by a constant.
  const control = runBook('CONTROL  buy-and-hold SPUS', series, calendar, [rebalDates[0]], () => ['SPUS'],
    (_s, _u, _d) => new Map([['SPUS', 1]]));
  const spus = series.get('SPUS');
  if (spus) {
    const a = spus.index.get(calendar.find((d) => spus.index.has(d))!)!;
    const b = spus.close.length - 1;
    const yrs = (new Date(`${spus.dates[b]}T00:00:00Z`).getTime() - new Date(`${spus.dates[a]}T00:00:00Z`).getTime()) / (365.2425 * 86_400_000);
    const truth = (spus.close[b] / spus.close[a]) ** (1 / yrs) - 1;
    console.log(`CONTROL CHECK  SPUS actual ${(truth * 100).toFixed(2)}%/yr  vs harness ${(control.cagr * 100).toFixed(2)}%/yr`
      + `  (delta ${((control.cagr - truth) * 100).toFixed(2)}pp)\n`);
  }

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    universe: 'A=today\'s roster (biased); B=SPUS PIT N-PORT holdings public at each date (survivorship-free)',
    costs: `flat ${(COST_PER_SIDE * 10_000).toFixed(0)}bps per side — the repo-wide assumption, frozen here`,
  });
  // The in-file CONTROL CHECK above compares the harness against a closed-form calc on the SAME
  // archive — useful for catching a NAV-loop bug, but not external. This anchor is: SPUS's real
  // multi-year return is independently known (~17.6%/yr, agents/objective.json), regardless of how
  // this harness computes anything. If the control book misses it, the whole harness is untrustworthy
  // and neither the biased nor the PIT number below can be believed.
  anchor('buy-and-hold SPUS CAGR (harness control)', control.cagr, 0.176, 0.3);

  const roster = nasdaqIngestRoster();

  // THE QUESTION THIS ANSWERS: does the momentum family beat simply holding the halal ETF once the
  // universe look-ahead is removed? Each variant is an already-run catalog configuration, measured
  // both ways. Nothing is tuned on these numbers.
  console.log('catalog variants, both universes, benchmark = buy-and-hold SPUS\n');
  console.log(`${''.padEnd(40)}   biased CAGR    PIT CAGR   PIT maxDD  PIT vs SPUS`);
  for (const v of CATALOG_VARIANTS) {
    const a = runBook(v.label, series, calendar, rebalDates, () => roster, (s, u, d) => decide(s, u, d, v));
    const b = runBook(v.label, series, calendar, rebalDates, (d) => pitUniverseAt(timeline, d), (s, u, d) => decide(s, u, d, v));
    console.log(
      `${v.label.padEnd(40)} ${(a.cagr * 100).toFixed(2).padStart(11)}% ${(b.cagr * 100).toFixed(2).padStart(10)}%`
      + ` ${(b.maxDD * 100).toFixed(2).padStart(10)}% ${((b.cagr - control.cagr) * 100).toFixed(2).padStart(11)}pp`,
    );
  }
  console.log(`${'buy-and-hold SPUS (benchmark)'.padEnd(40)} ${''.padStart(11)}  ${(control.cagr * 100).toFixed(2).padStart(10)}%`
    + ` ${(control.maxDD * 100).toFixed(2).padStart(10)}% ${'0.00'.padStart(11)}pp\n`);

  // Novy-Marx & Velikov (RFS 2016): anomalies above ~50% turnover PER MONTH rarely survive
  // trading costs. Measure where these variants actually sit rather than assuming.
  const months = calendar.length / 21;
  console.log('turnover vs the Novy-Marx & Velikov 50%/month cost-survival threshold\n');
  for (const v of CATALOG_VARIANTS) {
    const b = runBook(v.label, series, calendar, rebalDates, (d) => pitUniverseAt(timeline, d), (s2, u, d) => decide(s2, u, d, v));
    const perMonth = (b.turnoverSum / months) * 100;
    console.log(`  ${v.label.padEnd(40)} ${perMonth.toFixed(0).padStart(5)}%/month`
      + `  cost drag ${((b.costDrag / (calendar.length / 252)) * 100).toFixed(2)}pp/yr`
      + `  ${perMonth > 50 ? 'ABOVE threshold' : 'below threshold'}`);
  }
  console.log('');

  const biased = runBook('A  BIASED  (today\'s roster at every past date)', series, calendar, rebalDates, () => roster);
  const pit = runBook('B  POINT-IN-TIME  (holdings public at each date)', series, calendar, rebalDates,
    (d) => pitUniverseAt(timeline, d));

  const pad = (n: number, w = 8) => n.toFixed(2).padStart(w);
  console.log('                                                   CAGR     maxDD   Sharpe   names  cashWk');
  for (const r of [biased, pit]) {
    console.log(
      `${r.label.padEnd(46)} ${pad(r.cagr * 100)}% ${pad(r.maxDD * 100)}% ${pad(r.sharpe, 7)}`
      + `  ${String(r.distinctHeld).padStart(5)}  ${String(r.weeksInCash).padStart(5)}`,
    );
  }

  // Annual breakdown: a single CAGR can hide a result that is one good year and four bad ones.
  const yearsOf = (r: RunResult) => {
    const byYear = new Map<string, { first: number; last: number }>();
    for (const p of r.nav) {
      const y = p.d.slice(0, 4);
      const e = byYear.get(y);
      if (!e) byYear.set(y, { first: p.v, last: p.v }); else e.last = p.v;
    }
    return byYear;
  };
  const bY = yearsOf(biased); const pY = yearsOf(pit); const cY = yearsOf(control);
  console.log('\nannual return by book');
  console.log('  year     control(SPUS)      A biased    B point-in-time      A-B gap');
  for (const y of Array.from(bY.keys()).sort()) {
    const pct = (m: Map<string, { first: number; last: number }>) => {
      const e = m.get(y); return e ? (e.last / e.first - 1) * 100 : NaN;
    };
    const c = pct(cY); const a = pct(bY); const b = pct(pY);
    console.log(`  ${y}   ${c.toFixed(1).padStart(12)}%  ${a.toFixed(1).padStart(11)}%  ${b.toFixed(1).padStart(15)}%  ${(a - b).toFixed(1).padStart(11)}pp`);
  }

  const gap = biased.cagr - pit.cagr;
  console.log(`\nSURVIVORSHIP GAP: ${(gap * 100).toFixed(2)}pp of annual return`);
  console.log(`  biased CAGR is ${(biased.cagr / (pit.cagr || 1)).toFixed(2)}x the point-in-time CAGR`);

  const onlyPit = Array.from(pit.heldEver).filter((s) => !biased.heldEver.has(s)).sort();
  console.log(`\nnames the PIT book held that the biased book could never see: ${onlyPit.length}`);
  if (onlyPit.length) console.log(`  ${onlyPit.join(' ')}`);
}

main();
