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
const DAY0 = new Date('2026-07-19T00:00:00.000Z');
const DAY1 = new Date('2026-07-20T00:00:00.000Z');
const DAY2 = new Date('2026-07-21T00:00:00.000Z');
const DAY3 = new Date('2026-07-22T00:00:00.000Z');
const STRATEGY_NAME = `INCUBATION:${TARGET}`;
const STRATEGY_ID = `strat:${STRATEGY_NAME}`;

/** Seeds a pre-breach committed position + capital so day1's breach has something real to
 * freeze/exit, rather than the (weaker) zero-cash skip path. */
function seedPreBreachState(): void {
  db.strategies.set(STRATEGY_NAME, { id: STRATEGY_ID, autonomyTier: 'INCUBATION_PAPER' });
  db.allocationDecisions.set(dayKey(DAY0), { benched: [], inputs: { bookCash: { [TARGET]: '100000' } } });
  db.snapshots.set('seed-day0', {
    asOf: DAY0, cashVirtual: new D(0), nav: new D(100_000),
    positions: {
      AAA: { qty: '20', costBasis: '5000', price: '5000', entryTs: DAY0.toISOString(), entrySignalTs: DAY0.toISOString() },
    },
  });
}

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
    priorLedgerState: undefined as never,
    verifyLedger: undefined as never,
    persistLedger: undefined as never,
    persistAllocation: undefined as never,
    execute: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

/** The real (non-faked) persistence-touching dependencies, so the orchestrator's actual
 * reconstruction/replay-verification logic runs against the in-memory fake prisma above. */
function realDeps(overrides: Partial<IncubationDependencies>): IncubationDependencies {
  return dependencies({
    persistAllocation: defaultDependencies.persistAllocation,
    priorBookCash: defaultDependencies.priorBookCash,
    wasEntriesFrozen: defaultDependencies.wasEntriesFrozen,
    priorLedgerState: defaultDependencies.priorLedgerState,
    verifyLedger: defaultDependencies.verifyLedger,
    persistLedger: defaultDependencies.persistLedger,
    ...overrides,
  });
}

