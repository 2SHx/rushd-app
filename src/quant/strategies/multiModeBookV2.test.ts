import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { drawdownExposureScalar } from '../backtest/portfolioEngine';
import { MULTI_MODE_BOOK_V1 } from './multiModeBook';
import {
  MULTI_MODE_BOOK_V2, MULTI_MODE_UNIVERSE,
  multiModeBookV2Policy, multiModeBookV2Setup,
} from './multiModeBookV2';

describe('multi-mode-book-v2 pre-registration (E6 drawdown governor)', () => {
  it('inherits v1 sleeve weights UNCHANGED and adds only the frozen governor axis', () => {
    // The only pre-registered change is the governor; sleeve allocation is v1-identical.
    expect(MULTI_MODE_BOOK_V2).toEqual({
      version: 'v2', allocatorSeed: 42, validationTrials: 3,
      drawdownStartFraction: 0.10, drawdownCashFraction: 0.25,
    });
    expect(MULTI_MODE_BOOK_V1.momentumWeight).toBe(0.2);
    expect(MULTI_MODE_BOOK_V1.meanReversionWeight).toBe(0.4);
    expect(MULTI_MODE_BOOK_V1.dualMomentumWeight).toBe(0.4);
    expect(multiModeBookV2Setup.universeCompatibility).toBe('fixed');
    expect(new Set(MULTI_MODE_UNIVERSE).size).toBe(16);
  });

  it('carries v1 maxOpen/history plus the a-priori 10%→25% governor into the book policy', () => {
    expect(multiModeBookV2Policy()).toEqual({
      maxOpenPositions: 12, decisionHistoryBars: 295,
      drawdownStartFraction: 0.10, drawdownCashFraction: 0.25,
    });
  });

  it('declares the frozen 3×3 {8,10,12}×{20,25,30} governor plateau (8 off-center neighbors)', () => {
    const neighborhood = multiModeBookV2Setup.plateauNeighborhood!();
    expect(neighborhood.axes).toEqual(['drawdownStartFraction', 'drawdownCashFraction']);
    expect(neighborhood.center).toEqual(MULTI_MODE_BOOK_V2);
    // 3×3 grid minus the center = 8; center {10,25} must be absent from the neighbors.
    expect(neighborhood.neighbors).toHaveLength(8);
    expect(neighborhood.neighbors.map((n) => n.label)).not.toContain('start10|cash25');
    for (const neighbor of neighborhood.neighbors) {
      // Every neighbor is a valid, cash>start governor drawn only from the frozen grid.
      expect(multiModeBookV2Policy(neighbor.params)).toMatchObject({
        drawdownStartFraction: neighbor.params.drawdownStartFraction,
        drawdownCashFraction: neighbor.params.drawdownCashFraction,
      });
      expect(neighbor.params.drawdownCashFraction).toBeGreaterThan(neighbor.params.drawdownStartFraction);
      expect([0.08, 0.10, 0.12]).toContain(neighbor.params.drawdownStartFraction);
      expect([0.20, 0.25, 0.30]).toContain(neighbor.params.drawdownCashFraction);
    }
  });

  it('the engine governor is a linear down-only 1.0@10% → 0.0@25% multiplier (known input → known output)', () => {
    const s = 0.10, c = 0.25;
    expect(drawdownExposureScalar(0.05, s, c)).toBe(1); // above peak band → full exposure
    expect(drawdownExposureScalar(0.10, s, c)).toBe(1); // at start → still full
    expect(drawdownExposureScalar(0.175, s, c)).toBeCloseTo(0.5, 12); // midpoint → half
    expect(drawdownExposureScalar(0.25, s, c)).toBe(0); // at cash edge → all cash
    expect(drawdownExposureScalar(0.46, s, c)).toBe(0); // E3's 46% tail → all cash
  });

  it('rejects a name outside the 16-name C1 charter via the inherited v1 screen', () => {
    const ctx = {
      symbol: 'ZZZZ', market: 'NASDAQ' as const, asOf: new Date('2020-01-02T00:00:00Z'),
      bars: [], snapshot: null, positionQty: new Prisma.Decimal(0),
    };
    expect(multiModeBookV2Setup.screen(ctx).matched).toBe(false);
  });
});
