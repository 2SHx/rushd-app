// POST /api/quant/execute — approve (if owner) and paper-execute a committee Decision.
// Auth: requireSession; a user can only touch their own decisions. Rate-limited PER USER
// (a global bucket would let one caller 429 everyone).
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireUltraTier } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { TokenBucket } from '@/services/marketData';
import { executeDecision, ExecutionError } from '@/quant/execution/executeDecision';

const limiters = new Map<string, TokenBucket>();
function limiterFor(userId: string): TokenBucket {
  let bucket = limiters.get(userId);
  if (!bucket) {
    bucket = new TokenBucket(5, 0.1);
    limiters.set(userId, bucket);
  }
  return bucket;
}

const BodySchema = z.object({ decisionId: z.string().min(1) });

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
    const { decisionId } = parsed.data;

    // Approval is an owner action; verify ownership before mutating anything.
    const decision = await prisma.decision.findUnique({ where: { id: decisionId } });
    if (!decision) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (decision.userId !== user.id) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    if (decision.status === 'PROPOSED') {
      await prisma.decision.update({ where: { id: decisionId }, data: { status: 'APPROVED' } });
    }

    const result = await executeDecision(decisionId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    if (error instanceof ExecutionError) {
      const status =
        error.code === 'not_found'
          ? 404
          : error.code === 'forbidden'
            ? 403
            : error.code === 'conflict' || error.code === 'insufficient_funds'
              ? 409
              : 422;
      return NextResponse.json({ error: error.code }, { status });
    }
    // A racing unique-constraint hit (belt-and-suspenders; executeDecision handles it too).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'already_executing' }, { status: 409 });
    }
    console.error('quant execute failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
