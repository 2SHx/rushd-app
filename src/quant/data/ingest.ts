// src/quant/data/ingest.ts — Q0 ingestion: provider registry -> MarketBar (idempotent upsert).
// Mock-first: with no API keys, YahooFinanceProvider (keyless) or MockProvider (test env)
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
  if (market === 'NASDAQ' && opts?.days && opts.days > 365) {
    provider = new YahooFinanceProvider();
  }
  const source = sourceFor(provider);
  const candles = await provider.getCandles(symbol, market, opts?.days ?? 90);

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
