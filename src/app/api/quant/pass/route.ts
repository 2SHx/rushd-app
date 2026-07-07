// POST /api/quant/pass — run one committee pass for a symbol and persist a Decision
// (status PROPOSED) + its AnalystSignalRecords. Auth: requireSession; rate-limited PER
// USER (mirrors /api/quant/execute). Portfolio/market state is derived by the runner from
// the DB (never from the caller) — this route only accepts symbol + market.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Market } from '@prisma/client';
import { requireUltraTier } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { TokenBucket } from '@/services/marketData';
import { runCommitteePass } from '@/quant/committee/runner';

const limiters = new Map<string, TokenBucket>();
function limiterFor(userId: string): TokenBucket {
  let bucket = limiters.get(userId);
  if (!bucket) {
    bucket = new TokenBucket(5, 0.1);
    limiters.set(userId, bucket);
  }
  return bucket;
}

const BodySchema = z.object({
  symbol: z.string().min(1).max(12),
  market: z.nativeEnum(Market),
});

export async function POST(req: Request) {
  try {
    const user = await requireUltraTier();

    if (!limiterFor(user.id).tryAcquire()) {
      return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { symbol, market } = parsed.data;

    const { decisionId, finalAction } = await runCommitteePass({ userId: user.id, symbol, market });

    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: { signals: true },
    });
    if (!decision) {
      // Shouldn't happen — the runner just created it in a transaction — but never leak a 500 on a phantom.
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({
      decisionId,
      finalAction,
      finalQty: decision.finalQty,
      proposedAction: decision.proposedAction,
      proposedQty: decision.proposedQty,
      shariaGate: decision.shariaGate,
      riskAdjustments: decision.riskAdjustments,
      debateTranscript: decision.debateTranscript,
      signals: decision.signals,
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('quant pass failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
