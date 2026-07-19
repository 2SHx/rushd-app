import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  INCUBATION_BOOKS,
  INCUBATION_LABEL,
  assertIncubationOwner,
  completeUniverseAsOf,
  runDailyIncubationBooks,
  type IncubationDependencies,
  type IncubationOrder,
  type IncubationSimulation,
} from './incubationBooks';

const D = Prisma.Decimal;
const AS_OF = new Date('2026-07-20T00:00:00.000Z');
const order = { label: INCUBATION_LABEL, fill: {} } as IncubationOrder;
const simulation = { orders: [order], daily: [], fills: [] };

function dependencies(overrides: Partial<IncubationDependencies> = {}): IncubationDependencies {
  return {
    halted: vi.fn().mockResolvedValue(false),
    priorBookCash: vi.fn().mockResolvedValue(new D(0)),
    wasEntriesFrozen: vi.fn().mockResolvedValue(false),
    priorLedgerState: vi.fn().mockResolvedValue(null),
    availableCash: vi.fn().mockResolvedValue(new D(1_000_000)),
    latestAsOf: vi.fn().mockResolvedValue(AS_OF),
    evaluation: vi.fn().mockResolvedValue(null),
    shariaState: vi.fn().mockResolvedValue('VERIFIED_COMPLIANT'),
    persistAllocation: vi.fn(async (_asOf, result) => result.allocations),
    claim: vi.fn().mockResolvedValue(AS_OF),
    releaseClaim: vi.fn().mockResolvedValue(undefined),
    simulate: vi.fn().mockResolvedValue(simulation),
    verifyLedger: vi.fn().mockResolvedValue(undefined),
    persistLedger: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('QDR-8 daily incubation books', () => {
  beforeEach(() => vi.stubEnv('QUANT_INCUBATION_OWNER_USER_ID', 'paper-owner'));
  afterEach(() => vi.unstubAllEnvs());

  it('makes concurrent double-fire produce exactly one claim per (day, book)', async () => {
    const claims = new Set<string>();
    const deps = dependencies({
      claim: vi.fn(async (bookId, asOf) => {
        const key = `${asOf.toISOString().slice(0, 10)}:${bookId}`;
        if (claims.has(key)) return null;
        claims.add(key);
        return AS_OF;
      }),
    });

    const results = await Promise.all([
      runDailyIncubationBooks(AS_OF, deps),
      runDailyIncubationBooks(AS_OF, deps),
    ]);

    expect(claims.size).toBe(INCUBATION_BOOKS.length);
    expect(results.reduce((sum, result) => sum + result.claimed, 0)).toBe(INCUBATION_BOOKS.length);
    expect(deps.execute).toHaveBeenCalledTimes(INCUBATION_BOOKS.length);
  });

  it('uses only a complete-universe market watermark', () => {
    const older = new Date('2026-07-19T00:00:00.000Z');
    expect(completeUniverseAsOf(['A', 'B'], [
      { symbol: 'A', _max: { ts: AS_OF } },
      { symbol: 'B', _max: { ts: older } },
    ])).toEqual(older);
    expect(completeUniverseAsOf(['A', 'B'], [
      { symbol: 'A', _max: { ts: AS_OF } },
    ])).toBeNull();
  });

  it('executes only the allocation row returned by persistence, never a losing local calculation', async () => {
    const winning = Object.fromEntries(INCUBATION_BOOKS.map((book, index) => [
      book.bookId, index === 0 ? '0.4' : '0',
    ]));
    const deps = dependencies({ persistAllocation: vi.fn().mockResolvedValue(winning) });

    const result = await runDailyIncubationBooks(AS_OF, deps);

    expect(result.allocations).toEqual(winning);
    expect((deps.simulate as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0].bookId))
      .toEqual([INCUBATION_BOOKS[0].bookId]);
  });

  it('allows only a PARENT ULTRA account to own the fixed isolated bankroll', () => {
    expect(() => assertIncubationOwner({ role: 'PARENT', tier: 'ULTRA' })).not.toThrow();
    expect(() => assertIncubationOwner({ role: 'CHILD', tier: 'ULTRA' })).toThrow('PARENT');
    expect(() => assertIncubationOwner({ role: 'PARENT', tier: 'BASIC' })).toThrow('ULTRA');
  });

  it('benches a book after a −3% daily loss and never asks its engine for new entries', async () => {
    const deps = dependencies({
      evaluation: vi.fn(async bookId => bookId === 'bollinger-mr-long-v2' ? {
        nav: new D(97), dailyPnl: new D(-3), drawdown: new D('0.03'), trackingError: new D(0),
        benched: false, requiresRevalidation: false,
      } : null),
    });

    await runDailyIncubationBooks(AS_OF, deps);

    const simulated = (deps.simulate as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0].bookId);
    expect(simulated).not.toContain('bollinger-mr-long-v2');
  });

  it('consumes B2 tracking-error bench state before requesting new entries', async () => {
    const deps = dependencies({
      evaluation: vi.fn(async bookId => bookId === 'dual-momentum-rotation' ? {
        nav: new D(100), dailyPnl: new D(0), drawdown: new D(0), trackingError: new D('0.21'),
        benched: true, requiresRevalidation: true,
      } : null),
    });

    await runDailyIncubationBooks(AS_OF, deps);

    expect((deps.simulate as ReturnType<typeof vi.fn>).mock.calls.map(call => call[0].bookId))
      .not.toContain('dual-momentum-rotation');
  });

  it('keeps every unverified book at 0% and sends no order to the engine', async () => {
    const deps = dependencies({
      shariaState: vi.fn().mockResolvedValue('UNSCREENED_EXECUTION_BLOCKED'),
    });

    const result = await runDailyIncubationBooks(AS_OF, deps);

    expect(Object.values(result.allocations).every(weight => weight === '0')).toBe(true);
    expect(deps.simulate).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });

  it('splits CASH only, caps every book at 40%, and never exceeds the $1m envelope', async () => {
    const starts: Prisma.Decimal[] = [];
    const deps = dependencies({
      simulate: vi.fn(async (_book, cash) => {
        starts.push(cash);
        return { orders: [], daily: [], fills: [] };
      }),
    });

    const result = await runDailyIncubationBooks(AS_OF, deps);
    const total = starts.reduce((sum, cash) => sum.plus(cash), new D(0));

    expect(starts.every(cash => cash.lte(400_000))).toBe(true);
    expect(total.lte(1_000_000)).toBe(true);
    expect(Object.values(result.allocations).every(weight => new D(weight).lte('0.4'))).toBe(true);
    expect(deps.availableCash).toHaveBeenCalledWith('paper-owner');
  });

  it('re-checks the kill-switch before execution so no broker-bound call escapes', async () => {
    const halted = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const deps = dependencies({ halted });

    const result = await runDailyIncubationBooks(AS_OF, deps);

    expect(result.executed).toBe(0);
    expect(result.reason).toBe('halted');
    expect(deps.execute).not.toHaveBeenCalled();
    expect(deps.releaseClaim).toHaveBeenCalledTimes(1);
  });

  it('releases a transiently failed claim so the same book/day can retry idempotently', async () => {
    const claims = new Set<string>();
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(true);
    const deps = dependencies({
      claim: vi.fn(async (bookId, asOf) => {
        const key = `${asOf.toISOString().slice(0, 10)}:${bookId}`;
        if (claims.has(key)) return null;
        claims.add(key);
        return AS_OF;
      }),
      releaseClaim: vi.fn(async (bookId, asOf) => {
        claims.delete(`${asOf.toISOString().slice(0, 10)}:${bookId}`);
      }),
      execute,
    });

    const firstPass = await runDailyIncubationBooks(AS_OF, deps);
    expect(deps.releaseClaim).toHaveBeenCalledTimes(1);
    expect(Object.values(firstPass.errors ?? {})).toContain('transient');
    await runDailyIncubationBooks(AS_OF, deps);
    expect(execute).toHaveBeenCalledTimes(1 + INCUBATION_BOOKS.length);
  });

  it('MED#3: a failing book does not starve the others in the same pass', async () => {
    const simulate = vi.fn(async (book: { bookId: string }) => {
      if (book.bookId === INCUBATION_BOOKS[1].bookId) throw new Error('book2 boom');
      return simulation;
    });
    const deps = dependencies({ simulate });

    const result = await runDailyIncubationBooks(AS_OF, deps);

    expect(result.errors?.[INCUBATION_BOOKS[1].bookId]).toBe('book2 boom');
    expect(deps.execute).toHaveBeenCalledTimes(INCUBATION_BOOKS.length - 1);
    expect(result.claimed).toBe(INCUBATION_BOOKS.length - 1);
  });

  it('LOW: a breachered book with an open position still exits on the next pass', async () => {
    // Interleaved same day (also covers the interleaved-day fix, security gate 2026-07-19
    // round 2): a suppressed BUY and an executed SELL both land on AS_OF. The reconstruction
    // must ignore the BUY entirely and apply only the SELL against the real prior holding.
    const priorPosition = {
      symbol: 'AAA', qty: new D(20), price: new D(5_000), entryPrice: new D(5_000),
      entryTs: AS_OF, entrySignalTs: AS_OF,
    };
    const buyOrder = {
      label: INCUBATION_LABEL,
      fill: { action: 'BUY', symbol: 'AAA', ts: AS_OF, qty: new D(5), fillPrice: new D(5_100) },
    } as unknown as IncubationOrder;
    const sellOrder = {
      label: INCUBATION_LABEL,
      fill: { action: 'SELL', symbol: 'AAA', ts: AS_OF, qty: new D(8), fillPrice: new D(5_200) },
    } as unknown as IncubationOrder;
    const breachedBookId = INCUBATION_BOOKS[0].bookId;
    const deps = dependencies({
      evaluation: vi.fn(async bookId => bookId === breachedBookId ? {
        nav: new D(97), dailyPnl: new D(-3), drawdown: new D('0.03'), trackingError: new D(0),
        benched: false, requiresRevalidation: false,
      } : null),
      priorBookCash: vi.fn(async bookId => bookId === breachedBookId ? new D(100_000) : new D(0)),
      priorLedgerState: vi.fn(async (book: { bookId: string }) => book.bookId === breachedBookId
        ? { cash: new D(0), positions: [priorPosition] }
        : null),
      simulate: vi.fn(async () => (
        {
          orders: [buyOrder, sellOrder], daily: [],
          fills: [buyOrder.fill, sellOrder.fill],
        } as unknown as IncubationSimulation
      )),
    });

    const result = await runDailyIncubationBooks(AS_OF, deps);

    const executedOrders = (deps.execute as ReturnType<typeof vi.fn>).mock.calls
      .filter(call => call[0].bookId === breachedBookId)
      .map(call => call[2].fill.action);
    expect(executedOrders).toEqual(['SELL']);
    expect(result.allocations[breachedBookId]).toBe('0');

    // The persisted book of record must agree: no new position, cash reflects the real
    // exit only (8 * 5200 = 41,600) — never the phantom BUY's effect, in either order.
    const ledgerCall = (deps.persistLedger as ReturnType<typeof vi.fn>).mock.calls
      .find(call => call[0].bookId === breachedBookId);
    const persistedPoint = ledgerCall?.[2].daily.find((p: { ts: Date }) => p.ts.getTime() === AS_OF.getTime());
    expect(persistedPoint.cash.toString()).toBe('41600');
    expect(persistedPoint.positions).toEqual([
      { symbol: 'AAA', qty: new D(12), price: new D(5_200), entryPrice: new D(5_000), entryTs: AS_OF, entrySignalTs: AS_OF },
    ]);
  });

  it('persists each strategy-scoped close ledger only after its orders complete', async () => {
    const deps = dependencies();
    await runDailyIncubationBooks(AS_OF, deps);

    expect(deps.verifyLedger).toHaveBeenCalledTimes(INCUBATION_BOOKS.length);
    expect(deps.persistLedger).toHaveBeenCalledTimes(INCUBATION_BOOKS.length);
    expect((deps.execute as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0])
      .toBeLessThan((deps.persistLedger as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0]);
  });

  it('fails closed without an explicit paper owner and labels every output honestly', async () => {
    vi.stubEnv('QUANT_INCUBATION_OWNER_USER_ID', '');
    const result = await runDailyIncubationBooks(AS_OF, dependencies());

    expect(result).toMatchObject({ processed: false, reason: 'owner_not_configured', label: INCUBATION_LABEL });
  });
});
