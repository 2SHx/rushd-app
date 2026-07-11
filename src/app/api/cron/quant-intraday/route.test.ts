import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ ingest: vi.fn(), snapshot: vi.fn() }));
vi.mock('@/quant/data/intraday', () => ({ ingestIntradayBars: h.ingest }));
vi.mock('@/quant/data/snapshot', () => ({ computeAndUpsertSnapshot: h.snapshot }));

import { POST } from './route';

function request(body?: string, secret = 'secret') {
  return new Request('http://localhost/api/cron/quant-intraday', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    body,
  });
}

describe('POST /api/cron/quant-intraday', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'secret';
    h.ingest.mockResolvedValue({ requested: 0, created: 0, source: 'ALPACA', tier: 'fixtures', latestTs: null, fixtureSnapshots: [] });
  });

  it('requires the cron secret', async () => {
    expect((await POST(request(undefined, 'wrong'))).status).toBe(401);
  });

  it('returns 400 for malformed JSON', async () => {
    expect((await POST(request('{'))).status).toBe(400);
  });

  it('normalizes symbols and snapshots only when real bars were observed', async () => {
    const latestTs = new Date('2026-07-06T20:00:00Z');
    h.ingest
      .mockResolvedValueOnce({ requested: 10, created: 10, source: 'ALPACA', tier: 'fixtures', latestTs, fixtureSnapshots: [] })
      .mockResolvedValueOnce({ requested: 0, created: 0, source: 'ALPACA', tier: 'fixtures', latestTs: null, fixtureSnapshots: [] });

    const response = await POST(request(JSON.stringify({ symbols: ['msft', 'aapl'] })));

    expect(response.status).toBe(200);
    expect(h.ingest).toHaveBeenNthCalledWith(1, 'MSFT', 'NASDAQ');
    expect(h.snapshot).toHaveBeenCalledTimes(1);
    expect(h.snapshot).toHaveBeenCalledWith('MSFT', 'NASDAQ', latestTs, 'ALPACA');
  });

  it('rejects unsafe ticker input', async () => {
    expect((await POST(request(JSON.stringify({ symbols: ['../AAPL'] })))).status).toBe(400);
    expect(h.ingest).not.toHaveBeenCalled();
  });

  it('builds historical fixture snapshots from captured prior-close and market-cap inputs', async () => {
    const fixture = {
      asOf: new Date('2021-01-27T21:00:00Z'), barsSource: 'ALPACA', priorClose: 5,
      mcap: 500_000_000, mcapSource: 'FUNDAMENTALS',
    };
    h.ingest.mockResolvedValue({
      requested: 100, created: 100, source: 'ALPACA', tier: 'fixtures',
      latestTs: fixture.asOf, fixtureSnapshots: [fixture],
    });

    const response = await POST(request(JSON.stringify({ symbols: ['AMC'] })));

    expect(response.status).toBe(200);
    expect(h.snapshot).toHaveBeenCalledWith('AMC', 'NASDAQ', fixture.asOf, 'ALPACA', fixture);
  });
});
