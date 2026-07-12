// src/quant/data/ingest.ts — Q0 ingestion: provider registry -> MarketBar (idempotent upsert).
// Offline-first: bundled mode uses MockProvider; network modes are explicit.
// answers via `registry.getProvider`; ingestion never hits the network directly.
import { Prisma } from '@prisma/client';
import type { Market, DataSource } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  registry,
  type MarketDataProvider,
  MockProvider,
  SahmkAdapter,
  AlpacaAdapter,
  YahooFinanceProvider,
} from '@/services/marketData';

const INITIAL_BACKFILL_DAYS = 90;
const OVERLAP_DAYS = 3;

/** Which adapter answered -> DataSource enum, for provenance on every bar. */
function sourceFor(provider: MarketDataProvider): DataSource {
  if (provider instanceof AlpacaAdapter) return 'ALPACA';
  if (provider instanceof SahmkAdapter) return 'SAHMK';
  if (provider instanceof YahooFinanceProvider) return 'YAHOO';
  if (provider instanceof MockProvider) return 'MOCK';
  return 'MOCK';
}

export async function ingestBars(
  symbol: string,
  market: Market,
  opts?: { days?: number },
): Promise<{ upserted: number; source: string }> {
  let provider = registry.getProvider(market);
  // Bypasses Alpaca free tier caps for deep historical NASDAQ runs
  if (process.env.MARKET_DATA_MODE === 'keyless' && market === 'NASDAQ' && opts?.days && opts.days > 365) {
    provider = new YahooFinanceProvider();
  }
  const source = sourceFor(provider);
  const latest = await prisma.marketBar.findFirst({
    where: { symbol, market, interval: 'DAY' },
    orderBy: { ts: 'desc' },
    select: { ts: true },
  });
  // Bundled candles are synthetic. Once seeded, avoid regenerating and rewriting
  // them on every scheduled run.
  if (latest && provider instanceof MockProvider) {
    return { upserted: 0, source };
  }
  const elapsedDays = latest
    ? Math.max(0, Math.floor(Date.now() / 86_400_000) - Math.floor(latest.ts.getTime() / 86_400_000))
    : 0;
  const days = latest ? elapsedDays + OVERLAP_DAYS : (opts?.days ?? INITIAL_BACKFILL_DAYS);
  const candles = await provider.getCandles(symbol, market, days);

  await prisma.$transaction(
    candles.map((c) => {
      const ts = new Date(`${c.time}T00:00:00.000Z`);
      const fields = {
        open: new Prisma.Decimal(c.open),
        high: new Prisma.Decimal(c.high),
        low: new Prisma.Decimal(c.low),
        close: new Prisma.Decimal(c.close),
        volume: new Prisma.Decimal(c.value ?? 0),
        source,
      };
      return prisma.marketBar.upsert({
        where: { symbol_market_interval_ts: { symbol, market, interval: 'DAY', ts } },
        create: { symbol, market, interval: 'DAY', ts, ...fields },
        update: fields,
      });
    }),
  );

  return { upserted: candles.length, source };
}

/** ~6 calendar years — comfortably covers the ≥252-trading-day/year target for the halal universe. */
export const BACKFILL_TARGET_DAYS = 365 * 6;

export interface BackfillResult {
  inserted: number;
  source: string;
  earliestBefore: Date | null;
  earliestAfter: Date | null;
}

