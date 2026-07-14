// Rushd Quant — measured daily-return distribution (QDR-6 honest-expectations policy).
// The deliverable is never a promised return; it is the *measured* distribution of realized
// daily returns, including P(day ≥ +5%) and P(day ≤ −5%). We also expose the §6 implausible
// extension: any CLAIMED daily return ≥ 3σ of validated history is flagged implausible.
// Pure functions over plain numbers (return ratios), no Decimal money, no DB, no randomness.
import type { EquityPoint } from './metrics';

const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

function popStd(a: number[], m: number): number {
  if (a.length < 2) return 0;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

export interface DailyReturnDistribution {
  count: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  probDayGe5pct: number; // P(daily return ≥ +0.05)
  probDayLe5pct: number; // P(daily return ≤ −0.05)
}

/** Distribution summary of a realized daily-return series. */
export function summarizeDailyReturns(dailyReturns: number[]): DailyReturnDistribution {
  if (dailyReturns.length === 0) {
    return { count: 0, mean: 0, std: 0, min: 0, max: 0, probDayGe5pct: 0, probDayLe5pct: 0 };
  }
  const m = mean(dailyReturns);
  // Single-pass min/max: `Math.min(...arr)` blows the call stack on a wide-universe pooled series
  // (hundreds of thousands of daily returns spread as function arguments). A fold is O(n) + O(1) stack.
  let min = dailyReturns[0];
  let max = dailyReturns[0];
  for (const r of dailyReturns) {
    if (r < min) min = r;
    if (r > max) max = r;
  }
  return {
    count: dailyReturns.length,
    mean: m,
    std: popStd(dailyReturns, m),
    min,
    max,
    probDayGe5pct: dailyReturns.filter((r) => r >= 0.05).length / dailyReturns.length,
    probDayLe5pct: dailyReturns.filter((r) => r <= -0.05).length / dailyReturns.length,
  };
}

/**
 * Collapse an intraday (or any intra-period) equity curve to per-day close-to-close returns.
 * `dateKey` buckets timestamps into trading days; the last point in each bucket is that day's
 * mark. Overnight gaps between the harness's forced end-of-day flat and the next day's first
 * mark are real portfolio returns and are included.
 */
export function toDailyReturns(curve: EquityPoint[], dateKey: (d: Date) => string): number[] {
  if (curve.length < 2) return [];
  const eodByDay = new Map<string, number>();
  const order: string[] = [];
  for (const p of curve) {
    const k = dateKey(p.ts);
    if (!eodByDay.has(k)) order.push(k);
    eodByDay.set(k, p.equity); // later point overwrites → last mark of the day
  }
  const returns: number[] = [];
  for (let i = 1; i < order.length; i++) {
    const prev = eodByDay.get(order[i - 1])!;
    const cur = eodByDay.get(order[i])!;
    returns.push(prev !== 0 ? (cur - prev) / prev : 0);
  }
  return returns;
}

/**
 * Return of each independently-capitalized simulation period. Unlike close-to-close aggregation,
 * every supplied period contributes exactly one observation, including no-trade/zero-return days.
 */
export function toIndependentPeriodReturns(curves: readonly EquityPoint[][], startingEquity: number): number[] {
  return curves.map((curve) => {
    const endingEquity = curve.at(-1)?.equity ?? startingEquity;
    return startingEquity !== 0 ? endingEquity / startingEquity - 1 : 0;
  });
}

/**
 * §6 implausible extension: a claimed daily return is implausible when it lies ≥ `sigma`
 * standard deviations above the mean of validated history (i.e. beyond what the measured
 * distribution supports). With <2 observations there is no validated history, so any nonzero
 * claim is implausible — we cannot back it.
 */
export function isImplausibleDailyClaim(
  claimedDailyReturn: number,
  validatedDailyReturns: number[],
  sigma = 3,
): boolean {
  if (validatedDailyReturns.length < 2) return claimedDailyReturn !== 0;
  const m = mean(validatedDailyReturns);
  const sd = popStd(validatedDailyReturns, m);
  if (sd === 0) return claimedDailyReturn > m;
  return claimedDailyReturn >= m + sigma * sd;
}
