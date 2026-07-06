// Rushd Quant — point-in-time data access (Q0). Contract: QUANT_DESIGN.md §2.2.
//
// Two layers:
//   • PointInTimeStore — async, DB-facing; the no-look-ahead filter (`… lte asOf`)
//     plus a runtime assertion. The only place that touches `prisma` for history.
//   • PointInTimeContext — the sync, symbol-bound view analysts receive. Data is
//     pre-loaded once by `loadPointInTimeContext`, so `bars(n)` etc. are synchronous
//     and an analyst can never issue an unbounded/live query mid-decision.
//
// No look-ahead is the cardinal rule (skill: backtesting-rigor): nothing dated after
// `asOf` is ever visible, enforced in the query AND asserted at runtime. Because every
// filter lives here, analyst code is byte-identical between live and backtest.
import { prisma } from '@/lib/prisma';
import type { Market, BarInterval, MarketBar, Fundamentals, NewsItem } from '@prisma/client';

/** Thrown when a record dated after `asOf` reaches a caller — a look-ahead bug. */
export class LookaheadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookaheadError';
  }
}

/** Last line of defense: throw if any item's timestamp is strictly after `asOf`. */
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

const DAY_MS = 86_400_000;

/** Low-level, no-look-ahead DB accessor. Async; used by the loader and by ingestion tests. */
export class PointInTimeStore {
  constructor(private readonly interval: BarInterval = 'DAY') {}

  async bars(symbol: string, market: Market, asOf: Date, lookbackDays?: number): Promise<MarketBar[]> {
    const from = lookbackDays ? new Date(asOf.getTime() - lookbackDays * DAY_MS) : undefined;
    const rows = await prisma.marketBar.findMany({
      where: {
        symbol,
        market,
        interval: this.interval,
        ts: { lte: asOf, ...(from ? { gt: from } : {}) },
      },
      orderBy: { ts: 'asc' },
    });
    return assertNoLookahead(rows, asOf, 'ts') as MarketBar[];
  }

  async fundamentals(symbol: string, market: Market, asOf: Date): Promise<Fundamentals | null> {
    const f = await prisma.fundamentals.findFirst({
      where: { symbol, market, releasedAt: { lte: asOf } },
      orderBy: { releasedAt: 'desc' },
    });
    if (f) assertNoLookahead([f], asOf, 'releasedAt');
    return f;
  }

  async news(symbol: string, market: Market, asOf: Date, sinceDays?: number): Promise<NewsItem[]> {
    const from = sinceDays ? new Date(asOf.getTime() - sinceDays * DAY_MS) : undefined;
    const rows = await prisma.newsItem.findMany({
      where: {
        symbol,
        market,
        publishedAt: { lte: asOf, ...(from ? { gt: from } : {}) },
      },
      orderBy: { publishedAt: 'desc' },
    });
    return assertNoLookahead(rows, asOf, 'publishedAt') as NewsItem[];
  }
}

/**
 * The sync, symbol-bound view an analyst reads through (QUANT_DESIGN.md §2.2).
 * `shariaVerdict()` and `portfolio()` join in Q3 / Q1 respectively.
 */
export interface PointInTimeContext {
  readonly symbol: string;
  readonly market: Market;
  readonly asOf: Date;
  /** Bars within the last `lookbackDays` calendar days, chronological. */
  bars(lookbackDays: number): MarketBar[];
  /** Latest fundamentals public at or before asOf. */
  fundamentals(): Fundamentals | null;
  /** News published within the last `sinceDays` days, newest-first. */
  news(sinceDays: number): NewsItem[];
}

export interface LoadContextArgs {
  symbol: string;
  market: Market;
  asOf: Date;
  /** Widest window any analyst will request (default 400d ≈ 252 trading days). */
  maxLookbackDays?: number;
  interval?: BarInterval;
}

/**
 * Pre-load a decision's data window once and hand back a sync context. All
 * no-look-ahead filtering happens during the load; the returned accessors only
 * slice already-vetted arrays, so an analyst cannot reach past `asOf`.
 */
export async function loadPointInTimeContext(args: LoadContextArgs): Promise<PointInTimeContext> {
  const { symbol, market, asOf, maxLookbackDays = 400, interval = 'DAY' } = args;
  const store = new PointInTimeStore(interval);
  const [allBars, fund, allNews] = await Promise.all([
    store.bars(symbol, market, asOf, maxLookbackDays),
    store.fundamentals(symbol, market, asOf),
    store.news(symbol, market, asOf, maxLookbackDays),
  ]);

  return {
    symbol,
    market,
    asOf,
    bars(lookbackDays: number): MarketBar[] {
      const from = asOf.getTime() - lookbackDays * DAY_MS;
      return allBars.filter((b) => b.ts.getTime() > from); // chronological (store sorts asc)
    },
    fundamentals: () => fund,
    news(sinceDays: number): NewsItem[] {
      const from = asOf.getTime() - sinceDays * DAY_MS;
      return allNews.filter((n) => n.publishedAt.getTime() > from); // newest-first (store sorts desc)
    },
  };
}
