import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assessGateFeasibility,
  attainableDsr,
  gateSpecFromConfig,
  inverseNormalCDF,
  minimumObservationsForDsr,
  productClassFromConfig,
  type BetaGateSpec,
  type GateSpec,
} from './gatePower';
import { computeMetrics, type EquityPoint } from './metrics';

const FIVE_SESSION_PERIODS_PER_YEAR = 252 / 5;
const EXPERIMENTS_DIR = join(__dirname, '..', '..', '..', 'docs', 'quant-experiments');

function manifestConfig(file: string): unknown {
  return (JSON.parse(readFileSync(join(EXPERIMENTS_DIR, file), 'utf8')) as { config: unknown }).config;
}

/**
 * Deterministic, near-Gaussian return series with an EXACT sample per-period Sharpe. Symmetric
 * normal quantiles give sample skew 0 and kurtosis ≈ 3, i.e. the same reference moments the closed
 * form assumes — which is exactly what makes the two comparable.
 */
function curveWithAnnualSharpe(annualSharpe: number, observations: number, periodsPerYear: number): EquityPoint[] {
  const quantiles = Array.from({ length: observations }, (_, i) => inverseNormalCDF((i + 0.5) / observations));
  const mean = quantiles.reduce((sum, v) => sum + v, 0) / observations;
  const sd = Math.sqrt(quantiles.reduce((sum, v) => sum + (v - mean) ** 2, 0) / observations);
  const srPeriod = annualSharpe / Math.sqrt(periodsPerYear);
  const returns = quantiles.map((q) => 0.01 * ((q - mean) / sd + srPeriod));
  // Interleave low/high quantiles so the curve is not monotone; moments are order-invariant.
  const ordered: number[] = [];
  for (let i = 0; i < observations; i++) ordered.push(returns[i % 2 === 0 ? i / 2 : observations - 1 - (i - 1) / 2]);

  let equity = 100;
  const curve: EquityPoint[] = [{ ts: new Date(Date.UTC(2026, 0, 1)), equity }];
  ordered.forEach((r, index) => {
    equity *= 1 + r;
    curve.push({ ts: new Date(Date.UTC(2026, 0, 1 + 7 * (index + 1))), equity });
  });
  return curve;
}

describe('gate feasibility closed form vs the shipped deflated Sharpe', () => {
  it('ANCHOR: agrees with the real computeMetrics at the SPUS gate corner (n=100, 108 trials, Sharpe 3.00)', () => {
    const curve = curveWithAnnualSharpe(3, 100, FIVE_SESSION_PERIODS_PER_YEAR);
    const measured = computeMetrics(curve, {
      trades: 100,
      turnover: 1,
      trials: 108,
      periodsPerYear: FIVE_SESSION_PERIODS_PER_YEAR,
      annualization: 'fixed',
    });
    const closedForm = attainableDsr({
      annualSharpe: 3,
      observations: 100,
      observationsPerYear: FIVE_SESSION_PERIODS_PER_YEAR,
      trials: 108,
    });

    expect(measured.sharpe).toBeCloseTo(3, 6);
    expect(measured.implausible).toBe(false); // 3.00 is the LAST admissible Sharpe: flag is `> 3`.
    expect(measured.deflatedSharpe).toBeLessThanOrEqual(0.95);
    expect(Math.abs(measured.deflatedSharpe - closedForm)).toBeLessThan(0.01);
  });

  it('ANCHOR: the same agreement holds at the confirmatory tier (N=1)', () => {
    const curve = curveWithAnnualSharpe(0.8, 216, FIVE_SESSION_PERIODS_PER_YEAR);
    const measured = computeMetrics(curve, {
      trades: 216, turnover: 1, trials: 1, periodsPerYear: FIVE_SESSION_PERIODS_PER_YEAR, annualization: 'fixed',
    });
    const closedForm = attainableDsr({
      annualSharpe: 0.8, observations: 216, observationsPerYear: FIVE_SESSION_PERIODS_PER_YEAR, trials: 1,
    });

    expect(measured.deflatedSharpe).toBeGreaterThan(0.95);
    expect(Math.abs(measured.deflatedSharpe - closedForm)).toBeLessThan(0.01);
  });
});

describe('empty acceptance sets', () => {
  const original: GateSpec = {
    requiredDsr: 0.95,
    sharpeCeiling: 3,
    observations: 100,
    observationsPerYear: FIVE_SESSION_PERIODS_PER_YEAR,
    trials: 108,
    fallbackTrials: null,
    hypothesizedAnnualSharpe: 0.8,
  };

  it('detects the ORIGINAL sealed SPUS configuration as provably unwinnable', () => {
    const feasibility = assessGateFeasibility(original);

    expect(feasibility.verdict).toBe('EMPTY_ACCEPTANCE_SET');
    expect(feasibility.maxAttainableDsr).toBeCloseTo(0.93, 2);
    expect(feasibility.maxAttainableDsr).toBeLessThanOrEqual(0.95);
    expect(feasibility.requiredAnnualSharpe).toBeGreaterThan(3);
    expect(feasibility.detail).toMatch(/acceptance set is empty/);
  });

  it('flags a declared-confirmatory lane whose exploratory fallback is unwinnable', () => {
    const feasibility = assessGateFeasibility({ ...original, trials: 1, fallbackTrials: 108 });

    expect(feasibility.verdict).toBe('EMPTY_FALLBACK_ACCEPTANCE_SET');
    expect(feasibility.maxAttainableDsr).toBeGreaterThan(0.95);
    expect(feasibility.fallbackMaxAttainableDsr).toBeLessThanOrEqual(0.95);
  });

  it('separates underpowered from unwinnable and sizes the window', () => {
    const feasibility = assessGateFeasibility({ ...original, observations: 100, trials: 1, fallbackTrials: null });

    expect(feasibility.verdict).toBe('UNDERPOWERED');
    expect(feasibility.maxAttainableDsr).toBeGreaterThan(0.95);
    expect(feasibility.predictedDsr).toBeLessThanOrEqual(0.95);
    expect(feasibility.requiredObservations).toBe(216);
  });

  it('the minimum observation count is the smallest n that clears the gate', () => {
    const point = { annualSharpe: 0.8, observationsPerYear: FIVE_SESSION_PERIODS_PER_YEAR, trials: 1 };
    const n = minimumObservationsForDsr(point, 0.95);

    expect(n).toBe(216);
    expect(attainableDsr({ ...point, observations: n! })).toBeGreaterThan(0.95);
    expect(attainableDsr({ ...point, observations: n! - 1 })).toBeLessThanOrEqual(0.95);
  });
});

