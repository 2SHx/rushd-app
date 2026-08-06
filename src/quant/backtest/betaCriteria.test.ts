import { describe, expect, it } from 'vitest';
import {
  BETA_CRITERION_CODES,
  annualizedVolatility,
  contiguousHalves,
  evaluateBetaCriteria,
  volatilityBandFeasible,
  volatilityLowerBound95,
  volatilityUpperBound95,
  type BetaCriteriaInput,
  type BetaCriterionCode,
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
    expect(volatilityBandFeasible(0.06, 0.13, 104)).toBe(true);
    expect(volatilityBandFeasible(0.13, 0.13, 216)).toBe(false);
    expect(volatilityBandFeasible(0.13, 0.06, 216)).toBe(false);
    // A 2%-wide band is unreachable at n=20 and at n=4000: the half-window bound binds too.
    expect(volatilityBandFeasible(0.1, 0.102, 20)).toBe(false);
    expect(volatilityBandFeasible(0.1, 0.102, 4000)).toBe(false);
    expect(volatilityBandFeasible(0.1, 0.102, 21000)).toBe(true);
  });

  // ── QDR-10 2026-08-06b: (c1) withdrawn, criterion (a) tightened ──────────────────────────────
  it('(c1 WITHDRAWN) a 0.99 capture ratio PASSES when (c2) and (d) hold', () => {
    // The exact case the withdrawn 0.95 gate would have failed. The corrected true ratio for a
    // vol-managed book is 0.94-0.99, so gating here rejected working mechanisms for a measurement
    // artifact. Captures are still computed and reported; they simply decide nothing.
    const result = evaluateBetaCriteria(betaInput({ upCapture: 0.71, downCapture: 0.7029 }));

    expect(result.captureRatio).toBeCloseTo(0.99, 4);
    expect(result.failures).toEqual([]);
    expect(BETA_CRITERION_CODES).not.toContain('CAPTURE_CONVEXITY' as never);
    // Even a book with NO convexity at all (down/up = 1.0, or inverted) is admissible on (c).
    expect(evaluateBetaCriteria(betaInput({ upCapture: 0.7, downCapture: 0.7 })).failures).toEqual([]);
    expect(evaluateBetaCriteria(betaInput({ upCapture: 0.6, downCapture: 0.7 })).failures).toEqual([]);
  });

  it('CAPTURE_CONVEXITY is unconstructible at type level and unreachable at runtime', () => {
    // @ts-expect-error — withdrawn 2026-08-06b. If this line ever COMPILES, the gate has been
    // reintroduced and this test fails the build, which is the point of writing it this way.
    const withdrawn: BetaCriterionCode = 'CAPTURE_CONVEXITY';

    expect(BETA_CRITERION_CODES).toEqual(['VOLATILITY_BAND', 'RELATIVE_SHORTFALL', 'COST_ENVELOPE']);
    expect(BETA_CRITERION_CODES).not.toContain(withdrawn);
    for (const captures of [
      { upCapture: 0.71, downCapture: 0.635 },
      { upCapture: 0.71, downCapture: 0.7029 },
      { upCapture: 0.7, downCapture: 0.9 },
      { upCapture: 0, downCapture: 0.5 },
    ]) {
      expect(evaluateBetaCriteria(betaInput(captures)).failures).not.toContain(withdrawn);
    }
  });

  it('(a) fails when EITHER contiguous half breaches the ceiling, even if the full window passes', () => {
    // A dead half paired with a wild half: the pooled estimate sits inside the band, the halves do not.
    const wild = observationsWithVolatility(0.16, 108);
    const dead = observationsWithVolatility(0.055, 108);
    const paired = [...wild, ...dead];
    const full = evaluateBetaCriteria(betaInput({ observationReturns: paired }));

    expect(volatilityUpperBound95(paired, FIVE_SESSION_PERIODS_PER_YEAR)).toBeLessThanOrEqual(0.13);
    expect(contiguousHalves(paired)[0]).toHaveLength(108);
    expect(full.halfWindowUpperBounds95[0]).toBeGreaterThan(0.13);
    expect(full.failures).toEqual(['VOLATILITY_BAND']);
  });

  it('(a) tests the floor with a 95% LOWER bound, not the point estimate', () => {
    // 6.4% point estimate at n=104 clears a 6% floor on the old test but not on the lower bound.
    const series = observationsWithVolatility(0.064, 104);

    expect(annualizedVolatility(series, FIVE_SESSION_PERIODS_PER_YEAR)).toBeGreaterThan(0.06);
    expect(volatilityLowerBound95(series, FIVE_SESSION_PERIODS_PER_YEAR)).toBeLessThan(0.06);
    expect(evaluateBetaCriteria(betaInput({ observationReturns: series })).failures).toEqual(['VOLATILITY_BAND']);
    expect(volatilityLowerBound95(series, FIVE_SESSION_PERIODS_PER_YEAR))
      .toBeLessThan(annualizedVolatility(series, FIVE_SESSION_PERIODS_PER_YEAR));
  });
});
