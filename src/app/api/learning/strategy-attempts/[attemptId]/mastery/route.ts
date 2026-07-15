import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAccess, requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { BOLLINGER_MR_LONG_V2_CURRICULUM } from '@/quant/learning/bollingerMrLongV2Curriculum';
import {
  awardStrategyLearningMastery,
  retrievalAvailableAt,
  StrategyLearningMasteryResponseConflict,
  strategyLearningMasteryState,
  type StrategyLearningMasteryKind,
} from '@/services/strategyLearningMastery';

interface RouteContext { params: { attemptId: string } }

const requestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('RETRIEVAL'),
    questionId: z.string().min(1).max(100),
    optionId: z.string().min(1).max(100),
  }).strict(),
  z.object({
    kind: z.literal('REFLECTION'),
    response: z.enum(['PROCESS_OVER_OUTCOME', 'RISK_OVER_RETURN', 'DISCIPLINE_BEFORE_ENTRY']),
  }).strict(),
]);

function authzResponse(error: unknown): Response | null {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: Response }).response;
  }
  return null;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const sessionUser = await requireSession();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

    const attempt = await prisma.strategyLearningAttempt.findUnique({
      where: { id: context.params.attemptId },
      include: { result: true, masteryEvents: true },
    });
    if (!attempt) return NextResponse.json({ error: 'learning_attempt_not_found' }, { status: 404 });
    await authorizeAccess(sessionUser, attempt.userId);
    if (!attempt.result) return NextResponse.json({ error: 'learning_result_not_ready' }, { status: 409 });

    let kind: StrategyLearningMasteryKind;
    let response: string;
    let correct: boolean | undefined;
    if (parsed.data.kind === 'RETRIEVAL') {
      const retrieval = parsed.data;
      const availableAt = retrievalAvailableAt(attempt.sealedAt);
      if (new Date() < availableAt) {
        return NextResponse.json({ error: 'retrieval_not_ready', availableAt }, { status: 409 });
      }
      const question = BOLLINGER_MR_LONG_V2_CURRICULUM.questions.find(item => (
        item.id === retrieval.questionId && item.role === 'KNOWLEDGE_CHECK'
      ));
      if (!question || !question.options.some(option => option.id === retrieval.optionId)) {
        return NextResponse.json({ error: 'invalid_retrieval_answer' }, { status: 400 });
      }
      kind = 'RETRIEVAL';
      response = `${question.id}:${retrieval.optionId}`;
      correct = retrieval.optionId === question.correctOptionId;
    } else {
      kind = 'REFLECTION';
      response = parsed.data.response;
    }

    const existing = attempt.masteryEvents.find(event => event.kind === kind);
    if (existing && existing.response !== response) {
      return NextResponse.json({ error: 'mastery_response_conflict' }, { status: 409 });
    }
    const award = await awardStrategyLearningMastery({
      attempt: { id: attempt.id, userId: attempt.userId },
      kind,
      response,
      correct,
    });
    const events = existing ? attempt.masteryEvents : [...attempt.masteryEvents, award.event];
    return NextResponse.json({
      award: {
        kind,
        xp: award.event.xp,
        created: award.created,
        correct: award.event.correct,
        profile: award.profile,
      },
      mastery: strategyLearningMasteryState(events, attempt.sealedAt),
    }, { status: award.created ? 201 : 200 });
  } catch (error) {
    const response = authzResponse(error);
    if (response) return response;
    if (error instanceof StrategyLearningMasteryResponseConflict) {
      return NextResponse.json({ error: 'mastery_response_conflict' }, { status: 409 });
    }
    console.error('Strategy learning mastery award failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
