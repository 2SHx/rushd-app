// Guardrails for quantitative research scripts.
//
// WHY THIS EXISTS: on 2026-08-29 this program produced FOUR results that were wrong and looked
// right. Each was caught by accident or by an ad-hoc check, and each had already been reported
// before the check was run:
//
//   1. A 15bps-per-side cost assumption, never measured, was 5-100x too high. It was the stated
//      reason three strategies "failed" and the stated mechanism by which a fourth "worked".
//   2. A universe screen "beat the benchmark by 12.18pp/yr" by buying TQQQ, SQQQ and TLT. Caught
//      only by printing the holdings.
//   3. Market capitalisation computed from split-ADJUSTED prices times AS-REPORTED share counts put
//      Apple at $309B against a true $1.27T, failing companies on a debt screen they passed. Caught
//      only by eyeballing one number against outside knowledge.
//   4. A compliance screen reported PASS for companies whose debt data was simply absent —
//      treating missing evidence as evidence of compliance, in a fail-closed context.
//
// The common shape: a silent wrong answer that is indistinguishable from a right one. Every one was
// caught by the same two moves — compare against something independently known, and show what the
// code actually did. This module makes those moves cheap and repeatable instead of remembered.
//
// It is deliberately small. A checklist nobody runs is worth nothing; four functions that abort a
// bad run are worth a great deal.

export class AnchorViolation extends Error {}

/**
 * Assert a computed quantity against a value known from OUTSIDE the computation, and abort if it
 * misses. The point is not precision — it is catching order-of-magnitude and unit errors, which is
 * the class that actually occurs.
 *
 * Anchors must be things you would know without running this code: SPY's spread is under a basis
 * point; Apple is a multi-trillion-dollar company; a null control should land near zero. An anchor
 * derived from the same pipeline it is checking proves nothing.
 *
 * @param tolerance fractional; 0.5 means "within 50%", which is the right looseness for a check
 *                  aimed at 10x errors rather than at 1% ones.
 */
export function anchor(label: string, actual: number, expected: number, tolerance = 0.5): void {
  const ok = Number.isFinite(actual)
    && Math.abs(actual - expected) <= Math.abs(expected) * tolerance;
  const line = `${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${fmt(actual)}, expected ~${fmt(expected)} (±${(tolerance * 100).toFixed(0)}%)`;
  console.log(`  [anchor] ${line}`);
  if (!ok) {
    throw new AnchorViolation(
      `Anchor "${label}" failed: got ${fmt(actual)}, expected ~${fmt(expected)}.\n`
      + 'This run is NOT reportable. An anchor failure means a unit, basis or scale error somewhere '
      + 'upstream — fix the cause, do not loosen the tolerance.',
    );
  }
}

/**
 * A REGRESSION check: this pipeline against a number THIS pipeline produced before.
 *
 * Deliberately a separate function from `anchor()`, because the two catch different things and
 * conflating them is an easy and expensive mistake. A regression check catches "did this change".
 * An anchor catches "was this ever right". Every one of the three wrong results this program
 * published was a case where the pipeline was CONSISTENTLY wrong — a regression check would have
 * passed on all three, twice, happily.
 *
 * Introduced after a subagent, explicitly warned that "an anchor derived from the same pipeline it
 * checks proves nothing", nonetheless used `anchor()` for two prior-run figures out of fifteen. The
 * instruction was followed to the letter and missed its point, so the distinction now lives in the
 * type signature rather than in a comment nobody re-reads.
 *
 * Use it freely — reproducing a prior result IS valuable. Just never let it stand in for an anchor.
 */
export function regressionCheck(label: string, actual: number, previous: number, tolerance = 0.3): void {
  const ok = Number.isFinite(actual)
    && Math.abs(actual - previous) <= Math.abs(previous) * tolerance;
  console.log(`  [regression] ${ok ? 'ok  ' : 'FAIL'}  ${label}: got ${fmt(actual)}, prior run ${fmt(previous)}`);
  if (!ok) {
    throw new AnchorViolation(
      `Regression "${label}" failed: got ${fmt(actual)}, previously ${fmt(previous)}.\n`
      + 'Something changed. That may be a fix or a break — but this check CANNOT tell you which, '
      + 'and it is not evidence the number was ever correct. Find an external anchor too.',
    );
  }
}

export class WindowParityViolation extends Error {}

export interface ObservedWindow {
  /** First observation actually used, YYYY-MM or YYYY-MM-DD. */
  first: string;
  /** Last observation actually used, same granularity as `first`. */
  last: string;
  /** How many observations the arm actually evaluated over that span. */
  observations: number;
}

/**
 * Assert that a strategy arm and the benchmark it is compared against were measured over the SAME
 * span, and abort if they were not.
 *
 * WHY THIS EXISTS: on 2026-08-29 `measure-nasdaq-wide-momentum.ts` was found reporting a "vs bench"
 * column in which the strategies spanned 116 months and the benchmark spanned 81, because SPUS did
 * not begin trading until 2019-12-18 and the benchmark helper quietly restricted itself to months it
 * had. Nothing in the output disclosed it, and the numbers had already been reported to the owner
 * several times. Re-running on a common window kept the qualitative verdict but moved momentum
 * top-5 from 9.55%/yr to -0.21%/yr.
 *
 * The failure has two shapes and this catches both, because both reduce to "the benchmark has fewer
 * real observations than the strategy over the same nominal span":
 *   TRUNCATION — the benchmark series is silently filtered to the months/sessions it has.
 *   ZERO-FILL  — the benchmark is kept at full length by scoring 0% where it did not yet exist,
 *                which is not the benchmark at all but a cash-then-benchmark instrument.
 *
 * `benchmark.observations` must therefore be counted from OBSERVED benchmark bars inside the
 * strategy's span, never from the length of a padded or defaulted return series.
 *
 * @param tolerance fractional shortfall permitted, default 1%. Tight on purpose: the smallest real
 *   gap worth tolerating is an archive tail of a few sessions (2 of 1,455 = 0.14%), while the
 *   smallest gap worth aborting on is about a month (21 of 1,455 = 1.4%). A missing YEAR is ~17%.
 *   Widening this to make a comparison run is the exact move it exists to prevent.
 */
