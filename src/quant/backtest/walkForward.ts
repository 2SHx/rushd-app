// Walk-forward assertion (QUANT_DESIGN.md §6, QDR-6). The daily engine is STRUCTURALLY an
// expanding-window walk-forward: at each bar t it decides on the CLOSE using only the slice
// bars[0..t] (asserted look-ahead-free by assertNoLookahead, which throws → nonzero exit on any
// violation) and fills at t+1 open. Every such guarded decision is one out-of-sample "evaluation
// window": the decision consumes only data ≤ asOf and is scored on the strictly-later fill.
//
// The QDR-6 checklist's `walkForward` flag must be EARNED by that structure, not aliased to the
// trade count (a low-trade run can still be walk-forward; a high-trade run in one collapsed window is
// not). So the harness counts how many PIT-guarded decision windows the engine actually evaluated
// and asserts it clears a documented minimum. This module is the pure assertion over that count.
//
// PURE. No bars, no DB, no randomness.

/**
 * Minimum PIT-guarded decision windows for the walk-forward flag to be earned: ~one trading year of
 * sequential out-of-sample decisions. Below this the run has too few rolling evaluations to call
 * itself walk-forward, regardless of trade count.
 */
export const MIN_WALK_FORWARD_WINDOWS = 252;

export interface WalkForwardEvidence {
  /** PIT-guarded decision windows the engine evaluated (bars decided using only ≤ asOf data). */
  decisionWindows: number;
  minRequired: number;
  passed: boolean;
}

/**
 * Assert the run evaluated enough rolling PIT decision windows to earn the walk-forward flag.
 * `decisionWindows` is accumulated by the engine (one per look-ahead-guarded bar decision); a run
 * that violated PIT never reaches this call (the engine throws LookaheadError first).
 */
export function assertWalkForward(
  decisionWindows: number,
  minRequired: number = MIN_WALK_FORWARD_WINDOWS,
): WalkForwardEvidence {
  const passed = Number.isFinite(decisionWindows) && decisionWindows >= minRequired && minRequired > 0;
  return { decisionWindows, minRequired, passed };
}
