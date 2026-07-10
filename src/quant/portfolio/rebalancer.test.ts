import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' });
}

// A tiny fake DB-backed claim store: create() throws P2002 if the key is already held,
// deleteMany() releases keys — this mirrors the real AutoRunClaim unique-constraint
// semantics closely enough to prove claim/release/retry behavior deterministically.
const h = vi.hoisted(() => ({
  claimSet: new Set<string>(),
  tx: {
    transaction: { create: vi.fn() },
    user: { update: vi.fn() },
    portfolioItem: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    purificationEntry: { create: vi.fn() },
  },
  submitOrder: vi.fn(),
  selectBroker: vi.fn(),
  constructHalalPortfolio: vi.fn(),
  userFindUnique: vi.fn(),
  marketBarFindFirst: vi.fn(),
  autoRunClaimDeleteMany: vi.fn(),
  portfolioSnapshotFindFirst: vi.fn(),
  portfolioSnapshotCreate: vi.fn(),
  portfolioItemFindMany: vi.fn(),
  transactionFn: vi.fn(async (cb: any) => cb(h.tx)),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: any[]) => h.userFindUnique(...a) },
    marketBar: { findFirst: (...a: any[]) => h.marketBarFindFirst(...a) },
    autoRunClaim: {
      create: vi.fn(async ({ data }: any) => {
        if (h.claimSet.has(data.key)) throw uniqueViolation();
        h.claimSet.add(data.key);
        return { key: data.key };
      }),
      deleteMany: (...a: any[]) => {
        const [{ where }] = a;
        (where.key.in as string[]).forEach((k) => h.claimSet.delete(k));
        return h.autoRunClaimDeleteMany(...a);
      },
    },
    portfolioSnapshot: {
      findFirst: (...a: any[]) => h.portfolioSnapshotFindFirst(...a),
      create: (...a: any[]) => h.portfolioSnapshotCreate(...a),
    },
    portfolioItem: { findMany: (...a: any[]) => h.portfolioItemFindMany(...a) },
    $transaction: (cb: any) => h.transactionFn(cb),
  },
}));
vi.mock('./construction', () => ({
  constructHalalPortfolio: (...a: any[]) => h.constructHalalPortfolio(...a),
}));
vi.mock('../execution/registry', () => ({
  selectBroker: (...a: any[]) => h.selectBroker(...a),
}));

import { executePortfolioRebalance } from './rebalancer';

const USER_ID = 'user-1';
const STRATEGY_ID = 'strat-1';

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    tier: 'ULTRA',
    cashVirtual: new D(100000),
    portfolioItems: [],
    ...overrides,
  };
}

