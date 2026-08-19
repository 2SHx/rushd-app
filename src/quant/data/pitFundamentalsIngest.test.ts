// Offline tests for src/quant/data/pitFundamentalsIngest.ts. Prisma is mocked (no real DB, no
// network) — mirrors the vi.mock('@/lib/prisma', ...) pattern used across src/quant/data/*.test.ts.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    fundamentals: { createMany: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { PointInTimeStore } from './pointInTime';
import { toFundamentalsCreateInput, writePitFundamentals } from './pitFundamentalsIngest';
import type { PitFundamentalsFiling } from './pitFundamentalsBackfill';

const filing: PitFundamentalsFiling = {
  symbol: 'ABCD',
  market: 'NASDAQ',
  asOf: '2019-12-31',
  releasedAt: '2020-02-15',
  period: 'ANNUAL',
  metrics: {
    sic: '3674',
    interestBearingDebtUsd: 100,
    cashAndInterestSecuritiesUsd: 50,
    nonCompliantIncomeUsd: 5,
    totalRevenueUsd: 1_000,
    form: '10-K',
    notes: [],
  },
};

describe('toFundamentalsCreateInput', () => {
  it('maps releasedAt (SEC filed date) and asOf (fiscal period) to distinct Date fields', () => {
    const row = toFundamentalsCreateInput(filing);
    expect(row.asOf).toEqual(new Date('2019-12-31T00:00:00.000Z'));
    expect(row.releasedAt).toEqual(new Date('2020-02-15T00:00:00.000Z'));
    expect(row.asOf).not.toEqual(row.releasedAt);
    expect(row.source).toBe('FUNDAMENTALS');
    expect(row.metrics).toEqual(filing.metrics);
  });
});

describe('writePitFundamentals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes via createMany with skipDuplicates — never upsert/update — acceptance #4', async () => {
    (prisma.fundamentals.createMany as any).mockResolvedValue({ count: 1 });
    const result = await writePitFundamentals(prisma as any, [filing]);
    expect(result).toEqual({ attempted: 1, inserted: 1 });
    expect(prisma.fundamentals.createMany).toHaveBeenCalledTimes(1);
    const call = (prisma.fundamentals.createMany as any).mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data).toHaveLength(1);
  });

  it('a rerun over identical input reports 0 newly inserted (unique key already holds)', async () => {
    (prisma.fundamentals.createMany as any).mockResolvedValue({ count: 0 }); // simulates skipDuplicates on rerun
    const result = await writePitFundamentals(prisma as any, [filing]);
    expect(result).toEqual({ attempted: 1, inserted: 0 });
  });

  it('is a no-op for an empty filing list (never issues an empty createMany)', async () => {
    const result = await writePitFundamentals(prisma as any, []);
    expect(result).toEqual({ attempted: 0, inserted: 0 });
    expect(prisma.fundamentals.createMany).not.toHaveBeenCalled();
  });
});

describe('point-in-time read-back through the real consumer (PointInTimeStore.fundamentals)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('acceptance #1: a decision date between `end` (asOf) and `filed` (releasedAt) must NOT see the row', async () => {
    const row = { id: '1', ...toFundamentalsCreateInput(filing), createdAt: new Date() };
    // The mocked query mirrors PointInTimeStore's real `releasedAt <= asOf` filter so this test
    // proves the STORE'S behavior, not just the ingestion mapping.
    const releasedAt = row.releasedAt as Date;
    (prisma.fundamentals.findFirst as any).mockImplementation(({ where }: any) => {
      const decisionAt: Date = where.releasedAt.lte;
      return Promise.resolve(releasedAt.getTime() <= decisionAt.getTime() ? row : null);
    });

    const store = new PointInTimeStore();
    const decisionBetweenEndAndFiled = new Date('2020-01-15T00:00:00.000Z'); // after asOf, before releasedAt
    const decisionAfterFiled = new Date('2020-02-16T00:00:00.000Z');

    const beforeFiling = await store.fundamentals('ABCD', 'NASDAQ' as any, decisionBetweenEndAndFiled);
    expect(beforeFiling).toBeNull(); // the period had ended, but the filing was not yet public

    const afterFiling = await store.fundamentals('ABCD', 'NASDAQ' as any, decisionAfterFiled);
    expect(afterFiling?.id).toBe('1');
  });
});
