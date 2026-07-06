import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findMany: vi.fn() },
    fundamentals: { findFirst: vi.fn() },
    newsItem: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { PointInTimeContext, assertNoLookahead, LookaheadError } from './pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');
// A bar row shaped like Prisma's return (Decimal fields irrelevant to point-in-time logic).
const bar = (iso: string) => ({
  id: iso, symbol: 'AAPL', market: 'NASDAQ', interval: 'DAY',
  ts: new Date(iso), open: 1, high: 1, low: 1, close: 1, volume: 1,
  source: 'ALPACA', createdAt: new Date(),
});

describe('assertNoLookahead', () => {
  it('passes when every item is at or before asOf', () => {
    const items = [{ ts: new Date('2026-06-29T00:00:00Z') }, { ts: asOf }];
    expect(() => assertNoLookahead(items, asOf, 'ts')).not.toThrow();
  });

  it('throws LookaheadError on any item dated after asOf', () => {
    const items = [{ ts: new Date('2026-07-01T00:00:00Z') }];
    expect(() => assertNoLookahead(items, asOf, 'ts')).toThrow(LookaheadError);
  });
});

describe('PointInTimeContext.getBars', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters ts <= asOf, honors lookback, and returns oldest-first', async () => {
    // Prisma returns newest-first (for `take`); the context must reverse to chronological.
    (prisma.marketBar.findMany as any).mockResolvedValue([
      bar('2026-06-30T00:00:00.000Z'),
      bar('2026-06-29T00:00:00.000Z'),
      bar('2026-06-28T00:00:00.000Z'),
    ]);
    const ctx = new PointInTimeContext(asOf);
    const bars = await ctx.getBars('AAPL', 'NASDAQ' as any, { lookback: 3 });

    const callArg = (prisma.marketBar.findMany as any).mock.calls[0][0];
    expect(callArg.where.ts).toEqual({ lte: asOf });
    expect(callArg.where.interval).toBe('DAY');
    expect(callArg.take).toBe(3);
    expect(bars.map((b: any) => b.ts.toISOString())).toEqual([
      '2026-06-28T00:00:00.000Z',
      '2026-06-29T00:00:00.000Z',
      '2026-06-30T00:00:00.000Z',
    ]);
  });

  // The Q2 guarantee, asserted in Q0: a leaked future bar MUST fail the read.
  it('LOOK-AHEAD INJECTION → throws if the store leaks a bar dated after asOf', async () => {
    (prisma.marketBar.findMany as any).mockResolvedValue([bar('2026-07-05T00:00:00.000Z')]);
    const ctx = new PointInTimeContext(asOf);
    await expect(ctx.getBars('AAPL', 'NASDAQ' as any)).rejects.toBeInstanceOf(LookaheadError);
  });
});

describe('PointInTimeContext.getFundamentals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by releasedAt <= asOf, newest release first', async () => {
    (prisma.fundamentals.findFirst as any).mockResolvedValue({
      id: 'f1', symbol: 'AAPL', market: 'NASDAQ',
      asOf: new Date('2026-03-31T00:00:00Z'), releasedAt: new Date('2026-05-01T00:00:00Z'),
      metrics: {}, source: 'FUNDAMENTALS', createdAt: new Date(),
    });
    const ctx = new PointInTimeContext(asOf);
    const f = await ctx.getFundamentals('AAPL', 'NASDAQ' as any);
    const callArg = (prisma.fundamentals.findFirst as any).mock.calls[0][0];
    expect(callArg.where.releasedAt).toEqual({ lte: asOf });
    expect(callArg.orderBy).toEqual({ releasedAt: 'desc' });
    expect(f?.id).toBe('f1');
  });
});
