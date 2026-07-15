import { describe, expect, it } from 'vitest';
import { YAHOO_STOCK_METRICS } from './yahooFinanceData';

describe('YAHOO_STOCK_METRICS', () => {
  it('covers a broad Nasdaq representative set for themes and heatmaps', () => {
    const stocks = Object.values(YAHOO_STOCK_METRICS);
    const sectors = Array.from(new Set(stocks.map((stock) => stock.sector)));

    expect(stocks).toHaveLength(82);
    expect(new Set(stocks.map((stock) => stock.symbol)).size).toBe(stocks.length);
    expect(sectors).toEqual(expect.arrayContaining([
      'Technology',
      'Semiconductors',
      'Communication Services',
      'Consumer Cyclical',
      'Consumer Defensive',
      'Healthcare',
      'Industrials',
      'Utilities',
      'Energy',
    ]));
  });
});
