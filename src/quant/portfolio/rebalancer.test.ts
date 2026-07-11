import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: '5',
  });
}

const h = vi.hoisted(() => ({
  claimSet: new Set<string>(),
  decisions: [] as any[],
  orders: [] as any[],
  nextId: 1,
  autoRunClaimCreate: vi.fn(),
  autoRunClaimDeleteMany: vi.fn(),
  strategyFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  marketBarFindFirst: vi.fn(),
  portfolioSnapshotFindFirst: vi.fn(),
  portfolioSnapshotCreate: vi.fn(),
  portfolioItemFindMany: vi.fn(),
  decisionFindFirst: vi.fn(),
  orderUpdate: vi.fn(),
  transactionFn: vi.fn(),
  submitOrder: vi.fn(),
  getOrder: vi.fn(),
  cancelOrder: vi.fn(),
  selectBroker: vi.fn(),
  constructHalalPortfolio: vi.fn(),
  isHalted: vi.fn(),
  tx: {
    autoRunClaim: { create: vi.fn(), delete: vi.fn() },
    decision: { create: vi.fn(), update: vi.fn() },
    order: { create: vi.fn(), update: vi.fn() },
    transaction: { create: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn() },
    portfolioItem: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    purificationEntry: { create: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: any[]) => h.userFindUnique(...args) },
    strategy: { findFirst: (...args: any[]) => h.strategyFindFirst(...args) },
    marketBar: { findFirst: (...args: any[]) => h.marketBarFindFirst(...args) },
    autoRunClaim: {
      create: (...args: any[]) => h.autoRunClaimCreate(...args),
      deleteMany: (...args: any[]) => h.autoRunClaimDeleteMany(...args),
    },
    decision: { findFirst: (...args: any[]) => h.decisionFindFirst(...args) },
    order: { update: (...args: any[]) => h.orderUpdate(...args) },
    portfolioSnapshot: {
      findFirst: (...args: any[]) => h.portfolioSnapshotFindFirst(...args),
      create: (...args: any[]) => h.portfolioSnapshotCreate(...args),
    },
    portfolioItem: { findMany: (...args: any[]) => h.portfolioItemFindMany(...args) },
    $transaction: (callback: any) => h.transactionFn(callback),
  },
}));
vi.mock('../automation/control', () => ({ isHalted: h.isHalted }));
vi.mock('../execution/registry', () => ({
  selectBroker: (...args: any[]) => h.selectBroker(...args),
}));
vi.mock('./construction', () => ({
  constructHalalPortfolio: (...args: any[]) => h.constructHalalPortfolio(...args),
}));

import { executePortfolioRebalance } from './rebalancer';

const USER_ID = 'user-1';
const STRATEGY_ID = 'strategy-1';
const AS_OF = new Date('2026-07-10T12:00:00.000Z');

function portfolioItem(symbol: string, market: 'NASDAQ' | 'TASI', overrides: Record<string, unknown> = {}) {
  return {
    id: `position-${symbol}`,
    userId: USER_ID,
    symbol,
    market,
    currency: market === 'NASDAQ' ? 'USD' : 'SAR',
    shares: new D(10),
    costBasis: new D(200),
    createdAt: AS_OF,
    updatedAt: AS_OF,
    ...overrides,
  };
}

function user(portfolioItems: any[] = []) {
  return {
    id: USER_ID,
    tier: 'ULTRA',
    cashVirtual: new D(100000),
    portfolioItems,
  };
}

function filled(qty = '10', price = '300') {
  return {
    brokerRef: 'sim:fill',
    status: 'FILLED' as const,
    filledQty: new D(qty),
    avgFillPrice: new D(price),
  };
}