describe('manifest gate specs', () => {
  it('the AMENDED SPUS preregistration is winnable and powered at its declared effect size', () => {
    const config = manifestConfig('halal-spus-vol-managed-beta-v1.json') as {
      validation: { minimumOosObservations: number; minimumTradingSessions: number };
    };
    const spec = gateSpecFromConfig(config) as GateSpec;
    const feasibility = assessGateFeasibility(spec);

    // No productClass in that manifest ⇒ ALPHA, the strictest gate (QDR-10).
    expect(productClassFromConfig(config)).toBe('ALPHA');
    expect(spec).toMatchObject({ requiredDsr: 0.95, sharpeCeiling: 3, trials: 1, fallbackTrials: 108 });
    expect(feasibility.verdict).toBe('FEASIBLE');
    expect(feasibility.maxAttainableDsr).toBeGreaterThan(0.95);
    expect(feasibility.fallbackMaxAttainableDsr).toBeGreaterThan(0.95);
    expect(feasibility.predictedDsr).toBeGreaterThan(0.95);
    expect(feasibility.requiredObservations).toBeLessThanOrEqual(config.validation.minimumOosObservations);
    // The window must actually be able to produce that many non-overlapping five-session returns.
    expect(config.validation.minimumTradingSessions)
      .toBeGreaterThanOrEqual(config.validation.minimumOosObservations * 5 + 1);
  });

  it('declares no gate for validation blocks that carry no DSR threshold', () => {
    expect(gateSpecFromConfig(manifestConfig('halal-causal-tcn-alpha-v1.json'))).toBeNull();
    expect(gateSpecFromConfig(manifestConfig('halal-residual-fast-momentum-core-v1.json'))).toBeNull();
    expect(gateSpecFromConfig({ validation: null })).toBeNull();
  });

  it('QDR-10: reads a BETA gate block without demanding the alpha DSR keys', () => {
    const validation = {
      minimumOosObservations: 208,
      observationsPerYear: 252 / 5,
      relatedFamilyTrials: 108,
      productClass: 'BETA',
      benchmarkSymbol: 'SPUS',
      targetAnnualVol: 0.1,
      volCeiling: 0.13,
      volFloor: 0.06,
      hypothesizedBeta: 0.62,
      maxAnnualTurnover: 4,
      maxAnnualCostDragBps: 60,
      declaredConvexityPower: 0.921,
    };
    const spec = gateSpecFromConfig({ validation }) as BetaGateSpec;

    expect(productClassFromConfig({ validation })).toBe('BETA');
    expect(spec).toMatchObject({ productClass: 'BETA', benchmarkSymbol: 'SPUS', trials: 108 });
    expect(assessGateFeasibility(spec)).toMatchObject({ verdict: 'FEASIBLE', volatilityBandAchievable: true });
    expect(() => productClassFromConfig({ validation: { productClass: 'GAMMA' } })).toThrow(/productClass/);
    expect(() => gateSpecFromConfig({ validation: { ...validation, volCeiling: undefined } })).toThrow(/volCeiling/);
    expect(() => gateSpecFromConfig({ validation: { ...validation, declaredConvexityPower: undefined } }))
      .toThrow(/declaredConvexityPower/);
  });

  it('throws rather than skipping when a declared gate is incomplete or malformed', () => {
    const base = {
      minimumOosDsr: 0.95,
      maximumPlausibleSharpe: 3,
      minimumOosObservations: 216,
      observationsPerYear: 50.4,
      hypothesizedAnnualSharpe: 0.8,
      relatedFamilyTrials: 108,
    };
    expect(() => gateSpecFromConfig({ validation: { ...base, observationsPerYear: undefined } }))
      .toThrow(/observationsPerYear/);
    expect(() => gateSpecFromConfig({ validation: { ...base, minimumOosObservations: 1.5 } }))
      .toThrow(/minimumOosObservations/);
    expect(() => gateSpecFromConfig({ validation: { ...base, relatedFamilyTrials: undefined } }))
      .toThrow(/relatedFamilyTrials/);
    expect(() => gateSpecFromConfig({ validation: { ...base, trialTier: 'CONFIRMATORY' } }))
      .toThrow(/confirmatoryTrials must be exactly 1/);
    expect(() => gateSpecFromConfig({ validation: { ...base, trialTier: 'TRUST_ME' } }))
      .toThrow(/trialTier/);
  });
});
