// src/app/api/cron/quant-ingest/route.ts — signed cron: MarketBar ingestion (mirrors cron/distribute).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Market } from '@prisma/client';
import { ingestBars } from '@/quant/data/ingest';

const DEFAULT_SYMBOLS: Record<Market, string[]> = {
  NASDAQ: ['MSFT', 'NVDA'],
  TASI: ['2222', '1120'],
};

const bodySchema = z.object({
  symbols: z.array(z.string()).optional(),
  market: z.enum(['TASI', 'NASDAQ']).optional(),
});

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      console.error('CRON_SECRET environment variable is missing.');
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const raw = await req.text();
    const parsed = bodySchema.safeParse(raw ? JSON.parse(raw) : {});
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
