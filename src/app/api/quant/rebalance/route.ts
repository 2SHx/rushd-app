import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isHalted } from '@/quant/automation/control';
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
    // Legacy signed cron contract: the secret is accepted only as Authorization: Bearer.
    const authorization = req.headers.get('authorization');
    const bearer = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
    const systemSecret = process.env.CRON_SECRET;

    if (!systemSecret) {
      console.warn('CRON_SECRET environment variable is missing.');
      return NextResponse.json({ error: 'misconfigured' }, { status: 500 });
    }

    if (!bearer || !constantTimeCompare(bearer, systemSecret)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (await isHalted()) {
      return NextResponse.json({ error: 'halted' }, { status: 503 });
    }

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const strategies = await prisma.strategy.findMany({
      where: {
        enabled: true,
        market: 'NASDAQ',
        owner: { tier: 'ULTRA' }
      }
    });

    const logs: Record<string, Awaited<ReturnType<typeof executePortfolioRebalance>> | {
      rebalanced: false;
      error: string;
    }> = {};
    let failed = false;

    for (const strategy of strategies) {
      if (await isHalted()) {
        return NextResponse.json({ error: 'halted', logs }, { status: 503 });
      }
      try {
        const log = await executePortfolioRebalance(
          strategy.ownerUserId,
          strategy.id,
          now,
        );
        logs[strategy.id] = log;
      } catch (error) {
        console.error(`Rebalance failed for strategy ${strategy.id}:`, error);
        failed = true;
        logs[strategy.id] = {
          rebalanced: false,
          error: 'rebalance_failed',
        };
      }
    }

    return NextResponse.json(
      { success: !failed, rebalanceDate: todayStr, logs },
      { status: failed ? 500 : 200 },
    );
  } catch (error) {
    console.error('Error in rebalance cron handler:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
