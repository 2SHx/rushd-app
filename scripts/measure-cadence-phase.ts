// ROBUSTNESS CHECK on QDR-24, not a new lane.
//
// QDR-24's centre cell scored 17.27% at a MONTH_END cadence, and I flagged the obvious threat to
// that number: month-end is itself a well-known calendar anomaly, so a book that rebalances exactly
// on it may be harvesting the calendar rather than avoiding short-horizon reversal.
//
// THE TEST holds FREQUENCY fixed and varies only PHASE. Every arm below decides twelve times a
// year, so decision count, turnover and cost are near-identical by construction; the only thing
// that changes is WHICH trading day of the month the decision lands on. That isolates the calendar
// from the cadence.
//
//   if cadence is the mechanism   -> all phases score similarly, near 17%
//   if the calendar is the mechanism -> only MONTH_END scores well and the others collapse toward 10%
//
// THIS IS NOT A SEARCH. No arm here may be quoted as a result and none is a candidate parameter:
// the preregistered cadence stays MONTH_END whatever this shows. The only question is whether
// QDR-24's number means what its hypothesis claimed. A robustness check that could only ever
// confirm the finding would be worthless, so the failure mode is stated above before running it.
import { dualMomentumMetrics } from '../src/quant/strategies/dualMomentumRotation';
import { inverseVolatilityWeights } from '../src/quant/strategies/halalRiskParityCore';
import { dailyReturns } from '../src/quant/portfolio/frontier';
import { loadCapturedSpusNportSnapshots } from '../src/quant/universe/spusNport';
import { readArchive, listArchivedSymbols } from './backfill-alpaca-sip';
import { anchor, regressionCheck, declareBasis } from './lib/research-assertions';

const COST_PER_SIDE = 0.0015;
const SLEEVE_MAX = 60, DV_LOOKBACK = 20;
const LOOKBACK = 63, SKIP = 2, ABS_THRESHOLD = 0, CASH_FLOOR = 2, PER_NAME_CAP = 0.25;
const TOP_N = 5, RETAIN_RANK = 8; // QDR-24 centre, frozen

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

/**
 * Monthly decision dates at a chosen PHASE. `nth` is the index of the trading day within each
 * calendar month; negative counts back from the end, so -1 is month-end and 0 is the first session.
 * Every phase yields one decision per month, holding frequency constant.
 */
function monthlyAtPhase(calendar: string[], nth: number): string[] {
  const byMonth = new Map<string, string[]>();
  for (const d of calendar) {
    const k = d.slice(0, 7);
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k)!.push(d);
  }
  const out: string[] = [];
  for (const days of Array.from(byMonth.values())) {
    const i = nth < 0 ? days.length + nth : nth;
    if (i >= 0 && i < days.length) out.push(days[i]);
  }
  return out.sort();
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

/**
 * Buy-and-hold SPUS over this script's exact window, by first/last close division ONLY — no
 * ranking, no weighting, no phase logic, no book engine. It shares the bar archive, the date
 * strings and the /252 annualisation with every arm above, and shares nothing else. That is what
 * makes it a check on them rather than a restatement of them.
 *
 * Returns NaN rather than a fallback if SPUS is not archived: an absent benchmark is missing
 * evidence, and the anchor must fail on it instead of quietly passing.
 */
function spusBuyAndHoldCagr(series: Map<string, Series>, calendar: readonly string[]): number {
  const s = series.get('SPUS');
  if (!s || calendar.length === 0) return NaN;
  const lo = calendar[0], hi = calendar[calendar.length - 1];
  const closes: number[] = [];
  for (let i = 0; i < s.dates.length; i += 1) if (s.dates[i] >= lo && s.dates[i] <= hi) closes.push(s.close[i]);
  if (closes.length < 252 || !(closes[0] > 0)) return NaN;
  const years = (closes.length - 1) / 252;
  return (closes[closes.length - 1] / closes[0]) ** (1 / years) - 1;
}

interface Result { cagr: number; maxDD: number; sharpe: number; turnPerMonth: number; decisions: number }

