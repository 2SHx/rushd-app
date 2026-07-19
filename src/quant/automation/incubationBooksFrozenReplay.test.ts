import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

// A tiny in-memory fake of the exact prisma surface the REAL (non-overridden) dependencies
// touch: ensureStrategy, persistAllocation, wasEntriesFrozen, verifyLedger, persistLedger.
// State must round-trip across two separate `runDailyIncubationBooks` calls (day1 -> day2),
// which is exactly what this MED fix (security gate 2026-07-19 round 2) is proving.
const db = {
  strategies: new Map<string, { id: string; autonomyTier: string }>(),
  allocationDecisions: new Map<string, { benched: string[]; inputs: unknown }>(),
  snapshots: new Map<string, { asOf: Date; cashVirtual: Prisma.Decimal; nav: Prisma.Decimal; positions: unknown }>(),
};

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategy: {
      findFirst: vi.fn(async ({ where }: { where: { name: string } }) => (
        db.strategies.get(where.name) ? { id: db.strategies.get(where.name)!.id, autonomyTier: db.strategies.get(where.name)!.autonomyTier } : null
      )),
      create: vi.fn(async ({ data }: { data: { name: string; autonomyTier: string } }) => {
        const record = { id: `strat:${data.name}`, autonomyTier: data.autonomyTier };
        db.strategies.set(data.name, record);
        return record;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { autonomyTier: string } }) => {
        for (const [name, record] of Array.from(db.strategies.entries())) {
          if (record.id === where.id) db.strategies.set(name, { ...record, autonomyTier: data.autonomyTier });
        }
        return { id: where.id, autonomyTier: data.autonomyTier };
      }),
    },
    allocationDecision: {
      upsert: vi.fn(async ({ where, create }: { where: { asOf: Date }; create: { benched: string[]; inputs: unknown; allocations: Record<string, string> } }) => {
        const key = dayKey(where.asOf);
        if (!db.allocationDecisions.has(key)) db.allocationDecisions.set(key, { benched: create.benched, inputs: create.inputs });
        return { allocations: create.allocations };
      }),
      findFirst: vi.fn(async ({ where }: { where: { asOf: Date | { lt: Date } } }) => {
        const asOf = where.asOf;
        if (asOf instanceof Date) {
          const row = db.allocationDecisions.get(dayKey(asOf));
          return row ? { benched: row.benched } : null;
        }
        // priorBookCash's `{ asOf: { lt } }` query — most recent day strictly before `lt`.
        const lt = asOf.lt;
        const keys = Array.from(db.allocationDecisions.keys()).filter(k => new Date(k) < lt).sort();
        const key = keys.at(-1);
        return key ? { inputs: db.allocationDecisions.get(key)!.inputs } : null;
      }),
    },
    portfolioSnapshot: {
      findFirst: vi.fn(async ({ where }: { where: { strategyId: string; asOf: { lt: Date } } }) => {
        const rows = Array.from(db.snapshots.values()).filter(s => s.asOf < where.asOf.lt).sort((a, b) => a.asOf.getTime() - b.asOf.getTime());
        return rows.at(-1) ?? null;
      }),
      upsert: vi.fn(async ({ where, create }: { where: { id: string }; create: { asOf: Date; cashVirtual: Prisma.Decimal; nav: Prisma.Decimal; positions: unknown } }) => {
        db.snapshots.set(where.id, { asOf: create.asOf, cashVirtual: create.cashVirtual, nav: create.nav, positions: create.positions });
        return create;
      }),
    },
  },
}));

import {
  INCUBATION_BOOKS,
  INCUBATION_LABEL,
  defaultDependencies,
  runDailyIncubationBooks,
  type IncubationDependencies,
  type IncubationOrder,
  type IncubationSimulation,
} from './incubationBooks';

const OWNER = 'paper-owner';
const TARGET = INCUBATION_BOOKS[0].bookId;
const DAY1 = new Date('2026-07-20T00:00:00.000Z');
const DAY2 = new Date('2026-07-21T00:00:00.000Z');

