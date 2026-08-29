import { describe, it, expect, vi, beforeEach, afterAll, afterEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
    $transaction: vi.fn(async (work: unknown) => typeof work === 'function'
      ? (work as (tx: unknown) => Promise<unknown>)(prisma)
      : Promise.all(work as Promise<unknown>[])),
  },
}));

vi.mock('@/services/marketData', async () => {
  const actual = await vi.importActual<typeof import('@/services/marketData')>('@/services/marketData');
  return {
    ...actual,
    registry: { getProvider: vi.fn() },
  };
});

import { prisma } from '@/lib/prisma';
import { MockProvider, registry, YahooFinanceProvider } from '@/services/marketData';
import { ingestBars, ingestBarsBackfill, repairBarsRange } from './ingest';
import { nasdaqIngestRoster, BENCHMARK_SYMBOLS } from '@/quant/universe/ingestRoster';

const D = Prisma.Decimal;
const candles = [
  { time: '2024-01-01', open: 100, high: 105, low: 99, close: 102, value: 1000 },
  { time: '2024-01-02', open: 102, high: 107, low: 101, close: 106, value: 1100 },
];

describe('ingestBars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.marketBar.findFirst as any).mockResolvedValue(null);
    const yahoo = new YahooFinanceProvider();
    yahoo.getCandles = vi.fn().mockResolvedValue(candles);
    (registry.getProvider as any).mockReturnValue(yahoo);
  });

  it('maps N candles to N upserts with Decimal fields and the unique-key where-clause', async () => {
    const res = await ingestBars('MSFT', 'NASDAQ');

    expect(res.upserted).toBe(2);
    expect(res.source).toBe('YAHOO');
    expect((registry.getProvider as any).mock.results[0].value.getCandles).toHaveBeenCalledWith('MSFT', 'NASDAQ', 90);
    expect(prisma.marketBar.upsert).toHaveBeenCalledTimes(2);
    const call0 = (prisma.marketBar.upsert as any).mock.calls[0][0];
    expect(call0.where).toEqual({
      symbol_market_interval_ts: {
        symbol: 'MSFT',
        market: 'NASDAQ',
        interval: 'DAY',
        ts: new Date('2024-01-01T00:00:00.000Z'),
      },
    });
    expect(call0.create.open).toEqual(new D(100));
    expect(call0.create.high).toEqual(new D(105));
    expect(call0.create.low).toEqual(new D(99));
    expect(call0.create.close).toEqual(new D(102));
    expect(call0.create.volume).toEqual(new D(1000));
    expect(call0.create.source).toBe('YAHOO');
    expect(call0.update.close).toEqual(new D(102));
  });

  it('re-running with the same candles issues the same upsert calls (idempotent by upsert semantics)', async () => {
    const first = await ingestBars('MSFT', 'NASDAQ');
    const second = await ingestBars('MSFT', 'NASDAQ');

    expect(first.upserted).toBe(2);
    expect(second.upserted).toBe(2);
    expect(prisma.marketBar.upsert).toHaveBeenCalledTimes(4);
    const call0 = (prisma.marketBar.upsert as any).mock.calls[0][0];
    const call2 = (prisma.marketBar.upsert as any).mock.calls[2][0];
    expect(call2.where).toEqual(call0.where);
  });

  it('defaults volume to 0 when the provider omits it', async () => {
    const yahoo = new YahooFinanceProvider();
    yahoo.getCandles = vi.fn().mockResolvedValue([{ time: '2024-01-01', open: 1, high: 2, low: 0.5, close: 1.5 }]);
    (registry.getProvider as any).mockReturnValue(yahoo);
    const res = await ingestBars('AAPL', 'NASDAQ');
    expect(res.upserted).toBe(1);
    const call0 = (prisma.marketBar.upsert as any).mock.calls[0][0];
    expect(call0.create.volume).toEqual(new D(0));
  });

  it('requests only a three-day overlap when the latest bar is current', async () => {
    vi.setSystemTime(new Date('2024-01-10T12:00:00Z'));
    (prisma.marketBar.findFirst as any).mockResolvedValue({ ts: new Date('2024-01-10T00:00:00Z') });
    const provider = (registry.getProvider as any).mock.results[0]?.value ?? new YahooFinanceProvider();
    provider.getCandles = vi.fn().mockResolvedValue(candles);
    (registry.getProvider as any).mockReturnValue(provider);

    await ingestBars('MSFT', 'NASDAQ');

    expect(provider.getCandles).toHaveBeenCalledWith('MSFT', 'NASDAQ', 3);
    vi.useRealTimers();
  });

  it('does not regenerate bundled mock bars after the initial seed', async () => {
    const provider = new MockProvider();
    provider.getCandles = vi.fn();
    (registry.getProvider as any).mockReturnValue(provider);
    (prisma.marketBar.findFirst as any).mockResolvedValue({ ts: new Date() });

    const result = await ingestBars('MSFT', 'NASDAQ');

    expect(result).toEqual({ upserted: 0, source: 'MOCK' });
    expect(provider.getCandles).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ingestBarsBackfill (BACKWARDS deep-history)', () => {
  const deepCandles = [
    { time: '2019-01-01', open: 10, high: 11, low: 9, close: 10.5, value: 500 },
    { time: '2019-01-02', open: 10.5, high: 12, low: 10, close: 11, value: 600 },
    { time: '2024-01-01', open: 100, high: 105, low: 99, close: 102, value: 1000 }, // == existing earliest
    { time: '2024-01-05', open: 103, high: 106, low: 101, close: 104, value: 900 }, // newer than existing earliest
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.marketBar.createMany as any).mockResolvedValue({ count: 0 });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('throws for a non-NASDAQ market', async () => {
    await expect(ingestBarsBackfill('2222', 'TASI')).rejects.toThrow(/only supports NASDAQ/);
    expect(prisma.marketBar.createMany).not.toHaveBeenCalled();
  });

  it('inserts only candles strictly older than the existing earliest bar, never touching or duplicating it', async () => {
    (prisma.marketBar.findFirst as any)
      .mockResolvedValueOnce({ ts: new Date('2024-01-01T00:00:00.000Z') }) // earliest-before lookup
      .mockResolvedValueOnce({ ts: new Date('2019-01-01T00:00:00.000Z') }); // earliest-after lookup
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue(deepCandles);
    (prisma.marketBar.createMany as any).mockResolvedValue({ count: 2 });

    const result = await ingestBarsBackfill('AAPL', 'NASDAQ');

    expect(result).toMatchObject({
      inserted: 2,
      source: 'YAHOO',
      earliestBefore: new Date('2024-01-01T00:00:00.000Z'),
      earliestAfter: new Date('2019-01-01T00:00:00.000Z'),
    });
    const call = (prisma.marketBar.createMany as any).mock.calls[0][0];
    expect(call.skipDuplicates).toBe(true);
    const insertedDates = call.data.map((r: any) => r.ts.toISOString().slice(0, 10));
    expect(insertedDates).toEqual(['2019-01-01', '2019-01-02']); // strictly older only, no 2024-01-01/05
    expect(call.data.every((r: any) => r.source === 'YAHOO')).toBe(true);
  });

  it('inserts everything when no existing bars are stored', async () => {
    (prisma.marketBar.findFirst as any).mockResolvedValueOnce(null).mockResolvedValueOnce({ ts: new Date('2019-01-01T00:00:00.000Z') });
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue(deepCandles);
    (prisma.marketBar.createMany as any).mockResolvedValue({ count: 4 });

    const result = await ingestBarsBackfill('AAPL', 'NASDAQ');
    expect(result.inserted).toBe(4);
    expect((prisma.marketBar.createMany as any).mock.calls[0][0].data).toHaveLength(4);
  });

  it('is idempotent: a second run with the same fetched window inserts 0 rows and issues no createMany call', async () => {
    (prisma.marketBar.findFirst as any).mockResolvedValue({ ts: new Date('2019-01-01T00:00:00.000Z') }); // already the oldest candle
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue(deepCandles);

    const result = await ingestBarsBackfill('AAPL', 'NASDAQ');

    expect(result.inserted).toBe(0);
    expect(prisma.marketBar.createMany).not.toHaveBeenCalled();
  });
});

