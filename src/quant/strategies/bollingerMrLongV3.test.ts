import { describe, expect, it } from 'vitest';
import {
  BOLLINGER_MR_LONG_V3,
  bollingerMrLongV3Setup,
  bollingerV3BookPolicy,
} from './bollingerMrLongV3';

describe('bollinger-mr-long-v3 pre-registration', () => {
  it('changes breadth/routing only and freezes center plus four v2 neighbors', () => {
    expect(bollingerMrLongV3Setup.universeCompatibility).toBe('fixed');
    expect(BOLLINGER_MR_LONG_V3).toMatchObject({
      bandPeriod: 20, entryStdev: 2, varianceRatioMax: 0.85,
      trendSmaPeriod: 200, volLookback: 60, targetVolBudget: 0.004,
      maxNameFraction: 0.2, validationTrials: 5,
    });
    const grid = bollingerMrLongV3Setup.plateauNeighborhood!(BOLLINGER_MR_LONG_V3);
    expect([grid.center, ...grid.neighbors.map(({ params }) => params)]).toHaveLength(5);
    expect(grid.axes).toEqual(['entryStdev', 'varianceRatioMax']);
  });

  it('uses the shared book with a six-position cap and bounded v2 history', () => {
    expect(bollingerV3BookPolicy()).toEqual({ maxOpenPositions: 6, decisionHistoryBars: 200 });
  });
});
