// QDR-10 BETA-class promotion criteria. A BETA version claims risk-managed MARKET EXPOSURE, never
// an edge, so it is promoted on the claims it actually makes — volatility control, drawdown control,
// no return destruction versus a sealed benchmark, and cost honesty — instead of the DSR-versus-zero
// alpha gate. This module evaluates (a), (c) and (d); (b) drawdown and (e) the 100-observation floor
// are the EXISTING gates and are consumed unchanged by assembleReportCard.
//
// Nothing here lowers a threshold: the alpha gate is untouched and simply does not apply to a class
// that makes no alpha claim. Pure, deterministic, seeded — no LLM, no DB, no clock.
//
// Statistics boundary: every value is a plain number (ratios, volatilities, bps), never money.

import { computeCaptureRatios } from './metrics';
import { movingBlockSampleIndices } from './monteCarlo';

export const BETA_CRITERION_CODES = [
  'VOLATILITY_BAND',
  'CAPTURE_CONVEXITY',
  'RELATIVE_SHORTFALL',
  'COST_ENVELOPE',
] as const;
export type BetaCriterionCode = typeof BETA_CRITERION_CODES[number];

/** One-sided 95% normal quantile; the same 1.6449 the DSR gate uses. */
const Z_95 = 1.6449;

/** QDR-10 default band around the declared target, expressed as multiples of targetAnnualVol. */
export const BETA_VOL_CEILING_MULTIPLE = 1.3;
export const BETA_VOL_FLOOR_MULTIPLE = 0.6;
/** (c1) convexity ratio threshold — deliberate headroom over the mechanism's true 0.88–0.92. */
export const BETA_MAX_DOWN_OVER_UP_CAPTURE = 0.95;
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
  readonly upCapture: number;
  readonly downCapture: number;
  /** 5th percentile of the block-bootstrap distribution of (upCapture − downCapture). */
  readonly captureGapP5: number;
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
  readonly upCapture: number;
  readonly downCapture: number;
  /** downCapture / upCapture — must sit strictly below 0.95. */
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
 * Is a volatility band ACHIEVABLE at n observations? The best admissible point estimate is exactly
 * `volFloor` (below it the book failed to deliver the exposure it sold), so the band is non-empty
 * only when the floor's own upper confidence bound still fits under the ceiling. A ceiling at or
 * below the floor is empty at every n. Used at SEAL time, before any data exists.
 */
export function volatilityBandFeasible(volFloor: number, volCeiling: number, observations: number): boolean {
  if (!(volFloor > 0) || !(volCeiling > 0) || !Number.isInteger(observations) || observations < 2) return false;
  if (volCeiling <= volFloor) return false;
  return Math.log(volCeiling) - Math.log(volFloor) >= (Z_95 / 2) * Math.sqrt(2 / (observations - 1));
}

/**
 * Seeded moving-block bootstrap of the capture gap `(upCapture − downCapture)`. The SAME resampled
 * indices are applied to both series so the strategy/benchmark pairing — which is the whole content
 * of a capture ratio — survives resampling. Reuses `movingBlockSampleIndices` and
 * `computeCaptureRatios`; no new estimator is invented (QDR-10, lazy-dev).
 */
export function bootstrapCaptureGapP5(
  strategyReturns: readonly number[],
  benchmarkReturns: readonly number[],
  opts: { seed: number; resamples?: number; blockLength?: number },
): number {
  if (strategyReturns.length !== benchmarkReturns.length) {
    throw new Error('capture bootstrap requires paired strategy/benchmark returns');
  }
  const resamples = opts.resamples ?? 1000;
  if (!Number.isInteger(resamples) || resamples < 1) throw new Error('resamples must be a positive integer');
  if (strategyReturns.length < 2) return 0;
  const gaps: number[] = [];
  for (let path = 0; path < resamples; path++) {
    const indices = movingBlockSampleIndices(strategyReturns.length, {
      seed: opts.seed + path,
      sampleLength: strategyReturns.length,
      ...(opts.blockLength ? { blockLength: opts.blockLength } : {}),
    });
    const capture = computeCaptureRatios(
      indices.map((i) => strategyReturns[i]),
      indices.map((i) => benchmarkReturns[i]),
    );
    gaps.push(capture.upCapture - capture.downCapture);
  }
  gaps.sort((a, b) => a - b);
  const rank = Math.max(0, Math.min(gaps.length - 1, Math.ceil(0.05 * gaps.length) - 1));
  return gaps[rank];
}

function costModelsIdentical(sealed: BetaCostModel, realized: BetaCostModel): boolean {
  return sealed.commissionBpsPerSide === realized.commissionBpsPerSide
    && sealed.slippageBpsPerSide === realized.slippageBpsPerSide
    && sealed.advParticipationCap === realized.advParticipationCap;
}

/**
 * Evaluate QDR-10 criteria (a), (c1/c2) and (d). Criterion (b) drawdown and (e) the 100-observation
 * floor are the existing ALPHA gates, consumed byte-identically by assembleReportCard.
 * (c3) — the absolute positive-CAGR demand — is deliberately NOT evaluated here: it is an alpha
 * demand in disguise, and (c2) replaces it.
 */
export function evaluateBetaCriteria(input: BetaCriteriaInput): BetaCriteriaResult {
  const failures: BetaCriterionCode[] = [];

  const realizedAnnualVolatility = annualizedVolatility(input.observationReturns, input.observationsPerYear);
  const upperBound = volatilityUpperBound95(input.observationReturns, input.observationsPerYear);
  if (!(upperBound <= input.volCeiling) || !(realizedAnnualVolatility >= input.volFloor)) {
    failures.push('VOLATILITY_BAND');
  }

  const captureRatio = input.upCapture !== 0 ? input.downCapture / input.upCapture : Infinity;
  if (!(captureRatio < BETA_MAX_DOWN_OVER_UP_CAPTURE) || !(input.captureGapP5 > 0)) {
    failures.push('CAPTURE_CONVEXITY');
  }

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