describe('repairBarsRange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.marketBar.groupBy as any)
      .mockResolvedValueOnce([{ source: 'MOCK', _count: { _all: 1 } }])
      .mockResolvedValueOnce([{ source: 'YAHOO', _count: { _all: 2 } }]);
    (prisma.marketBar.findMany as any).mockResolvedValue([
      { ts: new Date('2024-01-01T00:00:00.000Z'), source: 'YAHOO' },
      { ts: new Date('2024-01-02T00:00:00.000Z'), source: 'YAHOO' },
    ]);
  });

  it('fills holes, replaces MOCK rows, and restricts reads and writes to the inclusive range', async () => {
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue([
      { time: '2023-12-29', open: 1, high: 2, low: 1, close: 2, value: 10 },
      ...candles,
      { time: '2024-01-03', open: 3, high: 4, low: 2, close: 3, value: 20 },
    ]);

    const result = await repairBarsRange('GOOGL', 'NASDAQ', {
      from: '2024-01-01', to: '2024-01-02', now: new Date('2024-01-10T00:00:00.000Z'),
    });

    expect(result).toEqual({ upserted: 2, returned: 2, persisted: 2, remainingMock: 0, source: 'YAHOO', beforeBySource: { MOCK: 1 }, afterBySource: { YAHOO: 2 } });
    expect(YahooFinanceProvider.prototype.getCandlesStrict).toHaveBeenCalledWith('GOOGL', 'NASDAQ', 10);
    expect(prisma.marketBar.groupBy).toHaveBeenCalledTimes(2);
    expect((prisma.marketBar.groupBy as any).mock.calls[0][0].where.ts).toEqual({
      gte: new Date('2024-01-01T00:00:00.000Z'), lte: new Date('2024-01-02T00:00:00.000Z'),
    });
    expect(prisma.marketBar.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.marketBar.deleteMany).toHaveBeenCalledWith({ where: {
      symbol: 'GOOGL', market: 'NASDAQ', interval: 'DAY',
      ts: { gte: new Date('2024-01-01T00:00:00.000Z'), lte: new Date('2024-01-02T00:00:00.000Z') },
      source: { not: 'YAHOO' },
    } });
    for (const [{ create, update }] of (prisma.marketBar.upsert as any).mock.calls) {
      expect(create.source).toBe('YAHOO');
      expect(update.source).toBe('YAHOO');
      expect(create.ts >= new Date('2024-01-01T00:00:00.000Z') && create.ts <= new Date('2024-01-02T00:00:00.000Z')).toBe(true);
    }
  });

  it('rejects invalid, reversed, future, and overlong ranges before querying', async () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    await expect(repairBarsRange('AAPL', 'NASDAQ', { from: '2024-02-30', to: '2024-03-01', now })).rejects.toThrow(/valid/);
    await expect(repairBarsRange('AAPL', 'NASDAQ', { from: '2024-02-02', to: '2024-02-01', now })).rejects.toThrow(/on or before/);
    await expect(repairBarsRange('AAPL', 'NASDAQ', { from: '2025-01-01', to: '2025-01-02', now })).rejects.toThrow(/future/);
    await expect(repairBarsRange('AAPL', 'NASDAQ', { from: '2010-01-01', to: '2020-01-02', now })).rejects.toThrow(/10 years/);
    expect(prisma.marketBar.groupBy).not.toHaveBeenCalled();
  });

  it('fails without writing when Yahoo returns no in-range candles', async () => {
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue([]);
    await expect(repairBarsRange('AAPL', 'NASDAQ', {
      from: '2024-01-01', to: '2024-01-02', now: new Date('2024-01-10T00:00:00.000Z'),
    })).rejects.toThrow(/zero candles/);
    expect(prisma.marketBar.upsert).not.toHaveBeenCalled();
  });

  it('propagates strict Yahoo failure without writing, even for a one-weekday range', async () => {
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockRejectedValue(new Error('Yahoo unavailable'));
    await expect(repairBarsRange('AAPL', 'NASDAQ', {
      from: '2024-01-02', to: '2024-01-02', now: new Date('2024-01-10T00:00:00.000Z'),
    })).rejects.toThrow(/Yahoo unavailable/);
    expect(prisma.marketBar.upsert).not.toHaveBeenCalled();
  });

  it('throws inside the transaction if bounded cleanup leaves a residual MOCK row', async () => {
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue(candles);
    (prisma.marketBar.findMany as any).mockResolvedValue([
      { ts: new Date('2024-01-01T00:00:00.000Z'), source: 'YAHOO' },
      { ts: new Date('2024-01-02T00:00:00.000Z'), source: 'MOCK' },
    ]);
    await expect(repairBarsRange('AAPL', 'NASDAQ', {
      from: '2024-01-01', to: '2024-01-02', now: new Date('2024-01-10'),
    })).rejects.toThrow(/non-YAHOO/);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
  });

  it('throws inside the transaction when a returned Yahoo date is missing after persistence', async () => {
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue(candles);
    (prisma.marketBar.findMany as any).mockResolvedValue([
      { ts: new Date('2024-01-01T00:00:00.000Z'), source: 'YAHOO' },
    ]);
    await expect(repairBarsRange('AAPL', 'NASDAQ', {
      from: '2024-01-01', to: '2024-01-02', now: new Date('2024-01-10'),
    })).rejects.toThrow(/not persisted/);
  });

  it('is idempotent by issuing identical unique-key upserts on rerun', async () => {
    vi.spyOn(YahooFinanceProvider.prototype, 'getCandlesStrict').mockResolvedValue(candles);
    await repairBarsRange('AAPL', 'NASDAQ', { from: '2024-01-01', to: '2024-01-02', now: new Date('2024-01-10') });
    (prisma.marketBar.groupBy as any)
      .mockResolvedValueOnce([{ source: 'YAHOO', _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ source: 'YAHOO', _count: { _all: 2 } }]);
    await repairBarsRange('AAPL', 'NASDAQ', { from: '2024-01-01', to: '2024-01-02', now: new Date('2024-01-10') });
    expect((prisma.marketBar.upsert as any).mock.calls[2][0].where).toEqual((prisma.marketBar.upsert as any).mock.calls[0][0].where);
    expect((prisma.marketBar.upsert as any).mock.calls[3][0].where).toEqual((prisma.marketBar.upsert as any).mock.calls[1][0].where);
  });
});

