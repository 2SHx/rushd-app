import { describe, expect, it } from 'vitest';
import {
  getBenchmarkAtOrBefore,
  normalizeSymbolAllowlist,
  runPortfolioBacktest
} from './portfolioEngine';

describe('portfolio backtest isolation helpers', () => {
  it('never attaches a future benchmark point to an earlier portfolio date', () => {
    const point = getBenchmarkAtOrBefore(
      [{ ts: new Date('2024-01-03'), spy: 120, spus: 115 }],
      new Date('2024-01-02'),
      100
    );

    expect(point).toEqual({ spy: 100, spus: 100 });
  });

  it('uses the latest benchmark point available on or before the portfolio date', () => {
    const point = getBenchmarkAtOrBefore(
      [
        { ts: new Date('2024-01-02'), spy: 101, spus: 102 },
        { ts: new Date('2024-01-04'), spy: 120, spus: 121 },
      ],
      new Date('2024-01-03'),
      100
    );

    expect(point).toEqual({ spy: 101, spus: 102 });
  });

  it('normalizes case, whitespace, and duplicates while preserving empty scope', () => {
    expect(normalizeSymbolAllowlist([' msft ', 'MSFT', 'nvda'])).toEqual(['MSFT', 'NVDA']);
    expect(normalizeSymbolAllowlist(['msft'])).toEqual(normalizeSymbolAllowlist(['MSFT']));
    expect(normalizeSymbolAllowlist([' ', ''])).toEqual([]);
    expect(normalizeSymbolAllowlist()).toBeUndefined();
  });

  it('returns an empty result without querying for an empty normalized scope', async () => {
    const result = await runPortfolioBacktest(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      100,
      [' ', '']
    );

    expect(result.equityCurve).toEqual([]);
  });
});
