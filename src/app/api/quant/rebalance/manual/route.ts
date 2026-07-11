import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { isHalted } from '@/quant/automation/control';
import { executePortfolioRebalance } from '@/quant/portfolio/rebalancer';

function acceptsJson(req: Request): boolean {
  return req.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() === 'application/json';
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    if (user.tier !== 'ULTRA' || user.role === 'CHILD') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (!acceptsJson(req)) {
      return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
    }

    if (await isHalted()) {
      return NextResponse.json({ error: 'halted' }, { status: 503 });
    }

    const now = new Date();
    const strategies = await prisma.strategy.findMany({
      where: { ownerUserId: user.id, enabled: true, market: 'NASDAQ' },
      select: { id: true },
    });
    const rebalanceDate = now.toISOString().slice(0, 10);

    if (strategies.length === 0) {
      return NextResponse.json({ success: true, rebalanceDate, logs: {} });
    }

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
        logs[strategy.id] = await executePortfolioRebalance(user.id, strategy.id, now);
      } catch (error) {
        console.error(`Manual rebalance failed for strategy ${strategy.id}:`, error);
        failed = true;
        logs[strategy.id] = {
          rebalanced: false,
          error: 'rebalance_failed',
        };
      }
    }

    return NextResponse.json(
      { success: !failed, rebalanceDate, logs },
      { status: failed ? 500 : 200 },
    );
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('manual portfolio rebalance failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
