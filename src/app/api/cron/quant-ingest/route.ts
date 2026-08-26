// src/app/api/cron/quant-ingest/route.ts — signed cron: MarketBar ingestion (mirrors cron/distribute).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Market } from '@prisma/client';
import { ingestBars } from '@/quant/data/ingest';
import { rejectUnauthorizedCron } from '@/lib/cronAuth';
import { buildVerifiedUniverse } from '@/quant/universe/buildVerifiedUniverse';
import { captureUniverseMembership } from '@/quant/universe/captureMembership';

/**
 * The engine's OWN universe, not a hand-kept list.
 *
 * This was `['MSFT','NVDA']` — a two-symbol stub — so a scheduled bodyless call ingested two names
 * while the momentum engine trades a sleeve drawn from 217. `buildVerifiedUniverse()` is the exact
 * function `runLab` uses to resolve that sleeve (runLab.ts:1701), so deriving from it means the
 * ingest roster cannot drift from what the strategy actually consumes.
 *
 * TASI is deliberately absent from the scheduled default: this program is NASDAQ-only by owner
 * directive. The `market` body field still accepts it for explicit manual invocation.
 */
function defaultNasdaqSymbols(): string[] {
  return buildVerifiedUniverse().entries.map((entry) => entry.symbol);
}

const DEFAULT_SYMBOLS: Record<Market, string[]> = {
  get NASDAQ() { return defaultNasdaqSymbols(); },
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

    // NASDAQ-only when unspecified: TASI is out of scope for this program and a scheduled call
    // carries no body, so the default IS the scheduled behaviour.
    const markets: Market[] = parsed.data.market ? [parsed.data.market] : ['NASDAQ'];
    const startedAt = Date.now();
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

    // Forward point-in-time membership capture. Unbackfillable: a day not captured is permanently
    // absent from the record, which is exactly the gap the survivorship measurement found for
    // 2018-2020 and could not close at any price. Deliberately NON-FATAL — a capture failure must
    // never abort bar ingestion, because losing today's bars to fix tomorrow's evidence is a bad
    // trade. The failure is reported in the response rather than swallowed.
    let membership: unknown = null;
    try {
      membership = await captureUniverseMembership();
    } catch (err) {
      console.error('Universe membership capture failed:', err);
      membership = { error: err instanceof Error ? err.message : 'unknown' };
    }

    // Duration is reported so the Vercel function-duration limit is measured, not assumed:
    // 217 symbols is a large step up from the previous two.
    return NextResponse.json({ processed, upserted, membership, durationMs: Date.now() - startedAt });
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
