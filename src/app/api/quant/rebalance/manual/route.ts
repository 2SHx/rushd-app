import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { isHalted } from '@/quant/automation/control';
import { executePortfolioRebalance } from '@/quant/portfolio/rebalancer';

function isUniqueViolation(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    if (user.tier !== 'ULTRA' || user.role === 'CHILD') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (req.headers.get('content-type') !== 'application/json') {
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

    try {
      await prisma.autoRunClaim.create({
        data: { key: `manual-rebalance:${user.id}:${rebalanceDate}` },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: 'already_run_today' }, { status: 409 });
      }
      throw error;
    }

    const logs: Record<string, Awaited<ReturnType<typeof executePortfolioRebalance>>> = {};
    for (const strategy of strategies) {
      if (await isHalted()) {
        return NextResponse.json({ error: 'halted', logs }, { status: 503 });
      }
      logs[strategy.id] = await executePortfolioRebalance(user.id, strategy.id, now);
    }

    return NextResponse.json({ success: true, rebalanceDate, logs });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('manual portfolio rebalance failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
