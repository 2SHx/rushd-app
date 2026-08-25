// src/app/api/cron/quant-run/route.ts — signed cron: automated AUTO_PAPER committee run
// (mirrors cron/distribute). Kill-switch + autonomy-tier gating live in autoRun.ts.
import { NextResponse } from 'next/server';
import { rejectUnauthorizedCron } from '@/lib/cronAuth';
import { runAutomatedStrategies } from '@/quant/automation/autoRun';

export async function POST(req: Request) {
  try {
    const rejection = rejectUnauthorizedCron(req);
    if (rejection) return rejection;

    const result = await runAutomatedStrategies();
    return NextResponse.json(result);
  } catch (err) {
    console.error('Quant automated run cron failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** Vercel Cron's verb. These routes take no body, so GET is the identical handler. */
export const GET = POST;
