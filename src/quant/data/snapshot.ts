// src/quant/data/snapshot.ts — QDR-6 (G1): derives `SymbolSnapshot` (mcap, premarket move %,
// cumulative volume) from the real `IntradayBar` spine + the existing `Fundamentals` model.
// Never hand-written: always computed from stored real bars. PIT-safe — reads never look past
// `asOf` (mirrors pointInTime.ts's `… lte asOf` + assertNoLookahead discipline).
import { Prisma } from '@prisma/client';
import type { Market, DataSource, IntradaySession } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertNoLookahead } from './pointInTime';

const D = Prisma.Decimal;
const marketDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** NASDAQ trading-date key, independent of the server's timezone and DST. */
export function nasdaqDateKey(ts: Date): string {
  const parts = marketDateFormatter.formatToParts(ts);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export interface BarLike {
  ts: Date;
  session: IntradaySession;
  close: Prisma.Decimal | number;
  volume: Prisma.Decimal | number;
}

/** Pure computation over already-vetted (≤asOf) bars: cumulative volume + premarket move %. */
export function computeIntradayMetrics(
  bars: readonly BarLike[],
  priorClose: number | null,
): { premarketMovePct: number | null; cumVolume: number } {
  const cumVolume = bars.reduce((sum, b) => sum + Number(b.volume), 0);
  const preBars = bars.filter((b) => b.session === 'PRE');
  let premarketMovePct: number | null = null;
  if (preBars.length && priorClose != null && priorClose !== 0) {
    const lastPre = preBars[preBars.length - 1];
    premarketMovePct = ((Number(lastPre.close) - priorClose) / priorClose) * 100;
  }
  return { premarketMovePct, cumVolume };
}

async function lookupMcap(
  symbol: string,
  market: Market,
  asOf: Date,
): Promise<{ mcap: number | null; mcapSource: DataSource | null }> {
  const fund = await prisma.fundamentals.findFirst({
    where: { symbol, market, releasedAt: { lte: asOf } },
    orderBy: { releasedAt: 'desc' },
  });
  if (fund) assertNoLookahead([fund], asOf, 'releasedAt');
  const metrics = fund?.metrics as Record<string, unknown> | undefined;
  const mcap = typeof metrics?.marketCap === 'number' ? (metrics.marketCap as number) : null;
  return mcap != null ? { mcap, mcapSource: 'FUNDAMENTALS' } : { mcap: null, mcapSource: null };
}

/**
 * Loads bars ≤ asOf for the trading day of `asOf`, the prior day's daily close (from the
 * existing `MarketBar` spine), computes metrics, and upserts `SymbolSnapshot`. `source`
 * records where `mcap` was resolved from (FUNDAMENTALS) or, absent that, the bars' own source —
 * always real provenance, never a fabricated tag.
 */
export async function computeAndUpsertSnapshot(
  symbol: string,
  market: Market,
  asOf: Date,
  barsSource: DataSource,
  fixture?: { priorClose: number | null; mcap: number | null; mcapSource: DataSource | null },
) {
  const tradingDate = nasdaqDateKey(asOf);
  const candidates = await prisma.intradayBar.findMany({
    // A 24-hour lower bound is intentionally broad; the Eastern-date filter below handles DST.
    where: { symbol, market, ts: { lte: asOf, gte: new Date(asOf.getTime() - 24 * 60 * 60 * 1000) } },
    orderBy: { ts: 'asc' },
  });
  assertNoLookahead(candidates, asOf, 'ts');
  const bars = candidates.filter((bar) => nasdaqDateKey(bar.ts) === tradingDate);
  if (bars.length === 0) return null;

  const prevDaily = fixture ? null : await prisma.marketBar.findFirst({
      where: { symbol, market, interval: 'DAY', ts: { lt: new Date(`${tradingDate}T00:00:00.000Z`) } },
      orderBy: { ts: 'desc' },
    });
  const priorClose = fixture ? fixture.priorClose : (prevDaily ? Number(prevDaily.close) : null);

  const { premarketMovePct, cumVolume } = computeIntradayMetrics(bars, priorClose);
  const storedMcap = fixture
    ? { mcap: fixture.mcap, mcapSource: fixture.mcapSource }
    : await lookupMcap(symbol, market, asOf);
  const { mcap, mcapSource } = storedMcap;

  return prisma.symbolSnapshot.upsert({
    where: { symbol_market_asOf: { symbol, market, asOf } },
    create: {
      symbol,
      market,
      asOf,
      mcap: mcap != null ? new D(mcap.toFixed(4)) : null,
      premarketMovePct: premarketMovePct != null ? new D(premarketMovePct.toFixed(4)) : null,
      cumVolume: new D(cumVolume.toFixed(4)),
      source: barsSource,
      mcapSource,
    },
    update: {
      mcap: mcap != null ? new D(mcap.toFixed(4)) : null,
      premarketMovePct: premarketMovePct != null ? new D(premarketMovePct.toFixed(4)) : null,
      cumVolume: new D(cumVolume.toFixed(4)),
      source: barsSource,
      mcapSource,
    },
  });
}