export function assertWindowParity(
  label: string,
  strategy: ObservedWindow,
  benchmark: ObservedWindow,
  tolerance = 0.01,
): void {
  const ratio = strategy.observations > 0 ? benchmark.observations / strategy.observations : 0;
  const ok = Number.isFinite(ratio) && ratio >= 1 - tolerance && ratio <= 1 + tolerance;
  console.log(`  [parity] ${ok ? 'ok  ' : 'FAIL'}  ${label}: strategy ${strategy.first}..${strategy.last} `
    + `(${strategy.observations}) vs benchmark ${benchmark.first}..${benchmark.last} (${benchmark.observations})`
    + `  coverage ${(ratio * 100).toFixed(2)}%`);
  if (!ok) {
    throw new WindowParityViolation(
      `WINDOW MISMATCH in "${label}": the strategy arm spans ${strategy.observations} observations `
      + `(${strategy.first}..${strategy.last}) but the benchmark supplies ${benchmark.observations} `
      + `(${benchmark.first}..${benchmark.last}) — ${(ratio * 100).toFixed(2)}% coverage.\n`
      + 'A difference between two different periods is not evidence of anything. Re-run on the common '
      + `window (start no earlier than ${benchmark.first}), or drop the benchmark column. Do NOT widen `
      + 'the tolerance.',
    );
  }
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a < 0.01 && a > 0) return v.toExponential(2);
  return v.toFixed(4);
}

/**
 * Three-state verdict. The existence of INSUFFICIENT is the entire point.
 *
 * A two-state boolean forces "no evidence" to be encoded as one of the two answers, and whichever is
 * chosen will be wrong somewhere. In a fail-closed compliance context, folding INSUFFICIENT into
 * PASS is the dangerous direction: it asserts a screen that never ran.
 */
export type Verdict = 'PASS' | 'FAIL' | 'INSUFFICIENT';

export interface Evidenced<T> {
  verdict: Verdict;
  value: T | null;
  /** Why, in the INSUFFICIENT and FAIL cases. Required — an unexplained verdict is not auditable. */
  reason: string;
}

/**
 * Build a verdict that cannot silently pass on absent inputs.
 *
 * `required` names the inputs the test genuinely needs. Any that is null/undefined/NaN produces
 * INSUFFICIENT naming the missing field, never a PASS. Note that a missing numeric input is NOT the
 * same as a zero one: zero debt is a fact, absent debt is not.
 */
export function evidenced<T>(
  required: Record<string, number | null | undefined>,
  compute: () => { pass: boolean; value: T; reason: string },
): Evidenced<T> {
  const missing = Object.entries(required)
    .filter(([, v]) => v === null || v === undefined || !Number.isFinite(v as number))
    .map(([k]) => k);
  if (missing.length) {
    return { verdict: 'INSUFFICIENT', value: null, reason: `no evidence for: ${missing.join(', ')}` };
  }
  const r = compute();
  return { verdict: r.pass ? 'PASS' : 'FAIL', value: r.value, reason: r.reason };
}

/**
 * Print what a selection rule actually chose.
 *
 * A screen whose holdings are never shown is unfalsifiable in practice. This is the check that
 * caught a "market-beating" rule buying 3x leveraged ETFs, and it costs one line.
 */
export function discloseSelection(label: string, picks: readonly string[], limit = 15): void {
  const shown = picks.slice(0, limit).join(' ');
  console.log(`  [holdings] ${label}: ${shown}${picks.length > limit ? ` … +${picks.length - limit}` : ''}`);
}

/**
 * Record the BASIS of the data a computation runs on, so a mismatch is visible in the output rather
 * than buried in an import.
 *
 * The market-cap error was exactly a basis mismatch — `adjustment=all` prices against as-reported
 * share counts — and nothing in the output said which basis either input used.
 */
export function declareBasis(fields: Record<string, string>): void {
  const w = Math.max(...Object.keys(fields).map((k) => k.length));
  console.log('  [basis]');
  for (const [k, v] of Object.entries(fields)) console.log(`     ${k.padEnd(w)}  ${v}`);
}

/**
 * A result must beat its own null before it is a result.
 *
 * Returns whether the strategy cleared the control by `margin`. Momentum on the full NASDAQ universe
 * returned 8.29%/yr against a random draw's 13.20% — it did not clear its null, and no amount of
 * comparing it to the benchmark instead would have revealed that.
 */
export function beatsNull(label: string, strategy: number, nullControl: number, margin = 0): boolean {
  const ok = strategy > nullControl + margin;
  console.log(`  [null] ${ok ? 'ok  ' : 'FAIL'}  ${label}: strategy ${fmt(strategy)} vs random ${fmt(nullControl)}`
    + `${ok ? '' : '  <-- does not clear its own null control'}`);
  return ok;
}
