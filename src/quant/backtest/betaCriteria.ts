// QDR-10 BETA-class promotion criteria. A BETA version claims risk-managed MARKET EXPOSURE, never
// an edge, so it is promoted on the claims it actually makes — volatility control, drawdown control,
// no return destruction versus a sealed benchmark, and cost honesty — instead of the DSR-versus-zero
// alpha gate. This module evaluates (a), (c2) and (d); (b) drawdown and (e) the 100-observation floor
// are the EXISTING gates and are consumed unchanged by assembleReportCard.
//
// CORRECTION OF RECORD 2026-08-06b — criterion (c1) capture convexity is WITHDRAWN as a gate. Its
// 0.95 threshold was calibrated on a benchmark whose drift was overstated by sqrt(252): only 8.8% of
// five-session benchmark blocks were negative where real equities are 42-45%, which manufactured the
// convexity the criterion existed to detect. Corrected, the true ratio is 0.94-0.99 and NO
// observation count reaches the criterion's own power floor (n=520 / 10.3y gives 44%). Captures are
// still MANDATORY REPORTED figures — printing the number while refusing to gate on it is the honest
// posture. The payment for that loosening is two STRUCTURAL tightenings of criterion (a) below (half
// windows, and a lower confidence bound for the floor), neither of which invents a new number.
//
// Nothing here lowers a threshold that survives: the alpha gate is untouched and simply does not
// apply to a class that makes no alpha claim. Pure and deterministic — no LLM, no DB, no clock.
//
// Statistics boundary: every value is a plain number (ratios, volatilities, bps), never money.

export const BETA_CRITERION_CODES = [
  'VOLATILITY_BAND',
  'RELATIVE_SHORTFALL',
  'COST_ENVELOPE',
] as const;
/** 'CAPTURE_CONVEXITY' is deliberately absent and must never be reintroduced (QDR-10 2026-08-06b). */
export type BetaCriterionCode = typeof BETA_CRITERION_CODES[number];

/** One-sided 95% normal quantile; the same 1.6449 the DSR gate uses. */
const Z_95 = 1.6449;

/** QDR-10 default band around the declared target, expressed as multiples of targetAnnualVol. */
export const BETA_VOL_CEILING_MULTIPLE = 1.3;
export const BETA_VOL_FLOOR_MULTIPLE = 0.6;
/** (c2) annualized slack covering cost and cash drag. */
export const BETA_RELATIVE_SHORTFALL_SLACK = 0.02;

export interface BetaCostModel {
  readonly commissionBpsPerSide: number;
  readonly slippageBpsPerSide: number;
  readonly advParticipationCap: number;
}

export interface BetaCriteriaInput {
  /** The PREREGISTERED non-overlapping observation series (five-session book returns for SPUS). */
  readonly observationReturns: readonly number[];
  readonly observationsPerYear: number;
  readonly volCeiling: number;
  readonly volFloor: number;
  /** (c1-report) REPORTED, never gated. Printed on every BETA card with its annotation. */
  readonly upCapture: number;
  readonly downCapture: number;
  readonly oosCagr: number;
  readonly benchmarkCagr: number;
  readonly betaVsBenchmark: number;
  readonly relativeShortfallSlack?: number;
  readonly sealedCostModel: BetaCostModel;
  readonly realizedCostModel: BetaCostModel;
  readonly realizedAnnualTurnover: number;
  readonly maxAnnualTurnover: number;
  readonly realizedAnnualCostDragBps: number;
  readonly maxAnnualCostDragBps: number;
}

