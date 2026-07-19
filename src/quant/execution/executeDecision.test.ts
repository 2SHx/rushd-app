import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  lockCreate: vi.fn(),
  lockDeleteMany: vi.fn(),
  tx: {
    order: { update: vi.fn() },
    transaction: { create: vi.fn() },
    user: { update: vi.fn(), updateMany: vi.fn() },
    portfolioItem: {
      upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
      delete: vi.fn(), deleteMany: vi.fn(),
    },
    decision: { update: vi.fn() },
  },
  submitOrder: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    decision: { findUnique: vi.fn() },
    marketBar: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    portfolioItem: { findUnique: vi.fn() },
    order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    autoRunClaim: { create: h.lockCreate, deleteMany: h.lockDeleteMany },
    $transaction: vi.fn(async (cb: any) => cb(h.tx)),
  },
}));
vi.mock('./registry', () => ({
  selectBroker: vi.fn(() => ({ kind: 'INTERNAL_SIM', submitOrder: h.submitOrder })),
}));

import { prisma } from '@/lib/prisma';
import { executeDecision, ExecutionError } from './executeDecision';

const D = Prisma.Decimal;
const OWNER = 'user-1';

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dec-1', userId: OWNER, symbol: 'AAPL', market: 'NASDAQ',
    finalAction: 'BUY', finalQty: new D(10), status: 'APPROVED', order: null, ...overrides,
  };
}

