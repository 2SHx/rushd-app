import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  isHalted: vi.fn(),
  findStrategies: vi.fn(),
  rebalance: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { strategy: { findMany: h.findStrategies } },
}));
vi.mock('@/quant/automation/control', () => ({ isHalted: h.isHalted }));
vi.mock('@/quant/portfolio/rebalancer', () => ({
  executePortfolioRebalance: h.rebalance,
}));

import { POST } from './route';

function request(options: {
  authorization?: string;
  querySecret?: string;
  headerSecret?: string;
} = {}) {
  const query = options.querySecret ? `?secret=${options.querySecret}` : '';
  const headers = new Headers();
  if (options.authorization) headers.set('Authorization', options.authorization);
  if (options.headerSecret) headers.set('x-cron-secret', options.headerSecret);
  return new Request(`http://localhost/api/quant/rebalance${query}`, {
    method: 'POST',
    headers,
  });
}

describe('POST /api/quant/rebalance legacy cron', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-secret';
    h.isHalted.mockResolvedValue(false);
    h.findStrategies.mockResolvedValue([
      { id: 'strategy-1', ownerUserId: 'user-1' },
    ]);
    h.rebalance.mockResolvedValue({
      rebalanced: true,
      nav: 100000,
      tradesPlaced: 1,
      purificationOwed: 0,
    });
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it('accepts a valid Bearer Authorization header', async () => {
    const response = await POST(request({ authorization: 'Bearer cron-secret' }));

    expect(response.status).toBe(200);
    expect(h.findStrategies).toHaveBeenCalledWith({
      where: {
        enabled: true,
        market: 'NASDAQ',
        owner: { tier: 'ULTRA' },
      },
    });
    expect(h.rebalance).toHaveBeenCalledWith('user-1', 'strategy-1', expect.any(Date));
  });

  it.each([
    ['query secret', { querySecret: 'cron-secret' }],
    ['x-cron-secret header', { headerSecret: 'cron-secret' }],
    ['wrong Bearer secret', { authorization: 'Bearer wrong' }],
    ['non-Bearer authorization', { authorization: 'Basic cron-secret' }],
  ])('rejects %s', async (_label, options) => {
    const response = await POST(request(options));

    expect(response.status).toBe(401);
    expect(h.findStrategies).not.toHaveBeenCalled();
    expect(h.rebalance).not.toHaveBeenCalled();
  });

  it('honors QuantControl before reading strategies', async () => {
    h.isHalted.mockResolvedValue(true);

    const response = await POST(request({ authorization: 'Bearer cron-secret' }));

    expect(response.status).toBe(503);
    expect(h.findStrategies).not.toHaveBeenCalled();
    expect(h.rebalance).not.toHaveBeenCalled();
  });

  it('returns a retryable failure without leaking strategy errors', async () => {
    h.rebalance.mockRejectedValue(new Error('database connection details'));

    const response = await POST(request({ authorization: 'Bearer cron-secret' }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.logs['strategy-1']).toEqual({
      rebalanced: false,
      error: 'rebalance_failed',
    });
    expect(JSON.stringify(body)).not.toContain('database connection details');
  });
});