export interface BetaCriteriaResult {
  readonly failures: readonly BetaCriterionCode[];
  readonly realizedAnnualVolatility: number;
  /** One-sided 95% UPPER confidence bound on realized annualized volatility. */
  readonly volatilityUpperBound95: number;
  /** One-sided 95% LOWER bound; the floor test compares against THIS, not the point estimate. */
  readonly volatilityLowerBound95: number;
  /** The same upper-bound test on each contiguous half — a passing average cannot hide a wild half. */
  readonly halfWindowUpperBounds95: readonly [number, number];
  readonly upCapture: number;
  readonly downCapture: number;
  /** downCapture / upCapture — REPORTED ONLY. Gates nothing; see the (c1) withdrawal above. */
  readonly captureRatio: number;
  /** Fraction of upside surrendered to buy the drawdown reduction (1 − upCapture). */
  readonly upsideSurrendered: number;
  /** betaVsBenchmark × benchmarkCagr − slack: the floor (c2) holds the book to. */
  readonly requiredCagr: number;
  readonly turnoverRatio: number;
  readonly costDragBps: number;
  /** True when the book lost money BECAUSE the benchmark did — an honest beta outcome, not a fail. */
  readonly negativeWindowWithNegativeBenchmark: boolean;
}

function sampleStdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
}

/** Realized annualized volatility of the preregistered observation unit (sample s, ddof = 1). */
export function annualizedVolatility(observationReturns: readonly number[], observationsPerYear: number): number {
  if (!Number.isFinite(observationsPerYear) || observationsPerYear <= 0) {
    throw new Error('observationsPerYear must be a positive number');
  }
  return sampleStdDev(observationReturns) * Math.sqrt(observationsPerYear);
}

/**
 * One-sided 95% UPPER confidence bound on annualized volatility, from the log-variance form
 * QDR-10 fixes: `ln(s²) + 1.6449·√(2/(n−1))` compared against `2·ln(volCeiling)`. Returned as a
 * volatility (not a variance) so it can be printed next to the ceiling on the card.
 */
export function volatilityUpperBound95(
  observationReturns: readonly number[],
  observationsPerYear: number,
): number {
  const s = annualizedVolatility(observationReturns, observationsPerYear);
  const n = observationReturns.length;
  if (s <= 0 || n < 2) return s;
  return Math.exp((Math.log(s * s) + Z_95 * Math.sqrt(2 / (n - 1))) / 2);
}

/**
 * One-sided 95% LOWER confidence bound on annualized volatility: `ln(s²) − 1.6449·√(2/(n−1))`
 * against `2·ln(volFloor)`. Replaces the point-estimate floor test (QDR-10 2026-08-06b) — strictly
 * harder, and symmetric with the ceiling test it sits beside.
 */
export function volatilityLowerBound95(
  observationReturns: readonly number[],
  observationsPerYear: number,
): number {
  const s = annualizedVolatility(observationReturns, observationsPerYear);
  const n = observationReturns.length;
  if (s <= 0 || n < 2) return s;
  return Math.exp((Math.log(s * s) - Z_95 * Math.sqrt(2 / (n - 1))) / 2);
}

/**
 * Is a volatility band ACHIEVABLE at n observations? Both bounds are multiplicative around the true
 * s: the ceiling test needs `s·k_half ≤ volCeiling` (the HALF window is binding, since it estimates
 * from n/2), and the floor test needs `s/k_full ≥ volFloor`. Some admissible s therefore exists iff
 * `volFloor·k_full ≤ volCeiling/k_half`. A ceiling at or below the floor is empty at every n.
 * Used at SEAL time, before any data exists.
 */
export function volatilityBandFeasible(volFloor: number, volCeiling: number, observations: number): boolean {
  if (!(volFloor > 0) || !(volCeiling > 0) || !Number.isInteger(observations) || observations < 4) return false;
  if (volCeiling <= volFloor) return false;
  const halfObservations = Math.floor(observations / 2);
  if (halfObservations < 2) return false;
  const logSpread = (Z_95 / 2) * (Math.sqrt(2 / (observations - 1)) + Math.sqrt(2 / (halfObservations - 1)));
  return Math.log(volCeiling) - Math.log(volFloor) >= logSpread;
}

