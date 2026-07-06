// POST /api/quant/execute — approve (if owner) and paper-execute a committee Decision.
// Auth: requireSession; a user can only touch their own decisions. Rate-limited.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { TokenBucket } from '@/services/marketData';
import { executeDecision, ExecutionError } from '@/quant/execution/executeDecision';

const limiter = new TokenBucket(5, 0.1);

const BodySchema = z.object({ decisionId: z.string().min(1) });

export async function POST(req: Request) {
  if (!limiter.tryAcquire()) {
    return NextResponse.json({ error: 'rate_limit_exceeded' }, { status: 429 });
  }
  try {
    const user = await requireSession();

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
        error.code === 'not_found' ? 404 : error.code === 'forbidden' ? 403 : error.code === 'conflict' ? 409 : 422;
      return NextResponse.json({ error: error.code }, { status });
    }
    console.error('quant execute failed:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
