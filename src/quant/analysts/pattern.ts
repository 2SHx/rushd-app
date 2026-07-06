// Pattern / Analog analyst (QUANT_DESIGN.md §2.3 #4) — empirical historical-analog
// mining: kNN over a z-normalized recent-return "shape" against every prior,
// non-overlapping window of the same length, voting on the forward-return
// distribution of the nearest matches. Deterministic, no LLM, no randomness.
//
// Honesty over cleverness (skill: backtesting-rigor):
//  - Leakage guard: any candidate whose [shape, forward] range intersects the
//    current lookback window is dropped before anything else runs.
//  - Non-overlap guard: accepted analogs' FORWARD windows never overlap each
//    other, so the forward-return sample is (close to) independent, not
//    pseudo-replicated off adjacent days.
//  - < MIN_ANALOGS qualified analogs (after both guards) ⇒ abstain. Never
//    fabricates a stance off a thin or all-recent sample.
//  - DECISION (flagged, not hidden): the spec names a separate "K nearest" and
//    "MIN_ANALOGS" gate; this implementation uses K_NEIGHBORS === MIN_ANALOGS
//    (the analogs actually voted on are the nearest min(K, poolSize) of the
//    full qualified pool). That keeps the evidence's reported analog count
//    always >= MIN_ANALOGS whenever non-abstaining, at the cost of conviction's
//    sample-size factor being driven by the *full* qualified pool size (which
//    can exceed K) rather than by K itself — i.e. "more history than the
//    minimum" raises conviction even though the same K analogs vote.
import type { Analyst, AnalystSignal, Stance, Evidence } from '../types';
import type { PointInTimeContext } from '../data/pointInTime';

export const PATTERN_WINDOW = 20; // trading days in the "shape" being matched
export const FORWARD_HORIZON = 10; // trading days of forward return per analog
export const MIN_ANALOGS = 100; // minimum qualified, non-overlapping analogs — else abstain
const K_NEIGHBORS = MIN_ANALOGS; // analogs actually voted on (nearest K of the qualified pool)
const DEADBAND = 0.002; // |median forward return| below this ⇒ NEUTRAL
const MAX_LOOKBACK_DAYS = 3650; // ~10y — the wider the analog pool, the better (see OPEN note)

const num = (x: unknown): number => Number(x as number);
const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a: number[]): number => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const median = (a: number[]): number => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const clamp = (x: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, x));

/** Daily simple returns from a chronological close series. rets[k] = day k → k+1. */
export function toReturns(closes: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    rets.push(closes[i - 1] ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0);
  }
  return rets;
}

