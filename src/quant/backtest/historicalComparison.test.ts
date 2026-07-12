import { describe, expect, it } from 'vitest';
import { buildHistoricalComparisonEvidence, type ComparisonBenchmarkBar } from './historicalComparison';

const day = (dayOfMonth: number) => new Date(`2026-01-${String(dayOfMonth).padStart(2, '0')}T21:00:00.000Z`);

function bars(symbol: 'SPY' | 'SPUS', values: number[], startDay = 1, source: 'YAHOO' | 'ALPACA' = 'YAHOO'): ComparisonBenchmarkBar[] {
  return values.map((close, index) => ({ symbol, ts: day(startDay + index), close, source }));
}

describe('buildHistoricalComparisonEvidence', () => {
  it('normalizes all three price-only series to 100', () => {
    const result = buildHistoricalComparisonEvidence({
      strategyCurve: [{ ts: day(1), equity: 50_000 }, { ts: day(2), equity: 55_000 }, { ts: day(3), equity: 60_000 }],
      oosStart: day(2),
      benchmarkBars: [...bars('SPY', [200, 220, 240]), ...bars('SPUS', [50, 55, 60])],
    });

    expect(result?.basis).toBe('NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS');
    expect(result?.series.model).toEqual([
      { ts: day(1).toISOString(), value: 100 },
      { ts: day(3).toISOString(), value: 120 },
    ]);
    expect(result?.series.spy.at(-1)?.value).toBe(120);
    expect(result?.series.spus.at(-1)?.value).toBe(120);
  });

  it('uses the late SPUS start and common earliest end for every series', () => {
    const result = buildHistoricalComparisonEvidence({
      strategyCurve: Array.from({ length: 8 }, (_, index) => ({ ts: day(index + 1), equity: 100 + index })),
      oosStart: day(5),
      benchmarkBars: [...bars('SPY', [10, 11, 12, 13, 14, 15, 16]), ...bars('SPUS', [20, 21, 22, 23], 4)],
    });

    expect(result).toMatchObject({ start: day(4).toISOString(), end: day(7).toISOString() });
    for (const series of Object.values(result!.series)) {
      expect(series[0]).toMatchObject({ ts: day(4).toISOString(), value: 100 });
      expect(series.at(-1)?.ts).toBe(day(7).toISOString());
    }
  });

  it('samples weekly-last with a bounded series while preserving common endpoints', () => {
    const values = Array.from({ length: 28 }, (_, index) => 100 + index);
    const result = buildHistoricalComparisonEvidence({
      strategyCurve: values.map((equity, index) => ({ ts: day(index + 1), equity })),
      oosStart: day(20),
      benchmarkBars: [...bars('SPY', values), ...bars('SPUS', values)],
    });

    for (const series of Object.values(result!.series)) {
      expect(series[0].ts).toBe(day(1).toISOString());
      expect(series.at(-1)?.ts).toBe(day(28).toISOString());
      expect(series.length).toBeLessThanOrEqual(6);
    }
  });

  it('returns null for missing or corrupt evidence', () => {
    const curve = [{ ts: day(1), equity: 100 }, { ts: day(2), equity: 101 }];
    expect(buildHistoricalComparisonEvidence({ strategyCurve: curve, oosStart: day(2), benchmarkBars: bars('SPY', [10, 11]) })).toBeNull();
    expect(buildHistoricalComparisonEvidence({
      strategyCurve: curve, oosStart: day(2),
      benchmarkBars: [...bars('SPY', [10, 11]), ...bars('SPUS', [0, 11])],
    })).toBeNull();
    expect(buildHistoricalComparisonEvidence({
      strategyCurve: [{ ts: day(1), equity: 100 }, { ts: day(2), equity: Number.NaN }], oosStart: day(2),
      benchmarkBars: [...bars('SPY', [10, 11]), ...bars('SPUS', [10, 11])],
    })).toBeNull();
  });

  it('preserves a legitimate model wipeout as zero rather than hiding the comparison', () => {
    const result = buildHistoricalComparisonEvidence({
      strategyCurve: [{ ts: day(1), equity: 100 }, { ts: day(2), equity: 0 }],
      oosStart: day(2),
      benchmarkBars: [...bars('SPY', [10, 11]), ...bars('SPUS', [10, 11])],
    });

    expect(result?.series.model.at(-1)?.value).toBe(0);
  });

  it('records canonical source provenance for each ETF proxy', () => {
    const result = buildHistoricalComparisonEvidence({
      strategyCurve: [{ ts: day(1), equity: 100 }, { ts: day(2), equity: 101 }],
      oosStart: day(2),
      benchmarkBars: [
        ...bars('SPY', [10], 1, 'ALPACA'), ...bars('SPY', [11], 2, 'YAHOO'),
        ...bars('SPUS', [10, 11], 1, 'ALPACA'),
      ],
    });

    expect(result?.sources).toEqual({ spy: ['YAHOO', 'ALPACA'], spus: ['ALPACA'] });
    expect(result?.strategyKind).toBe('POOLED_TRADE_SEQUENCED_SIMULATED_EQUITY');
    expect(result?.benchmarkKind).toBe('ETF_CLOSE_PRICE_PROXY');
  });
});
