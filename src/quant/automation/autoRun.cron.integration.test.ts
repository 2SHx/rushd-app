import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  isHalted: vi.fn(),
  runCommitteePass: vi.fn(),
  strategyFindMany: vi.fn(),
  claimCreate: vi.fn(),
  lockDeleteMany: vi.fn(),
  decisionFindUnique: vi.fn(),
  decisionUpdate: vi.fn(),
  orderCreate: vi.fn(),
  orderUpdate: vi.fn(),
  marketBarFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  submitOrder: vi.fn(),
  tx: {
    order: { update: vi.fn() },
    transaction: { create: vi.fn() },
    user: { updateMany: vi.fn() },
    portfolioItem: { upsert: vi.fn() },
    decision: { update: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategy: { findMany: (...args: unknown[]) => h.strategyFindMany(...args) },
    autoRunClaim: {
      create: (...args: unknown[]) => h.claimCreate(...args),
      deleteMany: (...args: unknown[]) => h.lockDeleteMany(...args),
    },
    decision: {
      findUnique: (...args: unknown[]) => h.decisionFindUnique(...args),
      update: (...args: unknown[]) => h.decisionUpdate(...args),
    },
    order: {
      create: (...args: unknown[]) => h.orderCreate(...args),
      update: (...args: unknown[]) => h.orderUpdate(...args),
    },
    marketBar: { findFirst: (...args: unknown[]) => h.marketBarFindFirst(...args) },
    user: { findUnique: (...args: unknown[]) => h.userFindUnique(...args) },
    $transaction: vi.fn(async (callback: (tx: typeof h.tx) => unknown) => callback(h.tx)),
  },
}));
vi.mock('./control', () => ({ isHalted: (...args: unknown[]) => h.isHalted(...args) }));
vi.mock('../committee/runner', () => ({
  runCommitteePass: (...args: unknown[]) => h.runCommitteePass(...args),
}));
vi.mock('../execution/registry', () => ({
  selectBroker: () => ({
    kind: 'INTERNAL_SIM',
    submitOrder: (...args: unknown[]) => h.submitOrder(...args),
    getOrder: vi.fn(),
    cancelOrder: vi.fn(),
    getPositions: vi.fn(),
    getCash: vi.fn(),
  }),
}));

import { POST } from '@/app/api/cron/quant-run/route';

const D = Prisma.Decimal;

function request() {
  return new Request('http://rushd.test/api/cron/quant-run', {
    method: 'POST',
    headers: { Authorization: 'Bearer tracer-secret' },
  });
}

describe('signed AUTO_PAPER cron tracer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'tracer-secret');
    h.isHalted.mockResolvedValue(false);
    h.strategyFindMany.mockResolvedValue([{
      id: 'strategy-1',
      ownerUserId: 'user-1',
      market: 'NASDAQ',
      config: { symbols: ['AAPL'] },
      autonomyTier: 'AUTO_PAPER',
      enabled: true,
    }]);
    h.runCommitteePass.mockResolvedValue({ decisionId: 'decision-1', finalAction: 'BUY' });
    h.decisionFindUnique.mockResolvedValue({
      id: 'decision-1',
      userId: 'user-1',
      strategyId: 'strategy-1',
      symbol: 'AAPL',
      market: 'NASDAQ',
      finalAction: 'BUY',
      finalQty: new D(2),
      status: 'APPROVED',
      order: null,
    });
    h.marketBarFindFirst.mockResolvedValue({ close: new D(100) });
    h.userFindUnique.mockResolvedValue({ cashVirtual: new D(10_000) });
    h.orderCreate.mockResolvedValue({ id: 'order-1' });
    h.submitOrder.mockResolvedValue({
      brokerRef: 'paper-fill-1',
      status: 'FILLED',
      filledQty: new D(2),
      avgFillPrice: new D('100.15'),
    });
    h.tx.user.updateMany.mockResolvedValue({ count: 1 });
    h.claimCreate
      .mockResolvedValueOnce({}) // cron unit claim
      .mockResolvedValueOnce({}) // per-user execution lock
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate cron claim', {
        code: 'P2002',
        clientVersion: '5',
      }));
  });

  it('settles once and a signed retry cannot duplicate broker or ledger writes', async () => {
    const first = await POST(request());
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ processed: true, ran: 1, executed: 1 });

    const second = await POST(request());
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ processed: false, ran: 0, executed: 0 });

    expect(h.decisionUpdate).toHaveBeenCalledWith({
      where: { id: 'decision-1' },
      data: { status: 'APPROVED' },
    });
    expect(h.submitOrder).toHaveBeenCalledTimes(1);
    expect(h.submitOrder.mock.calls[0][0]).toEqual(expect.objectContaining({
      clientOrderId: 'rushd-order-1',
      symbol: 'AAPL',
      side: 'BUY',
    }));
    expect(h.orderCreate).toHaveBeenCalledTimes(1);
    expect(h.tx.order.update).toHaveBeenCalledTimes(1);
    expect(h.tx.transaction.create).toHaveBeenCalledTimes(1);
    expect(h.tx.transaction.create.mock.calls[0][0].data.type).toBe('TRADE');
    expect(h.tx.decision.update).toHaveBeenCalledWith({
      where: { id: 'decision-1' },
      data: { status: 'EXECUTED' },
    });
  });
});
