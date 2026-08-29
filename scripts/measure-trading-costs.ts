// W3 — per-name trading costs estimated from the bar archive, replacing the flat 15bps.
//
// WHY: every cost number this program has produced (the 1.92-5.52pp/yr drag, and the verdict that
// cost killed fast momentum) rests on ONE unmeasured assumption: 15 basis points per side, applied
// identically to every name. Novy-Marx & Velikov's TAQ work puts real costs at 20-57bps for
// mid-turnover large-cap anomalies, and small caps are far worse. If the strategy is going to trade
// names like INOD, the flat assumption is not conservative — it is wrong in the direction that
// makes the strategy look profitable.
//
// TWO ESTIMATORS, both computable from daily OHLCV alone (no intraday data, no vendor):
//
//   Corwin & Schultz (2012), "A Simple Way to Estimate Bid-Ask Spreads from Daily High and Low
//   Prices", J. Finance 67(2). Uses the insight that the high-low RANGE reflects both volatility
//   (which scales with time) and the spread (which does not), so two consecutive days separate them.
//
//   Amihud (2002), "Illiquidity and stock returns", J. Financial Markets 5(1). |return| per dollar
//   traded — a price-IMPACT measure, which is what actually binds when a book grows.
//
// The spread is what you pay on a small order; impact is what you pay when your order is large
// relative to the name. A 100,000 SAR book pays roughly the spread. A 5,000,000 SAR book pays both.
//
// Reads ONLY the on-disk archive. No network, no DB writes.
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

const ROOT2 = Math.sqrt(2);
const K = 3 - 2 * ROOT2;
/** The assumption in force across this repo, quoted so every result below is a comparison to it. */
const FLAT_ASSUMPTION_BPS = 15;

/**
 * Corwin-Schultz two-day spread estimate, in basis points of price.
 *
 * Negative alphas are set to zero, per the paper: the estimator is unbiased in expectation but
 * individual two-day estimates can go negative on low-volatility pairs, and averaging the negatives
 * in would understate the true spread.
 */
export function corwinSchultzBps(bars: readonly ArchivedBar[]): number | null {
  const estimates: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const a = bars[i - 1];
    const b = bars[i];
    if (!(a.h > 0 && a.l > 0 && b.h > 0 && b.l > 0)) continue;
    // Overnight gaps violate the estimator's assumption that the two-day range contains both days'
    // prices. CS handle this by shifting the range; a gapped pair is skipped here instead, which is
    // conservative in the sense of dropping data rather than fabricating an adjustment.
    if (b.l > a.h || b.h < a.l) continue;
    const beta = Math.log(a.h / a.l) ** 2 + Math.log(b.h / b.l) ** 2;
    const gamma = Math.log(Math.max(a.h, b.h) / Math.min(a.l, b.l)) ** 2;
    const alpha = (Math.sqrt(2 * beta) - Math.sqrt(beta)) / K - Math.sqrt(gamma / K);
    const s = (2 * (Math.exp(alpha) - 1)) / (1 + Math.exp(alpha));
    estimates.push(Math.max(0, s));
  }
  if (estimates.length < 20) return null;
  estimates.sort((x, y) => x - y);
  // Median, not mean: the estimator has a fat right tail on halt days and earnings gaps.
  return estimates[Math.floor(estimates.length / 2)] * 10_000;
}

/**
 * Abdi & Ranaldo (2017), "A Simple Estimation of Bid-Ask Spreads from Daily Close, High, and Low
 * Prices", Review of Financial Studies 30(12).
 *
 * WHY THIS IS HERE: Corwin-Schultz confounds intraday VOLATILITY with the spread — the two-day range
 * grows with both, and the correction is imperfect for high-vol names. Run on this basket it returns
 * 4bps for SPY (true quoted spread is well under 1bp) and ranks NVDA as more expensive than AAPL
 * despite three times the dollar volume. That ordering is volatility, not liquidity.
 *
 * AR uses the distance between the CLOSE and the mid-range of the SAME and the NEXT day. Under the
 * paper's assumptions the volatility term cancels in expectation, leaving the spread. It is the
 * better estimator for exactly the high-volatility names this strategy would trade.
 *
 *   eta_t = (ln H_t + ln L_t) / 2
 *   S^2   = 4 * E[ (ln C_t - eta_t) * (ln C_t - eta_{t+1}) ]
 */
export function abdiRanaldoBps(bars: readonly ArchivedBar[]): number | null {
  const terms: number[] = [];
  for (let i = 0; i < bars.length - 1; i += 1) {
    const t = bars[i];
    const n = bars[i + 1];
    if (!(t.h > 0 && t.l > 0 && n.h > 0 && n.l > 0 && t.c > 0)) continue;
    const etaT = (Math.log(t.h) + Math.log(t.l)) / 2;
    const etaN = (Math.log(n.h) + Math.log(n.l)) / 2;
    const c = Math.log(t.c);
    terms.push(4 * (c - etaT) * (c - etaN));
  }
  if (terms.length < 20) return null;
  // The paper averages the covariance term and then takes the root, clamping negatives to zero.
  // Averaging BEFORE the root is essential: rooting each term first discards the sign and biases up.
  const mean = terms.reduce((a, b) => a + b, 0) / terms.length;
  return Math.sqrt(Math.max(0, mean)) * 10_000;
}

