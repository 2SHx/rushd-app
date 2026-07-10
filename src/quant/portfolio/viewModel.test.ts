import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  marketBarFindMany: vi.fn(),
  snapshotFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    marketBar: { findMany: db.marketBarFindMany },
    portfolioSnapshot: { findMany: db.snapshotFindMany },
  },
}));

import { loadPortfolioViewModel } from './viewModel';

const D = Prisma.Decimal;
const now = new Date('2026-07-10T12:00:00.000Z');

describe('loadPortfolioViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.snapshotFindMany.mockResolvedValue([]);
    db.marketBarFindMany.mockResolvedValue([]);
  });

  it('keeps real history empty and does not fabricate snapshots', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [],
      strategies: [{ id: 'strategy-1' }],
    });

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialSnapshots).toEqual([]);
    expect(result?.initialMetrics.alphaVsSpy).toBe(0);
    expect(db.snapshotFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', strategyId: { in: ['strategy-1'] } },
      orderBy: { asOf: 'asc' },
    });
  });

  it('marks positions from one fresh persisted-source batch and excludes missing prices from NAV', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: 'AAPL', market: 'NASDAQ', shares: new D(2), costBasis: new D(120) },
        { symbol: 'MSFT', market: 'NASDAQ', shares: new D(3), costBasis: new D(300) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      {
        symbol: 'AAPL',
        market: 'NASDAQ',
        close: new D(150),
        source: 'ALPACA',
        ts: new Date('2026-07-10T00:00:00.000Z'),
      },
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(db.marketBarFindMany).toHaveBeenCalledTimes(1);
    expect(db.marketBarFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          interval: 'DAY',
          ts: {
            gte: new Date('2026-07-05T12:00:00.000Z'),
            lte: now,
          },
          OR: expect.arrayContaining([
            expect.objectContaining({ market: 'NASDAQ', source: 'ALPACA' }),
          ]),
        }),
        distinct: ['symbol', 'market'],
      }),
    );
    expect(result?.initialNAV).toBe(1300);
    expect(result?.initialPositions.map((position) => position.symbol)).toEqual(['AAPL']);
    expect(result?.unpricedSymbols).toEqual(['MSFT']);
  });
});
