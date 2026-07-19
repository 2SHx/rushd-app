import { describe, expect, it } from 'vitest';
import {
  MULTI_MODE_ALLOCATOR_RESULT, MULTI_MODE_BOOK_V1, MULTI_MODE_UNIVERSE,
  multiModeBookPolicy, multiModeBookSetup,
} from './multiModeBook';

describe('multi-mode-book-v1 pre-registration', () => {
  it('uses the existing capped allocator to freeze 20/40/40 at seed 42', () => {
    expect(MULTI_MODE_ALLOCATOR_RESULT.allocations).toEqual({
      'dual-momentum': '0.4', 'mean-reversion': '0.4', momentum: '0.2',
    });
    expect(MULTI_MODE_BOOK_V1).toMatchObject({
      allocatorSeed: 42, momentumWeight: 0.2, meanReversionWeight: 0.4,
      dualMomentumWeight: 0.4, validationTrials: 3,
    });
  });

  it('owns a disjoint 16-name C1 charter in one shared book', () => {
    expect(new Set(MULTI_MODE_UNIVERSE).size).toBe(16);
    expect(multiModeBookSetup.universeCompatibility).toBe('fixed');
    expect(multiModeBookPolicy()).toEqual({ maxOpenPositions: 12, decisionHistoryBars: 295 });
    expect(multiModeBookSetup.plateauNeighborhood!(MULTI_MODE_BOOK_V1).neighbors).toHaveLength(2);
  });
});