function breached(bookId: string): { nav: Prisma.Decimal; dailyPnl: Prisma.Decimal; drawdown: Prisma.Decimal; trackingError: Prisma.Decimal; benched: boolean; requiresRevalidation: boolean } | null {
  return bookId === TARGET ? {
    nav: new D(97), dailyPnl: new D(-3), drawdown: new D('0.03'), trackingError: new D(0),
    benched: false, requiresRevalidation: false,
  } : null;
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
      priorLedgerState: defaultDependencies.priorLedgerState,
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
      priorLedgerState: defaultDependencies.priorLedgerState,
      verifyLedger: defaultDependencies.verifyLedger,
      persistLedger: defaultDependencies.persistLedger,
    });

    // Before the fix, this threw "Incubation ledger replay drift" because the raw replay
    // re-includes day1's suppressed BUY while the persisted day1 snapshot is exit-only/frozen.
    const day2Result = await runDailyIncubationBooks(DAY2, day2Deps);
    expect(day2Result.errors).toBeUndefined();
  });

  it('promotion gate (a): a breached day with a suppressed BUY and an executed SELL interleaved reconstructs correctly — never silent wrong state', async () => {
    seedPreBreachState();
    // Pinned actual behavior: CORRECT reconstruction (the stronger of the two sanctioned
    // outcomes — see applyExitOnlyFills), not fail-closed. The BUY is fully ignored regardless
    // of fill order; only the real, pre-existing 20-share holding is ever eligible to sell.
    const buyFill = { action: 'BUY', symbol: 'AAA', ts: DAY1, qty: new D(5), fillPrice: new D(5_100) };
    const sellFill = { action: 'SELL', symbol: 'AAA', ts: DAY1, qty: new D(8), fillPrice: new D(5_200) };
    const day1Deps = realDeps({
      latestAsOf: vi.fn().mockResolvedValue(DAY1),
      evaluation: vi.fn(async (bookId: string) => breached(bookId)),
      simulate: vi.fn(async () => ({
        orders: [{ label: INCUBATION_LABEL, fill: buyFill }, { label: INCUBATION_LABEL, fill: sellFill }],
        daily: [], fills: [buyFill, sellFill],
      } as unknown as IncubationSimulation)),
    });

    const day1Result = await runDailyIncubationBooks(DAY1, day1Deps);

    expect(day1Result.errors).toBeUndefined();
    const executed = (day1Deps.execute as ReturnType<typeof vi.fn>).mock.calls
      .filter(call => call[0].bookId === TARGET)
      .map(call => call[2].fill.action);
    expect(executed).toEqual(['SELL']); // the BUY was never sent to the broker

    const persisted = Array.from(db.snapshots.values()).find(s => s.asOf.getTime() === DAY1.getTime());
    expect(persisted?.cashVirtual.toString()).toBe('41600'); // 0 + 8 * 5200, no phantom BUY cost
    expect(persisted?.positions).toEqual({
      AAA: { qty: '12', costBasis: '5000', price: '5200', entryTs: DAY0.toISOString(), entrySignalTs: DAY0.toISOString() },
    });
  });

  it('promotion gate (b): a day1+day2 frozen chain reconstructs correctly through day3 verifyLedger — no silent divergence', async () => {
    seedPreBreachState();
    const day1BuyOnly = { action: 'BUY', symbol: 'AAA', ts: DAY1, qty: new D(5), fillPrice: new D(5_100) };
    const day1Deps = realDeps({
      latestAsOf: vi.fn().mockResolvedValue(DAY1),
      evaluation: vi.fn(async (bookId: string) => breached(bookId)),
      simulate: vi.fn(async () => ({
        orders: [{ label: INCUBATION_LABEL, fill: day1BuyOnly }],
        daily: [], fills: [day1BuyOnly],
      } as unknown as IncubationSimulation)),
    });
    const day1Result = await runDailyIncubationBooks(DAY1, day1Deps);
    expect(day1Result.errors).toBeUndefined();
    // Frozen day1: the suppressed BUY never happened — the pre-existing position is untouched.
    const day1Persisted = Array.from(db.snapshots.values()).find(s => s.asOf.getTime() === DAY1.getTime());
    expect(day1Persisted?.positions).toEqual({
      AAA: { qty: '20', costBasis: '5000', price: '5000', entryTs: DAY0.toISOString(), entrySignalTs: DAY0.toISOString() },
    });

    const day2SellOnly = { action: 'SELL', symbol: 'AAA', ts: DAY2, qty: new D(6), fillPrice: new D(5_300) };
    const day2Deps = realDeps({
      latestAsOf: vi.fn().mockResolvedValue(DAY2),
      evaluation: vi.fn(async (bookId: string) => breached(bookId)),
      simulate: vi.fn(async () => ({
        orders: [{ label: INCUBATION_LABEL, fill: day2SellOnly }],
        daily: [], fills: [day2SellOnly],
      } as unknown as IncubationSimulation)),
    });
    const day2Result = await runDailyIncubationBooks(DAY2, day2Deps);
    expect(day2Result.errors).toBeUndefined();
    const day2Persisted = Array.from(db.snapshots.values()).find(s => s.asOf.getTime() === DAY2.getTime());
    expect(day2Persisted?.cashVirtual.toString()).toBe('31800'); // 0 + 6 * 5300
    expect(day2Persisted?.positions).toEqual({
      AAA: { qty: '14', costBasis: '5000', price: '5300', entryTs: DAY0.toISOString(), entrySignalTs: DAY0.toISOString() },
    });

    // Day3: healthy again (entries allowed). Its "raw" replay (as a real from-scratch backtest
    // would produce) is deliberately CONTAMINATED — it re-includes day1's suppressed BUY and
    // would show a different day2 close than what was actually persisted/frozen. verifyLedger
    // must reconstruct day2 in its true frozen/exit-only mode and match reality (pass), not
    // silently accept the contaminated raw point and not spuriously drift-fail either.
    const day2RawContaminated = {
      ts: DAY2, cash: new D(6_300), positionsValue: new D(100_700), nav: new D(107_000),
      peakNav: new D(107_000), drawdown: new D(0), realizedVolAnnual: null, grossExposureScalar: 1,
      positions: [{
        symbol: 'AAA', qty: new D(19), price: new D(5_300), entryPrice: new D(5_000),
        entryTs: DAY0, entrySignalTs: DAY0,
      }],
    };
    const day3Point = { ...day2RawContaminated, ts: DAY3 };
    const day3Deps = realDeps({
      latestAsOf: vi.fn().mockResolvedValue(DAY3),
      evaluation: vi.fn().mockResolvedValue(null),
      simulate: vi.fn(async () => ({
        orders: [], daily: [day2RawContaminated, day3Point], fills: [day1BuyOnly, day2SellOnly],
      } as unknown as IncubationSimulation)),
    });
    const day3Result = await runDailyIncubationBooks(DAY3, day3Deps);
    expect(day3Result.errors).toBeUndefined();
  });
});
