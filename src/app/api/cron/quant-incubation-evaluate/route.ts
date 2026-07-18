import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runNightlyIncubationEvaluation } from '@/quant/automation/incubationEvaluation';

function secretMatches(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
    const authorization = request.headers.get('Authorization');
    if (!authorization || !secretMatches(authorization, `Bearer ${secret}`)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    return NextResponse.json(await runNightlyIncubationEvaluation());
  } catch (error) {
    console.error('Quant incubation evaluation cron failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
