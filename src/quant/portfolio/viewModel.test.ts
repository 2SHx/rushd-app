import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  marketBarFindMany: vi.fn(),
  snapshotFindMany: vi.fn(),
  decisionFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: db.userFindUnique },
    marketBar: { findMany: db.marketBarFindMany },
    portfolioSnapshot: { findMany: db.snapshotFindMany },
    decision: { findMany: db.decisionFindMany },
  },
}));

import { loadPortfolioViewModel } from './viewModel';

const D = Prisma.Decimal;
const now = new Date('2026-07-10T12:00:00.000Z');

function snapshot(strategyId: string, asOf: string, nav: number, currency: 'SAR' | 'USD' = 'USD') {
  return {
    strategyId,
    asOf: new Date(asOf),
    nav: new D(nav),
    cashVirtual: new D(100),
    currency,
    benchmarkNavSpy: new D(100),
    benchmarkNavSpus: new D(100),
  };
}

describe('loadPortfolioViewModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.snapshotFindMany.mockResolvedValue([]);
    db.marketBarFindMany.mockResolvedValue([]);
    db.decisionFindMany.mockResolvedValue([]);
  });

  it('keeps real history empty and does not fabricate snapshots', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [],
      strategies: [{ id: 'strategy-1' }],
    });

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialSnapshots).toEqual([]);
    expect(result?.performanceStatus).toBe('no_snapshots');
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
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(2), costBasis: new D(120) },
        { symbol: 'MSFT', market: 'NASDAQ', currency: 'USD', shares: new D(3), costBasis: new D(300) },
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
    expect(result?.initialNAV).toBeNull();
    expect(result?.cashCurrency).toBeNull();
    expect(result?.initialPositions.map((position) => position.symbol)).toEqual(['AAPL']);
    expect(result?.unpricedSymbols).toEqual(['MSFT']);
  });

  it('does not merge snapshots from multiple strategies into one performance curve', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [],
      strategies: [{ id: 'strategy-1' }, { id: 'strategy-2' }],
    });
    db.snapshotFindMany.mockResolvedValue([
      snapshot('strategy-1', '2026-07-08T00:00:00.000Z', 100),
      snapshot('strategy-2', '2026-07-09T00:00:00.000Z', 220),
      snapshot('strategy-1', '2026-07-10T00:00:00.000Z', 110),
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.performanceStatus).toBe('multiple_strategies');
    expect(result?.initialSnapshots).toEqual([]);
    expect(result?.initialMetrics.cagr).toBe(0);
  });

  it('passes the one strategy stream that actually has snapshots', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [],
      strategies: [{ id: 'strategy-empty' }, { id: 'strategy-with-history' }],
    });
    db.snapshotFindMany.mockResolvedValue([
      snapshot('strategy-with-history', '2026-07-08T00:00:00.000Z', 100),
      snapshot('strategy-with-history', '2026-07-10T00:00:00.000Z', 105),
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.performanceStatus).toBe('available');
    expect(result?.initialSnapshots.map((entry) => entry.nav)).toEqual([100, 105]);
  });

  it('withholds return metrics until one strategy has at least two snapshots', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [],
      strategies: [{ id: 'strategy-1' }],
    });
    db.snapshotFindMany.mockResolvedValue([
      snapshot('strategy-1', '2026-07-10T00:00:00.000Z', 100),
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.performanceStatus).toBe('no_snapshots');
    expect(result?.initialSnapshots).toEqual([]);
  });

  it('classifies a numeric TASI symbol from its DB market and preserves SAR', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: '2222', market: 'TASI', currency: 'SAR', shares: new D(2), costBasis: new D(25) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      { symbol: '2222', market: 'TASI', close: new D(30), source: 'SAHMK', ts: now },
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(db.marketBarFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [expect.objectContaining({ market: 'TASI', symbol: { in: ['2222'] } })],
        }),
      }),
    );
    expect(result?.initialPositions[0]).toMatchObject({
      symbol: '2222',
      market: 'TASI',
      currency: 'SAR',
      value: 60,
    });
  });

  it('keeps per-currency holdings and withholds a combined NAV for mixed currencies', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: '2222', market: 'TASI', currency: 'SAR', shares: new D(2), costBasis: new D(25) },
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      { symbol: '2222', market: 'TASI', close: new D(30), source: 'SAHMK', ts: now },
      { symbol: 'AAPL', market: 'NASDAQ', close: new D(150), source: 'ALPACA', ts: now },
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialNAV).toBeNull();
    expect(result?.cashCurrency).toBeNull();
    expect(result?.combinedValueStatus).toBe('mixed_currencies');
    expect(result?.performanceStatus).toBe('mixed_currencies');
    expect(result?.currencyTotals).toEqual([
      { currency: 'SAR', positionsValue: 60, cashValue: null, totalValue: null },
      { currency: 'USD', positionsValue: 150, cashValue: null, totalValue: null },
    ]);
    expect(result?.initialPositions.every((position) => position.weight === null)).toBe(true);
  });

  it('preserves an unknown cost basis instead of substituting the current price', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: null },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      { symbol: 'AAPL', market: 'NASDAQ', close: new D(150), source: 'ALPACA', ts: now },
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialPositions[0].costBasis).toBeNull();
  });

  it('marks holdings as unverified when no persisted compliance verdict exists', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      { symbol: 'AAPL', market: 'NASDAQ', close: new D(150), source: 'ALPACA', ts: now },
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialPositions[0].complianceStatus).toBe('UNVERIFIED');
  });

  it('uses one bounded persisted decision query for compliant, non-compliant, and unknown statuses', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
        { symbol: 'TSLA', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
        { symbol: 'MSFT', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue(['AAPL', 'TSLA', 'MSFT'].map((symbol) => ({
      symbol,
      market: 'NASDAQ',
      close: new D(150),
      source: 'ALPACA',
      ts: now,
    })));
    db.decisionFindMany.mockResolvedValue([
      { symbol: 'AAPL', market: 'NASDAQ', shariaGate: { compliant: true, source: 'zoya' } },
      { symbol: 'TSLA', market: 'NASDAQ', shariaGate: { compliant: false, source: 'zoya' } },
      { symbol: 'MSFT', market: 'NASDAQ', shariaGate: {} },
    ]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialPositions.map((position) => position.complianceStatus)).toEqual([
      'VERIFIED_COMPLIANT',
      'VERIFIED_NON_COMPLIANT',
      'UNVERIFIED',
    ]);
    expect(db.decisionFindMany).toHaveBeenCalledTimes(1);
    expect(db.decisionFindMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          { symbol: 'AAPL', market: 'NASDAQ' },
          { symbol: 'TSLA', market: 'NASDAQ' },
          { symbol: 'MSFT', market: 'NASDAQ' },
        ],
      },
      select: { symbol: true, market: true, shariaGate: true },
      orderBy: { createdAt: 'desc' },
      distinct: ['symbol', 'market'],
      take: 3,
    });
  });

  it('treats mock compliance decisions as unverified', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      { symbol: 'AAPL', market: 'NASDAQ', close: new D(150), source: 'ALPACA', ts: now },
    ]);
    db.decisionFindMany.mockResolvedValue([{
      symbol: 'AAPL',
      market: 'NASDAQ',
      shariaGate: { compliant: true, source: 'mock' },
    }]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialPositions[0].complianceStatus).toBe('UNVERIFIED');
  });

  it('treats a fail-closed screener outage as unknown, not verified non-compliant', async () => {
    db.userFindUnique.mockResolvedValue({
      cashVirtual: new D(1000),
      portfolioItems: [
        { symbol: 'AAPL', market: 'NASDAQ', currency: 'USD', shares: new D(1), costBasis: new D(120) },
      ],
      strategies: [],
    });
    db.marketBarFindMany.mockResolvedValue([
      { symbol: 'AAPL', market: 'NASDAQ', close: new D(150), source: 'ALPACA', ts: now },
    ]);
    db.decisionFindMany.mockResolvedValue([{
      symbol: 'AAPL',
      market: 'NASDAQ',
      shariaGate: {
        compliant: false,
        reason: 'screener_unavailable_fail_closed',
        source: 'none',
      },
    }]);

    const result = await loadPortfolioViewModel('user-1', now);

    expect(result?.initialPositions[0].complianceStatus).toBe('UNVERIFIED');
  });
});
