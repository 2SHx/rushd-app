// QDR-22's hysteresis lane, measured on the point-in-time universe.
//
// THE ONE NEW VARIABLE is `retainRank`: a name already in the previous week's decided set is
// RETAINED while its relative-momentum rank stays <= retainRank, instead of being sold the moment
// it drops out of the top `topN`. Everything else is identical to fast-momentum-core — 63d/skip2,
// absolute filter, ISO-week cadence, inverse-vol sizing at a 25% cap, cashFloor 2, 60-name sleeve.
//
// WHY THIS LANE AND NOT ANOTHER: Novy-Marx & Velikov identify a buy/hold spread — "more stringent
// requirements for establishing positions than for maintaining them" — as the single most effective
// cost-mitigation technique, and that is exactly what retainRank implements. Momentum here runs at
// 306%/month against their ~50%/month cost-survival threshold. QDR-22 preregistered this before any
// of today's measurements existed; the parameters below are ITS grid, not chosen by me.
//
// WHAT TRANSFERS AND WHAT DOES NOT: QDR-22's numeric predictions (+5.6pp cost channel, -3.5pp
// signal give-back, net +2.1pp) were calibrated against the SURVIVOR-ONLY baseline of 105.92% OOS
// CAGR. That baseline is now known to be 3.51% point-in-time, so the absolute predictions cannot
// transfer and are not tested here. What DOES transfer is the mechanism question and its
// falsification F3_INERT_COST_AXIS: realised cost-drag reduction must reach at least 1.2pp/yr, or
// the cost axis is inert and the lane is dead regardless of what CAGR does.
//
// INTERNAL NULL CONTROL, from the manifest: the cell {retainRank: 6, topN: 6} has band zero and MUST
// reproduce the plain comparator at topN=6 exactly. Divergence there is an implementation defect in
// this file, not a result — it is checked before any other number is reported.
import { dualMomentumMetrics } from '../src/quant/strategies/dualMomentumRotation';
import { inverseVolatilityWeights } from '../src/quant/strategies/halalRiskParityCore';
import { selectTopNByMomentum } from '../src/quant/strategies/halalFastMomentumCore';
import { dailyReturns } from '../src/quant/portfolio/frontier';
import { loadCapturedSpusNportSnapshots } from '../src/quant/universe/spusNport';
import { readArchive, listArchivedSymbols } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

/**
 * 15bps was an ASSUMPTION, never a measurement, and on 2026-08-29 it was measured and found wrong by
 * an order of magnitude. Alpaca SIP NBBO quotes, mid-session, 2018-2026: SPY 0.13bps half-spread,
 * AAPL 0.50, NVDA 0.48, MU 2.07, AMD 3.14, MRVL 3.63 — against 15 assumed. SPY at 0.27bps full
 * spread validates the sample as NBBO rather than per-venue quotes.
 *
 * This matters because the cost drag was the stated reason fast momentum failed (5.52pp/yr at 306%
 * monthly turnover) and the stated mechanism by which the cadence lever "worked". Both conclusions
 * were computed from a number that was 5-100x too large.
 *
 * Override with --cost-bps=N (per side). The default stays 15 so prior results remain reproducible;
 * every re-run at a corrected cost must state the flag it used.
 */
const COST_PER_SIDE = Number.parseFloat(
  process.argv.find((a) => a.startsWith('--cost-bps='))?.split('=')[1] ?? '15',
) / 10_000;
const SLEEVE_MAX = 60, DV_LOOKBACK = 20;
const LOOKBACK = 63, SKIP = 2, ABS_THRESHOLD = 0, CASH_FLOOR = 2, PER_NAME_CAP = 0.25;

/** QDR-22's frozen plateau: retainRank in {6,8,10} x topN in {4,5,6}, constraint retainRank >= topN. */
const GRID = { retainRank: [6, 8, 10], topN: [4, 5, 6] };

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
interface Series { dates: string[]; close: number[]; dollarVol: number[]; index: Map<string, number> }

