import { NextResponse } from 'next/server';
import { rejectUnauthorizedCron } from '@/lib/cronAuth';
import { runNightlyIncubationEvaluation } from '@/quant/automation/incubationEvaluation';

export async function POST(request: Request) {
  try {
    const rejection = rejectUnauthorizedCron(request);
    if (rejection) return rejection;
    return NextResponse.json(await runNightlyIncubationEvaluation());
  } catch (error) {
    console.error('Quant incubation evaluation cron failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** Vercel Cron's verb. This route takes no body, so GET is the identical handler. */
export const GET = POST;
