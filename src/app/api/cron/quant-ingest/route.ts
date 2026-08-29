// src/app/api/cron/quant-ingest/route.ts — signed cron: MarketBar ingestion (mirrors cron/distribute).
import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Market } from '@prisma/client';
import { ingestBars } from '@/quant/data/ingest';
import { rejectUnauthorizedCron } from '@/lib/cronAuth';
import { captureUniverseMembership } from '@/quant/universe/captureMembership';
import { nasdaqIngestRoster } from '@/quant/universe/ingestRoster';
import { registry, MockProvider } from '@/services/marketData';

/**
 * The engine's OWN roster, not a hand-kept list — see `ingestRoster.ts` for why it is shared with
 * the preflight rather than re-derived here.
 *
 * TASI is deliberately absent from the scheduled default: this program is NASDAQ-only by owner
 * directive. The `market` body field still accepts it for explicit manual invocation.
 */
const DEFAULT_SYMBOLS: Record<Market, string[]> = {
  get NASDAQ() { return nasdaqIngestRoster(); },
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
/**
 * The scheduled path must never write synthetic bars.
 *
 * `registry.getProvider` falls back to `MockProvider` whenever no data-source credentials are
 * visible, and `MockProvider` generates plausible-looking candles rather than failing. That makes a
 * misconfigured deployment indistinguishable from a healthy one: the cron returns 200 with a
 * non-zero `upserted`, the preflight sees fresh bars, and the engine trades on fabricated prices.
 *
 * This is not hypothetical. Sixty-four MOCK rows were found in the research database on 2026-08-27,
 * three of them predating that session — and their presence had already defeated the preflight's
 * bar-freshness check, which reported the feed current while real coverage was six days stale.
 *
 * Failing closed here costs one day of bars, which the next run backfills. Writing fabricated
 * prices costs the integrity of every decision made afterwards.
 */
function rejectSyntheticProvider(): NextResponse | null {
  const provider = registry.getProvider('NASDAQ');
  if (provider instanceof MockProvider) {
    console.error('Quant ingestion refused: resolved provider is MockProvider (no data credentials visible).');
    return NextResponse.json({
      error: 'synthetic_provider_refused',
      detail: 'Scheduled ingestion resolved to MockProvider, which fabricates candles. Configure a '
        + 'real market-data source (ALPACA_API_KEY/ALPACA_API_SECRET, or MARKET_DATA_MODE=keyless '
        + 'for Yahoo) before the cron can write bars.',
    }, { status: 503 });
  }
  return null;
}

async function handle(req: Request, rawBody: string) {
  try {
    const rejection = rejectUnauthorizedCron(req);
    if (rejection) return rejection;

    const synthetic = rejectSyntheticProvider();
    if (synthetic) return synthetic;

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
