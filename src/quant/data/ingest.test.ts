import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findFirst: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
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
import { ingestBars } from './ingest';

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

  it('processes the default symbol set per market with a valid secret', async () => {
    const { POST } = await import('@/app/api/cron/quant-ingest/route');
    const res = await POST(
      new Request('http://x/api/cron/quant-ingest', {
        method: 'POST',
        headers: { Authorization: 'Bearer test-secret' },
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.processed).toBe(4); // MSFT, NVDA, 2222, 1120
    expect(body.upserted).toBe(8); // 4 symbols * 2 candles each
  });
});
