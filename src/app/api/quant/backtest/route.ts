// POST /api/quant/backtest — run the deterministic PM-surrogate backtest over a date range
// and persist a BacktestRun (backtesting-rigor: never backtest the live LLM sizer). Auth:
// requireSession; rate-limited PER USER (mirrors /api/quant/execute).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Market } from '@prisma/client';
import { requireSession } from '@/lib/authz';
import { TokenBucket } from '@/services/marketData';
import { runBacktest } from '@/quant/backtest/engine';

const limiters = new Map<string, TokenBucket>();
function limiterFor(userId: string): TokenBucket {
  let bucket = limiters.get(userId);
  if (!bucket) {
    bucket = new TokenBucket(5, 0.1);
    limiters.set(userId, bucket);
  }
  return bucket;
}

const BodySchema = z
  .object({
    symbol: z.string().min(1).max(12),
    market: z.nativeEnum(Market),
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
    oosFraction: z.number().min(0).max(0.9).optional(),
  })
  .refine((b) => b.fromDate.getTime() < b.toDate.getTime(), {
    message: 'fromDate must be before toDate',
    path: ['fromDate'],
  });

export async function POST(req: Request) {
  try {
    const user = await requireSession();

    if (!limiterFor(user.id).tryAcquire()) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { symbol, market, fromDate, toDate, oosFraction } = parsed.data;

    const { backtestRunId, metrics, oosMetrics } = await runBacktest({
      symbol,
      market,
      fromDate,
      toDate,
      oosFraction,
    });

    return NextResponse.json({ backtestRunId, metrics, oosMetrics });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('quant backtest failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
