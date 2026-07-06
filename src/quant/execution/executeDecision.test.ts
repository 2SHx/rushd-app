import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  tx: {
    order: { create: vi.fn() },
    transaction: { create: vi.fn() },
    portfolioItem: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    decision: { update: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    decision: { findUnique: vi.fn() },
    marketBar: { findFirst: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(h.tx)),
  },
}));

import { prisma } from '@/lib/prisma';
import { executeDecision, ExecutionError } from './executeDecision';

const D = Prisma.Decimal;
const OWNER = 'user-1';

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dec-1',
    userId: OWNER,
    symbol: 'AAPL',
    market: 'NASDAQ',
    finalAction: 'BUY',
    finalQty: new D(10),
    status: 'APPROVED',
    order: null,
    ...overrides,
  };
}

describe('executeDecision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.marketBar.findFirst as any).mockResolvedValue({ close: new D(100) });
    h.tx.order.create.mockResolvedValue({ id: 'order-1', status: 'FILLED' });
    h.tx.portfolioItem.findUnique.mockResolvedValue({ id: 'pi-1', shares: new D(50) });
  });

  it('BUY: writes Order + TRADE Transaction + upserts PortfolioItem, flips status, atomic', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision());
    const res = await executeDecision('dec-1', OWNER);

    expect(res).toEqual({ orderId: 'order-1', status: 'FILLED' });
    expect((prisma.$transaction as any)).toHaveBeenCalledTimes(1);
    const orderArg = h.tx.order.create.mock.calls[0][0].data;
    expect(orderArg.side).toBe('BUY');
    expect(orderArg.broker).toBe('INTERNAL_SIM');
    // BUY fill = 100 + 0.15% = 100.15; audit Transaction type TRADE
    const txArg = h.tx.transaction.create.mock.calls[0][0].data;
    expect(txArg.type).toBe('TRADE');
    expect(txArg.currency).toBe('USD');
    expect(txArg.amount.equals(new D('1001.5'))).toBe(true); // 10 * 100.15
    expect(h.tx.portfolioItem.upsert).toHaveBeenCalledTimes(1);
    expect(h.tx.decision.update.mock.calls[0][0].data.status).toBe('EXECUTED');
  });

  it('is idempotent: an existing order short-circuits with no new fill', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ order: { id: 'order-x', status: 'FILLED' } }));
    const res = await executeDecision('dec-1', OWNER);
    expect(res).toEqual({ orderId: 'order-x', status: 'ALREADY_EXECUTED' });
    expect(prisma.$transaction as any).not.toHaveBeenCalled();
  });

  it('rejects a non-owner (403 / forbidden)', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ userId: 'someone-else' }));
    await expect(executeDecision('dec-1', OWNER)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('HOLD is a no-op (no order)', async () => {
    (prisma.decision.findUnique as any).mockResolvedValue(decision({ finalAction: 'HOLD', finalQty: new D(0) }));
    const res = await executeDecision('dec-1', OWNER);
    expect(res).toEqual({ orderId: null, status: 'HOLD_NOOP' });
    expect(prisma.$transaction as any).not.toHaveBeenCalled();
  });

  it('throws not_found for a missing decision and conflict when not APPROVED', async () => {
    (prisma.decision.findUnique as any).mockResolvedValueOnce(null);
    await expect(executeDecision('dec-1', OWNER)).rejects.toBeInstanceOf(ExecutionError);
    (prisma.decision.findUnique as any).mockResolvedValueOnce(decision({ status: 'PROPOSED' }));
    await expect(executeDecision('dec-1', OWNER)).rejects.toMatchObject({ code: 'conflict' });
  });
});
