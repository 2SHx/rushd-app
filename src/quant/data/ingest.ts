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