/**
 * The two contiguous halves of the OOS observation series. A book cannot buy a passing average by
 * pairing a wild first half with a dead second half, so criterion (a)'s upper-bound test runs on
 * each half as well as the whole. An odd count gives the extra observation to the second half.
 */
export function contiguousHalves<T>(series: readonly T[]): [readonly T[], readonly T[]] {
  const split = Math.floor(series.length / 2);
  return [series.slice(0, split), series.slice(split)];
}

function costModelsIdentical(sealed: BetaCostModel, realized: BetaCostModel): boolean {
  return sealed.commissionBpsPerSide === realized.commissionBpsPerSide
    && sealed.slippageBpsPerSide === realized.slippageBpsPerSide
    && sealed.advParticipationCap === realized.advParticipationCap;
}

/**
 * Evaluate QDR-10 criteria (a), (c2) and (d). Criterion (b) drawdown and (e) the 100-observation
 * floor are the existing ALPHA gates, consumed byte-identically by assembleReportCard.
 * (c1) is WITHDRAWN — captures are computed and returned for the card, and gate NOTHING.
 * (c3) — the absolute positive-CAGR demand — is deliberately NOT evaluated here: it is an alpha
 * demand in disguise, and (c2) replaces it.
 */
export function evaluateBetaCriteria(input: BetaCriteriaInput): BetaCriteriaResult {
  const failures: BetaCriterionCode[] = [];

  // (a) VOLATILITY CONTROL, as tightened 2026-08-06b: the one-sided 95% UPPER bound must sit under
  // the ceiling on the FULL window AND on each contiguous half, and the one-sided 95% LOWER bound
  // must sit at or above the floor. Both tightenings are structural — no new number is invented.
  const realizedAnnualVolatility = annualizedVolatility(input.observationReturns, input.observationsPerYear);
  const upperBound = volatilityUpperBound95(input.observationReturns, input.observationsPerYear);
  const lowerBound = volatilityLowerBound95(input.observationReturns, input.observationsPerYear);
  const halfWindowUpperBounds = contiguousHalves(input.observationReturns)
    .map((half) => volatilityUpperBound95(half, input.observationsPerYear)) as [number, number];
  if (!(upperBound <= input.volCeiling)
    || !halfWindowUpperBounds.every((bound) => bound <= input.volCeiling)
    || !(lowerBound >= input.volFloor)) {
    failures.push('VOLATILITY_BAND');
  }

  // (c1-report) reported, never gated.
  const captureRatio = input.upCapture !== 0 ? input.downCapture / input.upCapture : Infinity;

  const slack = input.relativeShortfallSlack ?? BETA_RELATIVE_SHORTFALL_SLACK;
  const requiredCagr = input.betaVsBenchmark * input.benchmarkCagr - slack;
  if (!(input.oosCagr >= requiredCagr)) failures.push('RELATIVE_SHORTFALL');

  const turnoverRatio = input.maxAnnualTurnover > 0
    ? input.realizedAnnualTurnover / input.maxAnnualTurnover
    : Infinity;
  const costsHonest = costModelsIdentical(input.sealedCostModel, input.realizedCostModel)
    && turnoverRatio <= 1.5
    && input.realizedAnnualCostDragBps <= input.maxAnnualCostDragBps;
  if (!costsHonest) failures.push('COST_ENVELOPE');

  return {
    failures,
    realizedAnnualVolatility,
    volatilityUpperBound95: upperBound,
    volatilityLowerBound95: lowerBound,
    halfWindowUpperBounds95: halfWindowUpperBounds,
    upCapture: input.upCapture,
    downCapture: input.downCapture,
    captureRatio,
    upsideSurrendered: 1 - input.upCapture,
    requiredCagr,
    turnoverRatio,
    costDragBps: input.realizedAnnualCostDragBps,
    negativeWindowWithNegativeBenchmark: input.oosCagr < 0 && input.benchmarkCagr < 0,
  };
}