export interface RangeRepairResult {
  upserted: number;
  returned: number;
  persisted: number;
  remainingMock: number;
  source: 'YAHOO';
  beforeBySource: Partial<Record<DataSource, number>>;
  afterBySource: Partial<Record<DataSource, number>>;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseRepairDay(value: string, name: string): Date {
  if (!ISO_DAY.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid YYYY-MM-DD date`);
  }
  return parsed;
}

function sourceCounts(rows: Array<{ source: DataSource; _count: { _all: number } }>): Partial<Record<DataSource, number>> {
  return Object.fromEntries(rows.map((row) => [row.source, row._count._all]));
}

/** Bounded Yahoo repair: fills holes and replaces any synthetic rows inside [from, to]. */
export async function repairBarsRange(
  symbol: string,
  market: Market,
  range: { from: string; to: string; now?: Date },
): Promise<RangeRepairResult> {
  if (market !== 'NASDAQ') throw new Error(`repairBarsRange only supports NASDAQ; got market=${market}`);
  const from = parseRepairDay(range.from, 'from');
  const to = parseRepairDay(range.to, 'to');
  const now = range.now ?? new Date();
  if (from > to) throw new Error('from must be on or before to');
  if (to.getTime() > now.getTime()) throw new Error('to must not be in the future');
  const maxTo = new Date(from);
  maxTo.setUTCFullYear(maxTo.getUTCFullYear() + 10);
  if (to > maxTo) {
    throw new Error('repair range must not exceed 10 years');
  }

  const where = { symbol, market, interval: 'DAY' as const, ts: { gte: from, lte: to } };
  const provider = new YahooFinanceProvider();
  const requestDays = Math.ceil((now.getTime() - from.getTime()) / DAY_MS) + 1;
  const providerCandles = await provider.getCandlesStrict(symbol, market, requestDays);
  const candles = providerCandles.filter((c) => {
    const ts = new Date(`${c.time}T00:00:00.000Z`);
    return ts >= from && ts <= to;
  });
  if (candles.length === 0) throw new Error(`Yahoo returned zero candles in range ${range.from}..${range.to} for ${symbol}`);

  return prisma.$transaction(async (tx) => {
    const before = await tx.marketBar.groupBy({ by: ['source'], where, _count: { _all: true } });
    for (const c of candles) {
      const ts = new Date(`${c.time}T00:00:00.000Z`);
      const fields = {
        open: new Prisma.Decimal(c.open), high: new Prisma.Decimal(c.high), low: new Prisma.Decimal(c.low),
        close: new Prisma.Decimal(c.close), volume: new Prisma.Decimal(c.value ?? 0), source: 'YAHOO' as const,
      };
      await tx.marketBar.upsert({
        where: { symbol_market_interval_ts: { symbol, market, interval: 'DAY', ts } },
        create: { symbol, market, interval: 'DAY', ts, ...fields }, update: fields,
      });
    }
    const [after, persistedRows] = await Promise.all([
      tx.marketBar.groupBy({ by: ['source'], where, _count: { _all: true } }),
      tx.marketBar.findMany({ where, select: { ts: true, source: true } }),
    ]);
    const unsupported = persistedRows.filter((row) => row.source !== 'YAHOO');
    if (unsupported.length) throw new Error(`repair verification failed: ${unsupported.length} non-YAHOO row(s) remain`);
    const persistedDates = new Set(persistedRows.map((row) => row.ts.toISOString().slice(0, 10)));
    const missing = candles.filter((c) => !persistedDates.has(c.time));
    if (missing.length) throw new Error(`repair verification failed: ${missing.length} Yahoo candle date(s) were not persisted`);
    const afterBySource = sourceCounts(after);
    return {
      upserted: candles.length, returned: candles.length, persisted: persistedRows.length,
      remainingMock: afterBySource.MOCK ?? 0, source: 'YAHOO' as const,
      beforeBySource: sourceCounts(before), afterBySource,
    };
  });
}

/**
 * Deep-history BACKWARDS backfill (QDR-6): the forward-only `ingestBars` cursor above never
 * looks earlier than the oldest stored bar, so once a symbol has *any* recent history it can
 * never grow deeper. This fills the gap explicitly: fetch a wide keyless-Yahoo window and keep
 * only candles strictly older than whatever is already stored, then `createMany` +
 * `skipDuplicates` — never an `update`, so an existing row (real or legacy MOCK) can never be
 * mutated or duplicated by this path. Idempotent: a rerun's fetched window has the same floor,
 * so after the first run every candle is no longer strictly older than the new earliest row,
 * and 0 rows are inserted.
 *
 * NASDAQ-only and keyless-only by design: this is the six-year real-history unlock, and Yahoo's
 * keyless chart endpoint is the only free source with years of daily history. Refuses to write
 * MOCK-sourced rows (hard user directive: no mock/synthetic bars from this path).
 */
export async function ingestBarsBackfill(
  symbol: string,
  market: Market,
  opts?: { days?: number },
): Promise<BackfillResult> {
  if (market !== 'NASDAQ') {
    throw new Error(`ingestBarsBackfill only supports NASDAQ (keyless Yahoo deep history); got market=${market}`);
  }
  const provider = new YahooFinanceProvider();
  const source = sourceFor(provider);
  if (source === 'MOCK') {
    // Unreachable given sourceFor(YahooFinanceProvider) === 'YAHOO', but this is the hard
    // no-mock-rows assertion the directive requires on every row this unit writes.
    throw new Error('ingestBarsBackfill refuses to write MOCK-sourced bars');
  }

  const earliest = await prisma.marketBar.findFirst({
    where: { symbol, market, interval: 'DAY' },
    orderBy: { ts: 'asc' },
    select: { ts: true },
  });
  const cutoff = earliest?.ts ?? null;

  const days = opts?.days ?? BACKFILL_TARGET_DAYS;
  const candles = await provider.getCandles(symbol, market, days);
  const olderCandles = cutoff
    ? candles.filter((c) => new Date(`${c.time}T00:00:00.000Z`) < cutoff)
    : candles;

  if (olderCandles.length === 0) {
    return { inserted: 0, source, earliestBefore: cutoff, earliestAfter: cutoff };
  }

  const rows = olderCandles.map((c) => ({
    symbol,
    market,
    interval: 'DAY' as const,
    ts: new Date(`${c.time}T00:00:00.000Z`),
    open: new Prisma.Decimal(c.open),
    high: new Prisma.Decimal(c.high),
    low: new Prisma.Decimal(c.low),
    close: new Prisma.Decimal(c.close),
    volume: new Prisma.Decimal(c.value ?? 0),
    source,
  }));

  const result = await prisma.marketBar.createMany({ data: rows, skipDuplicates: true });

  const newEarliest = await prisma.marketBar.findFirst({
    where: { symbol, market, interval: 'DAY' },
    orderBy: { ts: 'asc' },
    select: { ts: true },
  });

  return { inserted: result.count, source, earliestBefore: cutoff, earliestAfter: newEarliest?.ts ?? null };
}