describe('POST /api/cron/quant-ingest', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.marketBar.findFirst as any).mockResolvedValue(null);
    const yahoo = new YahooFinanceProvider();
    yahoo.getCandles = vi.fn().mockResolvedValue(candles);
    (registry.getProvider as any).mockReturnValue(yahoo);
    process.env.CRON_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('401s without a valid Bearer token', async () => {
    const { POST } = await import('@/app/api/cron/quant-ingest/route');
    const res = await POST(new Request('http://x/api/cron/quant-ingest', { method: 'POST' }));
    expect(res.status).toBe(401);
  });

  it('500s when CRON_SECRET is unset', async () => {
    delete process.env.CRON_SECRET;
    const { POST } = await import('@/app/api/cron/quant-ingest/route');
    const res = await POST(new Request('http://x/api/cron/quant-ingest', { method: 'POST' }));
    expect(res.status).toBe(500);
  });

  /**
   * The scheduled call carries NO body, so this default IS the scheduled behaviour. It used to be
   * `['MSFT','NVDA']` plus TASI — four symbols — while the momentum engine trades a sleeve drawn
   * from the verified universe. The count is derived from `buildVerifiedUniverse()` rather than
   * hardcoded, because a literal would silently drift out of step with the engine's own roster and
   * nothing at runtime would notice: the job reports success either way.
   */
  it('processes the engine\'s verified NASDAQ universe with a valid secret', async () => {
    const { buildVerifiedUniverse } = await import('@/quant/universe/buildVerifiedUniverse');
    // The scheduled default is the INGEST ROSTER, not the screened universe alone: it adds the
    // benchmark ETFs (SPUS, HLAL), without which no benchmark-relative result can be computed at
    // all. Comparing against `buildVerifiedUniverse().entries.length` omitted those two and left
    // this test asserting 216 against a correct 218.
    const expected = nasdaqIngestRoster().length;
    expect(expected).toBeGreaterThan(200);
    expect(expected).toBe(buildVerifiedUniverse().entries.length + BENCHMARK_SYMBOLS.length);

    const { POST } = await import('@/app/api/cron/quant-ingest/route');
    const res = await POST(
      new Request('http://x/api/cron/quant-ingest', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    // NASDAQ only: TASI is out of scope for this program and no longer in the scheduled default.
    expect(body.processed).toBe(expected);
    expect(body.upserted).toBe(expected * 2); // 2 candles per symbol in the mock feed
  });

  it('answers GET, the verb Vercel Cron actually sends', async () => {
    const { GET } = await import('@/app/api/cron/quant-ingest/route');
    const res = await GET(
      new Request('http://x/api/cron/quant-ingest', {
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
  });
});

/**
 * SYNTHETIC BARS MUST NEVER REACH THE DATABASE.
 *
 * `MockProvider` fabricates candles instead of failing, so a caller with no credentials visible
 * receives plausible prices and a success response. The original guard only fired when bars ALREADY
 * existed for the symbol — it stopped an existing series being overwritten, but a symbol with no
 * bars yet was seeded entirely with invented data.
 *
 * That hole was exercised on 2026-08-29: a direct `npx tsx -e` call (which does NOT load `.env`, so
 * the registry fell back to MockProvider) wrote 61 fabricated INOD bars at ~$381 for a stock trading
 * near $50, reporting `{"upserted":61,"source":"MOCK"}`. It was the SECOND occurrence of this exact
 * incident in this repository — the first left 64 MOCK rows that had already defeated the preflight's
 * own freshness check.
 *
 * A 503 guard exists in the quant-ingest cron route, but that protects ONE caller. These tests pin
 * the refusal at the only place that writes, so routes, scripts, tests and shell one-offs all
 * inherit it.
 */
describe('ingestBars refuses to persist fabricated candles', () => {
  const saved = process.env.ALLOW_SYNTHETIC_BARS;
  // This is a SIBLING describe, so the outer block's clearAllMocks does not run for it. Without
  // this the $transaction spy still carries the 218 calls from the route test above, and
  // "did not write" assertions silently inherit another test's history.
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOW_SYNTHETIC_BARS;
    else process.env.ALLOW_SYNTHETIC_BARS = saved;
  });

  it('throws for a symbol with NO existing bars — the case the old guard missed', async () => {
    delete process.env.ALLOW_SYNTHETIC_BARS;
    (registry.getProvider as any).mockReturnValue(new MockProvider());
    (prisma.marketBar.findFirst as any).mockResolvedValue(null); // the hole: no bars yet
    await expect(ingestBars('ZZZZ_NEW_SYMBOL', 'NASDAQ')).rejects.toThrow(/Refusing to write synthetic bars/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('names the remedy, including the `npx tsx -e` trap that caused both incidents', async () => {
    delete process.env.ALLOW_SYNTHETIC_BARS;
    (registry.getProvider as any).mockReturnValue(new MockProvider());
    (prisma.marketBar.findFirst as any).mockResolvedValue(null);
    await expect(ingestBars('ZZZZ_NEW_SYMBOL', 'NASDAQ')).rejects.toThrow(/ALPACA_API_KEY|MARKET_DATA_MODE/);
    await expect(ingestBars('ZZZZ_NEW_SYMBOL', 'NASDAQ')).rejects.toThrow(/does NOT load \.env/);
  });

  it('permits synthetic candles only when explicitly opted in', async () => {
    process.env.ALLOW_SYNTHETIC_BARS = '1';
    const mock = new MockProvider();
    mock.getCandles = vi.fn().mockResolvedValue(candles);
    (registry.getProvider as any).mockReturnValue(mock);
    (prisma.marketBar.findFirst as any).mockResolvedValue(null);
    await expect(ingestBars('ZZZZ_NEW_SYMBOL', 'NASDAQ')).resolves.toBeDefined();
  });
});
