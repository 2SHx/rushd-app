import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/authz';
import { TokenBucket } from '@/services/marketData';
import { TICKERS } from '@/lib/tickers';

const limiters = new Map<string, TokenBucket>();
function limiterFor(userId: string): TokenBucket {
  let bucket = limiters.get(userId);
  if (!bucket) {
    bucket = new TokenBucket(60, 10); // 60 burst, refills 10/sec
    limiters.set(userId, bucket);
  }
  return bucket;
}

const QuerySchema = z.object({
  symbols: z.string().min(1).max(3000),
  market: z.enum(['TASI', 'NASDAQ']),
});

export async function GET(request: Request) {
  try {
    const user = await requireSession();

    if (!limiterFor(user.id).tryAcquire()) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      symbols: searchParams.get('symbols') ?? '',
      market: searchParams.get('market'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }

    const { symbols, market } = parsed.data;
    const symbolList = symbols.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

    if (symbolList.length === 0) {
      return NextResponse.json({ quotes: {} });
    }

    const quotes: Record<string, { symbol: string; price: number; change: number; pct: number }> = {};

    // Check if we can fetch from Alpaca for NASDAQ (and if api key is present)
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET ?? '';

    if (process.env.MARKET_DATA_MODE === 'live' && market === 'NASDAQ' && key && key !== 'fail') {
      try {
        const symbolsString = symbolList.join(',');
        const res = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbolsString}`, {
          headers: {
            'APCA-API-KEY-ID': key,
            'APCA-API-SECRET-KEY': secret,
          },
        });

        if (res.ok) {
          const data = await res.json();
          const snapshots = data.snapshots || {};

          symbolList.forEach(sym => {
            const snap = snapshots[sym];
            if (snap) {
              const price = snap.latestTrade?.p ?? snap.dailyBar?.c ?? 0;
              const prevClose = snap.prevDailyBar?.c ?? price;
              const change = price - prevClose;
              const pct = prevClose > 0 ? (change / prevClose) * 100 : 0;
              quotes[sym] = { symbol: sym, price, change, pct };
            } else {
              // Fallback to static TICKERS data if not found in Alpaca snapshot response
              const match = TICKERS.NASDAQ.find(t => t.symbol === sym);
              if (match) {
                quotes[sym] = { symbol: sym, price: match.price, change: match.change, pct: match.pct };
              } else {
                quotes[sym] = { symbol: sym, price: 100, change: 0, pct: 0 };
              }
            }
          });
          
          return NextResponse.json({ quotes }, {
            headers: {
              'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=30'
            }
          });
        }
      } catch (err) {
        console.error('Error fetching Alpaca snapshots for batch quotes:', err);
      }
    }

    // Default/fallback logic for TASI and NASDAQ (when offline/un-keyed)
    symbolList.forEach(sym => {
      const activeList = market === 'TASI' ? TICKERS.TASI : TICKERS.NASDAQ;
      const cleanSym = sym.replace('.SR', '');
      const match = activeList.find(t => t.symbol.toUpperCase().replace('.SR', '') === cleanSym);
      if (match) {
        quotes[sym] = { symbol: sym, price: match.price, change: match.change, pct: match.pct };
      } else {
        quotes[sym] = { symbol: sym, price: 100, change: 0, pct: 0 };
      }
    });

    return NextResponse.json({ quotes }, {
      headers: {
        'Cache-Control': 'public, s-maxage=45, stale-while-revalidate=30'
      }
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: NextResponse }).response;
    }
    console.error('Error in /api/stocks/quotes:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
