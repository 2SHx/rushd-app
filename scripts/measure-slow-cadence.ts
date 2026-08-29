// QDR-24: halal-slow-cadence-momentum-core@v1 — DIAGNOSTIC ONLY.
//
// Preregistration: docs/quant-experiments/halal-slow-cadence-momentum-core-v1.json, written before
// this file ran. The one new variable is CADENCE (ISO_WEEK_END -> MONTH_END); retainRank is frozen
// at 8 and topN at 5 so retention width cannot be confounded with it.
//
// THE ANOMALY THIS EXISTS TO EXPLAIN: at the hysteresis centre cell, CAGR rose +6.72pp while cost
// drag fell only 2.05pp. Under a third of the gain came from the cost channel; ~4.67pp came from
// holding different names — and QDR-22 predicted the OPPOSITE SIGN, a 3.5pp signal give-back. The
// parsimonious reading is short-horizon reversal: a weekly cadence sells names about to bounce.
//
// QUOTATION RULE, from the manifest: ONLY the centre cell {MONTH_END, retainRank 8} may be quoted.
// The previous lane's best cell (13.74%) is named there as an example of a number that must not be.
import { dualMomentumMetrics } from '../src/quant/strategies/dualMomentumRotation';
import { inverseVolatilityWeights } from '../src/quant/strategies/halalRiskParityCore';
import { selectTopNByMomentum } from '../src/quant/strategies/halalFastMomentumCore';
import { dailyReturns } from '../src/quant/portfolio/frontier';
import { loadCapturedSpusNportSnapshots } from '../src/quant/universe/spusNport';
import { readArchive, listArchivedSymbols } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

const COST_PER_SIDE = 0.0015;
const SLEEVE_MAX = 60, DV_LOOKBACK = 20;
const LOOKBACK = 63, SKIP = 2, ABS_THRESHOLD = 0, CASH_FLOOR = 2, PER_NAME_CAP = 0.25;
const TOP_N = 5; // frozen by the manifest

type Cadence = 'ISO_WEEK_END' | 'BIWEEKLY' | 'MONTH_END';
const GRID: { cadence: Cadence[]; retainRank: number[] } = {
  cadence: ['ISO_WEEK_END', 'BIWEEKLY', 'MONTH_END'],
  retainRank: [6, 8, 10],
};

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

/** Decision dates. All three are resolved from the archive's own trading calendar, never a
 * forward calendar — a date the market did not open on can never become a decision date. */
function decisionDates(calendar: string[], cadence: Cadence): string[] {
  if (cadence === 'MONTH_END') {
    const last = new Map<string, string>();
    for (const d of calendar) last.set(d.slice(0, 7), d);
    return Array.from(last.values()).sort();
  }
  const weekly: string[] = (() => {
    const last = new Map<string, string>();
    for (const d of calendar) {
      const dt = new Date(`${d}T00:00:00Z`);
      const day = (dt.getUTCDay() + 6) % 7;
      const thu = new Date(dt); thu.setUTCDate(dt.getUTCDate() - day + 3);
      last.set(`${thu.getUTCFullYear()}-${thu.toISOString().slice(5, 10)}`, d);
    }
    return Array.from(last.values()).sort();
  })();
  if (cadence === 'ISO_WEEK_END') return weekly;
  return weekly.filter((_, i) => i % 2 === 0); // BIWEEKLY: every other week-end
}

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

interface Result { cagr: number; maxDD: number; sharpe: number; turnPerMonth: number; costDrag: number; decisions: number }

function runBook(
  series: Map<string, Series>, calendar: string[], decisions: string[],
  universe: (d: string) => string[] | null, topN: number, retainRank: number | null,
): Result {
  let nav = 1; let weights = new Map<string, number>();
  const path: number[] = []; const dec = new Set(decisions);
  let turnoverSum = 0; let costDrag = 0;
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

    if (dec.has(today)) {
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
          const held = new Set(eligible.slice(0, retainRank).filter((r) => previousDecided.has(r.symbol)).map((r) => r.symbol));
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
    turnPerMonth: turnoverSum / (calendar.length / 21), costDrag: costDrag / years, decisions: decisions.length,
  };
}