/** Per-window z-score normalization (shape-invariant to local drift/scale). */
function zNormalize(a: number[]): number[] {
  const m = mean(a);
  const s = std(a);
  return s ? a.map((v) => (v - m) / s) : a.map(() => 0);
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

export interface AnalogCandidate {
  start: number; // start index into `rets` (shape window begins here)
  forwardReturn: number; // cumulative return over FORWARD_HORIZON days after the shape window
}

/**
 * The full universe of historical analogs eligible to vote:
 *  (1) leakage guard — combined [shape ∪ forward] range must end at or before
 *      `currentStart` (the first index of the current lookback window in `rets`
 *      space), so no analog ever touches data used to build the query shape;
 *  (2) mutual non-overlap — forward windows are packed greedily, earliest-start
 *      first, so no two accepted analogs' forward returns share a day.
 * Pure function of (closes, rets, currentStart) — no wall-clock, no randomness.
 */
export function qualifiedAnalogCandidates(
  closes: number[],
  rets: number[],
  currentStart: number,
): AnalogCandidate[] {
  const n = rets.length;
  const pool: AnalogCandidate[] = [];
  let lastForwardEnd = -Infinity;
  for (let s = 0; s + PATTERN_WINDOW + FORWARD_HORIZON <= n; s++) {
    const forwardStart = s + PATTERN_WINDOW;
    const forwardEnd = forwardStart + FORWARD_HORIZON;
    if (forwardEnd > currentStart) break; // leakage guard: touches/overlaps current lookback
    if (forwardStart < lastForwardEnd) continue; // overlaps a previously accepted analog's forward window
    const shapeCloseStart = s + PATTERN_WINDOW; // closes index at shape-window end
    const shapeCloseFwdEnd = shapeCloseStart + FORWARD_HORIZON;
    const base = closes[shapeCloseStart];
    const forwardReturn = base ? (closes[shapeCloseFwdEnd] - base) / base : 0;
    pool.push({ start: s, forwardReturn });
    lastForwardEnd = forwardEnd;
  }
  return pool;
}

export const patternAnalyst: Analyst = {
  agent: 'PATTERN_ANALOG',
  async run(ctx: PointInTimeContext): Promise<AnalystSignal> {
    const bars = ctx.bars(MAX_LOOKBACK_DAYS);
    const base = {
      agent: 'PATTERN_ANALOG' as const,
      symbol: ctx.symbol,
      market: ctx.market,
      asOf: ctx.asOf,
      horizonDays: FORWARD_HORIZON,
      determinism: 'deterministic' as const,
      costCents: 0,
    };
    const abstain = (reason: string, reasonAr: string): AnalystSignal => ({
      ...base,
      stance: 'NEUTRAL',
      conviction: 0,
      evidence: [],
      failureMode: 'abstain',
      rationaleEn: reason,
      rationaleAr: reasonAr,
    });

    const closes = bars.map((b) => num(b.close));
    if (closes.length < PATTERN_WINDOW + 1) {
      return abstain(
        `Insufficient history (${closes.length} bars) to form a ${PATTERN_WINDOW}-day pattern.`,
        `بيانات تاريخية غير كافية (${closes.length} شمعة) لتكوين نمط ${PATTERN_WINDOW} يومًا.`,
      );
    }

    const rets = toReturns(closes);
    const n = rets.length;
    const currentStart = n - PATTERN_WINDOW;
    const currentShape = zNormalize(rets.slice(currentStart, n));

    const pool = qualifiedAnalogCandidates(closes, rets, currentStart);
    if (pool.length < MIN_ANALOGS) {
      return abstain(
        `Only ${pool.length} qualified non-overlapping analogs (< ${MIN_ANALOGS} required) — abstaining rather than guessing.`,
        `عدد الأنماط التاريخية المؤهلة غير المتداخلة ${pool.length} فقط (أقل من ${MIN_ANALOGS} المطلوبة) — الامتناع بدل التخمين.`,
      );
    }

    const scored = pool.map((c) => {
      const shape = zNormalize(rets.slice(c.start, c.start + PATTERN_WINDOW));
      return { ...c, distance: euclidean(shape, currentShape) };
    });
    scored.sort((a, b) => a.distance - b.distance);
    const analogs = scored.slice(0, Math.min(K_NEIGHBORS, scored.length));

    const fwdReturns = analogs.map((a) => a.forwardReturn);
    const medianFwd = median(fwdReturns);
    const sign = medianFwd > DEADBAND ? 1 : medianFwd < -DEADBAND ? -1 : 0;
    const agreement =
      analogs.filter((a) => Math.sign(a.forwardReturn) === Math.sign(medianFwd)).length / analogs.length;
    const sampleSizeFactor = clamp(pool.length / (MIN_ANALOGS * 2), 0, 1);
    const conviction = clamp(agreement * sampleSizeFactor, 0, 1);
    const distances = analogs.map((a) => a.distance);
    const stance: Stance = sign > 0 ? 'BULLISH' : sign < 0 ? 'BEARISH' : 'NEUTRAL';

    const evidence: Evidence[] = [
      { kind: 'analog', ref: 'analog_count', value: String(analogs.length) },
      { kind: 'analog', ref: 'qualified_pool', value: String(pool.length) },
      { kind: 'analog', ref: 'median_forward_return', value: medianFwd.toFixed(4) },
      { kind: 'analog', ref: 'agreement', value: agreement.toFixed(2) },
      { kind: 'analog', ref: 'distance_mean', value: mean(distances).toFixed(4) },
      { kind: 'analog', ref: 'validity', value: 'true' },
    ];

    return {
      ...base,
      stance,
      conviction,
      evidence,
      failureMode: 'ok',
      rationaleEn: `${analogs.length} historical analogs (of ${pool.length} qualified): median ${FORWARD_HORIZON}-day forward return ${(medianFwd * 100).toFixed(2)}%, ${(agreement * 100).toFixed(0)}% agreement.`,
      rationaleAr: `${analogs.length} نمطًا تاريخيًا مشابهًا (من أصل ${pool.length} مؤهل): متوسط العائد المستقبلي خلال ${FORWARD_HORIZON} يومًا ${(medianFwd * 100).toFixed(2)}٪، بتوافق ${(agreement * 100).toFixed(0)}٪.`,
    };
  },
};
