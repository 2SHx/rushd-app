// src/app/api/quant/backtest/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const requireSession = vi.fn();
const runBacktest = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
  requireUltraTier: () => requireSession(),
}));

vi.mock('@/quant/backtest/engine', () => ({
  runBacktest: (...args: any[]) => runBacktest(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {},
}));

beforeEach(() => {
  requireSession.mockReset();
  runBacktest.mockReset();
});

function req(body: unknown) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

const validBody = {
  symbol: '2222.SR',
  market: 'TASI',
  fromDate: '2024-01-01',
  toDate: '2024-06-01',
};

describe('POST /api/quant/backtest', () => {
  it('returns 401 if unauthenticated', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const res = await POST(req(validBody));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid market', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });

    const res = await POST(req({ ...validBody, market: 'LSE' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when fromDate is after toDate', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });

    const res = await POST(req({ ...validBody, fromDate: '2024-06-01', toDate: '2024-01-01' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_input');
  });

  it('returns 400 when oosFraction out of range', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });

    const res = await POST(req({ ...validBody, oosFraction: 1.5 }));
    expect(res.status).toBe(400);
  });

  it('happy path returns backtestRunId + metrics', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    const metrics = { cagr: 0.1, sharpe: 1.2, deflatedSharpe: 1.0, maxDrawdown: 0.2, hitRate: 0.5, trades: 10, turnover: 0.3, implausible: false };
    const oosMetrics = { ...metrics, cagr: 0.05 };
    runBacktest.mockResolvedValue({ backtestRunId: 'bt_1', metrics, oosMetrics });

    const res = await POST(req(validBody));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.backtestRunId).toBe('bt_1');
    expect(data.metrics).toEqual(metrics);
    expect(data.oosMetrics).toEqual(oosMetrics);

    expect(runBacktest).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: '2222.SR', market: 'TASI' }),
    );
  });

  it('rate-limits per user after 5 rapid requests', async () => {
    requireSession.mockResolvedValue({ id: 'user_rl_bt' });
    runBacktest.mockResolvedValue({ backtestRunId: 'bt_x', metrics: {}, oosMetrics: {} });

    for (let i = 0; i < 5; i++) {
      const res = await POST(req(validBody));
      expect(res.status).toBe(200);
    }
    const res = await POST(req(validBody));
    expect(res.status).toBe(429);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    requireSession.mockResolvedValue({ id: 'user_err_bt' });
    runBacktest.mockRejectedValue(new Error('boom'));

    const res = await POST(req(validBody));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('internal_error');
  });
});