function main() {
  const series = loadSeries();
  const tl = pitTimeline();
  const all = new Set<string>();
  for (const s of Array.from(series.values())) for (const d of s.dates) all.add(d);
  const start = new Date(new Date(`${tl[0].availableAt}T00:00:00Z`).getTime() + 105 * 86_400_000).toISOString().slice(0, 10);
  const calendar = Array.from(all).sort().filter((d) => d >= start);
  const uni = (d: string) => universeAt(tl, d);

  console.log(`QDR-24  halal-slow-cadence-momentum-core@v1  DIAGNOSTIC`);
  console.log(`window ${calendar[0]} .. ${calendar[calendar.length - 1]}\n`);

  // STRUCTURAL NULL CONTROL: at MONTH_END with retainRank == topN, retain is a subset of the
  // top-topN and the fill takes the rest, so the arm must equal a plain monthly top-N book.
  const md = decisionDates(calendar, 'MONTH_END');
  const nullA = runBook(series, calendar, md, uni, TOP_N, TOP_N);
  const nullB = runBook(series, calendar, md, uni, TOP_N, null);
  const drift = Math.abs(nullA.cagr - nullB.cagr);
  console.log(`STRUCTURAL NULL  MONTH_END retainRank==topN vs plain monthly top-${TOP_N}`);
  console.log(`  ${(nullA.cagr * 100).toFixed(4)}%  vs  ${(nullB.cagr * 100).toFixed(4)}%   drift ${(drift * 100).toFixed(6)}pp`);
  if (drift > 1e-9) { console.log('  FAIL — implementation defect, refusing to report the grid.'); process.exit(1); }
  console.log('  PASS\n');

  const comparator = runBook(series, calendar, decisionDates(calendar, 'ISO_WEEK_END'), uni, TOP_N, 8);
  const spusHold = (() => {
    const s = series.get('SPUS')!;
    const first = calendar.find((d) => s.index.has(d))!;
    const a = s.index.get(first)!; const b = s.close.length - 1;
    const yrs = (new Date(`${s.dates[b]}T00:00:00Z`).getTime() - new Date(`${first}T00:00:00Z`).getTime()) / (365.2425 * 86_400_000);
    return (s.close[b] / s.close[a]) ** (1 / yrs) - 1;
  })();

  console.log(`${'cell'.padEnd(30)} ${'CAGR'.padStart(8)} ${'maxDD'.padStart(8)} ${'Sharpe'.padStart(7)} ${'turn/mo'.padStart(9)} ${'cost/yr'.padStart(8)} ${'decisions'.padStart(10)}`);
  console.log('-'.repeat(86));
  const row = (label: string, r: Result, mark = '') => console.log(
    `${(label + mark).padEnd(30)} ${(r.cagr * 100).toFixed(2).padStart(7)}% ${(r.maxDD * 100).toFixed(2).padStart(7)}%`
    + ` ${r.sharpe.toFixed(2).padStart(7)} ${(r.turnPerMonth * 100).toFixed(0).padStart(8)}% ${(r.costDrag * 100).toFixed(2).padStart(7)}% ${String(r.decisions).padStart(10)}`);

  row('comparator WEEK retain 8', comparator);
  console.log('');
  const cells = new Map<string, Result>();
  for (const cadence of GRID.cadence) {
    const dates = decisionDates(calendar, cadence);
    for (const rr of GRID.retainRank) {
      const r = runBook(series, calendar, dates, uni, TOP_N, rr);
      cells.set(`${cadence}|${rr}`, r);
      const isCentre = cadence === 'MONTH_END' && rr === 8;
      row(`${cadence.padEnd(12)} retain ${rr}`, r, isCentre ? '  <- CENTRE' : '');
    }
  }
  console.log('');
  console.log(`${'buy-and-hold SPUS'.padEnd(30)} ${(spusHold * 100).toFixed(2).padStart(7)}%`);

  const centre = cells.get('MONTH_END|8')!;
  const values = Array.from(cells.values()).map((r) => r.cagr * 100);
  const span = Math.max(...values) - Math.min(...values);
  const monthRow = GRID.retainRank.map((rr) => cells.get(`MONTH_END|${rr}`)!.turnPerMonth);

  console.log('\n--- falsification, evaluated against the preregistered thresholds ---\n');
  const verdict = (name: string, failed: boolean, detail: string) =>
    console.log(`${failed ? 'FALSIFIED' : 'survives '}  ${name.padEnd(42)} ${detail}`);

  verdict('F1_CADENCE_AXIS_INERT', !(centre.turnPerMonth < 0.80),
    `turnover ${(centre.turnPerMonth * 100).toFixed(0)}%/mo  (must be < 80%)`);
  verdict('F2_COST_RECOVERED_BUT_RETURN_DID_NOT_FOLLOW', centre.turnPerMonth < 0.80 && centre.cagr <= comparator.cagr,
    `CAGR ${(centre.cagr * 100).toFixed(2)}% vs comparator ${(comparator.cagr * 100).toFixed(2)}%`);
  verdict('F3_NO_PLATEAU', span > 6.0,
    `grid spans ${span.toFixed(2)}pp  (must be <= 6.0pp);  MONTH_END turnover row ${monthRow.map((t) => (t * 100).toFixed(0) + '%').join(' ')}`);
  verdict('F4_STILL_LOSES_TO_BENCHMARK', !(centre.cagr > spusHold),
    `centre ${(centre.cagr * 100).toFixed(2)}% vs SPUS ${(spusHold * 100).toFixed(2)}%  (${((centre.cagr - spusHold) * 100).toFixed(2)}pp)`);

  console.log(`\nCENTRE CELL (the only quotable number): ${(centre.cagr * 100).toFixed(2)}% CAGR,`
    + ` ${(centre.maxDD * 100).toFixed(2)}% maxDD, Sharpe ${centre.sharpe.toFixed(2)},`
    + ` ${(centre.turnPerMonth * 100).toFixed(0)}%/mo turnover, ${(centre.costDrag * 100).toFixed(2)}pp/yr cost.`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    universe: 'PIT SPUS N-PORT membership (availableAt <= decision date), survivorship-free',
    costs: `flat ${(COST_PER_SIDE * 10_000).toFixed(0)}bps per side — the repo-wide assumption, frozen here`,
  });
  // Buy-and-hold SPUS is computed by simple first/last-close division, independent of the grid engine
  // above, and its real-world return is known outside this file at ~17.6%/yr (agents/objective.json).
  // A miss means the archive or the date/index handling has drifted since the cell above was measured.
  anchor('buy-and-hold SPUS CAGR', spusHold, 0.176, 0.3);
}

main();
