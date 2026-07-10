import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  requireSession: vi.fn(),
  isHalted: vi.fn(),
  findStrategies: vi.fn(),
  createClaim: vi.fn(),
  rebalance: vi.fn(),
}));

vi.mock('@/lib/authz', () => ({ requireSession: h.requireSession }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategy: { findMany: h.findStrategies },
    autoRunClaim: { create: h.createClaim },
  },
}));
vi.mock('@/quant/automation/control', () => ({ isHalted: h.isHalted }));
vi.mock('@/quant/portfolio/rebalancer', () => ({
  executePortfolioRebalance: h.rebalance,
}));

import { POST } from './route';

function request() {
  return new Request('http://localhost/api/quant/rebalance/manual', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/quant/rebalance/manual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T12:00:00.000Z'));
    h.requireSession.mockResolvedValue({ id: 'user-1', role: 'PARENT', tier: 'ULTRA' });
    h.isHalted.mockResolvedValue(false);
    h.findStrategies.mockResolvedValue([{ id: 'strategy-1' }]);
    h.createClaim.mockResolvedValue({ key: 'claim' });
    h.rebalance.mockResolvedValue({
      rebalanced: true,
      nav: 100000,
      tradesPlaced: 1,
      purificationOwed: 0,
    });
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

  it('scopes enabled strategies to the session owner', async () => {
    await POST(request());

    expect(h.findStrategies).toHaveBeenCalledWith({
      where: { ownerUserId: 'user-1', enabled: true, market: 'NASDAQ' },
      select: { id: true },
    });
    expect(h.rebalance).toHaveBeenCalledWith('user-1', 'strategy-1', expect.any(Date));
  });

  it('honors QuantControl halt before claiming or delegating', async () => {
    h.isHalted.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(h.createClaim).not.toHaveBeenCalled();
    expect(h.rebalance).not.toHaveBeenCalled();
  });

  it('returns 409 when the user/day claim already exists', async () => {
    h.createClaim.mockRejectedValue({ code: 'P2002' });

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(h.createClaim).toHaveBeenCalledWith({
      data: { key: 'manual-rebalance:user-1:2026-07-10' },
    });
    expect(h.rebalance).not.toHaveBeenCalled();
  });

  it('delegates each owned enabled strategy after a successful claim', async () => {
    h.findStrategies.mockResolvedValue([{ id: 'strategy-1' }, { id: 'strategy-2' }]);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(h.rebalance).toHaveBeenCalledTimes(2);
    expect(h.rebalance).toHaveBeenNthCalledWith(1, 'user-1', 'strategy-1', expect.any(Date));
    expect(h.rebalance).toHaveBeenNthCalledWith(2, 'user-1', 'strategy-2', expect.any(Date));
  });
});