describe('executePortfolioRebalance execution safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.claimSet.clear();
    h.decisions.length = 0;
    h.orders.length = 0;
    h.nextId = 1;

    h.autoRunClaimCreate.mockImplementation(async ({ data }: any) => {
      if (h.claimSet.has(data.key)) throw uniqueViolation();
      h.claimSet.add(data.key);
      return { key: data.key };
    });
    h.autoRunClaimDeleteMany.mockImplementation(async ({ where }: any) => {
      if (typeof where.key === 'string') h.claimSet.delete(where.key);
      return { count: 1 };
    });
    h.tx.autoRunClaim.create.mockImplementation((args: any) => h.autoRunClaimCreate(args));
    h.tx.autoRunClaim.delete.mockImplementation(async ({ where }: any) => {
      h.claimSet.delete(where.key);
      return { key: where.key };
    });

    h.tx.decision.create.mockImplementation(async ({ data }: any) => {
      const decision = {
        id: `decision-${h.nextId++}`,
        status: data.status,
        createdAt: new Date(),
        ...data,
        order: null,
      };
      h.decisions.push(decision);
      return decision;
    });
    h.tx.order.create.mockImplementation(async ({ data }: any) => {
      const order = {
        id: `order-${h.nextId++}`,
        brokerRef: null,
        ...data,
      };
      h.orders.push(order);
      const decision = h.decisions.find((row) => row.id === data.decisionId);
      if (decision) decision.order = order;
      return order;
    });
    h.decisionFindFirst.mockImplementation(async () => h.decisions.at(-1) ?? null);
    h.orderUpdate.mockImplementation(async ({ where, data }: any) => {
      const order = h.orders.find((row) => row.id === where.id);
      Object.assign(order, data);
      return order;
    });
    h.tx.order.update.mockImplementation((args: any) => h.orderUpdate(args));
    h.tx.decision.update.mockImplementation(async ({ where, data }: any) => {
      const decision = h.decisions.find((row) => row.id === where.id);
      Object.assign(decision, data);
      return decision;
    });
    h.transactionFn.mockImplementation(async (callback: any) => callback(h.tx));

    h.strategyFindFirst.mockResolvedValue({ autonomyTier: 'HUMAN_APPROVE' });
    h.userFindUnique.mockResolvedValue(user());
    h.marketBarFindFirst.mockImplementation(async ({ where }: any) => ({
      symbol: where.symbol,
      market: 'NASDAQ',
      ts: where.ts?.lte ?? AS_OF,
      close: new D(300),
    }));
    h.portfolioSnapshotFindFirst.mockResolvedValue(null);
    h.portfolioSnapshotCreate.mockResolvedValue({});
    h.portfolioItemFindMany.mockResolvedValue([]);
    h.constructHalalPortfolio.mockResolvedValue({
      asOf: AS_OF,
      weights: [],
      cashWeight: 1,
      contributorTrace: {},
    });
    h.isHalted.mockResolvedValue(false);
    h.tx.transaction.create.mockResolvedValue({});
    h.tx.user.update.mockResolvedValue({});
    h.tx.user.updateMany.mockResolvedValue({ count: 1 });
    h.tx.portfolioItem.findUnique.mockResolvedValue(null);
    h.tx.portfolioItem.upsert.mockResolvedValue({});
    h.tx.portfolioItem.update.mockResolvedValue({});
    h.tx.portfolioItem.updateMany.mockResolvedValue({ count: 1 });
    h.tx.portfolioItem.delete.mockResolvedValue({});
    h.tx.portfolioItem.deleteMany.mockResolvedValue({ count: 1 });
    h.tx.purificationEntry.create.mockResolvedValue({});
    h.submitOrder.mockResolvedValue(filled());
    h.getOrder.mockResolvedValue(filled());
    h.cancelOrder.mockResolvedValue(undefined);
    h.selectBroker.mockReturnValue({
      kind: 'INTERNAL_SIM',
      submitOrder: h.submitOrder,
      getOrder: h.getOrder,
      cancelOrder: h.cancelOrder,
      getPositions: vi.fn(),
      getCash: vi.fn(),
    });
  });

  it('fails closed on a missing or stale mark before creating an order or calling the broker', async () => {
    h.userFindUnique.mockResolvedValue(user([portfolioItem('MSFT', 'NASDAQ')]));
    h.marketBarFindFirst.mockImplementation(async ({ where }: any) => ({
      symbol: where.symbol,
      ts: where.symbol === 'MSFT' ? new Date('2026-06-01') : AS_OF,
      close: new D(300),
    }));

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF))
      .rejects.toThrow('Missing or stale NASDAQ mark for MSFT');

    expect(h.orders).toHaveLength(0);
    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.claimSet.size).toBe(0);
  });

  it('does not invent a target price when a target mark is missing', async () => {
    h.constructHalalPortfolio.mockResolvedValue({
      asOf: AS_OF,
      weights: [{ symbol: 'NVDA', weight: 0.03, purificationRatio: 0.005 }],
      cashWeight: 0.97,
      contributorTrace: {},
    });
    h.marketBarFindFirst.mockImplementation(async ({ where }: any) => (
      where.symbol === 'NVDA' ? null : { symbol: where.symbol, ts: AS_OF, close: new D(300) }
    ));

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF))
      .rejects.toThrow('Missing or stale NASDAQ mark for NVDA');
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('checks QuantControl immediately before submit and releases the definitively unsubmitted unit', async () => {
    h.userFindUnique.mockResolvedValue(user([portfolioItem('MSFT', 'NASDAQ')]));
    h.isHalted.mockResolvedValue(true);

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF))
      .rejects.toThrow('halted before broker submission');

    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.orders[0].status).toBe('CANCELLED');
    expect(h.claimSet.size).toBe(0);
  });

  it('keeps TASI positions out of NASDAQ NAV, marks, orders, and snapshots', async () => {
    h.userFindUnique.mockResolvedValue(user([
      portfolioItem('2222', 'TASI'),
      portfolioItem('MSFT', 'NASDAQ'),
    ]));

    await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);

    expect(h.marketBarFindFirst.mock.calls.some(([arg]) => arg.where.symbol === '2222')).toBe(false);
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    expect(h.submitOrder.mock.calls[0][0]).toMatchObject({ symbol: 'MSFT', market: 'NASDAQ' });
    expect(h.tx.portfolioItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'position-MSFT', shares: { lte: 0 } },
    });
    expect(h.portfolioItemFindMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, market: 'NASDAQ' },
    });
    expect(h.portfolioSnapshotCreate.mock.calls[0][0].data.positions).not.toHaveProperty('2222');
  });

  it('releases a failed InternalSim unit so a retry creates a new audited attempt', async () => {
    h.userFindUnique.mockResolvedValue(user([portfolioItem('MSFT', 'NASDAQ')]));
    h.submitOrder.mockRejectedValueOnce(new Error('broker offline')).mockResolvedValue(filled());

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF))
      .rejects.toThrow('broker offline');
    expect(h.orders[0].status).toBe('REJECTED');
    expect(h.claimSet.size).toBe(0);

    const retry = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);
    expect(retry.tradesPlaced).toBe(1);
    expect(h.submitOrder).toHaveBeenCalledTimes(2);
    expect(h.orders).toHaveLength(2);
    expect(h.orders[1].status).toBe('FILLED');
    expect(h.tx.transaction.create).toHaveBeenCalled();
  });

  it('reconciles a filled Order after DB settlement failure without a second broker submit', async () => {
    h.userFindUnique.mockResolvedValue(user([portfolioItem('MSFT', 'NASDAQ')]));
    h.tx.transaction.create.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF))
      .rejects.toThrow('database unavailable');
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    expect(h.orders[0]).toMatchObject({
      brokerRef: 'sim:fill',
      status: 'FILLED',
    });
    expect(h.decisions[0].status).toBe('APPROVED');
    expect(h.claimSet.has(`rebalance-order-${STRATEGY_ID}-2026-07-10-MSFT-SELL`)).toBe(true);

    const retry = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);
    expect(retry.tradesPlaced).toBe(1);
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    expect(h.getOrder).not.toHaveBeenCalled();
    expect(h.decisions[0].status).toBe('EXECUTED');
    // First TRADE audit fails; retry writes TRADE + purification audit in one DB transaction.
    expect(h.tx.transaction.create).toHaveBeenCalledTimes(3);
  });

  it('reconciles an ambiguous remote failure with the same client order ID', async () => {
    h.userFindUnique.mockResolvedValue(user([portfolioItem('MSFT', 'NASDAQ')]));
    h.selectBroker.mockReturnValue({
      kind: 'ALPACA_PAPER',
      submitOrder: h.submitOrder,
      getOrder: h.getOrder,
      cancelOrder: h.cancelOrder,
      getPositions: vi.fn(),
      getCash: vi.fn(),
    });
    h.submitOrder.mockRejectedValueOnce(new Error('network timeout')).mockResolvedValue(filled());

    await expect(executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF))
      .rejects.toThrow('network timeout');
    const retry = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);

    expect(retry.tradesPlaced).toBe(1);
    expect(h.submitOrder).toHaveBeenCalledTimes(2);
    expect(h.submitOrder.mock.calls[0][0].clientOrderId).toBe(h.submitOrder.mock.calls[1][0].clientOrderId);
    expect(h.orders).toHaveLength(1);
    expect(h.orders[0].status).toBe('FILLED');
  });

  it('caps BUY fills, prevents negative cash, and records a signed ledger outflow', async () => {
    h.constructHalalPortfolio.mockResolvedValue({
      asOf: AS_OF,
      weights: [{ symbol: 'NVDA', weight: 0.03, purificationRatio: 0.005 }],
      cashWeight: 0.97,
      contributorTrace: {},
    });
    h.submitOrder.mockResolvedValue(filled('10', '300'));

    const result = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);

    expect(result.tradesPlaced).toBe(1);
    expect(h.submitOrder.mock.calls[0][0].limitPrice.toString()).toBe('303');
    expect(h.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: USER_ID, cashVirtual: { gte: new D(3000) } },
      data: { cashVirtual: { decrement: new D(3000) } },
    });
    expect(h.tx.transaction.create.mock.calls[0][0].data.amount.toString()).toBe('-3000');
  });

  it('keeps the strategy/day claim after success so a concurrent or duplicate call cannot resubmit', async () => {
    const first = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);
    const second = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);

    expect(first.rebalanced).toBe(true);
    expect(second).toEqual({
      rebalanced: false,
      nav: 100000,
      tradesPlaced: 0,
      purificationOwed: 0,
    });
    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(h.portfolioSnapshotCreate).toHaveBeenCalledTimes(1);
  });

  it('uses Decimal fill values for realized profit and purification audit', async () => {
    h.userFindUnique.mockResolvedValue(user([
      portfolioItem('MSFT', 'NASDAQ', { shares: new D(10), costBasis: new D(200) }),
    ]));
    h.submitOrder.mockResolvedValue(filled('10', '300'));

    const result = await executePortfolioRebalance(USER_ID, STRATEGY_ID, AS_OF);

    expect(result.purificationOwed).toBe(5);
    expect(h.tx.purificationEntry.create.mock.calls[0][0].data).toMatchObject({
      userId: USER_ID,
      symbol: 'MSFT',
    });
    expect(h.tx.purificationEntry.create.mock.calls[0][0].data.profit.toString()).toBe('1000');
    expect(h.tx.purificationEntry.create.mock.calls[0][0].data.amount.toString()).toBe('5');
  });
});
