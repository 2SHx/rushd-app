// src/app/api/cron/distribute/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processCashSweeps } from '@/services/engines';

export async function POST(req: Request) {
  try {
    // 1. Authenticate with CRON_SECRET Bearer token
    const authHeader = req.headers.get('Authorization');
    const secret = process.env.CRON_SECRET;

    if (!secret) {
      console.error('CRON_SECRET environment variable is missing.');
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 2. Enforce Daily Idempotency
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const alreadyRun = await prisma.transaction.findFirst({
      where: {
        type: 'PROFIT_SHARE',
        createdAt: { gte: todayStart },
      },
    });

    if (alreadyRun) {
      return NextResponse.json({
        processed: false,
        message: 'Mudarabah profit share has already been distributed today.',
      });
    }

    // 3. Process the distribution
    const result = await processCashSweeps();

    return NextResponse.json({
      processed: true,
      ...result,
    });
  } catch (err) {
    console.error('Mudarabah distribution cron failed:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
