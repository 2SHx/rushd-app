import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findMany: vi.fn() },
    fundamentals: { findFirst: vi.fn() },
    newsItem: { findMany: vi.fn() },
    intradayBar: { findMany: vi.fn() },
    symbolSnapshot: { findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  PointInTimeStore,
  loadPointInTimeContext,
  assertNoLookahead,
  LookaheadError,
  IntradayPointInTimeStore,
  ANNUAL_DEFAULT,
} from './pointInTime';
import { computeAaoifiScreen, type Tier2Inputs } from '../universe/tier2AaoifiScreener';

const asOf = new Date('2026-06-30T00:00:00.000Z');
const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000);
const bar = (ts: Date) => ({
  id: ts.toISOString(), symbol: 'AAPL', market: 'NASDAQ', interval: 'DAY',
  ts, open: 1, high: 1, low: 1, close: 1, volume: 1, source: 'ALPACA', createdAt: new Date(),
});

describe('IntradayPointInTimeStore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries minute bars only at-or-before asOf', async () => {
    (prisma.intradayBar.findMany as any).mockResolvedValue([{ ts: asOf }]);
    await new IntradayPointInTimeStore().bars('AAPL', 'NASDAQ' as any, asOf, 60);
    const query = (prisma.intradayBar.findMany as any).mock.calls[0][0];
    expect(query.where.ts.lte).toBe(asOf);
    expect(query.where.ts.gt).toEqual(new Date(asOf.getTime() - 60 * 60_000));
    expect(query.orderBy).toEqual({ ts: 'asc' });
  });

  it('LOOK-AHEAD INJECTION → rejects a leaked future minute bar', async () => {
    (prisma.intradayBar.findMany as any).mockResolvedValue([{ ts: new Date(asOf.getTime() + 60_000) }]);
    await expect(new IntradayPointInTimeStore().bars('AAPL', 'NASDAQ' as any, asOf)).rejects.toBeInstanceOf(LookaheadError);
  });

  it('queries the latest snapshot at-or-before asOf', async () => {
    (prisma.symbolSnapshot.findFirst as any).mockResolvedValue({ asOf });
    await new IntradayPointInTimeStore().snapshot('AAPL', 'NASDAQ' as any, asOf);
    expect((prisma.symbolSnapshot.findFirst as any).mock.calls[0][0]).toMatchObject({
      where: { symbol: 'AAPL', market: 'NASDAQ', asOf: { lte: asOf } },
      orderBy: { asOf: 'desc' },
    });
  });
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

describe('PointInTimeStore.fundamentals — deterministic tie-break — acceptance #3', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves a releasedAt collision by latest fiscal `asOf`, and repeated reads agree', async () => {
    // Two distinct fiscal-year filings (WAT FY2016, FY2017) that both became public the same day
    // — a real, confirmed collision. `releasedAt desc` alone leaves the winner to undefined DB
    // row order; `asOf desc` as the documented secondary key makes it a total order.
    const rows = [
      { id: 'fy2016', symbol: 'WAT', market: 'NASDAQ', asOf: new Date('2016-12-31'), releasedAt: new Date('2019-02-26') },
      { id: 'fy2017', symbol: 'WAT', market: 'NASDAQ', asOf: new Date('2017-12-31'), releasedAt: new Date('2019-02-26') },
    ];
    // Mock emulates a real DB: filters by `where`, sorts by the exact `orderBy` array passed in,
    // and returns the first row — so this test exercises the actual tie-break contract, not just
    // that some `orderBy` was passed.
    (prisma.fundamentals.findFirst as any).mockImplementation(async (args: any) => {
      const cutoff = (args.where.releasedAt.lte as Date).getTime();
      const filtered = rows.filter((r) => r.releasedAt.getTime() <= cutoff);
      const sorted = [...filtered].sort((a, b) => {
        for (const clause of args.orderBy as Array<Record<string, 'asc' | 'desc'>>) {
          const [key, dir] = Object.entries(clause)[0] as [keyof typeof a, 'asc' | 'desc'];
          const diff = (a[key] as Date).getTime() - (b[key] as Date).getTime();
          if (diff !== 0) return dir === 'desc' ? -diff : diff;
        }
        return 0;
      });
      return sorted[0] ?? null;
    });

    const store = new PointInTimeStore();
    const queryAsOf = new Date('2020-01-01');
    const first = await store.fundamentals('WAT', 'NASDAQ' as any, queryAsOf);
    const second = await store.fundamentals('WAT', 'NASDAQ' as any, queryAsOf);

    expect(first?.id).toBe('fy2017'); // the more recently completed fiscal year wins the tie
    expect(second?.id).toBe('fy2017'); // repeated reads agree — no undefined-DB-order flakiness
    expect((prisma.fundamentals.findFirst as any).mock.calls[0][0].orderBy).toEqual([
      { releasedAt: 'desc' },
      { asOf: 'desc' },
    ]);
  });
});

