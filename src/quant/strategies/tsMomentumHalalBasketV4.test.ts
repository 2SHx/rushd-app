import { describe, expect, it } from 'vitest';
import { drawdownExposureScalar } from '../backtest/portfolioEngine';
import {
  TS_MOMENTUM_HALAL_BASKET_V4,
  tsMomentumHalalBasketV4Setup,
  tsMomentumV4BookPolicy,
} from './tsMomentumHalalBasketV4';

describe('ts-momentum-halal-basket-v4 pre-registration', () => {
  it('freezes the 8%-to-20% linear drawdown governor', () => {
    expect(drawdownExposureScalar(0.08, 0.08, 0.20)).toBe(1);
    expect(drawdownExposureScalar(0.14, 0.08, 0.20)).toBeCloseTo(0.5, 12);
    expect(drawdownExposureScalar(0.20, 0.08, 0.20)).toBe(0);
    expect(tsMomentumV4BookPolicy()).toMatchObject({
      drawdownStartFraction: 0.08,
      drawdownCashFraction: 0.20,
      realizedVolLookback: 60,
      targetAnnualVol: 0.15,
      maxOpenPositions: 6,
    });
  });

  it('keeps v3 signal and plateau parameters while declaring the verified fixed sleeve', () => {
    expect(tsMomentumHalalBasketV4Setup.universeCompatibility).toBe('fixed');
    expect(TS_MOMENTUM_HALAL_BASKET_V4.validationTrials).toBe(9);
    const grid = tsMomentumHalalBasketV4Setup.plateauNeighborhood!(TS_MOMENTUM_HALAL_BASKET_V4);
    expect(grid.neighbors).toHaveLength(8);
    expect(grid.neighbors.every(({ params }) => (
      params.drawdownStartFraction === 0.08 && params.drawdownCashFraction === 0.20
    ))).toBe(true);
  });
});
