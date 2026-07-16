import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAccess, requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { strategyLearningMasteryState } from '@/services/strategyLearningMastery';
import {
  DEFAULT_STRATEGY_LEARNING_SETUP_ID,
  isStrategyLearningSetupId,
} from '@/quant/learning/strategyLearningModules';

function authzResponse(error: unknown): Response | null {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: Response }).response;
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const sessionUser = await requireSession();
    const url = new URL(request.url);
    const setupId = url.searchParams.get('setupId') ?? DEFAULT_STRATEGY_LEARNING_SETUP_ID;
    if (!isStrategyLearningSetupId(setupId)) {
      return NextResponse.json({ error: 'learning_module_unavailable' }, { status: 404 });
    }
    const parsedUserId = z.string().min(1).max(128).safeParse(
      url.searchParams.get('userId') ?? sessionUser.id,
    );
    if (!parsedUserId.success) return NextResponse.json({ error: 'invalid_user_id' }, { status: 400 });
    await authorizeAccess(sessionUser, parsedUserId.data);

    const attempt = await prisma.strategyLearningAttempt.findFirst({
      where: {
        userId: parsedUserId.data,
        setupId,
        result: { isNot: null },
      },
      orderBy: { createdAt: 'desc' },
      include: { result: true, masteryEvents: true },
    });
    if (!attempt?.result) return new Response(null, { status: 204 });

    if (url.searchParams.get('summary') === '1') {
      return NextResponse.json({
        completed: true,
        attempt: {
          id: attempt.id,
          setupId: attempt.setupId,
          attemptNumber: attempt.attemptNumber,
          sealedAt: attempt.sealedAt,
        },
      });
    }

    return NextResponse.json({
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        answers: attempt.answers,
        sealedAt: attempt.sealedAt,
      },
      result: attempt.result.payload,
      mastery: strategyLearningMasteryState(attempt.masteryEvents, attempt.sealedAt),
    });
  } catch (error) {
    const response = authzResponse(error);
    if (response) return response;
    console.error('Latest strategy learning attempt read failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
