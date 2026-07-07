// src/app/api/cron/quant-run/route.ts — signed cron: automated AUTO_PAPER committee run
// (mirrors cron/distribute). Kill-switch + autonomy-tier gating live in autoRun.ts.
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runAutomatedStrategies } from '@/quant/automation/autoRun';

/** Constant-time compare (DR: timing-variable `!==` secret compare leaks the secret via
 * response-time side channel). Length is checked first without touching timingSafeEqual,
 * since it throws on mismatched buffer lengths and length itself is not the sensitive part. */
function secretMatches(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      console.error('CRON_SECRET environment variable is missing.');
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
    }

    if (!authHeader || !secretMatches(authHeader, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const result = await runAutomatedStrategies();
    return NextResponse.json(result);
  } catch (err) {
    console.error('Quant automated run cron failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