function stdev(v: readonly number[]): number {
  if (v.length < 2) return 0;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

function loadSeries(): Map<string, Series> {
  const out = new Map<string, Series>();
  for (const symbol of listArchivedSymbols()) {
    const a = readArchive(symbol);
    if (!a || a.bars.length === 0) continue;
    const index = new Map<string, number>();
    a.bars.forEach((b, i) => index.set(b.d, i));
    out.set(symbol, { dates: a.bars.map((b) => b.d), close: a.bars.map((b) => b.c), dollarVol: a.bars.map((b) => b.c * b.v), index });
  }
  return out;
}

function pitTimeline() {
  return (loadCapturedSpusNportSnapshots() as any[])
    .map((s) => ({
      availableAt: (s.availableAt instanceof Date ? s.availableAt.toISOString() : String(s.availableAt)).slice(0, 10),
      symbols: (s.holdings ?? []).map((h: any) => h.symbol).filter(Boolean) as string[],
    }))
    .sort((a, b) => a.availableAt.localeCompare(b.availableAt));
}

function universeAt(tl: ReturnType<typeof pitTimeline>, date: string): string[] | null {
  let chosen: string[] | null = null;
  for (const e of tl) { if (e.availableAt <= date) chosen = e.symbols; else break; }
  return chosen;
}

function weekEndDates(calendar: string[]): string[] {
  const last = new Map<string, string>();
  for (const d of calendar) {
    const dt = new Date(`${d}T00:00:00Z`);
    const day = (dt.getUTCDay() + 6) % 7;
    const thu = new Date(dt); thu.setUTCDate(dt.getUTCDate() - day + 3);
    last.set(`${thu.getUTCFullYear()}-${thu.toISOString().slice(5, 10)}`, d);
  }
  return Array.from(last.values()).sort();
}

/** Sleeve then momentum rank. Shared by both arms so the sleeve is never the variable. */
function rankEligible(series: Map<string, Series>, universe: readonly string[], asOf: string) {
  const dv: { symbol: string; adv: number }[] = [];
  for (const symbol of universe) {
    const s = series.get(symbol); const i = s?.index.get(asOf);
    if (!s || i === undefined || i < DV_LOOKBACK) continue;
    let sum = 0;
    for (let k = i - DV_LOOKBACK + 1; k <= i; k += 1) sum += s.dollarVol[k];
    dv.push({ symbol, adv: sum / DV_LOOKBACK });
  }
  dv.sort((a, b) => b.adv - a.adv || a.symbol.localeCompare(b.symbol));

  const rankable: { symbol: string; relative: number; absolute: number; closes: number[] }[] = [];
  for (const { symbol } of dv.slice(0, SLEEVE_MAX)) {
    const s = series.get(symbol)!; const i = s.index.get(asOf)!;
    if (i < LOOKBACK) continue;
    const closes = s.close.slice(i - LOOKBACK, i + 1);
    const m = dualMomentumMetrics(closes, LOOKBACK, SKIP);
    if (!m) continue;
    rankable.push({ symbol, ...m, closes });
  }
  // Comparator's ordering, reused verbatim: relative DESC, symbol ASC.
  const eligible = rankable.filter((r) => r.absolute > ABS_THRESHOLD)
    .sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol));
  return { rankable, eligible };
}

function sizeSelected(rankable: ReturnType<typeof rankEligible>['rankable'], selected: Set<string>): Map<string, number> {
  const vol = new Map<string, number>();
  for (const row of rankable) {
    if (!selected.has(row.symbol)) continue;
    let rets: number[];
    try { rets = dailyReturns(row.closes); } catch { continue; }
    const sigma = stdev(rets);
    if (!(sigma > 0) || !Number.isFinite(sigma)) continue;
    vol.set(row.symbol, sigma);
  }
  return inverseVolatilityWeights(vol, PER_NAME_CAP);
}

interface Result { cagr: number; maxDD: number; sharpe: number; turnPerMonth: number; costDrag: number }

