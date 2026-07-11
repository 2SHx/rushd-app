import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ORIGINAL_MODE = process.env.MARKET_DATA_MODE;

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_MODE === undefined) delete process.env.MARKET_DATA_MODE;
  else process.env.MARKET_DATA_MODE = ORIGINAL_MODE;
});

describe('GET /api/fear-greed', () => {
  it('returns a labeled bundled fallback without fetching by default', async () => {
    delete process.env.MARKET_DATA_MODE;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      source: 'bundled',
      fear_and_greed: { score: 50, rating: 'Bundled neutral fallback' },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
