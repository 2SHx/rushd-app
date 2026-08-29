// D3 — 12-1 momentum on the FULL NASDAQ universe, survivorship-free, at MEASURED trading costs.
//
// WHY THIS IS THE TEST THAT MATTERS: every prior result in this program is confounded by two errors
// that were never research choices.
//
//   1. WRONG POND. All three strategy families ran on the SPUS-ever-held universe — ~320 large and
//      mid caps. The owner's actual winners (SNDK, INOD, ASTS, RKLB) were never in it. A strategy
//      cannot select a name its universe excludes.
//   2. WRONG COSTS. 15bps per side was assumed everywhere and never measured. Alpaca SIP NBBO
//      quotes put it at 0.13-3.6bps for liquid names (SPY 0.27bps full spread validates the sample).
//      That single number was the stated reason fast momentum failed.
//
// This runs on all 6,786 NASDAQ symbols ever listed — active and delisted — with a liquidity-tiered
// cost model calibrated to the measured spreads.
//
// SURVIVORSHIP: delisted names are IN the archive and IN the universe on every date they traded. A
// name that stops trading is liquidated at its last close and the proceeds held in cash to the next
// rebalance. Dropping it instead would rebuild the 13.55pp/yr bias this program already measured.
//
// LOOK-AHEAD: the universe at each decision date is "had a bar in the trailing 60 sessions and met
// the liquidity floor" — both computable on the date itself. No index membership, no current roster.
//
// PRE-REGISTERED PARAMETERS (Jegadeesh & Titman 1993; not tuned here):
//   signal    return from t-12 months to t-1 month (the standard one-month skip for reversal)
//   rebalance monthly, at month end
//   hold      top N equal-weighted
//   floor     trailing median dollar volume >= $5M/day
//
// Monthly granularity: NAV is tracked month to month, so drawdown and Sharpe are monthly-based and
// will understate intramonth drawdown. Stated, not hidden.
//
// Reads the archive only. No network, no DB writes.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

/**
 * ETFs, ETNs and closed-end funds, excluded from the SELECTABLE universe (never from the benchmark).
 *
 * Without this the first run of this script produced a rule that "beat SPUS by 12.18pp/yr" by
 * holding SPY, QQQ, TQQQ (3x leveraged Nasdaq), SQQQ (3x inverse) and TLT (Treasury bonds). That is
 * borrowed beta dressed as alpha, and two of those holdings are impermissible outright. A
 * stock-selection result that can select an index fund is not measuring stock selection.
 */
const FUND_SYMBOLS: Set<string> = (() => {
  try {
    return new Set(readFileSync(path.join(process.cwd(), 'data', 'fund-symbols.txt'), 'utf8')
      .split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean));
  } catch {
    throw new Error('data/fund-symbols.txt missing — run scripts/build-fund-exclusion-list.ts first. '
      + 'Refusing to run a stock screen over a universe that still contains leveraged ETFs.');
  }
})();

/** cik -> 'YYYYQn' -> revenue, and symbol -> cik. Both absent is fine; the price modes ignore them. */
const REVENUE: Record<string, Record<string, number>> = (() => {
  try {
    return JSON.parse(gunzipSync(readFileSync(
      path.join(process.cwd(), 'data', 'fundamentals', 'revenue-frames.json.gz'))).toString('utf8'));
  } catch { return {}; }
})();
const TICKER_CIK: Record<string, string> = (() => {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'fundamentals', 'ticker-cik.json'), 'utf8'));
  } catch { return {}; }
})();

/**
 * Days after a fiscal quarter ends before its revenue is treated as public.
 *
 * The frames API carries no filing date, so availability has to be approximated. 90 days exceeds the
 * SEC's own 10-Q deadline (40 days accelerated, 45 non-accelerated), so this DELAYS the signal
 * rather than advancing it — the error runs against the strategy, never for it.
 */
const AVAILABILITY_LAG_DAYS = 90;
const QUARTER_END: Record<string, string> = { Q1: '-03-31', Q2: '-06-30', Q3: '-09-30', Q4: '-12-31' };

/** The most recent quarter whose revenue is public by the last day of month `m` ('YYYY-MM'). */
function latestAvailableQuarter(m: string): string | null {
  const decisionDate = new Date(`${m}-01T00:00:00Z`);
  decisionDate.setUTCMonth(decisionDate.getUTCMonth() + 1);
  decisionDate.setUTCDate(0); // last day of month m
  let best: string | null = null;
  const year = Number(m.slice(0, 4));
  for (let y = year - 2; y <= year; y += 1) {
    for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) {
      const end = new Date(`${y}${QUARTER_END[q]}T00:00:00Z`);
      if (end.getTime() + AVAILABILITY_LAG_DAYS * 86_400_000 <= decisionDate.getTime()) best = `${y}${q}`;
    }
  }
  return best;
}