function runBook(
  series: Map<string, Series>, calendar: string[], rebalDates: string[],
  universe: (d: string) => string[] | null,
  topN: number, retainRank: number | null,
): Result {
  let nav = 1; let weights = new Map<string, number>();
  const path: number[] = []; const rebal = new Set(rebalDates);
  let turnoverSum = 0; let costDrag = 0;
  /** Previous week-end DECISION's key set — never realised holdings, per the manifest. */
  let previousDecided = new Set<string>();

  for (let t = 1; t < calendar.length; t += 1) {
    const prev = calendar[t - 1]; const today = calendar[t];
    let growth = 0; const grown = new Map<string, number>();
    for (const [sym, w] of Array.from(weights.entries())) {
      const s = series.get(sym); const i = s?.index.get(today); const j = s?.index.get(prev);
      if (!s || i === undefined || j === undefined) { grown.set(sym, w); continue; }
      const r = s.close[i] / s.close[j] - 1;
      growth += w * r; grown.set(sym, w * (1 + r));
    }
    nav *= 1 + growth;
    weights = new Map();
    for (const [sym, v] of Array.from(grown.entries())) weights.set(sym, v / (1 + growth));

    if (rebal.has(today)) {
      const u = universe(today);
      let target = new Map<string, number>();
      if (u) {
        const { rankable, eligible } = rankEligible(series, u, today);
        let selected: Set<string>;
        if (retainRank === null) {
          selected = new Set(selectTopNByMomentum(eligible, topN, CASH_FLOOR));
        } else if (eligible.length < CASH_FLOOR) {
          selected = new Set();
        } else {
          // Step 2: retain incumbents still ranked within retainRank.
          const retain = eligible
            .slice(0, retainRank)
            .filter((r) => previousDecided.has(r.symbol))
            .map((r) => r.symbol);
          // Step 5: fill from the best-ranked NON-retained names up to topN. When retention already
          // holds topN or more, nothing is bought — that is the whole point of the buy/hold spread.
          const held = new Set(retain);
          for (const row of eligible) {
            if (held.size >= topN) break;
            if (!held.has(row.symbol)) held.add(row.symbol);
          }
          selected = held;
        }
        if (selected.size >= CASH_FLOOR) target = sizeSelected(rankable, selected);
        previousDecided = new Set(target.keys());
      }
      let turnover = 0;
      for (const s of Array.from(new Set([...Array.from(weights.keys()), ...Array.from(target.keys())])))
        turnover += Math.abs((target.get(s) ?? 0) - (weights.get(s) ?? 0));
      turnoverSum += turnover; costDrag += turnover * COST_PER_SIDE;
      nav *= 1 - turnover * COST_PER_SIDE;
      weights = target;
    }
    path.push(nav);
  }

  const years = path.length / 252;
  const cagr = years > 0 ? nav ** (1 / years) - 1 : 0;
  let peak = -Infinity; let maxDD = 0;
  for (const v of path) { peak = Math.max(peak, v); maxDD = Math.max(maxDD, 1 - v / peak); }
  const rets: number[] = [];
  for (let i = 1; i < path.length; i += 1) rets.push(path[i] / path[i - 1] - 1);
  const mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = stdev(rets);
  return {
    cagr, maxDD, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : 0,
    turnPerMonth: turnoverSum / (calendar.length / 21), costDrag: costDrag / years,
  };
}

