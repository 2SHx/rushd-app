import { NextResponse } from 'next/server';
import { authorizeAccess, requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { strategyLearningMasteryState } from '@/services/strategyLearningMastery';

interface RouteContext {
  params: { attemptId: string };
}

function authzResponse(error: unknown): Response | null {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: Response }).response;
  }
  return null;
}

async function authorizedAttempt(context: RouteContext) {
  const sessionUser = await requireSession();
  const attempt = await prisma.strategyLearningAttempt.findUnique({
    where: { id: context.params.attemptId },
    include: { result: true, masteryEvents: true },
  });
  if (!attempt) return null;
  await authorizeAccess(sessionUser, attempt.userId);
  return attempt;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const attempt = await authorizedAttempt(context);
    if (!attempt) return NextResponse.json({ error: 'learning_attempt_not_found' }, { status: 404 });
    return NextResponse.json({
      attempt: {
        id: attempt.id,
        userId: attempt.userId,
        setupId: attempt.setupId,
        setupVersion: attempt.setupVersion,
        questionSetVersion: attempt.questionSetVersion,
        policyVersion: attempt.policyVersion,
        policyHash: attempt.policyHash,
        complianceTag: attempt.complianceTag,
        attemptNumber: attempt.attemptNumber,
        answers: attempt.answers,
        retryOfId: attempt.retryOfId,
        sealedAt: attempt.sealedAt,
        createdAt: attempt.createdAt,
      },
      result: attempt.result?.payload ?? null,
      mastery: strategyLearningMasteryState(attempt.masteryEvents, attempt.sealedAt),
    });
  } catch (error) {
    const response = authzResponse(error);
    if (response) return response;
    console.error('Strategy learning attempt read failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const attempt = await authorizedAttempt(context);
    if (!attempt) return NextResponse.json({ error: 'learning_attempt_not_found' }, { status: 404 });
    return NextResponse.json({ error: 'learning_attempt_sealed' }, { status: 409 });
  } catch (error) {
    const response = authzResponse(error);
    if (response) return response;
    console.error('Strategy learning attempt mutation failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
