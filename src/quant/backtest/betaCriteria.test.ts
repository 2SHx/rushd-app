import { describe, expect, it } from 'vitest';
import {
  annualizedVolatility,
  bootstrapCaptureGapP5,
  evaluateBetaCriteria,
  volatilityBandFeasible,
  volatilityUpperBound95,
  type BetaCriteriaInput,
} from './betaCriteria';

const FIVE_SESSION_PERIODS_PER_YEAR = 252 / 5;

/** Deterministic near-Gaussian observation series with an exact target annualized volatility. */
function observationsWithVolatility(annualVol: number, n: number, drift = 0.001): number[] {
  const raw = Array.from({ length: n }, (_, i) => Math.sin((i + 1) * 2.399963229728653));
  const mean = raw.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(raw.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const scale = annualVol / Math.sqrt(FIVE_SESSION_PERIODS_PER_YEAR) / sd;
  return raw.map((v) => drift + (v - mean) * scale);
}

function betaInput(override: Partial<BetaCriteriaInput> = {}): BetaCriteriaInput {
  return {
    observationReturns: observationsWithVolatility(0.1, 216),
    observationsPerYear: FIVE_SESSION_PERIODS_PER_YEAR,
    volCeiling: 0.13,
    volFloor: 0.06,
    upCapture: 0.71,
    downCapture: 0.635,
    captureGapP5: 0.02,
    oosCagr: 0.06,
    benchmarkCagr: 0.09,
    betaVsBenchmark: 0.62,
    sealedCostModel: { commissionBpsPerSide: 10, slippageBpsPerSide: 5, advParticipationCap: 0.05 },
    realizedCostModel: { commissionBpsPerSide: 10, slippageBpsPerSide: 5, advParticipationCap: 0.05 },
    realizedAnnualTurnover: 3,
    maxAnnualTurnover: 4,
    realizedAnnualCostDragBps: 35,
    maxAnnualCostDragBps: 60,
    ...override,
  };
}

describe('QDR-10 BETA criteria', () => {
  it('measures realized volatility and its one-sided 95% upper bound on the preregistered unit', () => {
    const series = observationsWithVolatility(0.1, 216);

    expect(annualizedVolatility(series, FIVE_SESSION_PERIODS_PER_YEAR)).toBeCloseTo(0.1, 6);
    // ln(s²) + 1.6449·√(2/(n−1)) ⇒ the bound sits above the point estimate and shrinks with n.
    expect(volatilityUpperBound95(series, FIVE_SESSION_PERIODS_PER_YEAR)).toBeGreaterThan(0.1);
    expect(volatilityUpperBound95(series, FIVE_SESSION_PERIODS_PER_YEAR))
      .toBeLessThan(volatilityUpperBound95(observationsWithVolatility(0.1, 52), FIVE_SESSION_PERIODS_PER_YEAR));
  });

  it('passes every criterion for a book that does what a BETA product claims', () => {
    const result = evaluateBetaCriteria(betaInput());

    expect(result.failures).toEqual([]);
    expect(result.captureRatio).toBeLessThan(0.95);
    expect(result.upsideSurrendered).toBeCloseTo(0.29, 2);
    expect(result.negativeWindowWithNegativeBenchmark).toBe(false);
  });

  it('(a) fails a book above the ceiling AND a book that never delivered the exposure it sold', () => {
    expect(evaluateBetaCriteria(betaInput({ observationReturns: observationsWithVolatility(0.14, 216) })).failures)
      .toEqual(['VOLATILITY_BAND']);
    expect(evaluateBetaCriteria(betaInput({ observationReturns: observationsWithVolatility(0.04, 216) })).failures)
      .toEqual(['VOLATILITY_BAND']);
  });

  it('(c1) fails a flat capture profile and a convexity gap the bootstrap cannot separate from zero', () => {
    expect(evaluateBetaCriteria(betaInput({ downCapture: 0.7 })).failures).toEqual(['CAPTURE_CONVEXITY']);
    expect(evaluateBetaCriteria(betaInput({ captureGapP5: -0.01 })).failures).toEqual(['CAPTURE_CONVEXITY']);
  });

  it('(c2) holds the book to beta × benchmark − 200bps, not to a positive absolute return', () => {
    // Down benchmark, negative book return, but the shortfall floor is met ⇒ NOT a failure.
    const downMarket = evaluateBetaCriteria(betaInput({ oosCagr: -0.05, benchmarkCagr: -0.06, betaVsBenchmark: 0.62 }));
    expect(downMarket.failures).toEqual([]);
    expect(downMarket.negativeWindowWithNegativeBenchmark).toBe(true);
    // Same window, but the book destroyed the exposure it delivered ⇒ RELATIVE_SHORTFALL.
    expect(evaluateBetaCriteria(betaInput({ oosCagr: -0.12, benchmarkCagr: -0.06 })).failures)
      .toEqual(['RELATIVE_SHORTFALL']);
  });

  it('(d) fails drifted cost params, turnover blow-out, and cost drag beyond the envelope', () => {
    expect(evaluateBetaCriteria(betaInput({
      realizedCostModel: { commissionBpsPerSide: 2, slippageBpsPerSide: 5, advParticipationCap: 0.05 },
    })).failures).toEqual(['COST_ENVELOPE']);
    expect(evaluateBetaCriteria(betaInput({ realizedAnnualTurnover: 6.1 })).failures).toEqual(['COST_ENVELOPE']);
    expect(evaluateBetaCriteria(betaInput({ realizedAnnualCostDragBps: 61 })).failures).toEqual(['COST_ENVELOPE']);
  });

  it('seal-time band feasibility refuses an inverted or unreachable band', () => {
    expect(volatilityBandFeasible(0.06, 0.13, 216)).toBe(true);
    expect(volatilityBandFeasible(0.13, 0.13, 216)).toBe(false);
    expect(volatilityBandFeasible(0.13, 0.06, 216)).toBe(false);
    // A 2%-wide band is unreachable at n=20 and even at n=2000; it needs n≈3451.
    expect(volatilityBandFeasible(0.1, 0.102, 20)).toBe(false);
    expect(volatilityBandFeasible(0.1, 0.102, 2000)).toBe(false);
    expect(volatilityBandFeasible(0.1, 0.102, 4000)).toBe(true);
  });

  it('the capture-gap bootstrap is seeded, paired, and separates a real gap from noise', () => {
    const benchmark = observationsWithVolatility(0.18, 200, 0.002);
    const convex = benchmark.map((r) => (r > 0 ? r * 0.71 : r * 0.6));
    const flat = benchmark.map((r) => r * 0.65);

    const gap = bootstrapCaptureGapP5(convex, benchmark, { seed: 42, resamples: 200 });
    expect(gap).toBe(bootstrapCaptureGapP5(convex, benchmark, { seed: 42, resamples: 200 }));
    expect(gap).toBeGreaterThan(0);
    expect(bootstrapCaptureGapP5(flat, benchmark, { seed: 42, resamples: 200 })).toBeCloseTo(0, 6);
    expect(() => bootstrapCaptureGapP5(convex.slice(1), benchmark, { seed: 42 })).toThrow(/paired/);
  });
});
