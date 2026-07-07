// GET /api/stocks/search?q=<query>&market=<TASI|NASDAQ>
// Symbol/English-name/Arabic-name substring search over the bundled + live
// stock universe (src/lib/stockUniverse.ts, src/services/marketData.ts).
// Auth: requireSession (401 if none). Rate-limited PER USER (mirrors
// /api/quant/execute — a global bucket would let one caller 429 everyone).
// Read-only: no Prisma writes, no quotes fetched here (those stay per-symbol
// via /api/market-data).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/authz';
import { TokenBucket, getStockUniverse } from '@/services/marketData';
import { searchUniverse } from '@/lib/stockUniverse';

const limiters = new Map<string, TokenBucket>();
function limiterFor(userId: string): TokenBucket {
  let bucket = limiters.get(userId);
  if (!bucket) {
    bucket = new TokenBucket(10, 1); // 10 burst, refills 1/sec
    limiters.set(userId, bucket);
  }
  return bucket;
}

const QuerySchema = z.object({
  q: z.string().min(1).max(60),
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
      q: searchParams.get('q') ?? '',
      market: searchParams.get('market'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { q, market } = parsed.data;

    const universe = await getStockUniverse(market);
    const results = searchUniverse(universe, q, 30);

    return NextResponse.json({ results });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: NextResponse }).response;
    }
    console.error('Error in /api/stocks/search:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
