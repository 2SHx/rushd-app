import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  createMany: vi.fn(),
  loadFixturesForSymbol: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { intradayBar: { findFirst: h.findFirst, createMany: h.createMany } },
}));
vi.mock('./fixtureLoader', () => ({ loadFixturesForSymbol: h.loadFixturesForSymbol }));

import { ingestIntradayBars, ingestIntradayBarsForDay, ingestIntradayBarsBackfill, selectIntradayTier, sessionForTs } from './intraday';

describe('intraday data tiers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.MARKET_DATA_MODE;
    delete process.env.ALPACA_API_KEY;
    h.findFirst.mockResolvedValue(null);
    h.createMany.mockResolvedValue({ count: 0 });
    h.loadFixturesForSymbol.mockReturnValue([]);
  });

  it('requires explicit live mode for Alpaca', () => {
    process.env.ALPACA_API_KEY = 'configured';
    expect(selectIntradayTier()).toBe('fixtures');
    process.env.MARKET_DATA_MODE = 'keyless';
    expect(selectIntradayTier()).toBe('yahoo');
    process.env.MARKET_DATA_MODE = 'live';
    expect(selectIntradayTier()).toBe('alpaca');
  });

  it('classifies Eastern sessions across daylight-saving time', () => {
    expect(sessionForTs(new Date('2026-07-06T13:29:00Z'))).toBe('PRE');
    expect(sessionForTs(new Date('2026-07-06T13:30:00Z'))).toBe('REGULAR');
    expect(sessionForTs(new Date('2026-07-06T20:00:00Z'))).toBe('POST');
  });

  it('preserves real fixture provenance and reports the latest observed timestamp', async () => {
    h.loadFixturesForSymbol.mockReturnValue([{
      source: 'YAHOO',
      verification: { priorClose: 100 },
      fundamentals: { marketCap: 1_000_000 },
      bars: [
        { ts: '2026-07-06T13:30:00.000Z', open: 1, high: 2, low: 1, close: 2, volume: 10, session: 'REGULAR' },
        { ts: '2026-07-06T13:31:00.000Z', open: 2, high: 3, low: 2, close: 3, volume: 20, session: 'REGULAR' },
      ],
    }]);
    h.createMany.mockResolvedValue({ count: 2 });

    const result = await ingestIntradayBars('MSFT', 'NASDAQ');

    expect(result).toMatchObject({ requested: 2, created: 2, source: 'YAHOO', tier: 'fixtures' });
    expect(result.latestTs).toEqual(new Date('2026-07-06T13:32:00.000Z'));
    expect(result.fixtureSnapshots[0]).toMatchObject({
      barsSource: 'YAHOO', priorClose: 100, mcap: 1_000_000, mcapSource: 'FUNDAMENTALS',
    });
    expect(h.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
  });

  it('returns no snapshot timestamp when bundled fixtures are absent', async () => {
    await expect(ingestIntradayBars('MSFT', 'NASDAQ')).resolves.toMatchObject({
      requested: 0, created: 0, tier: 'fixtures', latestTs: null, fixtureSnapshots: [],
    });
    expect(h.createMany).not.toHaveBeenCalled();
  });

  it('performs no I/O for unsupported TASI ingestion', async () => {
    const result = await ingestIntradayBars('2222', 'TASI');
    expect(result.tier).toBe('unsupported-market');
    expect(result.latestTs).toBeNull();
    expect(h.loadFixturesForSymbol).not.toHaveBeenCalled();
  });

  it('uses a 90-day initial Alpaca window and a 60-minute resumable overlap', async () => {
    process.env.MARKET_DATA_MODE = 'live';
    process.env.ALPACA_API_KEY = 'key';
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ bars: { MSFT: [] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const now = new Date('2026-07-11T12:00:00.000Z');

    await ingestIntradayBars('MSFT', 'NASDAQ', { now });
    let url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.searchParams.get('start')).toBe('2026-04-12T12:00:00.000Z');

    h.findFirst.mockResolvedValue({ ts: new Date('2026-07-11T10:30:00.000Z') });
    fetchMock.mockClear();
    await ingestIntradayBars('MSFT', 'NASDAQ', { now });
    url = new URL(fetchMock.mock.calls[0][0] as URL);
    expect(url.searchParams.get('start')).toBe('2026-07-11T09:30:00.000Z');
  });

  it('normalizes provider minute-start timestamps to completed-bar PIT timestamps', async () => {
    process.env.MARKET_DATA_MODE = 'live';
    process.env.ALPACA_API_KEY = 'key';
    h.createMany.mockResolvedValue({ count: 1 });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      bars: { MSFT: [{ t: '2026-07-06T13:30:00.000Z', o: 1, h: 2, l: 1, c: 2, v: 10 }] },
    }), { status: 200 })));

    await ingestIntradayBars('MSFT', 'NASDAQ', { now: new Date('2026-07-06T14:00:00Z') });

    const row = h.createMany.mock.calls[0][0].data[0];
    expect(row.ts).toEqual(new Date('2026-07-06T13:31:00.000Z'));
    expect(row.session).toBe('REGULAR');
  });

  describe('ingestIntradayBarsForDay (candidate-list single-day backfill)', () => {
    it('performs no I/O for unsupported TASI ingestion', async () => {
      const result = await ingestIntradayBarsForDay('2222', 'TASI', '2026-07-06');
      expect(result.tier).toBe('unsupported-market');
      expect(h.createMany).not.toHaveBeenCalled();
    });

    it('requires explicit live Alpaca mode', async () => {
      await expect(ingestIntradayBarsForDay('MSFT', 'NASDAQ', '2026-07-06')).rejects.toThrow(/live Alpaca mode/);
    });

    it.each([
      ['2026-07-06', '2026-07-06T08:00:00.000Z', '2026-07-07T00:00:00.000Z'],
      ['2026-01-06', '2026-01-06T09:00:00.000Z', '2026-01-07T01:00:00.000Z'],
    ])('requests exactly 04:00-20:00 ET on %s across DST', async (dateKey, expectedStart, expectedEnd) => {
      process.env.MARKET_DATA_MODE = 'live';
      process.env.ALPACA_API_KEY = 'key';
      h.createMany.mockResolvedValue({ count: 1 });
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        bars: { MSFT: [{ t: '2026-07-06T13:30:00.000Z', o: 1, h: 2, l: 1, c: 2, v: 10 }] },
      }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      const result = await ingestIntradayBarsForDay('MSFT', 'NASDAQ', dateKey);

      const url = new URL(fetchMock.mock.calls[0][0] as URL);
      expect(url.searchParams.get('start')).toBe(expectedStart);
      expect(url.searchParams.get('end')).toBe(expectedEnd);
      expect(result).toMatchObject({ requested: 1, created: 1, source: 'ALPACA', tier: 'alpaca' });
      expect(h.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    });

    it('is idempotent: a rerun over stored bars reports 0 new rows via skipDuplicates', async () => {
      process.env.MARKET_DATA_MODE = 'live';
      process.env.ALPACA_API_KEY = 'key';
      h.createMany.mockResolvedValue({ count: 0 }); // simulates every row already existing
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
        bars: { MSFT: [{ t: '2026-07-06T13:30:00.000Z', o: 1, h: 2, l: 1, c: 2, v: 10 }] },
      }), { status: 200 })));

      const result = await ingestIntradayBarsForDay('MSFT', 'NASDAQ', '2026-07-06');
      expect(result).toMatchObject({ requested: 1, created: 0 });
    });
  });

  describe('ingestIntradayBarsBackfill (BACKWARDS deep-history)', () => {
    it('performs no I/O for unsupported TASI ingestion', async () => {
      const result = await ingestIntradayBarsBackfill('2222', 'TASI');
      expect(result).toEqual({ requested: 0, created: 0, chunks: 0, earliestBefore: null, earliestAfter: null });
      expect(h.findFirst).not.toHaveBeenCalled();
    });

    it('requires explicit live Alpaca mode', async () => {
      await expect(ingestIntradayBarsBackfill('MSFT', 'NASDAQ')).rejects.toThrow(/live Alpaca mode/);
    });

    it('walks backward in chunks from the existing earliest bar down to the target floor, never mutating existing rows', async () => {
      process.env.MARKET_DATA_MODE = 'live';
      process.env.ALPACA_API_KEY = 'key';
      const now = new Date('2026-07-11T12:00:00.000Z');
      const earliestStored = new Date('2026-05-01T09:31:00.000Z'); // 71 days back from `now`
      h.findFirst
        .mockResolvedValueOnce({ ts: earliestStored }) // earliest-before
        .mockResolvedValueOnce({ ts: new Date('2026-03-01T09:31:00.000Z') }); // earliest-after
      h.createMany.mockResolvedValue({ count: 1 });
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        bars: { MSFT: [{ t: '2026-03-01T09:30:00.000Z', o: 1, h: 2, l: 1, c: 2, v: 10 }] },
      }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      // 100-day target from `now`, chunked at 80 days: one chunk from (now-100d) to (earliest-1ms).
      const result = await ingestIntradayBarsBackfill('MSFT', 'NASDAQ', { days: 100, now });

      expect(result.chunks).toBe(1);
      expect(result.requested).toBe(1);
      expect(result.created).toBe(1);
      expect(result.earliestBefore).toEqual(earliestStored);
      const url = new URL(fetchMock.mock.calls[0][0] as URL);
      expect(new Date(url.searchParams.get('end')!).getTime()).toBe(earliestStored.getTime() - 1);
      // createMany is only ever called with fresh rows via skipDuplicates — never an update call exists on this model.
      expect(h.createMany).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
    });

    it('makes multiple chunked requests when the target window exceeds the per-chunk cap', async () => {
      process.env.MARKET_DATA_MODE = 'live';
      process.env.ALPACA_API_KEY = 'key';
      const now = new Date('2026-07-11T12:00:00.000Z');
      h.findFirst.mockResolvedValue(null); // nothing stored yet
      h.createMany.mockResolvedValue({ count: 0 });
      const fetchMock = vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify({ bars: { MSFT: [] } }), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      // 200-day target, 80-day chunks => 3 chunks (80 + 80 + 40).
      const result = await ingestIntradayBarsBackfill('MSFT', 'NASDAQ', { days: 200, now });

      expect(result.chunks).toBe(3);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('is idempotent: rerunning from the deepened earliest bar requests 0 further chunks once the floor is reached', async () => {
      process.env.MARKET_DATA_MODE = 'live';
      process.env.ALPACA_API_KEY = 'key';
      const now = new Date('2026-07-11T12:00:00.000Z');
      const floorReached = new Date(now.getTime() - 100 * 86_400_000 + 1);
      h.findFirst.mockResolvedValue({ ts: floorReached }); // already sitting at the target floor
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await ingestIntradayBarsBackfill('MSFT', 'NASDAQ', { days: 100, now });

      expect(result.chunks).toBe(0);
      expect(result.requested).toBe(0);
      expect(result.created).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
