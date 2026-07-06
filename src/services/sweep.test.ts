// src/services/sweep.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const findMany = vi.fn();
const jarUpdate = vi.fn();
const transactionCreate = vi.fn();
const transactionFindFirst = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    savingsJar: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => jarUpdate(...args),
    },
    transaction: {
      create: (...args: unknown[]) => transactionCreate(...args),
      findFirst: (...args: unknown[]) => transactionFindFirst(...args),
    },
  },
}));

import { processCashSweeps } from './engines';
import { POST } from '../app/api/cron/distribute/route';

beforeEach(() => {
  findMany.mockReset();
  jarUpdate.mockReset();
  transactionCreate.mockReset();
  transactionFindFirst.mockReset();
  process.env.CRON_SECRET = 'supersecret';
});

describe('Mudarabah Savings distribution (processCashSweeps)', () => {
  it('correctly calculates user profit share and platform Mudarib fee, writing transactions', async () => {
    findMany.mockResolvedValue([
      { id: 'j1', userId: 'u1', balance: 1000, currency: 'SAR', profitShareRatioBps: 7000 },
      { id: 'j2', userId: 'u2', balance: 2000, currency: 'SAR', profitShareRatioBps: 8000 },
      { id: 'j3', userId: 'u3', balance: 0, currency: 'SAR', profitShareRatioBps: 7000 },
    ]);

    const customYield = new Prisma.Decimal('0.10').div(365);
    const result = await processCashSweeps(customYield);

    expect(result.processedJars).toBe(3);
    expect(result.platformRevenue).toBeCloseTo(0.19178, 4);

    expect(jarUpdate).toHaveBeenCalledTimes(2);
    expect(transactionCreate).toHaveBeenCalledTimes(2);

    const updateCall1 = jarUpdate.mock.calls.find(c => c[0].where.id === 'j1');
    expect(updateCall1).toBeDefined();
    expect(updateCall1![0].data.balance.toNumber()).toBeCloseTo(1000 + 0.19178, 4);

    const txCall1 = transactionCreate.mock.calls.find(c => c[0].data.userId === 'u1');
    expect(txCall1).toBeDefined();
    expect(txCall1![0].data.amount.toNumber()).toBeCloseTo(0.19178, 4);
    expect(txCall1![0].data.type).toBe('PROFIT_SHARE');
  });
});

describe('POST /api/cron/distribute', () => {
  it('returns 401 if unauthorized', async () => {
    const req = new Request('http://localhost/api/cron/distribute', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('runs successfully if authorized and has not run today', async () => {
    transactionFindFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([]);

    const req = new Request('http://localhost/api/cron/distribute', {
      method: 'POST',
      headers: { Authorization: 'Bearer supersecret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processed).toBe(true);
  });

  it('skips run if already distributed today (idempotency)', async () => {
    transactionFindFirst.mockResolvedValue({ id: 'exists' });

    const req = new Request('http://localhost/api/cron/distribute', {
      method: 'POST',
      headers: { Authorization: 'Bearer supersecret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processed).toBe(false);
    expect(data.message).toContain('already been distributed');
  });
});