describe('executeDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.lockCreate.mockResolvedValue({ key: `money-user-${OWNER}` });
    h.lockDeleteMany.mockResolvedValue({ count: 1 });
    (prisma.marketBar.findFirst as any).mockResolvedValue({ close: new D(100) });
    (prisma.user.findUnique as any).mockResolvedValue({ cashVirtual: new D(100000) });
    (prisma.order.create as any).mockResolvedValue({ id: 'order-1' });
    h.submitOrder.mockResolvedValue({ brokerRef: 'r', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D('100.15') });
    h.tx.user.updateMany.mockResolvedValue({ count: 1 });
    h.tx.portfolioItem.updateMany.mockResolvedValue({ count: 1 });
    (prisma.portfolioItem.findUnique as any).mockResolvedValue({ id: 'pi-1', shares: new D(50) });
    h.tx.portfolioItem.findUnique.mockResolvedValue({ id: 'pi-1', shares: new D(50) });
  });

  it('BUY: claims the Order before the broker call, then settles atomically with cash debit', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    const res = await executeDecision('dec-1', OWNER);

    expect(res).toEqual({ orderId: 'order-1', status: 'FILLED' });
    // claim precedes broker submit
    expect((prisma.order.create as any).mock.invocationCallOrder[0]).toBeLessThan(h.submitOrder.mock.invocationCallOrder[0]);
    expect((prisma.order.create as any).mock.calls[0][0].data.status).toBe('NEW');
    // settle: TRADE audit + cash debit + portfolio + status
    expect(h.tx.transaction.create.mock.calls[0][0].data.type).toBe('TRADE');
    expect(h.tx.transaction.create.mock.calls[0][0].data.amount.toString()).toBe('-1001.5');
    expect(h.tx.user.updateMany.mock.calls[0][0].data.cashVirtual).toEqual({ decrement: new D('1001.5') }); // 10*100.15
    expect(h.tx.portfolioItem.upsert).toHaveBeenCalledTimes(1);
    expect(h.tx.decision.update.mock.calls[0][0].data.status).toBe('EXECUTED');
  });

  it('reconciles an existing order claim with the stable broker request', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    (prisma.order.create as any).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
    (prisma.order.findUnique as any).mockResolvedValue({
      id: 'order-x', status: 'NEW', brokerRef: null, filledQty: new D(0), avgFillPrice: new D(0), qty: new D(10),
    });
    const res = await executeDecision('dec-1', OWNER);
    expect(res).toEqual({ orderId: 'order-x', status: 'FILLED' });
    expect(h.submitOrder.mock.calls[0][0].clientOrderId).toBe('rushd-order-x');
  });

  it('broker failure after claim marks the Order REJECTED and rethrows', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    h.submitOrder.mockRejectedValue(new Error('broker down'));
    await expect(executeDecision('dec-1', OWNER)).rejects.toThrow('broker down');
    expect((prisma.order.update as any).mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('checks an automation kill-switch immediately before submission', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    const beforeSubmit = vi.fn().mockRejectedValue(new Error('automation_halted'));

    await expect(executeDecision('dec-1', OWNER, { beforeSubmit })).rejects.toThrow('automation_halted');
    expect(beforeSubmit).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('lets trusted paper automation pin InternalSimBroker instead of consulting live-mode selection', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    const submitOrder = vi.fn().mockResolvedValue({
      brokerRef: 'internal-only', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D('100.15'),
    });

    await executeDecision('dec-1', OWNER, {
      broker: { kind: 'INTERNAL_SIM', submitOrder } as any,
    });

    expect(submitOrder).toHaveBeenCalledTimes(1);
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('settles a strategy-scoped isolated book without touching the owner wallet or shared holdings', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ strategyId: 'book-strategy' }));
    const submitOrder = vi.fn().mockResolvedValue({
      brokerRef: 'internal-only', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D('123.1845'),
    });

    await executeDecision('dec-1', OWNER, {
      broker: { kind: 'INTERNAL_SIM', submitOrder } as any,
      refPrice: new D(123),
      isolatedPaperBook: true,
    });

    expect(submitOrder.mock.calls[0][0].refPrice.toString()).toBe('123');
    expect(prisma.marketBar.findFirst as any).not.toHaveBeenCalled();
    expect(prisma.user.findUnique as any).not.toHaveBeenCalled();
    expect(prisma.portfolioItem.findUnique as any).not.toHaveBeenCalled();
    expect(h.tx.user.updateMany).not.toHaveBeenCalled();
    expect(h.tx.user.update).not.toHaveBeenCalled();
    expect(h.tx.portfolioItem.upsert).not.toHaveBeenCalled();
    expect(h.tx.portfolioItem.updateMany).not.toHaveBeenCalled();
    expect(h.tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(h.tx.decision.update).toHaveBeenCalledTimes(1);
  });

  it('MED#2: an isolated-book trade is labeled INCUBATION_TRADE, never owner-visible TRADE', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ strategyId: 'book-strategy' }));
    const submitOrder = vi.fn().mockResolvedValue({
      brokerRef: 'internal-only', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D('123.1845'),
    });

    await executeDecision('dec-1', OWNER, {
      broker: { kind: 'INTERNAL_SIM', submitOrder } as any,
      refPrice: new D(123),
      isolatedPaperBook: true,
    });

    expect(h.tx.transaction.create.mock.calls[0][0].data.type).toBe('INCUBATION_TRADE');
    // A family ledger sum (Prisma aggregate over type: 'TRADE') provably excludes this row.
    const familyLedgerTypes = ['DEPOSIT', 'WITHDRAWAL', 'TRADE', 'QUEST_REWARD', 'ALLOWANCE', 'PROFIT_SHARE'];
    expect(familyLedgerTypes).not.toContain(h.tx.transaction.create.mock.calls[0][0].data.type);
  });

  it('fails closed when isolated-book execution is not strategy-scoped InternalSim', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ strategyId: null }));
    await expect(executeDecision('dec-1', OWNER, {
      broker: { kind: 'INTERNAL_SIM' } as any,
      refPrice: new D(123),
      isolatedPaperBook: true,
    })).rejects.toMatchObject({ code: 'conflict' });
    expect(prisma.order.create as any).not.toHaveBeenCalled();
  });

  it('rejects a BUY with insufficient virtual cash (no claim, no broker call)', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ finalQty: new D(10) }));
    (prisma.user.findUnique as any).mockResolvedValue({ cashVirtual: new D(50) }); // < 10*100
    await expect(executeDecision('dec-1', OWNER)).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(prisma.order.create as any).not.toHaveBeenCalled();
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('is idempotent (existing order), rejects non-owner, and no-ops HOLD', async () => {
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ status: 'EXECUTED', order: { id: 'o-1', status: 'FILLED' } }));
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ status: 'EXECUTED', order: { id: 'o-1', status: 'FILLED' } }));
    expect(await executeDecision('dec-1', OWNER)).toEqual({ orderId: 'o-1', status: 'ALREADY_EXECUTED' });
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ userId: 'other' }));
    await expect(executeDecision('dec-1', OWNER)).rejects.toMatchObject({ code: 'forbidden' });
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ finalAction: 'HOLD', finalQty: new D(0) }));
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ finalAction: 'HOLD', finalQty: new D(0) }));
    expect(await executeDecision('dec-1', OWNER)).toEqual({ orderId: null, status: 'HOLD_NOOP' });
  });

  it('SELL credits cash', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ finalAction: 'SELL' }));
    h.submitOrder.mockResolvedValue({ brokerRef: 'r', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D('99.85') });
    await executeDecision('dec-1', OWNER);
    expect(h.tx.user.update.mock.calls[0][0].data.cashVirtual).toEqual({ increment: new D('998.5') });
  });
});