// Fixed, existing pre-breach position: same fills replay identically whichever asOf they're
// queried through, matching how the real deterministic engine behaves.
const position = {
  symbol: 'AAA', qty: new D(20), price: new D(5_000), entryPrice: new D(5_000),
  entryTs: DAY1, entrySignalTs: DAY1,
};
const buyFill = {
  action: 'BUY', symbol: 'AAA', ts: DAY1,
  cashAfter: new D(0), positionsValueAfter: new D(100_000), navAfter: new D(100_000),
  positionsAfter: [position],
};
const day1Point = {
  ts: DAY1, cash: new D(0), positionsValue: new D(100_000), nav: new D(100_000),
  peakNav: new D(100_000), drawdown: new D(0), realizedVolAnnual: null, grossExposureScalar: 1,
  positions: [position],
};
const day1Simulation: IncubationSimulation = {
  orders: [{ label: INCUBATION_LABEL, fill: buyFill } as unknown as IncubationOrder],
  daily: [day1Point as never],
  fills: [buyFill as never],
};
const day2Point = { ...day1Point, ts: DAY2 };
const day2Simulation: IncubationSimulation = {
  orders: [],
  daily: [day1Point as never, day2Point as never],
  fills: [buyFill as never],
};

function dependencies(overrides: Partial<IncubationDependencies> = {}): IncubationDependencies {
  return {
    halted: vi.fn().mockResolvedValue(false),
    availableCash: vi.fn().mockResolvedValue(new D(1_000_000)),
    latestAsOf: vi.fn(),
    evaluation: vi.fn().mockResolvedValue(null),
    shariaState: vi.fn(async (book: { bookId: string }) => (
      book.bookId === TARGET ? 'VERIFIED_COMPLIANT' : 'UNSCREENED_EXECUTION_BLOCKED'
    )),
    claim: vi.fn().mockResolvedValue(new Date()),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    simulate: vi.fn(),
    priorBookCash: undefined as never,
    wasEntriesFrozen: undefined as never,
    verifyLedger: undefined as never,
    persistLedger: undefined as never,
    persistAllocation: undefined as never,
    execute: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('MED: entriesFrozen round-trips through persistence and honors replay (security gate 2026-07-19 round 2)', () => {
  beforeEach(() => {
    db.strategies.clear();
    db.allocationDecisions.clear();
    db.snapshots.clear();
    vi.stubEnv('QUANT_INCUBATION_OWNER_USER_ID', OWNER);
  });
  afterEach(() => vi.unstubAllEnvs());

  it('persists day1 as breachered/frozen, then day2 verifyLedger reproduces it and passes', async () => {
    const day1Deps = dependencies({
      latestAsOf: vi.fn().mockResolvedValue(DAY1),
      // A −3%/day breach on the target book alone; every other book is Sharia-blocked (0%).
      evaluation: vi.fn(async (bookId: string) => bookId === TARGET ? {
        nav: new D(97), dailyPnl: new D(-3), drawdown: new D('0.03'), trackingError: new D(0),
        benched: false, requiresRevalidation: false,
      } : null),
      simulate: vi.fn(async () => day1Simulation),
      persistAllocation: defaultDependencies.persistAllocation,
      priorBookCash: defaultDependencies.priorBookCash,
      wasEntriesFrozen: defaultDependencies.wasEntriesFrozen,
      verifyLedger: defaultDependencies.verifyLedger,
      persistLedger: defaultDependencies.persistLedger,
    });

    const day1Result = await runDailyIncubationBooks(DAY1, day1Deps);
    expect(day1Result.errors).toBeUndefined();
    expect(day1Result.allocations[TARGET]).toBe('0');
    // The flag round-tripped: day1's AllocationDecision marks the target book benched/frozen.
    expect(await defaultDependencies.wasEntriesFrozen(TARGET, DAY1)).toBe(true);

    const day2Deps = dependencies({
      latestAsOf: vi.fn().mockResolvedValue(DAY2),
      evaluation: vi.fn(async (bookId: string) => bookId === TARGET ? {
        nav: new D(100), dailyPnl: new D(3), drawdown: new D(0), trackingError: new D(0),
        benched: false, requiresRevalidation: false,
      } : null),
      simulate: vi.fn(async () => day2Simulation),
      persistAllocation: defaultDependencies.persistAllocation,
      priorBookCash: defaultDependencies.priorBookCash,
      wasEntriesFrozen: defaultDependencies.wasEntriesFrozen,
      verifyLedger: defaultDependencies.verifyLedger,
      persistLedger: defaultDependencies.persistLedger,
    });

    // Before the fix, this threw "Incubation ledger replay drift" because the raw replay
    // re-includes day1's suppressed BUY while the persisted day1 snapshot is exit-only/frozen.
    const day2Result = await runDailyIncubationBooks(DAY2, day2Deps);
    expect(day2Result.errors).toBeUndefined();
  });
});