/** Shift a 'YYYYQn' key back by `n` quarters. */
function shiftQuarter(key: string, n: number): string {
  let y = Number(key.slice(0, 4));
  let q = Number(key.slice(5)) - n;
  while (q < 1) { q += 4; y -= 1; }
  return `${y}Q${q}`;
}

/**
 * `--universe=halal` restricts the eligible set to the Shariah-screened roster AS IT STOOD AT EACH
 * DECISION DATE — point-in-time SPUS N-PORT membership, `availableAt <= decision date`.
 *
 * THE FIRST VERSION OF THIS FILTER USED TODAY'S ROSTER AND IT PRODUCED A FANTASY. Filtering a
 * 2020-2026 backtest by who is in SPUS in 2026 is precisely the survivorship bias this program
 * already measured at 13.55pp/yr: a name is in today's list partly BECAUSE it did well. Momentum
 * top-5 came back at 70.18%/yr with a 1.47 Sharpe, against 12.90% on the honest full universe.
 *
 * The null control is what caught it. A RANDOM draw from the same filtered set returned 27.70%/yr
 * and beat the benchmark by 9.27pp — random selection cannot beat a benchmark, so the universe
 * itself had to be carrying the return. Any ranking rule would have looked brilliant on it.
 */
const HALAL_ONLY = process.argv.includes('--universe=halal');
type MembershipTimeline = { availableAt: string; symbols: Set<string> }[];
const HALAL_TIMELINE: MembershipTimeline = (() => {
  if (!HALAL_ONLY) return [];
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const { loadCapturedSpusNportSnapshots } = require('../src/quant/universe/spusNport');
  return (loadCapturedSpusNportSnapshots() as any[])
    .map((snap) => ({
      availableAt: (snap.availableAt instanceof Date
        ? snap.availableAt.toISOString() : String(snap.availableAt)).slice(0, 7),
      symbols: new Set<string>((snap.holdings ?? []).map((h: any) => h.symbol).filter(Boolean)),
    }))
    .sort((a: any, b: any) => a.availableAt.localeCompare(b.availableAt));
})();

/** Membership PUBLIC at month `m` — never a later snapshot, never today's roster. */
function halalUniverseAt(m: string): Set<string> | null {
  let chosen: Set<string> | null = null;
  for (const e of HALAL_TIMELINE) { if (e.availableAt <= m) chosen = e.symbols; else break; }
  return chosen;
}

const LIQUIDITY_FLOOR_USD = 5_000_000;
const SKIP_MONTHS = 1;
const LOOKBACK_MONTHS = 12;
const BENCH = 'SPUS';

/**
 * Half-spread in basis points by trailing dollar volume, calibrated to measured Alpaca SIP NBBO
 * medians (2026-08-29): SPY 36.9B/0.13, NVDA 32.1B/0.48, AAPL 11.0B/0.50, AMD 7.4B/3.14,
 * MU 2.8B/2.07, SNDK 1.9B/5.34, MRVL 1.1B/3.63, RKLB 536M/3.93, HIMS 450M/3.16, ASTS 393M/5.25,
 * INOD 49M/15.38. Tiers are rounded UP from the measured medians — a cost model should err expensive.
 */
function halfSpreadBps(dollarVolume: number): number {
  if (dollarVolume >= 5e9) return 1;
  if (dollarVolume >= 1e9) return 4;
  if (dollarVolume >= 2e8) return 6;
  if (dollarVolume >= 5e7) return 16;
  return 35;
}

interface MonthRec { close: number; dollarVol: number }
/** symbol -> 'YYYY-MM' -> record. Built in one streaming pass so raw bars are never all resident. */
type Panel = Map<string, Map<string, MonthRec>>;

