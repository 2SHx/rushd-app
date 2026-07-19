import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  strategyFindFirst: vi.fn(),
  portfolioSnapshotFindMany: vi.fn(),
  bookEvaluationFindFirst: vi.fn(),
  marketBarFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategy: { findFirst: (...a: unknown[]) => h.strategyFindFirst(...a) },
    portfolioSnapshot: { findMany: (...a: unknown[]) => h.portfolioSnapshotFindMany(...a) },
    bookEvaluation: { findFirst: (...a: unknown[]) => h.bookEvaluationFindFirst(...a) },
    marketBar: { findFirst: (...a: unknown[]) => h.marketBarFindFirst(...a) },
  },
}));

import { defaultDependencies } from './incubationEvaluation';

const D = Prisma.Decimal;
const AS_OF = new Date('2026-07-20T00:00:00.000Z');

describe('HIGH: evaluateBook queries the post-hardening tier (security gate 2026-07-19)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries autonomyTier INCUBATION_PAPER, not the pre-hardening AUTO_PAPER', async () => {
    h.strategyFindFirst.mockResolvedValue(null);

    await defaultDependencies.evaluate('bollinger-mr-long-v2', 'paper-owner', AS_OF);

    expect(h.strategyFindFirst).toHaveBeenCalledWith({
      where: { ownerUserId: 'paper-owner', name: 'INCUBATION:bollinger-mr-long-v2', autonomyTier: 'INCUBATION_PAPER' },
      select: { id: true },
    });
  });

  it('finds a strategy created (or migrated) by ensureStrategy and evaluates it', async () => {
    h.strategyFindFirst.mockResolvedValue({ id: 'strat-1' });
    h.portfolioSnapshotFindMany.mockResolvedValue([{
      id: 'snap-1', asOf: AS_OF, nav: new D(100), benchmarkNavSpy: new D(100), benchmarkNavSpus: new D(100),
    }]);
    h.marketBarFindFirst.mockResolvedValue({ close: new D(100) });
    h.bookEvaluationFindFirst.mockResolvedValue(null);

    const result = await defaultDependencies.evaluate('bollinger-mr-long-v2', 'paper-owner', AS_OF);

    expect(result?.snapshotId).toBe('snap-1');
    expect(h.strategyFindFirst).toHaveBeenCalledTimes(1);
  });
});
