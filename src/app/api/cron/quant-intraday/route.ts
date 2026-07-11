// src/app/api/cron/quant-intraday/route.ts — signed cron: intraday spine ingestion + snapshot
// (QDR-6 / G1). Mirrors cron/quant-ingest's Bearer-CRON_SECRET pattern exactly. NASDAQ-only,
// symbol list capped (cost/DoS bound) — mirrors autoRun.ts's `configuredCap` pattern.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ingestIntradayBars } from '@/quant/data/intraday';
import { computeAndUpsertSnapshot } from '@/quant/data/snapshot';

const DEFAULT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA'];

function configuredCap(name: string, fallback: number, ceiling: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, ceiling) : fallback;
}

export const MAX_INTRADAY_SYMBOLS = configuredCap('INTRADAY_MAX_SYMBOLS', 5, 25);

const bodySchema = z.object({
  symbols: z.array(z.string().regex(/^[A-Za-z]{1,10}$/).transform((symbol) => symbol.toUpperCase())).optional(),
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
    let body: unknown = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_body', details: parsed.error.flatten() }, { status: 400 });
    }

    const symbols = Array.from(new Set(parsed.data.symbols ?? DEFAULT_SYMBOLS)).slice(0, MAX_INTRADAY_SYMBOLS);
    let created = 0;
    const results: Array<{ symbol: string; requested: number; created: number; tier: string }> = [];

    for (const symbol of symbols) {
      const res = await ingestIntradayBars(symbol, 'NASDAQ');
      created += res.created;
      results.push({ symbol, requested: res.requested, created: res.created, tier: res.tier });
      if (res.fixtureSnapshots.length) {
        for (const fixture of res.fixtureSnapshots) {
          await computeAndUpsertSnapshot(symbol, 'NASDAQ', fixture.asOf, fixture.barsSource, fixture);
        }
      } else if (res.latestTs) {
        await computeAndUpsertSnapshot(symbol, 'NASDAQ', res.latestTs, res.source);
      }
    }

    return NextResponse.json({ processed: symbols.length, created, results });
  } catch (err) {
    console.error('Quant intraday cron failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
