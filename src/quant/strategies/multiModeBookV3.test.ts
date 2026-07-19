import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { MULTI_MODE_BOOK_V2, multiModeBookV2Setup } from './multiModeBookV2';
import {
  MULTI_MODE_BALLAST_SYMBOL, MULTI_MODE_BOOK_V3, MULTI_MODE_UNIVERSE,
  multiModeBookV3Policy, multiModeBookV3Setup,
} from './multiModeBookV3';

describe('multi-mode-book-v3 pre-registration (E8 sukuk-ballast substitution)', () => {
  it('inherits EVERY v2 tunable parameter UNCHANGED — zero new tunable parameters', () => {
    // The tunable-param object is byte-identical to v2 (same governor, same allocator seed/trials).
    // The ONLY change is structural: the SPSK ballast, carried by the engine policy, not a param.
    expect(MULTI_MODE_BOOK_V3).toEqual(MULTI_MODE_BOOK_V2);
    expect(Object.keys(MULTI_MODE_BOOK_V3).sort()).toEqual(Object.keys(MULTI_MODE_BOOK_V2).sort());
    expect(multiModeBookV3Setup.version).toBe('v3');
    expect(multiModeBookV3Setup.universeCompatibility).toBe('fixed');
    expect(new Set(MULTI_MODE_UNIVERSE).size).toBe(16);
  });

  it('carries v2 maxOpen/history + the frozen 10%→25% governor PLUS the SPSK idle-ballast policy', () => {
    expect(multiModeBookV3Policy()).toEqual({
      maxOpenPositions: 12, decisionHistoryBars: 295,
      drawdownStartFraction: 0.10, drawdownCashFraction: 0.25,
      idleBallastSymbol: 'SPSK',
    });
    expect(MULTI_MODE_BALLAST_SYMBOL).toBe('SPSK');
  });

  it('inherits v2 governor thresholds into the policy for every off-center plateau neighbor', () => {
    const neighborhood = multiModeBookV3Setup.plateauNeighborhood!();
    // Frozen 3×3 {8,10,12}×{20,25,30} governor grid inherited from v2 VERBATIM (8 off-center cells).
    expect(neighborhood.axes).toEqual(['drawdownStartFraction', 'drawdownCashFraction']);
    expect(neighborhood.neighbors).toHaveLength(8);
    for (const neighbor of neighborhood.neighbors) {
      const policy = multiModeBookV3Policy(neighbor.params);
      expect(policy.idleBallastSymbol).toBe('SPSK'); // ballast is fixed across the whole plateau
      expect(policy.drawdownStartFraction).toBe(neighbor.params.drawdownStartFraction);
      expect(policy.drawdownCashFraction).toBe(neighbor.params.drawdownCashFraction);
      expect([0.08, 0.10, 0.12]).toContain(neighbor.params.drawdownStartFraction);
      expect([0.20, 0.25, 0.30]).toContain(neighbor.params.drawdownCashFraction);
    }
  });

  it('delegates the sleeve charter screen to v1/v2 verbatim (SPSK is never a setup-traded name)', () => {
    const ctx = {
      symbol: MULTI_MODE_BALLAST_SYMBOL, market: 'NASDAQ' as const,
      asOf: new Date('2020-01-02T00:00:00Z'),
      bars: [], snapshot: null, positionQty: new Prisma.Decimal(0),
    };
    // SPSK is outside the 16-name equity charter: the setup rejects it (engine, not setup, holds it).
    expect(multiModeBookV3Setup.screen(ctx).matched).toBe(false);
    expect(MULTI_MODE_UNIVERSE).not.toContain(MULTI_MODE_BALLAST_SYMBOL);
    expect(multiModeBookV2Setup.universeCompatibility).toBe('fixed');
  });
});
