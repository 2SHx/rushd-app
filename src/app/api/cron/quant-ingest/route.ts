// src/app/api/cron/quant-ingest/route.ts — signed cron: MarketBar ingestion (mirrors cron/distribute).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Market } from '@prisma/client';
import { ingestBars } from '@/quant/data/ingest';
import { rejectUnauthorizedCron } from '@/lib/cronAuth';

const DEFAULT_SYMBOLS: Record<Market, string[]> = {
  NASDAQ: ['MSFT', 'NVDA'],
  TASI: ['2222', '1120'],
};

const bodySchema = z.object({
  symbols: z.array(z.string()).optional(),
  market: z.enum(['TASI', 'NASDAQ']).optional(),
});

/**
 * Shared by both verbs. `rawBody` is empty for GET: Vercel Cron issues GET and carries no body, and
 * every field of `bodySchema` is optional, so the scheduled call takes the defaults.
 */
async function handle(req: Request, rawBody: string) {
  try {
    const rejection = rejectUnauthorizedCron(req);
    if (rejection) return rejection;

    const parsed = bodySchema.safeParse(rawBody ? JSON.parse(rawBody) : {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }

    const markets: Market[] = parsed.data.market ? [parsed.data.market] : ['NASDAQ', 'TASI'];
    let processed = 0;
    let upserted = 0;

    for (const market of markets) {
      const symbols = parsed.data.symbols ?? DEFAULT_SYMBOLS[market];
      for (const symbol of symbols) {
        const result = await ingestBars(symbol, market);
        processed += 1;
        upserted += result.upserted;
      }
    }

    return NextResponse.json({ processed, upserted });
  } catch (err) {
    console.error('Quant ingestion cron failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return handle(req, await req.text());
}

/** Vercel Cron's verb. Same auth, same handler, no body. */
export async function GET(req: Request) {
  return handle(req, '');
}
