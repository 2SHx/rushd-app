// Point-in-time gross-profitability book, measured on the same harness that produced the
// survivorship numbers — and against the same benchmark.
//
// THE HYPOTHESIS, fixed before the run: momentum failed here for three compounding reasons that
// gross profitability inverts. Long-only keeps roughly half of momentum but the long side is where
// quality lives; publication removed ~58% of momentum since 1993; and 306%/month turnover is six
// times the level above which anomalies stop surviving costs. Novy-Marx's profitability strategy
// turns over "only once every four years", works within "the 500 largest non-financial stocks", and
// he measures that EXCLUDING financials strengthens the spread. If low turnover is the binding
// constraint, this book should close most of the 6.18pp gap to SPUS that momentum could not.
//
// FALSIFICATION, stated before the numbers exist: if the PIT gross-profitability book does not beat
// buy-and-hold SPUS (17.48%/yr, 28.06% max drawdown) over this window after costs, the honest
// conclusion is that this program has no edge worth paying for and the answer is to hold the ETF.
//
// PARAMETERS ARE THE PAPER'S, NOT TUNED. Novy-Marx buys one dollar of each of the top 150 of 500
// ranked names — top 30%, equal weight, rebalanced each June. Translated to our 60-name sleeve that
// is the top 18, equal weight, end of June. Nothing here is swept, and no alternative N is tried:
// the program has already spent its trial budget, and a search over N would deflate every result in
// the ledger further.
import { readArchive, listArchivedSymbols } from './backfill-alpaca-sip';
import { readFundamentals, grossProfitsToAssetsAt } from './backfill-gross-profitability';
import { loadCapturedSpusNportSnapshots } from '../src/quant/universe/spusNport';
import { anchor, declareBasis } from './lib/research-assertions';

const COST_PER_SIDE = 0.0015;
const SLEEVE_MAX = 60;       // identical to the momentum runs, so the sleeve is not the variable
const DV_LOOKBACK = 20;
const TOP_FRACTION = 0.30;   // Novy-Marx: 150 of 500
const TOP_N = Math.round(SLEEVE_MAX * TOP_FRACTION); // 18

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
    out.set(symbol, {
      dates: a.bars.map((b) => b.d), close: a.bars.map((b) => b.c),
      dollarVol: a.bars.map((b) => b.c * b.v), index,
    });
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

/** Last trading session on or before 30 June of each year in the calendar. */
function juneRebalances(calendar: string[]): string[] {
  const out: string[] = [];
  const years = new Set(calendar.map((d) => d.slice(0, 4)));
  for (const y of Array.from(years).sort()) {
    const cut = `${y}-06-30`;
    const candidates = calendar.filter((d) => d <= cut && d.slice(0, 4) === y);
    if (candidates.length) out.push(candidates[candidates.length - 1]);
  }
  return out;
}

interface Book { cagr: number; maxDD: number; sharpe: number; turnoverSum: number; costDrag: number; held: Set<string>; rebalances: number; covered: number[] }

function runBook(
  series: Map<string, Series>, calendar: string[], rebalDates: string[],
  universe: (d: string) => string[] | null,
  decide: (u: readonly string[], d: string) => Map<string, number>,
): Book {
  let nav = 1; let weights = new Map<string, number>();
  const path: number[] = []; const held = new Set<string>();
  let turnoverSum = 0; let costDrag = 0; let rebalances = 0;
  const rebal = new Set(rebalDates); const covered: number[] = [];

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
      rebalances += 1;
      const u = universe(today);
      const target = u ? decide(u, today) : new Map<string, number>();
      covered.push(target.size);
      for (const s of Array.from(target.keys())) held.add(s);
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
  return { cagr, maxDD, sharpe: sd > 0 ? (mu / sd) * Math.sqrt(252) : 0, turnoverSum, costDrag, held, rebalances, covered };
}