function buildPanel(): { panel: Panel; months: string[] } {
  const panel: Panel = new Map();
  const allMonths = new Set<string>();
  const symbols = listArchivedSymbols();
  let loaded = 0;

  for (const s of symbols) {
    let arch;
    try { arch = readArchive(s); } catch { continue; }
    if (!arch?.bars?.length) continue;
    const bars = arch.bars as ArchivedBar[];
    const byMonth = new Map<string, { close: number; dvs: number[] }>();
    for (const b of bars) {
      if (!(b.c > 0)) continue;
      const m = b.d.slice(0, 7);
      let rec = byMonth.get(m);
      if (!rec) { rec = { close: b.c, dvs: [] }; byMonth.set(m, rec); }
      rec.close = b.c; // last close of the month
      rec.dvs.push(b.c * b.v);
    }
    const out = new Map<string, MonthRec>();
    for (const [m, rec] of Array.from(byMonth.entries())) {
      const dvs = rec.dvs.filter((v) => v > 0).sort((a, b) => a - b);
      out.set(m, { close: rec.close, dollarVol: dvs.length ? dvs[Math.floor(dvs.length / 2)] : 0 });
      allMonths.add(m);
    }
    panel.set(s, out);
    loaded += 1;
  }
  console.log(`panel: ${loaded} symbols, ${allMonths.size} months`);
  return { panel, months: Array.from(allMonths).sort() };
}

interface Result {
  cagr: number; maxDD: number; sharpe: number; turnPerMonth: number; costDrag: number;
  months: number; avgNames: number;
}

/**
 * Ranking modes. The controls are not decoration — they are what makes the momentum number
 * interpretable.
 *
 *   random   the null. If momentum does not beat a random draw from the SAME liquidity-filtered
 *            universe, the signal carries no information and every other number is diversification.
 *   reversal momentum with the sign flipped. If reversal beats momentum, the era rewarded buying
 *            losers, and a momentum book was on the wrong side of a real effect rather than of noise.
 *   largest  buy the biggest names by dollar volume — a crude cap-weight proxy. Checks whether the
 *            benchmark's advantage is simply size exposure the strategy refuses to take.
 */
type Mode = 'momentum' | 'reversal' | 'random' | 'largest'
  | 'revgrowth' | 'revaccel' | 'largest-mapped';

