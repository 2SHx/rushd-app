import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireSession: vi.fn(),
  isHalted: vi.fn(),
  findStrategies: vi.fn(),
  rebalance: vi.fn(),
}));

vi.mock('@/lib/authz', () => ({ requireSession: h.requireSession }));
vi.mock('@/lib/prisma', () => ({
  prisma: { strategy: { findMany: h.findStrategies } },
}));
vi.mock('@/quant/automation/control', () => ({ isHalted: h.isHalted }));
vi.mock('@/quant/portfolio/rebalancer', () => ({
  executePortfolioRebalance: h.rebalance,
}));

import { POST } from './route';

function request(contentType = 'application/json') {
  return new Request('http://localhost/api/quant/rebalance/manual', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
  });
}

const successLog = {
  rebalanced: true,
  nav: 100000,
  tradesPlaced: 1,
  purificationOwed: 0,
};

describe('POST /api/quant/rebalance/manual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    h.requireSession.mockResolvedValue({ id: 'user-1', role: 'PARENT', tier: 'ULTRA' });
    h.isHalted.mockResolvedValue(false);
    h.findStrategies.mockResolvedValue([{ id: 'strategy-1' }]);
    h.rebalance.mockResolvedValue(successLog);
  });

  afterEach(() => vi.useRealTimers());

  it('returns 401 when unauthenticated', async () => {
    h.requireSession.mockRejectedValue({
      response: new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(h.findStrategies).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-ULTRA session', async () => {
    h.requireSession.mockResolvedValue({ id: 'user-1', role: 'PARENT', tier: 'PREMIUM' });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(h.findStrategies).not.toHaveBeenCalled();
  });

  it('accepts application/json with charset and rejects non-JSON media types', async () => {
    const accepted = await POST(request('application/json; charset=utf-8'));
    const rejected = await POST(request('text/plain; charset=utf-8'));

    expect(accepted.status).toBe(200);
    expect(rejected.status).toBe(415);
  });

  it('scopes enabled NASDAQ strategies to the session owner', async () => {
    await POST(request());

    expect(h.findStrategies).toHaveBeenCalledWith({
      where: { ownerUserId: 'user-1', enabled: true, market: 'NASDAQ' },
      select: { id: true },
    });
    expect(h.rebalance).toHaveBeenCalledWith('user-1', 'strategy-1', expect.any(Date));
  });

  it('honors QuantControl halt before delegating', async () => {
    h.isHalted.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(h.rebalance).not.toHaveBeenCalled();
  });

  it('has no user/day claim that can strand later strategies after a partial failure', async () => {
    h.findStrategies.mockResolvedValue([{ id: 'strategy-1' }, { id: 'strategy-2' }]);
    h.rebalance
      .mockResolvedValueOnce(successLog)
      .mockRejectedValueOnce(new Error('strategy-2 database failure'));

    const first = await POST(request());
    const firstBody = await first.json();

    expect(first.status).toBe(500);
    expect(firstBody.logs['strategy-1'].rebalanced).toBe(true);
    expect(firstBody.logs['strategy-2']).toEqual({
      rebalanced: false,
      error: 'rebalance_failed',
    });
    expect(h.rebalance).toHaveBeenCalledTimes(2);

    h.rebalance.mockReset();
    h.rebalance
      .mockResolvedValueOnce({ ...successLog, rebalanced: false, tradesPlaced: 0 })
      .mockResolvedValueOnce(successLog);

    const retry = await POST(request());
    const retryBody = await retry.json();

    expect(retry.status).toBe(200);
    expect(retryBody.success).toBe(true);
    expect(h.rebalance).toHaveBeenNthCalledWith(1, 'user-1', 'strategy-1', expect.any(Date));
    expect(h.rebalance).toHaveBeenNthCalledWith(2, 'user-1', 'strategy-2', expect.any(Date));
  });

  it('stops between strategies if QuantControl is engaged mid-request', async () => {
    h.findStrategies.mockResolvedValue([{ id: 'strategy-1' }, { id: 'strategy-2' }]);
    h.isHalted
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(h.rebalance).toHaveBeenCalledTimes(1);
    expect(body.logs['strategy-1'].rebalanced).toBe(true);
  });
});
