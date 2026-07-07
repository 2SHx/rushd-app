import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  tx: {
    order: { update: vi.fn() },
    transaction: { create: vi.fn() },
    user: { update: vi.fn() },
    portfolioItem: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    decision: { update: vi.fn() },
  },
  submitOrder: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    decision: { findUnique: vi.fn() },
    marketBar: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    order: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
    (prisma.marketBar.findFirst as any).mockResolvedValue({ close: new D(100) });
    (prisma.user.findUnique as any).mockResolvedValue({ cashVirtual: new D(100000) });
    (prisma.order.create as any).mockResolvedValue({ id: 'order-1' });
    h.submitOrder.mockResolvedValue({ brokerRef: 'r', status: 'FILLED', filledQty: new D(10), avgFillPrice: new D('100.15') });
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
    expect(h.tx.user.update.mock.calls[0][0].data.cashVirtual).toEqual({ decrement: new D('1001.5') }); // 10*100.15
    expect(h.tx.portfolioItem.upsert).toHaveBeenCalledTimes(1);
    expect(h.tx.decision.update.mock.calls[0][0].data.status).toBe('EXECUTED');
  });

  it('race: a unique-constraint hit on claim short-circuits WITHOUT calling the broker', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    (prisma.order.create as any).mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' }));
    (prisma.order.findUnique as any).mockResolvedValue({ id: 'order-x', status: 'NEW' });
    const res = await executeDecision('dec-1', OWNER);
    expect(res).toEqual({ orderId: 'order-x', status: 'ALREADY_EXECUTED' });
    expect(h.submitOrder).not.toHaveBeenCalled();
    expect(prisma.$transaction as any).not.toHaveBeenCalled();
  });

  it('broker failure after claim marks the Order REJECTED and rethrows', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    h.submitOrder.mockRejectedValue(new Error('broker down'));
    await expect(executeDecision('dec-1', OWNER)).rejects.toThrow('broker down');
    expect((prisma.order.update as any).mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('rejects a BUY with insufficient virtual cash (no claim, no broker call)', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ finalQty: new D(10) }));
    (prisma.user.findUnique as any).mockResolvedValue({ cashVirtual: new D(50) }); // < 10*100
    await expect(executeDecision('dec-1', OWNER)).rejects.toMatchObject({ code: 'insufficient_funds' });
    expect(prisma.order.create as any).not.toHaveBeenCalled();
    expect(h.submitOrder).not.toHaveBeenCalled();
  });

  it('is idempotent (existing order), rejects non-owner, and no-ops HOLD', async () => {
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ order: { id: 'o-1', status: 'FILLED' } }));
    expect(await executeDecision('dec-1', OWNER)).toEqual({ orderId: 'o-1', status: 'ALREADY_EXECUTED' });
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ userId: 'other' }));
    await expect(executeDecision('dec-1', OWNER)).rejects.toMatchObject({ code: 'forbidden' });
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