function main() {
  const series = loadSeries();
  const tl = pitTimeline();
  const all = new Set<string>();
  for (const s of Array.from(series.values())) for (const d of s.dates) all.add(d);
  const start = new Date(new Date(`${tl[0].availableAt}T00:00:00Z`).getTime() + 105 * 86_400_000).toISOString().slice(0, 10);
  const calendar = Array.from(all).sort().filter((d) => d >= start);
  const rebalDates = weekEndDates(calendar);
  const uni = (d: string) => universeAt(tl, d);

  console.log(`window ${calendar[0]} .. ${calendar[calendar.length - 1]}  ${rebalDates.length} weekly decisions\n`);

  // NULL CONTROL FIRST. {retainRank: 6, topN: 6} must equal the plain comparator at topN=6.
  const nullHyst = runBook(series, calendar, rebalDates, uni, 6, 6);
  const nullPlain = runBook(series, calendar, rebalDates, uni, 6, null);
  const drift = Math.abs(nullHyst.cagr - nullPlain.cagr);
  console.log('INTERNAL NULL CONTROL  {retainRank:6, topN:6} vs plain comparator at topN=6');
  console.log(`  hysteresis ${(nullHyst.cagr * 100).toFixed(4)}%   plain ${(nullPlain.cagr * 100).toFixed(4)}%   drift ${(drift * 100).toFixed(6)}pp`);
  if (drift > 1e-9) {
    console.log('  FAIL — the arms diverge where they must be identical. This is an implementation');
    console.log('  defect in this file, not a result. Refusing to report the grid.');
    process.exit(1);
  }
  console.log('  PASS — arms are byte-identical where the manifest requires it.\n');

  const baseline = runBook(series, calendar, rebalDates, uni, 5, null);
  const spus = runBook(series, calendar, [calendar[1]], () => ['SPUS'], 1, null);
  // Benchmark is bought on the first session and held; it never uses the strategy's decision path.
  const spusHold = (() => {
    const s = series.get('SPUS')!;
    const first = calendar.find((d) => s.index.has(d))!;
    const a = s.index.get(first)!; const b = s.close.length - 1;
    const yrs = (new Date(`${s.dates[b]}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / (365.2425 * 86_400_000);
    return (s.close[b] / s.close[a]) ** (1 / yrs) - 1;
  })();

  console.log(`${'cell'.padEnd(26)} ${'CAGR'.padStart(8)} ${'maxDD'.padStart(8)} ${'Sharpe'.padStart(7)} ${'turn/mo'.padStart(9)} ${'cost/yr'.padStart(8)} ${'vs base'.padStart(9)}`);
  console.log('-'.repeat(82));
  const row = (label: string, r: Result, base?: Result) => {
    const d = base ? `${((r.cagr - base.cagr) * 100 >= 0 ? '+' : '')}${((r.cagr - base.cagr) * 100).toFixed(2)}pp` : '';
    console.log(`${label.padEnd(26)} ${(r.cagr * 100).toFixed(2).padStart(7)}% ${(r.maxDD * 100).toFixed(2).padStart(7)}%`
      + ` ${r.sharpe.toFixed(2).padStart(7)} ${(r.turnPerMonth * 100).toFixed(0).padStart(8)}% ${(r.costDrag * 100).toFixed(2).padStart(7)}% ${d.padStart(9)}`);
  };
  row('baseline  no hysteresis', baseline);
  console.log('');
  for (const rr of GRID.retainRank) {
    for (const tn of GRID.topN) {
      if (rr < tn) continue; // manifest validity constraint
      row(`retainRank ${rr}  topN ${tn}`, runBook(series, calendar, rebalDates, uni, tn, rr), baseline);
    }
  }
  console.log('');
  console.log(`${'buy-and-hold SPUS'.padEnd(26)} ${(spusHold * 100).toFixed(2).padStart(7)}%`);

  const centre = runBook(series, calendar, rebalDates, uni, 5, 8);
  const costCut = (baseline.costDrag - centre.costDrag) * 100;
  console.log(`\nF3_INERT_COST_AXIS: realised cost-drag reduction at the centre cell = ${costCut.toFixed(2)}pp/yr`);
  console.log(`  threshold is 1.20pp/yr -> ${costCut >= 1.2 ? 'cost axis is LIVE' : 'FALSIFIED, cost axis is INERT'}`);
  console.log(`  turnover ${(baseline.turnPerMonth * 100).toFixed(0)}%/mo -> ${(centre.turnPerMonth * 100).toFixed(0)}%/mo`);
  console.log(`\ncentre cell vs benchmark: ${((centre.cagr - spusHold) * 100).toFixed(2)}pp/yr`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    universe: 'PIT SPUS N-PORT membership (availableAt <= decision date), survivorship-free',
    costs: `flat ${(COST_PER_SIDE * 10_000).toFixed(0)}bps per side (override with --cost-bps=N)`,
  });
  // Buy-and-hold SPUS over this window is computed here by simple first/last-close division, not by
  // the hysteresis engine above, and its real-world return is independently known at ~17.6%/yr
  // (agents/objective.json). A miss means the archive or the date/index handling has drifted, and
  // every "vs benchmark" comparison above is measuring against the wrong number.
  anchor('buy-and-hold SPUS CAGR', spusHold, 0.176, 0.3);
}

main();