describe('PointInTimeStore.fundamentals — explicit ANNUAL/QUARTERLY period (2026-08-19 defect fix)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a request for QUARTERLY queries period: QUARTERLY, never ANNUAL — and vice versa', async () => {
    (prisma.fundamentals.findFirst as any).mockResolvedValue(null);
    await new PointInTimeStore().fundamentals('AAPL', 'NASDAQ' as any, asOf, 'QUARTERLY');
    expect((prisma.fundamentals.findFirst as any).mock.calls[0][0].where.period).toBe('QUARTERLY');

    vi.clearAllMocks();
    (prisma.fundamentals.findFirst as any).mockResolvedValue(null);
    await new PointInTimeStore().fundamentals('AAPL', 'NASDAQ' as any, asOf, 'ANNUAL');
    expect((prisma.fundamentals.findFirst as any).mock.calls[0][0].where.period).toBe('ANNUAL');
  });

  it('a caller that specifies nothing gets the documented ANNUAL_DEFAULT, not a mix', async () => {
    (prisma.fundamentals.findFirst as any).mockResolvedValue(null);
    await new PointInTimeStore().fundamentals('AAPL', 'NASDAQ' as any, asOf);
    expect((prisma.fundamentals.findFirst as any).mock.calls[0][0].where.period).toBe(ANNUAL_DEFAULT);
    expect(ANNUAL_DEFAULT).toBe('ANNUAL');
  });

  it.each(['ANNUAL', 'QUARTERLY'] as const)(
    'LOOK-AHEAD INJECTION (%s) → assertNoLookahead still rejects a releasedAt after asOf',
    async (period) => {
      (prisma.fundamentals.findFirst as any).mockResolvedValue({
        id: 'leak', symbol: 'AAPL', market: 'NASDAQ', period, releasedAt: new Date(asOf.getTime() + 1),
      });
      await expect(new PointInTimeStore().fundamentals('AAPL', 'NASDAQ' as any, asOf, period)).rejects.toBeInstanceOf(
        LookaheadError,
      );
    },
  );

  it('the period a Sharia-gate-style reader chooses is what it reads, and a null required field still fails closed', async () => {
    // Simulates the pending Sharia-gate join (sharia.ts's documented QUARTERLY choice): resolve
    // the latest QUARTERLY row, map its metrics onto Tier2Inputs, and run the real AAOIFI screen.
    (prisma.fundamentals.findFirst as any).mockResolvedValue({
      id: 'q1', symbol: 'AAPL', market: 'NASDAQ', period: 'QUARTERLY',
      asOf: new Date('2026-06-30'), releasedAt: daysAgo(10),
      metrics: {
        sic: '7372', interestBearingDebtUsd: null, // thin quarterly coverage: debt field absent
        cashAndInterestSecuritiesUsd: 1_000, marketCapUsd: 2_000_000_000, nonCompliantIncomeUsd: 0,
        totalRevenueUsd: 100_000_000,
      },
    });
    const row = await new PointInTimeStore().fundamentals('AAPL', 'NASDAQ' as any, asOf, 'QUARTERLY');
    expect((prisma.fundamentals.findFirst as any).mock.calls[0][0].where.period).toBe('QUARTERLY');
    expect(row).not.toBeNull();

    const metrics = row!.metrics as Record<string, unknown>;
    const inputs: Tier2Inputs = {
      symbol: row!.symbol,
      name: row!.symbol,
      sic: metrics.sic as string,
      interestBearingDebtUsd: metrics.interestBearingDebtUsd as number | null,
      cashAndInterestSecuritiesUsd: metrics.cashAndInterestSecuritiesUsd as number,
      marketCapUsd: metrics.marketCapUsd as number,
      nonCompliantIncomeUsd: metrics.nonCompliantIncomeUsd as number,
      totalRevenueUsd: metrics.totalRevenueUsd as number,
      asOf: row!.asOf.toISOString().slice(0, 10),
    };
    const screen = computeAaoifiScreen(inputs, { referenceDate: asOf });
    expect(screen.compliant).toBe(false);
    expect(screen.reasonCodes).toContain('missing_xbrl_inputs');
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
    // No fundamentalsPeriod passed → documented ANNUAL_DEFAULT reaches the store's `where`.
    expect((prisma.fundamentals.findFirst as any).mock.calls[0][0].where.period).toBe(ANNUAL_DEFAULT);
    // bars(30) keeps only the two within 30 days (daysAgo(10), asOf), chronological
    expect(ctx.bars(30).map((b) => b.ts.getTime())).toEqual([daysAgo(10).getTime(), asOf.getTime()]);
    // bars(365) keeps all three
    expect(ctx.bars(365)).toHaveLength(3);
    // news(7) keeps only the 3-days-ago item
    expect(ctx.news(7)).toHaveLength(1);
    expect(ctx.fundamentals()?.id).toBe('f1');
  });
});
