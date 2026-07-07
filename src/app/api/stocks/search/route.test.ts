// src/app/api/stocks/search/route.test.ts
// marketData.ts is intentionally NOT mocked: with no ALPACA_API_KEY set (the
// CI/no-keys path), getStockUniverse('NASDAQ') resolves synchronously from
// the bundled fallback list, so this exercises the real keyless behavior.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from './route';

const requireSession = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
}));

beforeEach(() => {
  requireSession.mockReset();
  delete process.env.ALPACA_API_KEY;
});

function req(qs: string) {
  return new Request(`http://x/api/stocks/search?${qs}`);
}

describe('GET /api/stocks/search', () => {
  it('returns 401 if unauthenticated', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const res = await GET(req('q=app&market=NASDAQ'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid market', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    const res = await GET(req('q=app&market=LSE'));
    expect(res.status).toBe(400);
  });

  it('returns 400 on missing query', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    const res = await GET(req('market=NASDAQ'));
    expect(res.status).toBe(400);
  });

  it('finds AAPL by English-name match on NASDAQ (keyless bundled fallback)', async () => {
    requireSession.mockResolvedValue({ id: 'user_app' });
    const res = await GET(req('q=app&market=NASDAQ'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.some((r: { symbol: string }) => r.symbol === 'AAPL')).toBe(true);
  });

  it('finds 2222.SR for "aramco" and 1120.SR for the Arabic Al Rajhi name on TASI', async () => {
    requireSession.mockResolvedValue({ id: 'user_tasi' });

    const aramco = await GET(req('q=aramco&market=TASI'));
    const aramcoData = await aramco.json();
    expect(aramcoData.results.some((r: { symbol: string }) => r.symbol === '2222.SR')).toBe(true);

    const rajhi = await GET(req(`q=${encodeURIComponent('راجحي')}&market=TASI`));
    const rajhiData = await rajhi.json();
    expect(rajhiData.results.some((r: { symbol: string }) => r.symbol === '1120.SR')).toBe(true);
  });

  it('rate-limits per user after the burst is exhausted', async () => {
    requireSession.mockResolvedValue({ id: 'user_rl' });

    for (let i = 0; i < 10; i++) {
      const res = await GET(req('q=a&market=NASDAQ'));
      expect(res.status).toBe(200);
    }
    const res = await GET(req('q=a&market=NASDAQ'));
    expect(res.status).toBe(429);
  });
});
