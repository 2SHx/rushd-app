import { describe, expect, it } from 'vitest';
import { evaluateProfitPlateau, DEFAULT_MAX_PLATEAU_DEGRADATION } from './profitPlateau';
import { bollingerMrLongV2Setup, BOLLINGER_MR_LONG_V2 } from '../strategies/bollingerMrLongV2';
import { tsMomentumHalalBasketV2Setup, TS_MOMENTUM_HALAL_BASKET_V2 } from '../strategies/tsMomentumHalalBasketV2';

// The evaluator is PURE metrics math over expectancy NUMBERS — no synthetic bars are used as market
// data here; these arrays stand in for OOS expectancies already measured on real bars upstream.
describe('evaluateProfitPlateau (pure robustness math)', () => {
  it('PASSES on a flat neighborhood — all neighbors same-sign and within the degradation bound', () => {
    const center = 0.002; // +0.2%/trade OOS expectancy
    const flat = [
      { label: 'a-', oosExpectancy: 0.0019 },
      { label: 'a+', oosExpectancy: 0.0021 },
      { label: 'b-', oosExpectancy: 0.0018 },
      { label: 'b+', oosExpectancy: 0.0022 },
    ];
    const evaluation = evaluateProfitPlateau(center, flat);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.reason).toBe('plateau_confirmed');
    expect(evaluation.neighbors.every((n) => n.withinBound && n.sameSign)).toBe(true);
  });

  it('FAILS on a spiky neighborhood — a neighbor sign-flips (edge is a knife-edge, not a plateau)', () => {
    const center = 0.002;
    const spiky = [
      { label: 'a-', oosExpectancy: 0.0019 },
      { label: 'a+', oosExpectancy: -0.0015 }, // sign flip: edge disappears one step away
      { label: 'b-', oosExpectancy: 0.0021 },
      { label: 'b+', oosExpectancy: 0.0018 },
    ];
    const evaluation = evaluateProfitPlateau(center, spiky);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.reason).toContain('a+');
    expect(evaluation.neighbors.find((n) => n.label === 'a+')!.sameSign).toBe(false);
  });

  it('FAILS when a neighbor collapses past the degradation bound even without a sign flip', () => {
    const center = 0.002;
    const collapse = [
      { label: 'a-', oosExpectancy: 0.0019 },
      { label: 'a+', oosExpectancy: 0.0002 }, // still positive but a 90% drop > 50% bound
    ];
    const evaluation = evaluateProfitPlateau(center, collapse);
    expect(evaluation.passed).toBe(false);
    const spike = evaluation.neighbors.find((n) => n.label === 'a+')!;
    expect(spike.sameSign).toBe(true);
    expect(spike.degradation).toBeGreaterThan(DEFAULT_MAX_PLATEAU_DEGRADATION);
    expect(spike.withinBound).toBe(false);
  });

  it('a BETTER neighbor is not a failure (robustness proof, not optimization)', () => {
    const evaluation = evaluateProfitPlateau(0.002, [
      { label: 'a+', oosExpectancy: 0.0030 },
      { label: 'a-', oosExpectancy: 0.0021 },
    ]);
    expect(evaluation.passed).toBe(true);
    expect(evaluation.neighbors[0].degradation).toBeLessThan(0);
  });

  it('a non-positive center edge cannot form a PROFIT plateau', () => {
    expect(evaluateProfitPlateau(0, [{ label: 'a', oosExpectancy: 0 }]).passed).toBe(false);
    expect(evaluateProfitPlateau(-0.001, [{ label: 'a', oosExpectancy: -0.001 }]).reason).toBe('no_positive_center_edge');
  });
});

describe('plateauNeighborhood declarations (a-priori, additive)', () => {
  it('bollinger-mr-long-v2 perturbs its 1–2 most sensitive params without mutating the center', () => {
    const nb = bollingerMrLongV2Setup.plateauNeighborhood!();
    expect(nb.axes).toEqual(['entryStdev', 'varianceRatioMax']);
    expect(nb.center).toEqual(BOLLINGER_MR_LONG_V2); // center == chosen params, never a neighbor
    expect(nb.neighbors.map((n) => n.label)).toEqual([
      'entryStdev-0.25', 'entryStdev+0.25', 'varianceRatioMax-0.05', 'varianceRatioMax+0.05',
    ]);
    const up = nb.neighbors.find((n) => n.label === 'entryStdev+0.25')!.params;
    expect(up.entryStdev).toBeCloseTo(BOLLINGER_MR_LONG_V2.entryStdev + 0.25, 10);
    expect(up.varianceRatioMax).toBe(BOLLINGER_MR_LONG_V2.varianceRatioMax); // only one axis moves
    // The declared center is frozen; reading the neighborhood must not touch the chosen params.
    expect(BOLLINGER_MR_LONG_V2.entryStdev).toBe(2);
  });

  it('ts-momentum-halal-basket-v2 perturbs the regime + sizing layers by fixed steps', () => {
    const nb = tsMomentumHalalBasketV2Setup.plateauNeighborhood!();
    expect(nb.axes).toEqual(['regimeSmaPeriod', 'targetVolBudget']);
    expect(nb.center).toEqual(TS_MOMENTUM_HALAL_BASKET_V2);
    const smaUp = nb.neighbors.find((n) => n.label === 'regimeSmaPeriod+20')!.params;
    expect(smaUp.regimeSmaPeriod).toBe(TS_MOMENTUM_HALAL_BASKET_V2.regimeSmaPeriod + 20);
    const budgetDown = nb.neighbors.find((n) => n.label === 'targetVolBudget-0.001')!.params;
    expect(budgetDown.targetVolBudget).toBeCloseTo(TS_MOMENTUM_HALAL_BASKET_V2.targetVolBudget - 0.001, 10);
  });
});
