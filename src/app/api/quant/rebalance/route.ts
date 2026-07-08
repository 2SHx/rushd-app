import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { executePortfolioRebalance } from '@/quant/portfolio/rebalancer';

// Constant-time string compare to mitigate timing attacks
function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function POST(req: Request) {
  try {
    // 1. Cron Secret Authorization
    const { searchParams } = new URL(req.url);
    const secret = searchParams.get('secret') || req.headers.get('x-cron-secret');
    const systemSecret = process.env.CRON_SECRET;

    if (!systemSecret) {
      console.warn('CRON_SECRET environment variable is missing.');
      return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
    }

    if (!secret || !constantTimeCompare(secret, systemSecret)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    // 2. Quant Control Kill-Switch
    const ctrl = await prisma.quantControl.findUnique({ where: { id: 'singleton' } });
    if (ctrl?.halted) {
      return NextResponse.json({ error: 'halted', reason: ctrl.reason }, { status: 503 });
    }

    // 3. Race-safety run claim for the rebalance pass (runs at most once per day)
    const todayStr = new Date().toISOString().slice(0, 10);
    const claimKey = `rebalance-nasdaq-${todayStr}`;
    try {
      await prisma.autoRunClaim.create({ data: { key: claimKey } });
    } catch {
      return NextResponse.json({ error: 'already_run_today' }, { status: 409 });
    }

    // 4. Fetch all active NASDAQ strategies owned by ULTRA tier users
    const strategies = await prisma.strategy.findMany({
      where: {
        enabled: true,
        market: 'NASDAQ',
        owner: { tier: 'ULTRA' }
      }
    });

    const logs: Record<string, any> = {};

    for (const strategy of strategies) {
      try {
        const log = await executePortfolioRebalance(
          strategy.ownerUserId,
          strategy.id,
          new Date()
        );
        logs[strategy.id] = log;
      } catch (err: any) {
        console.error(`Rebalance failed for strategy ${strategy.id}:`, err);
        logs[strategy.id] = { rebalanced: false, error: err.message };
      }
    }

    return NextResponse.json({ success: true, rebalanceDate: todayStr, logs });
  } catch (error) {
    console.error('Error in rebalance cron handler:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
