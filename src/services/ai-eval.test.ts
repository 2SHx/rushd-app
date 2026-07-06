// src/services/ai-eval.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireSession = vi.fn();
const portfolioFindMany = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    portfolioItem: {
      findMany: (...args: unknown[]) => portfolioFindMany(...args),
    },
  },
}));

import { GET as getQuiz } from '../app/api/quiz/route';
import { POST as postSignal } from '../app/api/signals/route';

beforeEach(() => {
  requireSession.mockReset();
  portfolioFindMany.mockReset();
});

describe('AI Route Evaluation - Quiz & Signals Hardening', () => {
  it('GET /api/quiz sanitizes the topic parameter using an allowlist', async () => {
    // A topic not in the allowlist should work but the route executes safely
    // (mock fallback returns 'Stock Market Basics' and carrying complianceTag)
    const req = new Request('http://localhost/api/quiz?topic=dangerous_injection_string_here');
    const res = await getQuiz(req);
    expect(res.status).toBe(200);
    
    const data = await res.json();
    expect(data.topic).toBe('Stock Market Basics');
    expect(data.complianceTag).toBeDefined();
    expect(['HALAL', 'HARAM', 'MASHBOOH', 'EDUCATIONAL_ONLY']).toContain(data.complianceTag);
  });

  it('POST /api/signals rejects unauthenticated requests', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const req = new Request('http://localhost/api/signals', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL', market: 'NASDAQ', currentPrice: 150 }),
    });

    const res = await postSignal(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/signals rejects non-matching market/symbol format (NASDAQ numeric check)', async () => {
    const user = { id: 'u1', role: 'CHILD', tier: 'BASIC', parentId: 'p1' };
    requireSession.mockResolvedValue(user);

    // NASDAQ symbol must be alphabetic. Sending numeric '1120' should fail.
    const req = new Request('http://localhost/api/signals', {
      method: 'POST',
      body: JSON.stringify({ symbol: '1120', market: 'NASDAQ', currentPrice: 150 }),
    });

    const res = await postSignal(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_nasdaq_symbol');
  });

  it('POST /api/signals rejects non-matching market/symbol format (TASI alphabetic check)', async () => {
    const user = { id: 'u1', role: 'CHILD', tier: 'BASIC', parentId: 'p1' };
    requireSession.mockResolvedValue(user);

    // TASI symbol must be numeric. Sending alphabetic 'AAPL' should fail.
    const req = new Request('http://localhost/api/signals', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL', market: 'TASI', currentPrice: 150 }),
    });

    const res = await postSignal(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('invalid_tasi_symbol');
  });

  it('POST /api/signals returns a compliant mock fallback signal', async () => {
    const user = { id: 'u1', role: 'CHILD', tier: 'BASIC', parentId: 'p1' };
    requireSession.mockResolvedValue(user);
    portfolioFindMany.mockResolvedValue([]); // Mock empty portfolio

    const req = new Request('http://localhost/api/signals', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL', market: 'NASDAQ', currentPrice: 150 }),
    });

    const res = await postSignal(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    
    expect(data.action).toBeDefined();
    expect(data.complianceTag).toBeDefined();
    expect(['HALAL', 'HARAM', 'MASHBOOH', 'EDUCATIONAL_ONLY']).toContain(data.complianceTag);
  });
});
