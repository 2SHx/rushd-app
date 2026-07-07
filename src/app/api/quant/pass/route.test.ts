// src/app/api/quant/pass/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const requireSession = vi.fn();
const runCommitteePass = vi.fn();
const decisionFindUnique = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
}));

vi.mock('@/quant/committee/runner', () => ({
  runCommitteePass: (...args: any[]) => runCommitteePass(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    decision: {
      findUnique: (...args: any[]) => decisionFindUnique(...args),
    },
  },
}));

beforeEach(() => {
  requireSession.mockReset();
  runCommitteePass.mockReset();
  decisionFindUnique.mockReset();
});

function req(body: unknown) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/quant/pass', () => {
  it('returns 401 if unauthenticated', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const res = await POST(req({ symbol: '2222.SR', market: 'TASI' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid market', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });

    const res = await POST(req({ symbol: '2222.SR', market: 'LSE' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_input');
  });

  it('returns 400 on missing symbol', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });

    const res = await POST(req({ market: 'TASI' }));
    expect(res.status).toBe(400);
  });

  it('happy path returns decision + signals', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    runCommitteePass.mockResolvedValue({ decisionId: 'dec_1', finalAction: 'BUY' });
    decisionFindUnique.mockResolvedValue({
      id: 'dec_1',
      finalQty: '10',
      proposedAction: 'BUY',
      proposedQty: '10',
      shariaGate: { compliant: true },
      riskAdjustments: {},
      debateTranscript: [],
      signals: [{ id: 'sig_1', agent: 'FUNDAMENTAL', stance: 'BULLISH' }],
    });

    const res = await POST(req({ symbol: '2222.SR', market: 'TASI' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.decisionId).toBe('dec_1');
    expect(data.finalAction).toBe('BUY');
    expect(data.signals).toHaveLength(1);
    expect(data.shariaGate).toEqual({ compliant: true });

    expect(runCommitteePass).toHaveBeenCalledWith({
      userId: 'user_1',
      symbol: '2222.SR',
      market: 'TASI',
    });
  });

  it('rate-limits per user after 5 rapid requests', async () => {
    requireSession.mockResolvedValue({ id: 'user_rl' });
    runCommitteePass.mockResolvedValue({ decisionId: 'dec_x', finalAction: 'HOLD' });
    decisionFindUnique.mockResolvedValue({
      id: 'dec_x',
      finalQty: '0',
      proposedAction: 'HOLD',
      proposedQty: '0',
      shariaGate: {},
      riskAdjustments: {},
      debateTranscript: [],
      signals: [],
    });

    for (let i = 0; i < 5; i++) {
      const res = await POST(req({ symbol: 'AAPL', market: 'NASDAQ' }));
      expect(res.status).toBe(200);
    }
    const res = await POST(req({ symbol: 'AAPL', market: 'NASDAQ' }));
    expect(res.status).toBe(429);
  });

  it('returns 500 on unexpected error without leaking details', async () => {
    requireSession.mockResolvedValue({ id: 'user_err' });
    runCommitteePass.mockRejectedValue(new Error('boom'));

    const res = await POST(req({ symbol: 'AAPL', market: 'NASDAQ' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('internal_error');
  });
});