/** Deterministic PRNG so the random control is reproducible from its seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function run(panel: Panel, months: string[], topN: number, from: string, to: string,
  mode: Mode = 'momentum', seed = 20260829): Result {
  const rnd = mulberry32(seed);
  const decisionMonths = months.filter((m) => m >= from && m <= to);
  let nav = 1;
  const navPath: number[] = [1];
  let weights = new Map<string, number>();
  let turnoverSum = 0; let costSum = 0; let nameSum = 0; let rebalances = 0;

  for (let i = 0; i < decisionMonths.length - 1; i += 1) {
    const m = decisionMonths[i];
    const next = decisionMonths[i + 1];
    const lookbackIdx = months.indexOf(m) - LOOKBACK_MONTHS;
    const skipIdx = months.indexOf(m) - SKIP_MONTHS;
    if (lookbackIdx < 0) continue;
    const mLook = months[lookbackIdx];
    const mSkip = months[skipIdx];

    // Eligible = priced now, priced at both signal endpoints, and liquid enough NOW.
    // Fundamental modes need a revenue panel and a CIK; the price modes must NOT be restricted to
    // that subset, or their numbers stop being comparable to the earlier full-universe runs.
    const needsRevenue = mode === 'revgrowth' || mode === 'revaccel';
    const restrictToMapped = needsRevenue || mode === 'largest-mapped';
    const q = restrictToMapped ? latestAvailableQuarter(m) : null;

    // Resolved once per decision month, from snapshots public BY that month.
    const halalAt = HALAL_ONLY ? halalUniverseAt(m) : null;
    if (HALAL_ONLY && !halalAt) continue; // no membership evidence yet -> no decision, not a guess

    const scored: { s: string; mom: number; dv: number; growth: number; accel: number }[] = [];
    for (const [s, rows] of Array.from(panel.entries())) {
      if (s === BENCH || FUND_SYMBOLS.has(s)) continue;
      if (halalAt && !halalAt.has(s)) continue;
      const now = rows.get(m);
      const look = rows.get(mLook);
      const skip = rows.get(mSkip);
      if (!now || !look || !skip) continue;
      if (now.dollarVol < LIQUIDITY_FLOOR_USD) continue;

      let growth = 0; let accel = 0;
      if (restrictToMapped) {
        const cik = TICKER_CIK[s];
        if (!cik) continue;
        const rev = REVENUE[String(Number(cik))] ?? REVENUE[cik];
        if (needsRevenue) {
          if (!rev || !q) continue;
          const r0 = rev[q]; const r4 = rev[shiftQuarter(q, 4)];
          const r1 = rev[shiftQuarter(q, 1)]; const r5 = rev[shiftQuarter(q, 5)];
          // Growth is undefined against a non-positive base, and a sign flip in the denominator
          // produces a meaningless ratio rather than a large one.
          if (!(r0 > 0 && r4 > 0 && r1 > 0 && r5 > 0)) continue;
          growth = r0 / r4 - 1;
          accel = growth - (r1 / r5 - 1);
        }
      }
      scored.push({ s, mom: skip.close / look.close - 1, dv: now.dollarVol, growth, accel });
    }
    if (scored.length < topN * 3) continue;
    // Every mode draws from the IDENTICAL eligible set, so the comparison isolates the ranking rule
    // and nothing else — same dates, same liquidity floor, same survivorship treatment.
    if (mode === 'momentum') scored.sort((a, b) => b.mom - a.mom);
    else if (mode === 'reversal') scored.sort((a, b) => a.mom - b.mom);
    else if (mode === 'largest' || mode === 'largest-mapped') scored.sort((a, b) => b.dv - a.dv);
    // Fast growers that are ALSO speeding up. The acceleration filter comes first as a gate, then
    // growth ranks within it — a decelerating 200% grower is the classic value trap of this factor.
    else if (mode === 'revaccel') {
      const accelerating = scored.filter((x) => x.accel > 0 && x.growth > 0);
      scored.length = 0;
      scored.push(...accelerating.sort((a, b) => b.growth - a.growth));
    } else if (mode === 'revgrowth') scored.sort((a, b) => b.growth - a.growth);
    else for (let k = scored.length - 1; k > 0; k -= 1) {
      const j = Math.floor(rnd() * (k + 1));
      [scored[k], scored[j]] = [scored[j], scored[k]];
    }
    const picks = scored.slice(0, topN).map((x) => x.s);
    nameSum += picks.length; rebalances += 1;
    // A strategy nobody can see the holdings of is not auditable. Printed once a year so the reader
    // can judge whether the rule is picking what they think it is.
    if (process.argv.includes('--holdings') && m.endsWith('-12')) {
      console.log(`    ${m}  ${picks.slice(0, 12).join(' ')}`);
    }

    const target = new Map<string, number>(picks.map((s) => [s, 1 / picks.length]));

    // Cost: per-name half-spread on the absolute weight change, not a flat rate. A rebalance that
    // rotates into illiquid names costs more than one that rotates into liquid ones, and a flat
    // rate hides exactly that.
    let turnover = 0; let cost = 0;
    const universe = new Set<string>([...Array.from(target.keys()), ...Array.from(weights.keys())]);
    for (const s of Array.from(universe)) {
      const d = Math.abs((target.get(s) ?? 0) - (weights.get(s) ?? 0));
      if (d <= 0) continue;
      turnover += d;
      const dv = panel.get(s)?.get(m)?.dollarVol ?? 0;
      cost += d * (halfSpreadBps(dv) / 10_000);
    }
    turnoverSum += turnover; costSum += cost;
    nav *= 1 - cost;

    // Hold one month. A name with no next-month bar delisted: realise at its last known close,
    // which is already `now.close`, i.e. a 0% return for the month rather than a silent drop.
    let growth = 0;
    for (const [s, w] of Array.from(target.entries())) {
      const now = panel.get(s)!.get(m)!;
      const nxt = panel.get(s)!.get(next);
      growth += w * (nxt ? nxt.close / now.close - 1 : 0);
    }
    nav *= 1 + growth;
    navPath.push(nav);
    // Weights drift with the individual names, not with the book — the bug that inflated turnover
    // in an earlier measurement in this program.
    const grown = new Map<string, number>();
    for (const [s, w] of Array.from(target.entries())) {
      const now = panel.get(s)!.get(m)!;
      const nxt = panel.get(s)!.get(next);
      grown.set(s, w * (nxt ? nxt.close / now.close : 1));
    }
    weights = new Map();
    for (const [s, v] of Array.from(grown.entries())) weights.set(s, v / (1 + growth));
  }

  const years = (navPath.length - 1) / 12;
  const rets = navPath.slice(1).map((v, i) => v / navPath[i] - 1);
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length - 1));
  let peak = navPath[0]; let mdd = 0;
  for (const v of navPath) { if (v > peak) peak = v; mdd = Math.max(mdd, (peak - v) / peak); }
  return {
    cagr: nav ** (1 / years) - 1,
    maxDD: mdd,
    sharpe: sd > 0 ? (mu / sd) * Math.sqrt(12) : 0,
    turnPerMonth: turnoverSum / rebalances,
    costDrag: costSum / years,
    months: navPath.length - 1,
    avgNames: nameSum / Math.max(1, rebalances),
  };
}

function benchmark(panel: Panel, months: string[], from: string, to: string): Result | null {
  const rows = panel.get(BENCH);
  if (!rows) return null;
  const ms = months.filter((m) => m >= from && m <= to && rows.has(m));
  if (ms.length < 24) return null;
  const path = ms.map((m) => rows.get(m)!.close);
  const years = (path.length - 1) / 12;
  const rets = path.slice(1).map((v, i) => v / path[i] - 1);
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length - 1));
  let peak = path[0]; let mdd = 0;
  for (const v of path) { if (v > peak) peak = v; mdd = Math.max(mdd, (peak - v) / peak); }
  return {
    cagr: (path[path.length - 1] / path[0]) ** (1 / years) - 1,
    maxDD: mdd, sharpe: (mu / sd) * Math.sqrt(12),
    turnPerMonth: 0, costDrag: 0, months: path.length - 1, avgNames: 1,
  };
}

function main() {
  const { panel, months } = buildPanel();
  const from = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] ?? '2017-01';
  const to = process.argv.find((a) => a.startsWith('--to='))?.split('=')[1] ?? '2026-08';

  const b = benchmark(panel, months, from, to);

  // WINDOW PARITY. `benchmark()` silently restricts itself to months the benchmark actually has,
  // because SPUS did not exist before 2019-12-18. Asking for 2017-01 therefore measured the
  // STRATEGIES over 9.6 years and the BENCHMARK over 6.7, and printed the difference as if it were
  // a like-for-like comparison. Nothing in the output disclosed it.
  //
  // The qualitative verdict survived a re-run on a common window (momentum still loses at every
  // concentration), but a comparison that quietly uses two different periods is not evidence of
  // anything, and the next person would not have known either. Fail loudly instead.
  const stratMonths = months.filter((m) => m >= from && m <= to).length;
  const benchMonths = b ? b.months + 1 : 0;
  if (b && benchMonths < stratMonths * 0.95) {
    const firstBench = Array.from(panel.get(BENCH)?.keys() ?? []).sort()[0] ?? '?';
    throw new Error(
      `WINDOW MISMATCH: strategies would span ${stratMonths} months (${from}..${to}) but ${BENCH} `
      + `only covers ${benchMonths} of them — its first month is ${firstBench}.\n`
      + `Comparing them would report a difference between two different periods. `
      + `Re-run with --from=${firstBench} or later.`,
    );
  }

  console.log(`\nwindow ${from} .. ${to}`);
  if (b) console.log(`benchmark ${BENCH}   ${(b.cagr * 100).toFixed(2)}%/yr   maxDD ${(b.maxDD * 100).toFixed(1)}%   Sharpe ${b.sharpe.toFixed(2)}\n`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    universe: 'all 6,786 ever-listed NASDAQ symbols, FUND_SYMBOLS excluded, survivorship-INCLUSIVE',
    costs: 'liquidity-tiered half-spread, calibrated to measured Alpaca SIP NBBO medians (see header)',
  });
  // SPUS's own return over the default 2017-2026 window is known independently of this file's ranking
  // machinery — repeatedly measured elsewhere in this program at ~17.6%/yr (agents/objective.json).
  // Skipped for a caller-supplied window, since a custom --from/--to has no reason to land near it.
  if (b && from === '2017-01' && to === '2026-08') anchor(`${BENCH} benchmark CAGR`, b.cagr, 0.176, 0.35);

  const modes = (process.argv.find((a) => a.startsWith('--modes='))?.split('=')[1]
    ?? 'momentum,reversal,random,largest').split(',') as Mode[];
  for (const mode of modes) {
    console.log(`\n=== ${mode.toUpperCase()} ===`);
    console.log('topN    CAGR     maxDD   Sharpe   turn/mo   cost/yr   vs bench');
    for (const topN of [5, 20, 50, 100]) {
      const r = run(panel, months, topN, from, to, mode);
      const vs = b ? `${((r.cagr - b.cagr) * 100).toFixed(2).padStart(8)}pp` : '';
      console.log(`${String(topN).padStart(4)}  ${(r.cagr * 100).toFixed(2).padStart(6)}%  `
        + `${(r.maxDD * 100).toFixed(1).padStart(6)}%  ${r.sharpe.toFixed(2).padStart(6)}  `
        + `${(r.turnPerMonth * 100).toFixed(0).padStart(7)}%  ${(r.costDrag * 100).toFixed(2).padStart(7)}%  ${vs}`);
    }
  }
}

main();
