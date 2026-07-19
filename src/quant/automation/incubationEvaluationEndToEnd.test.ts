import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
const AS_OF = new Date('2026-07-20T00:00:00.000Z');
const BOOK_ID = 'bollinger-mr-long-v2';
const STRATEGY_NAME = `INCUBATION:${BOOK_ID}`;
const OWNER = 'paper-owner';

const h = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  marketBarGroupBy: vi.fn(),
  marketBarFindFirst: vi.fn(),
  strategyFindFirst: vi.fn(),
  portfolioSnapshotFindMany: vi.fn(),
  portfolioSnapshotUpdate: vi.fn(),
  bookEvaluationFindMany: vi.fn(),
  bookEvaluationFindFirst: vi.fn(),
  bookEvaluationUpsert: vi.fn(),
  autoRunClaimCreate: vi.fn(),
  autoRunClaimDeleteMany: vi.fn(),
  transaction: vi.fn(),
  quantControlUpsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => h.userFindUnique(...a) },
    marketBar: {
      groupBy: (...a: unknown[]) => h.marketBarGroupBy(...a),
      findFirst: (...a: unknown[]) => h.marketBarFindFirst(...a),
    },
    strategy: { findFirst: (...a: unknown[]) => h.strategyFindFirst(...a) },
    portfolioSnapshot: {
      findMany: (...a: unknown[]) => h.portfolioSnapshotFindMany(...a),
      update: (...a: unknown[]) => h.portfolioSnapshotUpdate(...a),
    },
    bookEvaluation: {
      findMany: (...a: unknown[]) => h.bookEvaluationFindMany(...a),
      findFirst: (...a: unknown[]) => h.bookEvaluationFindFirst(...a),
      upsert: (...a: unknown[]) => h.bookEvaluationUpsert(...a),
    },
    autoRunClaim: {
      create: (...a: unknown[]) => h.autoRunClaimCreate(...a),
      deleteMany: (...a: unknown[]) => h.autoRunClaimDeleteMany(...a),
    },
    $transaction: (...a: unknown[]) => h.transaction(...a),
    quantControl: { upsert: (...a: unknown[]) => h.quantControlUpsert(...a) },
  },
}));

import { runNightlyIncubationEvaluation } from './incubationEvaluation';

describe('HIGH end-to-end: pendingAsOf/evaluateBook honor the post-hardening tier (security gate 2026-07-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('QUANT_INCUBATION_OWNER_USER_ID', OWNER);
    h.userFindUnique.mockResolvedValue({ role: 'PARENT', tier: 'ULTRA' });
    h.quantControlUpsert.mockResolvedValue({ halted: false });
    h.marketBarGroupBy.mockResolvedValue([
      { symbol: 'SPY', _max: { ts: AS_OF } },
      { symbol: 'SPUS', _max: { ts: AS_OF } },
    ]);
    h.marketBarFindFirst.mockResolvedValue({ close: new D(100) });
    h.autoRunClaimCreate.mockResolvedValue({ createdAt: AS_OF });
    h.bookEvaluationFindFirst.mockResolvedValue(null);
    h.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    h.portfolioSnapshotUpdate.mockResolvedValue(undefined);
    h.bookEvaluationUpsert.mockResolvedValue(undefined);

    // Only the INCUBATION_PAPER-tiered strategy for this exact book exists; every other
    // incubation book (and any pre-hardening AUTO_PAPER-tiered query) finds nothing.
    h.strategyFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => (
      where.name === STRATEGY_NAME && where.autonomyTier === 'INCUBATION_PAPER'
        ? { id: 'strat-1' }
        : null
    ));
    h.portfolioSnapshotFindMany.mockResolvedValue([{
      id: 'snap-1', asOf: AS_OF, nav: new D(100), benchmarkNavSpy: new D(100), benchmarkNavSpus: new D(100),
    }]);
    h.bookEvaluationFindMany.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('produces a persisted BookEvaluation row for the INCUBATION_PAPER strategy', async () => {
    const result = await runNightlyIncubationEvaluation(AS_OF);

    expect(result.evaluated).toBeGreaterThanOrEqual(1);
    expect(h.bookEvaluationUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { bookId_asOf: { bookId: BOOK_ID, asOf: AS_OF } },
      create: expect.objectContaining({ bookId: BOOK_ID, asOf: AS_OF }),
    }));
  });
});
