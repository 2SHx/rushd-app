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
import type {
  Market,
  BarInterval,
  MarketBar,
  Fundamentals,
  FundamentalsPeriod,
  NewsItem,
  IntradayBar,
  SymbolSnapshot,
} from '@prisma/client';

/**
 * `Fundamentals.period` (schema-level ANNUAL/QUARTERLY discriminator) is never optional at a call
 * site — mixing a 10-K in with "last N quarters" (or vice versa) is a silent correctness bug, not
 * a type error, so every reader must say which it wants. `ANNUAL_DEFAULT` is the safe fallback for
 * a caller that specifies nothing: it is the highest-coverage period (debt 53.9% vs 47.4%, cash
 * 96.0% vs 94.6% non-null on annual vs quarterly, measured 2026-08-20) and matches every reader's
 * behavior before the 2026-08-19 quarterly ingest, so an un-migrated caller sees byte-identical
 * results rather than a silent mix. A caller that specifically wants quarterly cadence (e.g. a
 * rolling AAOIFI rescreen, or "last 4 quarters" momentum) must pass `'QUARTERLY'` explicitly.
 */
export const ANNUAL_DEFAULT: FundamentalsPeriod = 'ANNUAL';

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

  /**
   * Latest fundamentals row public at-or-before `asOf`. `releasedAt` alone does not uniquely
   * order rows: two distinct fiscal-period filings can share the same `releasedAt` (e.g. a
   * catch-up filing day, or one `Fundamentals.releasedAt = max(filed)` landing on the same date
   * for two adjacent fiscal years). Deterministic secondary key: `asOf` (the fiscal period end)
   * descending. Because `@@unique([symbol, market, asOf])` guarantees no two rows share a
   * `(symbol, market, asOf)`, this two-key order is a total order — repeated reads over the same
   * data always return the same row (reproducibility, QUANT_DESIGN.md §2.2). The winner is the
   * row describing the MOST RECENTLY COMPLETED fiscal period among those that became public
   * simultaneously — the most current annual figure a decision-maker actually had in hand at
   * `asOf`, never an older, superseded fiscal year's row.
   *
   * `period` is REQUIRED-in-spirit, optional-in-signature: every existing caller of this method
   * passes it explicitly (see `loadPointInTimeContext`'s `fundamentalsPeriod` arg); the default
   * (`ANNUAL_DEFAULT`) only protects a future caller that forgets, so it fails safe (same period as
   * every pre-quarterly-ingest reader) rather than accidentally mixing 10-K and 10-Q rows. Never
   * omit `period` from the `where` clause — that is precisely the 2026-08-19 defect this guards.
   */
  async fundamentals(
    symbol: string,
    market: Market,
    asOf: Date,
    period: FundamentalsPeriod = ANNUAL_DEFAULT,
  ): Promise<Fundamentals | null> {
    const f = await prisma.fundamentals.findFirst({
      where: { symbol, market, period, releasedAt: { lte: asOf } },
      orderBy: [{ releasedAt: 'desc' }, { asOf: 'desc' }],
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
 * QDR-6 (G1): no-look-ahead accessor for the 1-minute intraday spine (`IntradayBar`) and its
 * derived rollup (`SymbolSnapshot`). Same contract as `PointInTimeStore`: nothing dated after
 * `asOf` is ever returned, enforced in the query AND asserted at runtime. This path bypasses
 * the 12h NASDAQ universe cache in `services/marketData.ts` on purpose — intraday screening
 * needs fresh-to-the-minute data, not a slow-changing symbol list.
 */
export class IntradayPointInTimeStore {
  async bars(symbol: string, market: Market, asOf: Date, lookbackMinutes?: number): Promise<IntradayBar[]> {
    const from = lookbackMinutes ? new Date(asOf.getTime() - lookbackMinutes * 60_000) : undefined;
    const rows = await prisma.intradayBar.findMany({
      where: {
        symbol,
        market,
        ts: { lte: asOf, ...(from ? { gt: from } : {}) },
      },
      orderBy: { ts: 'asc' },
    });
    return assertNoLookahead(rows, asOf, 'ts') as IntradayBar[];
  }

  /** Latest snapshot at-or-before `asOf` (mcap/float/premarket move/cumulative volume). */
  async snapshot(symbol: string, market: Market, asOf: Date): Promise<SymbolSnapshot | null> {
    const s = await prisma.symbolSnapshot.findFirst({
      where: { symbol, market, asOf: { lte: asOf } },
      orderBy: { asOf: 'desc' },
    });
    if (s) assertNoLookahead([s], asOf, 'asOf');
    return s;
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
  /** Latest fundamentals public at or before asOf, for the period `loadPointInTimeContext` was
   * loaded with (`fundamentalsPeriod`, default `ANNUAL_DEFAULT`). */
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
  /**
   * Which `Fundamentals.period` this context's single fundamentals row is drawn from. Default
   * `ANNUAL_DEFAULT` — every current consumer (the fundamental analyst, reasoning over a ~1y
   * holding horizon) wants the highest-coverage, most-stable annual figure, not a thinner-coverage
   * quarterly snapshot. Pass `'QUARTERLY'` explicitly for a caller that specifically wants
   * quarterly cadence.
   */
  fundamentalsPeriod?: FundamentalsPeriod;
}

/**
 * Pre-load a decision's data window once and hand back a sync context. All
 * no-look-ahead filtering happens during the load; the returned accessors only
 * slice already-vetted arrays, so an analyst cannot reach past `asOf`.
 */
export async function loadPointInTimeContext(args: LoadContextArgs): Promise<PointInTimeContext> {
  const { symbol, market, asOf, maxLookbackDays = 400, interval = 'DAY', fundamentalsPeriod = ANNUAL_DEFAULT } = args;
  const store = new PointInTimeStore(interval);
  const [allBars, fund, allNews] = await Promise.all([
    store.bars(symbol, market, asOf, maxLookbackDays),
    store.fundamentals(symbol, market, asOf, fundamentalsPeriod),
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
