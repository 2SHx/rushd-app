import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findMany: vi.fn() },
    fundamentals: { findFirst: vi.fn() },
    newsItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  PointInTimeStore,
  loadPointInTimeContext,
  assertNoLookahead,
  LookaheadError,
} from './pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);
const bar = (ts: Date) => ({
  id: ts.toISOString(), symbol: 'AAPL', market: 'NASDAQ', interval: 'DAY',
  ts, open: 1, high: 1, low: 1, close: 1, volume: 1, source: 'ALPACA', createdAt: new Date(),
});
const newsRow = (ts: Date) => ({
  id: ts.toISOString(), symbol: 'AAPL', market: 'NASDAQ', publishedAt: ts,
  headline: 'x', summary: null, url: null, sentiment: null, source: 'ALPACA', createdAt: new Date(),
});

describe('assertNoLookahead', () => {
  it('passes when every item is at or before asOf', () => {
    expect(() => assertNoLookahead([{ ts: daysAgo(1) }, { ts: asOf }], asOf, 'ts')).not.toThrow();
  });
  it('throws LookaheadError on any item dated after asOf', () => {
    expect(() => assertNoLookahead([{ ts: daysAgo(-1) }], asOf, 'ts')).toThrow(LookaheadError);
  });
});

describe('PointInTimeStore.bars', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries ts <= asOf (and > from when lookback given), returns rows chronologically', async () => {
    (prisma.marketBar.findMany as any).mockResolvedValue([bar(daysAgo(2)), bar(daysAgo(1)), bar(asOf)]);
    const rows = await new PointInTimeStore().bars('AAPL', 'NASDAQ' as any, asOf, 30);
    const arg = (prisma.marketBar.findMany as any).mock.calls[0][0];
    expect(arg.where.ts.lte).toBe(asOf);
    expect(arg.where.ts.gt).toEqual(daysAgo(30));
    expect(arg.orderBy).toEqual({ ts: 'asc' });
    expect(rows).toHaveLength(3);
  });

  // Q2 guarantee asserted in Q0: a leaked future bar MUST fail the read.
  it('LOOK-AHEAD INJECTION → throws if the store leaks a bar dated after asOf', async () => {
    (prisma.marketBar.findMany as any).mockResolvedValue([bar(daysAgo(-5))]);
    await expect(new PointInTimeStore().bars('AAPL', 'NASDAQ' as any, asOf)).rejects.toBeInstanceOf(
      LookaheadError,
    );
  });
});

describe('loadPointInTimeContext (sync view)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pre-loads once and slices by lookback window synchronously', async () => {
    (prisma.marketBar.findMany as any).mockResolvedValue([bar(daysAgo(100)), bar(daysAgo(10)), bar(asOf)]);
    (prisma.fundamentals.findFirst as any).mockResolvedValue({ id: 'f1', releasedAt: daysAgo(40) });
    (prisma.newsItem.findMany as any).mockResolvedValue([newsRow(daysAgo(3)), newsRow(daysAgo(20))]);

    const ctx = await loadPointInTimeContext({ symbol: 'AAPL', market: 'NASDAQ' as any, asOf });

    expect(ctx.symbol).toBe('AAPL');
    expect(ctx.asOf).toBe(asOf);
    // bars(30) keeps only the two within 30 days (daysAgo(10), asOf), chronological
    expect(ctx.bars(30).map((b) => b.ts.getTime())).toEqual([daysAgo(10).getTime(), asOf.getTime()]);
    // bars(365) keeps all three
    expect(ctx.bars(365)).toHaveLength(3);
    // news(7) keeps only the 3-days-ago item
    expect(ctx.news(7)).toHaveLength(1);
    expect(ctx.fundamentals()?.id).toBe('f1');
  });
});
