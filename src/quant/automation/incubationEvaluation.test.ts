import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  INCUBATION_BOOKS,
  INCUBATION_LABEL,
} from './incubationBooks';
import {
  runNightlyIncubationEvaluation,
  type IncubationEvaluationDependencies,
  type NightlyBookEvaluation,
} from './incubationEvaluation';

const D = Prisma.Decimal;
const AS_OF = new Date('2026-07-20T00:00:00.000Z');

function evaluation(overrides: Partial<NightlyBookEvaluation> = {}): NightlyBookEvaluation {
  return {
    snapshotId: 'snapshot-1', benchmarkNavSpy: new D(100), benchmarkNavSpus: new D(100),
    nav: new D(100), dailyPnl: new D(0), drawdown: new D(0), trackingError: new D(0),
    benchFlags: [], benched: false, requiresRevalidation: false, ...overrides,
  };
}

function dependencies(overrides: Partial<IncubationEvaluationDependencies> = {}): IncubationEvaluationDependencies {
  return {
    halted: vi.fn().mockResolvedValue(false),
    owner: vi.fn().mockResolvedValue({ role: 'PARENT', tier: 'ULTRA' }),
    latestAsOf: vi.fn().mockResolvedValue(AS_OF),
    pendingAsOf: vi.fn().mockResolvedValue([AS_OF]),
    claim: vi.fn().mockResolvedValue(AS_OF),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(evaluation()),
    persist: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('QDR-8 nightly incubation evaluation', () => {
  beforeEach(() => vi.stubEnv('QUANT_INCUBATION_OWNER_USER_ID', 'paper-owner'));
  afterEach(() => vi.unstubAllEnvs());

  it('is idempotent under concurrent same-day fires', async () => {
    const claims = new Set<string>();
    const deps = dependencies({
      claim: vi.fn(async (bookId, asOf) => {
        const key = `${asOf.toISOString().slice(0, 10)}:${bookId}`;
        if (claims.has(key)) return null;
        claims.add(key);
        return AS_OF;
      }),
    });

    const runs = await Promise.all([
      runNightlyIncubationEvaluation(AS_OF, deps),
      runNightlyIncubationEvaluation(AS_OF, deps),
    ]);

    expect(claims.size).toBe(INCUBATION_BOOKS.length);
    expect(runs.reduce((sum, run) => sum + run.evaluated, 0)).toBe(INCUBATION_BOOKS.length);
    expect(deps.persist).toHaveBeenCalledTimes(INCUBATION_BOOKS.length);
  });

  it('persists a tracking-error breach as a bench requiring revalidation', async () => {
    const breached = evaluation({
      trackingError: new D('0.21'), benchFlags: ['TRACKING_ERROR_BREACH'],
      benched: true, requiresRevalidation: true,
    });
    const deps = dependencies({
      evaluate: vi.fn(async bookId => bookId === 'dual-momentum-rotation' ? breached : evaluation()),
    });

    const run = await runNightlyIncubationEvaluation(AS_OF, deps);

    expect(run.benched).toEqual(['dual-momentum-rotation']);
    expect(deps.persist).toHaveBeenCalledWith('dual-momentum-rotation', AS_OF, breached);
  });

  it('releases only a failed book lease for a same-day retry', async () => {
    const deps = dependencies({
      evaluate: vi.fn().mockRejectedValueOnce(new Error('mark unavailable')),
    });

    await expect(runNightlyIncubationEvaluation(AS_OF, deps)).rejects.toThrow('mark unavailable');
    expect(deps.releaseClaim).toHaveBeenCalledTimes(1);
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it('releases an early book claim when its close snapshot is not ready yet', async () => {
    const deps = dependencies({ evaluate: vi.fn().mockResolvedValue(null) });

    const run = await runNightlyIncubationEvaluation(AS_OF, deps);

    expect(run).toMatchObject({ processed: false, claimed: 0, evaluated: 0 });
    expect(deps.releaseClaim).toHaveBeenCalledTimes(INCUBATION_BOOKS.length);
  });

  it('backfills every missing snapshot day before the current benchmark watermark', async () => {
    const prior = new Date('2026-07-19T00:00:00.000Z');
    const deps = dependencies({
      pendingAsOf: vi.fn().mockResolvedValue([prior, AS_OF]),
      claim: vi.fn(async (_bookId, asOf) => asOf),
    });

    const run = await runNightlyIncubationEvaluation(AS_OF, deps);

    expect(run.evaluated).toBe(INCUBATION_BOOKS.length * 2);
    expect(deps.persist).toHaveBeenCalledWith(INCUBATION_BOOKS[0].bookId, prior, expect.any(Object));
  });

  it('fails closed without the configured ULTRA parent owner', async () => {
    const deps = dependencies({ owner: vi.fn().mockResolvedValue({ role: 'CHILD', tier: 'ULTRA' }) });
    await expect(runNightlyIncubationEvaluation(AS_OF, deps)).rejects.toThrow('PARENT');
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it('honestly reports a halted or unavailable after-close pass', async () => {
    const halted = await runNightlyIncubationEvaluation(AS_OF, dependencies({ halted: vi.fn().mockResolvedValue(true) }));
    const noDay = await runNightlyIncubationEvaluation(AS_OF, dependencies({ latestAsOf: vi.fn().mockResolvedValue(null) }));

    expect(halted).toMatchObject({ processed: false, reason: 'halted', label: INCUBATION_LABEL });
    expect(noDay).toMatchObject({ processed: false, reason: 'no_market_day', label: INCUBATION_LABEL });
  });
});