function runBook(series: Map<string, Series>, calendar: string[], decisions: string[], universe: (d: string) => string[] | null): Result {
  let nav = 1; let weights = new Map<string, number>();
  const path: number[] = []; const dec = new Set(decisions);
  let turnoverSum = 0; let previousDecided = new Set<string>();

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
        let selected = new Set<string>();
        if (eligible.length >= CASH_FLOOR) {
          const held = new Set(eligible.slice(0, RETAIN_RANK).filter((r) => previousDecided.has(r.symbol)).map((r) => r.symbol));
          for (const row of eligible) {
            if (held.size >= TOP_N) break;
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
      turnoverSum += turnover;
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
  return { cagr, maxDD, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : 0, turnPerMonth: turnoverSum / (calendar.length / 21), decisions: decisions.length };
}

function main() {
  const series = loadSeries();
  const tl = pitTimeline();
  const all = new Set<string>();
  for (const s of Array.from(series.values())) for (const d of s.dates) all.add(d);
  const start = new Date(new Date(`${tl[0].availableAt}T00:00:00Z`).getTime() + 105 * 86_400_000).toISOString().slice(0, 10);
  const calendar = Array.from(all).sort().filter((d) => d >= start);
  const uni = (d: string) => universeAt(tl, d);

  console.log('ROBUSTNESS CHECK on QDR-24 — monthly frequency held fixed, PHASE varied\n');
  console.log('  cadence real   -> every phase near 17%');
  console.log('  calendar effect -> only month-end scores well\n');

  const phases: { label: string; nth: number }[] = [
    { label: 'trading day  1 (start)', nth: 0 },
    { label: 'trading day  5', nth: 4 },
    { label: 'trading day 10 (mid)', nth: 9 },
    { label: 'trading day 15', nth: 14 },
    { label: 'last-4', nth: -5 },
    { label: 'last-2', nth: -3 },
    { label: 'MONTH_END (QDR-24 centre)', nth: -1 },
  ];

  // ---------------------------------------------------------------------------------------------
  // EXTERNAL ANCHORS. Deliberately BEFORE the arms run, so a broken run aborts without printing
  // seven numbers nobody may quote. Each expected value below is knowable WITHOUT running this
  // script; none of them comes from this repo's own measurement machinery. That distinction is the
  // whole point — the regressionCheck() at the foot of this file compares this pipeline to a figure
  // this pipeline produced, so a systematic error reproduces and passes it happily.
  const spanYears = (Date.parse(`${calendar[calendar.length - 1]}T00:00:00Z`) - Date.parse(`${calendar[0]}T00:00:00Z`))
    / (365.2425 * 86_400_000);
  console.log(`window ${calendar[0]} .. ${calendar[calendar.length - 1]}  (${calendar.length} sessions, ${spanYears.toFixed(2)} yr)`);

  // (1) The US equity market trades ~252 sessions a year — 252 in 2021, 251 in 2022, 250 in 2023,
  // 252 in 2024, per the published NYSE/Nasdaq holiday calendars. Every CAGR this script prints is
  // annualised by dividing the session count by exactly 252, so if the calendar built above is not
  // a real session calendar — weekend dates leaking in from a bad union, duplicate dates, or whole
  // stretches missing because one symbol's archive is short — then all seven arms are mis-annualised
  // in the SAME direction and by the SAME factor. The phase comparison would still look internally
  // consistent, and the QDR-24 regression check would still pass if 17.27% was itself produced on
  // the same broken calendar. Tight tolerance, because this is a hard fact and not an estimate.
  anchor('trading sessions per calendar year in the constructed calendar', calendar.length / spanYears, 252, 0.03);

  // (2) Twelve months to a year, and every month of US trading has at least 18 sessions, so a rule
  // that takes the nth session of each month must fire ~12x a year at EVERY phase. This is the
  // premise the whole experiment rests on — "frequency held fixed, only phase varies". If some
  // phase silently fires less often (a short month skipped, an off-by-one in monthlyAtPhase), then
  // the arms differ in turnover and cost as well as phase, and the comparison below is measuring
  // something other than the calendar. Checked at both extremes so no single arm can drift.
  const perYear = phases.map((p) => monthlyAtPhase(calendar, p.nth).length / spanYears);
  anchor('fewest decisions per year across the phase arms', Math.min(...perYear), 12, 0.1);
  anchor('most decisions per year across the phase arms', Math.max(...perYear), 12, 0.1);

  // (3) SPUS is a passive, fully-invested S&P 500 Shariah-industry-exclusions ETF, and its NAV
  // total return is published by the fund and reported by every quote vendor. Over a window that
  // starts in Nov 2020 and runs to Aug 2026 — mega-cap-tech-led, with the 2022 drawdown inside it —
  // its published annualised total return sits in the mid-to-high teens. Expected value below is
  // taken from that published performance, NOT from any prior run of this repo. It is computed here
  // by dividing two closes, so it fails if the archive is on the wrong price basis, has a scale or
  // units error, or is being indexed by the wrong field — the classes of error that put Apple at
  // $309B. Wide tolerance on purpose: this is a magnitude check, not a precision claim.
  anchor('buy-and-hold SPUS CAGR over this window (fund-published basis)',
    spusBuyAndHoldCagr(series, calendar), 0.17, 0.35);
  console.log('');
  // ---------------------------------------------------------------------------------------------

  console.log(`${'phase'.padEnd(28)} ${'CAGR'.padStart(8)} ${'maxDD'.padStart(8)} ${'Sharpe'.padStart(7)} ${'turn/mo'.padStart(9)} ${'decisions'.padStart(10)}`);
  console.log('-'.repeat(74));
  const results: { label: string; r: Result }[] = [];
  for (const p of phases) {
    const r = runBook(series, calendar, monthlyAtPhase(calendar, p.nth), uni);
    results.push({ label: p.label, r });
    console.log(`${p.label.padEnd(28)} ${(r.cagr * 100).toFixed(2).padStart(7)}% ${(r.maxDD * 100).toFixed(2).padStart(7)}%`
      + ` ${r.sharpe.toFixed(2).padStart(7)} ${(r.turnPerMonth * 100).toFixed(0).padStart(8)}% ${String(r.decisions).padStart(10)}`);
  }

  const monthEnd = results[results.length - 1].r.cagr * 100;
  const others = results.slice(0, -1).map((x) => x.r.cagr * 100);
  const mean = others.reduce((a, b) => a + b, 0) / others.length;
  const spread = Math.max(...others) - Math.min(...others);

  console.log(`\nmonth-end        ${monthEnd.toFixed(2)}%`);
  console.log(`other phases     mean ${mean.toFixed(2)}%   range ${Math.min(...others).toFixed(2)}%..${Math.max(...others).toFixed(2)}%   spread ${spread.toFixed(2)}pp`);
  console.log(`month-end premium over the other phases: ${(monthEnd - mean).toFixed(2)}pp\n`);

  if (monthEnd - mean > 4) {
    console.log('READ: month-end carries a large premium the other phases do not share. QDR-24\'s');
    console.log('17.27% is substantially a CALENDAR effect, not the reversal-avoidance mechanism its');
    console.log('hypothesis claimed. The cadence story is not supported at the level measured.');
  } else if (mean > 14) {
    console.log('READ: every phase scores similarly and well. The gain is CADENCE, not the calendar —');
    console.log('QDR-24\'s mechanism survives its most obvious confound.');
  } else {
    console.log('READ: neither clean. Phases disagree without month-end dominating, which points at');
    console.log('noise over 70 decisions rather than either mechanism.');
  }

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    universe: 'PIT SPUS N-PORT membership (availableAt <= decision date), survivorship-free',
    costs: `flat ${(COST_PER_SIDE * 100).toFixed(2)}% per side — the repo-wide assumption, frozen here`,
  });
  // QDR-24's centre cell (MONTH_END, this exact rule) was already measured and recorded at 17.27%/yr
  // BEFORE this robustness check was written (see this file's header). That figure did not come from
  // this run — it is what this run is checking itself against. A miss means either the archive moved
  // since QDR-24 or this file's phase machinery does not actually reproduce the preregistered cell.
  regressionCheck('MONTH_END phase reproduces the QDR-24 centre cell', monthEnd / 100, 0.1727, 0.3);
}

main();
