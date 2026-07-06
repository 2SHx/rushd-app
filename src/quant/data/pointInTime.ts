// Rushd Quant — point-in-time data access (Q0).
// The ONLY way an analyst or the backtester reads history. Every accessor returns
// records dated <= `asOf`, enforced twice: in the query (`… lte asOf`) and by a
// runtime assertion (`assertNoLookahead`). No look-ahead is the cardinal rule
// (skill: backtesting-rigor) — a leak here silently invalidates every backtest.
import { prisma } from '@/lib/prisma';
import type { Market, BarInterval, MarketBar, Fundamentals, NewsItem } from '@prisma/client';

/** Thrown when a record dated after `asOf` reaches a caller — a look-ahead bug. */
export class LookaheadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookaheadError';
  }
}

/**
 * Last line of defense: throw if any item's timestamp is strictly after `asOf`.
 * Belt-and-suspenders behind the query filter — a query bug that leaks a future
 * row is caught here rather than corrupting a decision.
 */
export function assertNoLookahead<T>(items: readonly T[], asOf: Date, tsKey: keyof T): readonly T[] {
  const cutoff = asOf.getTime();
  for (const item of items) {
    const ts = item[tsKey] as unknown;
    if (ts instanceof Date && ts.getTime() > cutoff) {
      throw new LookaheadError(
        `Look-ahead: ${String(tsKey)}=${ts.toISOString()} is after asOf=${asOf.toISOString()}`,
      );
    }
  }
  return items;
}

export interface BarQuery {
  /** Most recent N bars at or before asOf. Omit for all history. */
  lookback?: number;
  interval?: BarInterval;
}

/**
 * A read window frozen at `asOf`. Analysts receive one of these and must read
 * market history exclusively through it — never `prisma` directly, never a
 * "latest quote" call. That constraint is what makes strategies backtestable.
 */
export class PointInTimeContext {
  constructor(public readonly asOf: Date) {}

  /** OHLCV bars at or before asOf, returned oldest-first (chronological). */
  async getBars(symbol: string, market: Market, q: BarQuery = {}): Promise<MarketBar[]> {
    const interval: BarInterval = q.interval ?? 'DAY';
    const bars = await prisma.marketBar.findMany({
      where: { symbol, market, interval, ts: { lte: this.asOf } },
      orderBy: { ts: 'desc' },
      ...(q.lookback ? { take: q.lookback } : {}),
    });
    bars.reverse(); // desc (for `take`) -> chronological for analysts
    return assertNoLookahead(bars, this.asOf, 'ts') as MarketBar[];
  }

  /** Latest fundamentals whose data was public at or before asOf (by release date). */
  async getFundamentals(symbol: string, market: Market): Promise<Fundamentals | null> {
    const f = await prisma.fundamentals.findFirst({
      where: { symbol, market, releasedAt: { lte: this.asOf } },
      orderBy: { releasedAt: 'desc' },
    });
    if (f) assertNoLookahead([f], this.asOf, 'releasedAt');
    return f;
  }

  /** News published at or before asOf (optionally since a floor), newest-first. */
  async getNews(symbol: string, market: Market, since?: Date): Promise<NewsItem[]> {
    const news = await prisma.newsItem.findMany({
      where: {
        symbol,
        market,
        publishedAt: { lte: this.asOf, ...(since ? { gte: since } : {}) },
      },
      orderBy: { publishedAt: 'desc' },
    });
    return assertNoLookahead(news, this.asOf, 'publishedAt') as NewsItem[];
  }
}

/** Context for a live decision (asOf = now). Backtests construct their own per step. */
export function liveContext(): PointInTimeContext {
  return new PointInTimeContext(new Date());
}
