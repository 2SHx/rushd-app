import { NextResponse } from 'next/server';
import { rejectUnauthorizedCron } from '@/lib/cronAuth';
import { runDailyIncubationBooks } from '@/quant/automation/incubationBooks';

export async function POST(request: Request) {
  try {
    const rejection = rejectUnauthorizedCron(request);
    if (rejection) return rejection;
    return NextResponse.json(await runDailyIncubationBooks());
  } catch (error) {
    console.error('Quant incubation cron failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

/** Vercel Cron's verb. These routes take no body, so GET is the identical handler. */
export const GET = POST;