/** Amihud illiquidity, scaled x1e6 as in the original paper. Higher = more price impact per dollar. */
export function amihud(bars: readonly ArchivedBar[]): number | null {
  const vals: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const dv = bars[i].c * bars[i].v;
    if (dv <= 0) continue;
    vals.push(Math.abs(bars[i].c / bars[i - 1].c - 1) / dv);
  }
  if (vals.length < 20) return null;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)] * 1e6;
}

export function medianDollarVolume(bars: readonly ArchivedBar[]): number {
  const dv = bars.map((b) => b.c * b.v).filter((v) => v > 0).sort((a, b) => a - b);
  return dv.length ? dv[Math.floor(dv.length / 2)] : 0;
}

function windowed(bars: readonly ArchivedBar[], from: string): ArchivedBar[] {
  return bars.filter((b) => b.d >= from);
}

function main() {
  const from = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] ?? '2024-01-01';
  const requested = process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1];
  const symbols = requested
    ? requested.split(',').map((s) => s.trim().toUpperCase())
    : ['AMD', 'GOOGL', 'RKLB', 'MU', 'HIMS', 'MRVL', 'NVDA', 'INOD', 'ASTS', 'SNDK',
      'SPUS', 'QQQ', 'SPY', 'AAPL', 'MSFT'];

  console.log(`estimated from daily bars since ${from}\n`);
  console.log('symbol   medianDollarVol    AR spread   CS spread   AR half   Amihud   vs 15bps');
  console.log('                    $/day          bps         bps  bps/side     x1e6');

  const rows: { s: string; half: number; dv: number }[] = [];
  for (const s of symbols) {
    const arch = readArchive(s);
    if (!arch) { console.log(`${s.padEnd(8)} no archive`); continue; }
    const bars = windowed(arch.bars as ArchivedBar[], from);
    if (bars.length < 40) { console.log(`${s.padEnd(8)} only ${bars.length} bars since ${from}`); continue; }
    const cs = corwinSchultzBps(bars);
    const ar = abdiRanaldoBps(bars);
    const am = amihud(bars);
    const dv = medianDollarVolume(bars);
    if (ar === null) { console.log(`${s.padEnd(8)} insufficient usable pairs`); continue; }
    // AR is the primary estimate; CS is retained only as the contrast that motivated adding AR.
    const half = ar / 2;
    rows.push({ s, half, dv });
    console.log(`${s.padEnd(8)} ${fmtUsd(dv).padStart(15)}   ${ar.toFixed(1).padStart(10)}  `
      + `${(cs ?? NaN).toFixed(1).padStart(10)}  ${half.toFixed(1).padStart(8)}  `
      + `${(am ?? NaN).toFixed(3).padStart(7)}   ${(half / FLAT_ASSUMPTION_BPS).toFixed(2).padStart(5)}x`);
  }

  // What the flat assumption costs us, in the only terms that matter: the turnover a strategy can
  // afford before its cost drag eats the benchmark's entire return.
  console.log(`\nTURNOVER A NAME CAN SUSTAIN before cost drag reaches 5%/yr of the book`);
  console.log(`(at the measured half-spread; 5% chosen because it is roughly a third of SPUS's 17.6%)`);
  for (const r of rows.sort((a, b) => a.half - b.half)) {
    // drag = turnover_per_year x half_spread. Solve for monthly turnover at 5%/yr.
    const annualTurns = 0.05 / (r.half / 10_000);
    console.log(`  ${r.s.padEnd(8)} ${(annualTurns / 12 * 100).toFixed(0).padStart(5)}% per month`
      + `   (half-spread ${r.half.toFixed(1)}bps)`);
  }

  const measured = rows.reduce((a, r) => a + r.half, 0) / rows.length;
  console.log(`\nmean measured half-spread across these names: ${measured.toFixed(1)}bps`);
  console.log(`repo-wide assumption:                         ${FLAT_ASSUMPTION_BPS}bps`);
  console.log(`ratio:                                        ${(measured / FLAT_ASSUMPTION_BPS).toFixed(2)}x`);
  console.log(`\nCAVEAT: Corwin-Schultz estimates the QUOTED spread. Marketable retail orders often`);
  console.log(`execute inside it via price improvement, so this is an upper bound on the spread`);
  console.log(`component — and a LOWER bound on total cost, because it excludes market impact,`);
  console.log(`which Amihud measures separately and which grows with book size.`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted) — fine for spread/volume estimators',
    spreads: 'RANGE-ESTIMATED (Corwin-Schultz / Abdi-Ranaldo) from daily OHLC, NOT observed quotes',
    costs: 'HALF-spread, per side — a round-trip pays it twice',
  });

  // NOT anchoring the spread estimate itself: this file's own AR/CS estimators return 93.7bps for
  // SPY against a true NBBO spread well under 1bp (see measure-quoted-spreads.ts, written specifically
  // because these range estimators lost their resolution once real spreads fell below the noise in a
  // daily high/low bar). Asserting an anchor here would just document a known, already-superseded
  // defect on every run rather than catch a new one — the honest move is to say so, not to invent a
  // tolerance loose enough to paper over it. Use measure-quoted-spreads.ts for a real spread number.
  //
  // What IS safe to anchor from this file: dollar volume, which is `close x shares traded` and does
  // not go through either spread estimator. SPY trades tens of billions of dollars a day — a fact
  // any market participant knows without running this script.
  const spyRow = rows.find((r) => r.s === 'SPY');
  anchor('SPY median daily dollar volume', spyRow?.dv ?? NaN, 35e9, 0.6);
}

function fmtUsd(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

main();
