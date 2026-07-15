// GET /api/market-data/bars?symbol=AAPL&market=NASDAQ&tf=1H
// Serves REAL stored bars resampled to the requested chart timeframe.
//
// Sources (MOCK rows are excluded everywhere):
// - Intraday tfs (5m…4H): IntradayBar minute bars (REGULAR session), aggregated
//   session-anchored per src/services/barAggregation.ts.
// - 1D/1W/1M: MarketBar daily rows; when the DB holds none for the symbol the
//   response is an honest empty set (`realData:false`) — the client keeps its
//   provider-supplied history as fallback and labels it. No bars are invented.
//
// `availableTfs` tells the client which intraday buttons to disable for
// symbols without real minute coverage.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  aggregateIntraday,
  aggregateDaily,
  isIntradayTimeframe,
  ALL_TIMEFRAMES,
  type Timeframe,
  type TimeframeBar,
} from '@/services/barAggregation';

// Per-timeframe raw-minute lookback (days). Bounded further by MAX_RAW_ROWS so
// a 2-year minute archive can never be dragged through one request.
const INTRADAY_LOOKBACK_DAYS: Record<string, number> = {
  '5m': 7,
  '15m': 21,
  '30m': 45,
  '1H': 120,
  '2H': 240,
  '4H': 365,
};
const MAX_RAW_ROWS = 75_000;
const DAILY_LOOKBACK_DAYS: Record<string, number> = { '1D': 366, '1W': 366 * 5, '1M': 366 * 9 };

const QuerySchema = z.object({
  symbol: z.string().min(1).max(12).regex(/^[A-Za-z0-9.\-^]+$/),
  market: z.enum(['TASI', 'NASDAQ']),
  tf: z.enum(ALL_TIMEFRAMES as [Timeframe, ...Timeframe[]]),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    symbol: searchParams.get('symbol') ?? '',
    market: searchParams.get('market') ?? '',
    tf: searchParams.get('tf') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }
  const { market, tf } = parsed.data;
  const symbol = parsed.data.symbol.toUpperCase();

  try {
    // One indexed probe: does this symbol have ANY real minute coverage?
    const intradayProbe = await prisma.intradayBar.findFirst({
      where: { symbol, market, source: { not: 'MOCK' } },
      select: { id: true },
    });
    const intradayAvailable = intradayProbe !== null;

    let bars: TimeframeBar[] = [];
    let source: string | null = null;

    if (isIntradayTimeframe(tf)) {
      if (intradayAvailable) {
        const from = new Date(Date.now() - INTRADAY_LOOKBACK_DAYS[tf] * 86_400_000);
        const rows = await prisma.intradayBar.findMany({
          where: { symbol, market, session: 'REGULAR', source: { not: 'MOCK' }, ts: { gte: from } },
          orderBy: { ts: 'desc' },
          take: MAX_RAW_ROWS,
          select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true },
        });
        rows.reverse();
        source = rows[rows.length - 1]?.source ?? null;
        bars = aggregateIntraday(
          rows.map((r) => ({
            ts: r.ts,
            open: Number(r.open),
            high: Number(r.high),
            low: Number(r.low),
            close: Number(r.close),
            volume: Number(r.volume),
          })),
          tf
        );
      }
    } else {
      const from = new Date(Date.now() - DAILY_LOOKBACK_DAYS[tf] * 86_400_000);
      const rows = await prisma.marketBar.findMany({
        where: { symbol, market, interval: 'DAY', source: { not: 'MOCK' }, ts: { gte: from } },
        orderBy: { ts: 'asc' },
        select: { ts: true, open: true, high: true, low: true, close: true, volume: true, source: true },
      });
      source = rows[rows.length - 1]?.source ?? null;
      const daily = rows.map((r) => ({
        day: r.ts,
        open: Number(r.open),
        high: Number(r.high),
        low: Number(r.low),
        close: Number(r.close),
        volume: Number(r.volume),
      }));
      bars =
        tf === '1D'
          ? daily.map((d) => ({ time: d.day.toISOString().slice(0, 10), open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume }))
          : aggregateDaily(daily, tf === '1W' ? 'week' : 'month');
    }

    return NextResponse.json(
      {
        symbol,
        market,
        tf,
        bars,
        realData: bars.length > 0,
        source,
        availableTfs: { intraday: intradayAvailable },
      },
      { headers: { 'Cache-Control': 'private, max-age=60' } }
    );
  } catch (error) {
    console.error(`/api/market-data/bars failed for ${symbol} ${tf}:`, error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
