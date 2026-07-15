import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
vi.mock('@/lib/authz', () => ({ requireSession: () => requireSession() }));

import { GET } from './route';

describe('GET /api/stocks/quotes free-first mode', () => {
  beforeEach(() => {
    requireSession.mockResolvedValue({ id: 'quotes-test-user' });
    delete process.env.MARKET_DATA_MODE;
    process.env.ALPACA_API_KEY = 'configured-but-disabled';
  });

  it('does not call Alpaca merely because a key exists', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET(new Request('http://localhost/api/stocks/quotes?symbols=MSFT&market=NASDAQ'));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = await response.json();
    expect(body.quotes.MSFT).toBeDefined();
    expect(body).toMatchObject({ requested: 1, priced: 1 });
  });

  it('omits unavailable symbols instead of fabricating flat prices', async () => {
    const response = await GET(new Request(
      'http://localhost/api/stocks/quotes?symbols=MSFT,NOT_A_REAL_SYMBOL&market=NASDAQ',
    ));
    const body = await response.json();

    expect(body.quotes.MSFT).toBeDefined();
    expect(body.quotes.NOT_A_REAL_SYMBOL).toBeUndefined();
    expect(body).toMatchObject({ requested: 2, priced: 1 });
  });
});