describe('executePortfolioRebalance — crash-safety, idempotency, cost basis, purification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.claimSet.clear();
    h.selectBroker.mockReturnValue({ kind: 'INTERNAL_SIM', submitOrder: h.submitOrder });
    h.constructHalalPortfolio.mockResolvedValue({ asOf: new Date(), weights: [], cashWeight: 1, contributorTrace: {} });
    h.marketBarFindFirst.mockResolvedValue({ close: new D(300) });
    h.portfolioSnapshotFindFirst.mockResolvedValue(null);
    h.portfolioItemFindMany.mockResolvedValue([]);
    h.portfolioSnapshotCreate.mockResolvedValue({});
    h.userFindUnique.mockImplementation(async () => user());
    h.tx.portfolioItem.findUnique.mockResolvedValue(null);
  });

  it('(a) a broker failure mid-rebalance leaves no partial mutation and releases the claim so a retry succeeds', async () => {
    const asOf = new Date('2026-07-08');
    const held = user({ portfolioItems: [{ id: 'pi-1', symbol: 'MSFT', shares: new D(100), costBasis: new D(250) }] });
    h.userFindUnique.mockImplementation(async () => held);

    h.submitOrder
      .mockRejectedValueOnce(new Error('broker offline'))
      .mockResolvedValue({ brokerRef: 'sim', status: 'FILLED', filledQty: new D(100), avgFillPrice: new D(300) });

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf)).rejects.toThrow('broker offline');

    // No DB mutation was ever committed (the transaction is only entered after the broker call).
    expect(h.transactionFn).not.toHaveBeenCalled();
    // Both the day claim and the per-order claim were released.
    expect(h.autoRunClaimDeleteMany).toHaveBeenCalledTimes(1);
    const released = h.autoRunClaimDeleteMany.mock.calls[0][0].where.key.in;
    expect(released).toEqual(
      expect.arrayContaining([`rebalance-${STRATEGY_ID}-2026-07-08`, `rebalance-order-${STRATEGY_ID}-2026-07-08-MSFT-SELL`])
    );
    expect(h.claimSet.size).toBe(0);

    // Retry with a working broker succeeds.
    const res = await executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf);
    expect(res.rebalanced).toBe(true);
    expect(res.tradesPlaced).toBe(1);
    expect(h.transactionFn).toHaveBeenCalledTimes(1);
  });

  it('(b) a double-invocation does not double-execute (second call skips, no broker/tx calls)', async () => {
    const asOf = new Date('2026-07-08');
    h.submitOrder.mockResolvedValue({ brokerRef: 'sim', status: 'FILLED', filledQty: new D(0), avgFillPrice: new D(0) });

    const first = await executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf);
    expect(first.rebalanced).toBe(true);

    const second = await executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf);
    expect(second).toEqual({ rebalanced: false, nav: 100000, tradesPlaced: 0, purificationOwed: 0 });
    expect(h.submitOrder).not.toHaveBeenCalled(); // no orders placed in the first pass (no holdings/targets) — 2nd just short-circuits
    expect(h.transactionFn).not.toHaveBeenCalled();
  });

  it('(c) a non-P2002 DB error on the claim propagates instead of returning success', async () => {
    const asOf = new Date('2026-07-08');
    (h.userFindUnique as any).mockImplementation(async () => user());
    // Force the underlying autoRunClaim.create mock (not our stateful wrapper) to throw a generic error once.
    const { prisma } = await import('@/lib/prisma');
    (prisma.autoRunClaim.create as any).mockRejectedValueOnce(new Error('connection dropped'));

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf)).rejects.toThrow('connection dropped');
    expect(h.portfolioSnapshotFindFirst).not.toHaveBeenCalled(); // never falls into the "already ran" skip path
  });

  it('(d) costBasis after two BUYs at different prices is the weighted average', async () => {
    h.constructHalalPortfolio.mockResolvedValue({
      asOf: new Date(),
      weights: [{ symbol: 'MSFT', weight: 1, purificationRatio: 0.005 }],
      cashWeight: 0,
      contributorTrace: {},
    });

    // --- First BUY: 10 shares @ 100, no prior position ---
    const day1 = new Date('2026-07-08');
    h.userFindUnique.mockImplementation(async () => user({ portfolioItems: [] }));
    h.marketBarFindFirst.mockResolvedValue({ close: new D(100) });
    h.submitOrder.mockResolvedValue({ brokerRef: 'sim', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D(100) });
    h.tx.portfolioItem.findUnique.mockResolvedValue(null);

    const res1 = await executePortfolioRebalance(USER_ID, STRATEGY_ID, day1);
    expect(res1.tradesPlaced).toBe(1);
    expect(h.tx.portfolioItem.upsert.mock.calls[0][0].update.costBasis.toString()).toBe('100');

    // --- Second BUY: existing 10@100, buy 10 more @ 200 -> weighted avg = 150 ---
    const day2 = new Date('2026-07-09');
    h.userFindUnique.mockImplementation(async () =>
      user({ portfolioItems: [{ id: 'pi-1', symbol: 'MSFT', shares: new D(10), costBasis: new D(100) }] })
    );
    h.marketBarFindFirst.mockResolvedValue({ close: new D(200) });
    h.submitOrder.mockResolvedValue({ brokerRef: 'sim', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D(200) });
    h.tx.portfolioItem.findUnique.mockResolvedValue({ shares: new D(10), costBasis: new D(100) });

    const res2 = await executePortfolioRebalance(USER_ID, STRATEGY_ID, day2);
    expect(res2.tradesPlaced).toBe(1);
    const secondUpsert = h.tx.portfolioItem.upsert.mock.calls[1][0];
    expect(secondUpsert.update.shares.toString()).toBe('20');
    expect(secondUpsert.update.costBasis.toString()).toBe('150'); // (10*100 + 10*200) / 20
  });

  it('(e) purification amount = max(0, realizedProfit) * ratio, computed on the (averaged) cost basis', async () => {
    const asOf = new Date('2026-07-08');
    h.marketBarFindFirst.mockResolvedValue({ close: new D(300) });
    h.submitOrder.mockResolvedValue({ brokerRef: 'sim', status: 'FILLED', filledQty: new D(20), avgFillPrice: new D(300) });

    // Profit case: averaged costBasis 150, sell all 20 @ 300 -> profit = (300-150)*20 = 3000; ratio default 0.005 -> 15.
    h.userFindUnique.mockImplementation(async () =>
      user({ portfolioItems: [{ id: 'pi-1', symbol: 'MSFT', shares: new D(20), costBasis: new D(150) }] })
    );
    const res = await executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf);
    expect(res.rebalanced).toBe(true);
    expect(h.tx.purificationEntry.create).toHaveBeenCalledTimes(1);
    const entry = h.tx.purificationEntry.create.mock.calls[0][0].data;
    expect(entry.profit.toString()).toBe('3000');
    expect(entry.amount.toString()).toBe('15');
    expect(res.purificationOwed).toBeCloseTo(15);

    // Loss case: no purification entry when there's no realized profit.
    vi.clearAllMocks();
    h.claimSet.clear();
    h.selectBroker.mockReturnValue({ kind: 'INTERNAL_SIM', submitOrder: h.submitOrder });
    h.constructHalalPortfolio.mockResolvedValue({ asOf: new Date(), weights: [], cashWeight: 1, contributorTrace: {} });
    h.marketBarFindFirst.mockResolvedValue({ close: new D(300) });
    h.portfolioSnapshotFindFirst.mockResolvedValue(null);
    h.portfolioItemFindMany.mockResolvedValue([]);
    h.submitOrder.mockResolvedValue({ brokerRef: 'sim', status: 'FILLED', filledQty: new D(20), avgFillPrice: new D(300) });
    h.userFindUnique.mockImplementation(async () =>
      user({ portfolioItems: [{ id: 'pi-1', symbol: 'MSFT', shares: new D(20), costBasis: new D(350) }] })
    );

    const asOf2 = new Date('2026-07-09');
    const res2 = await executePortfolioRebalance(USER_ID, STRATEGY_ID, asOf2);
    expect(res2.rebalanced).toBe(true);
    expect(h.tx.purificationEntry.create).not.toHaveBeenCalled();
    expect(res2.purificationOwed).toBe(0);
  });
});
