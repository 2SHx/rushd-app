// Profit-plateau robustness gate (QUANT_DESIGN.md §6, QDR-6). A-priori definition, documented here
// so the gate is auditable and cannot be silently loosened to manufacture a pass.
//
// WHAT A PLATEAU IS (and is NOT). We re-run the setup over a small FIXED neighborhood grid of its
// 1–2 MOST sensitive params (each setup declares them via `plateauNeighborhood()`), and require the
// OOS expectancy to stay same-sign as, and within a documented DEGRADATION BOUND of, the chosen
// (center) params across ALL neighbors. This is a ROBUSTNESS PROOF — evidence the edge sits on a
// broad plateau, not a knife-edge peak that only survives at one exact parameter value. It is NOT an
// optimization: the center params are NEVER updated from a neighbor's result (a better neighbor is
// allowed and does not "win" — this module only reads expectancies, it cannot mutate params).
//
// PURE. This file does math over expectancy NUMBERS only — no bars, no DB, no randomness, no LLM.
// The expectancies are produced upstream by re-simulating each neighbor on the SAME real bars.

/**
 * Documented degradation bound: a neighbor's OOS expectancy may not fall more than 50% below the
 * center's magnitude (and must keep the same sign). A neighbor that BEATS the center is fine
 * (negative degradation) — being suboptimal at the chosen point is not a robustness failure; a
 * sharp DROP or a sign flip is. Tightening this is a real methodology change, not a config tweak.
 */
export const DEFAULT_MAX_PLATEAU_DEGRADATION = 0.5;

export interface PlateauNeighborResult {
  /** The perturbed-axis label from the setup's neighborhood (e.g. `entryStdev+0.25`). */
  label: string;
  /** OOS expectancy (mean OOS trade return) measured for this neighbor on the same real bars. */
  oosExpectancy: number;
}

export interface PlateauNeighborVerdict extends PlateauNeighborResult {
  /** Same sign as the center expectancy (a sign flip is an automatic robustness failure). */
  sameSign: boolean;
  /** (|center| − |neighbor|) / |center|: positive = worse than center, negative = better. */
  degradation: number;
  /** sameSign AND degradation ≤ the bound. */
  withinBound: boolean;
}

export interface PlateauEvaluation {
  passed: boolean;
  centerExpectancy: number;
  maxDegradation: number;
  neighbors: PlateauNeighborVerdict[];
  reason: string;
}

const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

/**
 * Evaluate the profit-plateau gate over a center expectancy and its neighborhood expectancies.
 * Passes iff the center is a genuine POSITIVE edge and every neighbor keeps the same sign and stays
 * within the degradation bound. A flat neighborhood (all neighbors ≈ center) passes; a spiky one
 * (any neighbor sign-flips or collapses past the bound) fails.
 */
export function evaluateProfitPlateau(
  centerExpectancy: number,
  neighbors: readonly PlateauNeighborResult[],
  opts?: { maxDegradation?: number },
): PlateauEvaluation {
  const maxDegradation = opts?.maxDegradation ?? DEFAULT_MAX_PLATEAU_DEGRADATION;
  if (!Number.isFinite(maxDegradation) || maxDegradation < 0) {
    throw new Error('maxDegradation must be a finite non-negative ratio');
  }

  const centerSign = sign(centerExpectancy);
  const verdicts: PlateauNeighborVerdict[] = neighbors.map((n) => {
    const sameSign = Number.isFinite(n.oosExpectancy) && sign(n.oosExpectancy) === centerSign && centerSign !== 0;
    const degradation =
      centerExpectancy !== 0 && Number.isFinite(n.oosExpectancy)
        ? (Math.abs(centerExpectancy) - Math.abs(n.oosExpectancy)) / Math.abs(centerExpectancy)
        : Infinity;
    return { ...n, sameSign, degradation, withinBound: sameSign && degradation <= maxDegradation };
  });

  // A profit plateau must be a PROFITABLE one — a non-positive center edge has nothing to be robust
  // about. (Same-sign against a negative center would only prove a robust LOSS.)
  if (!Number.isFinite(centerExpectancy) || centerExpectancy <= 0) {
    return {
      passed: false,
      centerExpectancy,
      maxDegradation,
      neighbors: verdicts,
      reason: 'no_positive_center_edge',
    };
  }
  if (verdicts.length === 0) {
    return { passed: false, centerExpectancy, maxDegradation, neighbors: verdicts, reason: 'no_neighbors' };
  }

  const failing = verdicts.filter((v) => !v.withinBound);
  return {
    passed: failing.length === 0,
    centerExpectancy,
    maxDegradation,
    neighbors: verdicts,
    reason: failing.length === 0
      ? 'plateau_confirmed'
      : `spiky_neighborhood:${failing.map((f) => f.label).join(',')}`,
  };
}
