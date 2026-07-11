import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  intradayFindMany: vi.fn(),
  marketFindFirst: vi.fn(),
  fundamentalsFindFirst: vi.fn(),
  snapshotUpsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    intradayBar: { findMany: h.intradayFindMany },
    marketBar: { findFirst: h.marketFindFirst },
    fundamentals: { findFirst: h.fundamentalsFindFirst },
    symbolSnapshot: { upsert: h.snapshotUpsert },
  },
}));

import { computeAndUpsertSnapshot, computeIntradayMetrics, nasdaqDateKey } from './snapshot';

describe('intraday snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.marketFindFirst.mockResolvedValue({ close: 100 });
    h.fundamentalsFindFirst.mockResolvedValue(null);
    h.snapshotUpsert.mockResolvedValue({ id: 'snapshot' });
  });

  it('computes cumulative volume and the move from the last premarket close', () => {
    const metrics = computeIntradayMetrics([
      { ts: new Date(), session: 'PRE', close: 105, volume: 10 },
      { ts: new Date(), session: 'PRE', close: 110, volume: 20 },
      { ts: new Date(), session: 'REGULAR', close: 109, volume: 30 },
    ], 100);
    expect(metrics).toEqual({ premarketMovePct: 10, cumVolume: 60 });
  });

  it('uses the America/New_York date across UTC midnight', () => {
    expect(nasdaqDateKey(new Date('2026-07-07T01:00:00Z'))).toBe('2026-07-06');
  });

  it('filters candidates to the Eastern trading date and does not write an empty snapshot', async () => {
    h.intradayFindMany.mockResolvedValue([{ ts: new Date('2026-07-05T19:00:00Z'), session: 'REGULAR', close: 100, volume: 1 }]);

    const result = await computeAndUpsertSnapshot('MSFT', 'NASDAQ', new Date('2026-07-06T14:00:00Z'), 'ALPACA');

    expect(result).toBeNull();
    expect(h.snapshotUpsert).not.toHaveBeenCalled();
  });

  it('writes only same-day bars and keeps point-in-time query bounds', async () => {
    const asOf = new Date('2026-07-07T01:00:00Z');
    h.intradayFindMany.mockResolvedValue([
      { ts: new Date('2026-07-06T13:00:00Z'), session: 'PRE', close: 105, volume: 10 },
      { ts: new Date('2026-07-07T00:30:00Z'), session: 'POST', close: 106, volume: 20 },
    ]);

    await computeAndUpsertSnapshot('MSFT', 'NASDAQ', asOf, 'ALPACA');

    const query = h.intradayFindMany.mock.calls[0][0];
    expect(query.where.ts.lte).toBe(asOf);
    expect(h.snapshotUpsert.mock.calls[0][0].create.cumVolume.toString()).toBe('30');
  });

  it('uses captured PIT inputs while keeping bar and market-cap provenance separate', async () => {
    const asOf = new Date('2021-01-27T21:00:00Z');
    h.intradayFindMany.mockResolvedValue([
      { ts: new Date('2021-01-27T13:00:00Z'), session: 'PRE', close: 10, volume: 100 },
    ]);

    await computeAndUpsertSnapshot('AMC', 'NASDAQ', asOf, 'ALPACA', {
      priorClose: 5, mcap: 500_000_000, mcapSource: 'FUNDAMENTALS',
    });

    const create = h.snapshotUpsert.mock.calls[0][0].create;
    expect(create.premarketMovePct.toString()).toBe('100');
    expect(create.mcap.toString()).toBe('500000000');
    expect(create).toMatchObject({ source: 'ALPACA', mcapSource: 'FUNDAMENTALS' });
    expect(h.marketFindFirst).not.toHaveBeenCalled();
    expect(h.fundamentalsFindFirst).not.toHaveBeenCalled();
  });
});