function main() {
  const fundamentals = readFundamentals();
  if (!fundamentals) {
    console.error('No fundamentals archive. Run: npx tsx scripts/backfill-gross-profitability.ts');
    process.exit(1);
  }
  const series = loadSeries();
  const tl = pitTimeline();
  const firstPit = tl[0].availableAt;

  const all = new Set<string>();
  for (const s of Array.from(series.values())) for (const d of s.dates) all.add(d);
  const start = new Date(new Date(`${firstPit}T00:00:00Z`).getTime() + 100 * 86_400_000).toISOString().slice(0, 10);
  const calendar = Array.from(all).sort().filter((d) => d >= start);
  const rebalDates = juneRebalances(calendar);

  console.log(`fundamentals: ${Object.keys(fundamentals.symbols).length} symbols`
    + `  (${fundamentals.unresolved.length} unresolved)`);
  console.log(`window ${calendar[0]} .. ${calendar[calendar.length - 1]}`);
  console.log(`annual rebalances at: ${rebalDates.join(', ')}\n`);

  /** Sleeve by liquidity, then rank by point-in-time GP/A, then equal-weight the top 30%. */
  const decideGpa = (universe: readonly string[], asOf: string): Map<string, number> => {
    const dv: { symbol: string; adv: number }[] = [];
    for (const symbol of universe) {
      const s = series.get(symbol); const i = s?.index.get(asOf);
      if (!s || i === undefined || i < DV_LOOKBACK) continue;
      let sum = 0;
      for (let k = i - DV_LOOKBACK + 1; k <= i; k += 1) sum += s.dollarVol[k];
      dv.push({ symbol, adv: sum / DV_LOOKBACK });
    }
    dv.sort((a, b) => b.adv - a.adv || a.symbol.localeCompare(b.symbol));
    const sleeve = dv.slice(0, SLEEVE_MAX);

    const ranked: { symbol: string; gpa: number }[] = [];
    for (const { symbol } of sleeve) {
      const gpa = grossProfitsToAssetsAt(fundamentals.symbols[symbol], asOf);
      // Fail-closed: a name whose fundamentals were not public at asOf is simply not rankable.
      // It is never defaulted to zero, which would be a covert bet on missing data.
      if (gpa === null || !Number.isFinite(gpa)) continue;
      ranked.push({ symbol, gpa });
    }
    if (ranked.length < TOP_N) return new Map();
    ranked.sort((a, b) => b.gpa - a.gpa || a.symbol.localeCompare(b.symbol));
    const picked = ranked.slice(0, TOP_N);
    const w = 1 / picked.length;
    return new Map(picked.map((p) => [p.symbol, w]));
  };

  const gpa = runBook(series, calendar, rebalDates, (d) => universeAt(tl, d), decideGpa);
  // The benchmark must buy on the FIRST session of the window, not on the strategy's first annual
  // rebalance — inheriting the June calendar would park it in cash for eight months and flatter
  // every strategy it is compared against.
  const spus = runBook(series, calendar, [calendar[1]], () => ['SPUS'], () => new Map([['SPUS', 1]]));
  const months = calendar.length / 21;

  const row = (name: string, b: Book, turn = true) => {
    console.log(
      `${name.padEnd(38)} ${(b.cagr * 100).toFixed(2).padStart(8)}% ${(b.maxDD * 100).toFixed(2).padStart(9)}%`
      + ` ${b.sharpe.toFixed(2).padStart(7)}`
      + (turn ? ` ${((b.turnoverSum / months) * 100).toFixed(1).padStart(9)}%` : `${'—'.padStart(11)}`),
    );
  };
  console.log(`${''.padEnd(38)} ${'CAGR'.padStart(9)} ${'maxDD'.padStart(9)} ${'Sharpe'.padStart(7)} ${'turnover/mo'.padStart(10)}`);
  row('gross profitability  PIT  top-18', gpa);
  row('buy-and-hold SPUS (benchmark)', spus, false);

  const delta = gpa.cagr - spus.cagr;
  console.log(`\nvs benchmark: ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(2)}pp/yr`);
  console.log(`cost drag: ${((gpa.costDrag / (calendar.length / 252)) * 100).toFixed(2)}pp/yr`
    + `  (momentum paid 5.52pp/yr at the same 15bps)`);
  console.log(`distinct names held across ${gpa.rebalances} annual rebalances: ${gpa.held.size}`);
  console.log(`names selected per rebalance: ${gpa.covered.join(', ')}`);
  console.log(`\nVERDICT: ${delta > 0 ? 'BEATS' : 'LOSES TO'} buy-and-hold SPUS.`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    fundamentals: 'SEC XBRL, AS-FILED (point-in-time by `filed` date, never restated)',
    universe: 'PIT SPUS N-PORT membership (availableAt <= decision date), survivorship-free',
  });
  // SPUS's own return over this window is known independently of the GP/A ranking machinery — this
  // program has repeatedly measured it at ~17.6%/yr (agents/objective.json), and the falsification
  // threshold this file's own header states (17.48%/yr) was itself calibrated against that fact. Both
  // books share the same runBook() drift/NAV loop, so a miss here means neither number is trustworthy.
  anchor('buy-and-hold SPUS CAGR', spus.cagr, 0.176, 0.3);
}

main();
