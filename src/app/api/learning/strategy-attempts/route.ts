import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authorizeAccess, requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import type { StrategyLearningAnswer } from '@/quant/learning/bollingerMrLongV2Curriculum';
import type { StrategyLearningFixture } from '@/quant/learning/strategyLearningReplay';
import {
  awardStrategyLearningMastery,
  strategyLearningMasteryState,
} from '@/services/strategyLearningMastery';
import {
  DEFAULT_STRATEGY_LEARNING_SETUP_ID,
  getStrategyLearningModule,
  isStrategyLearningSetupId,
  STRATEGY_LEARNING_SETUP_IDS,
  type CompiledStrategyLearningModulePolicy,
  type StrategyLearningModule,
} from '@/quant/learning/strategyLearningModules';

const answerSchema = z.object({
  questionId: z.string().min(1).max(100),
  optionId: z.string().min(1).max(100),
}).strict();

const completionSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  setupId: z.enum(STRATEGY_LEARNING_SETUP_IDS),
  idempotencyKey: z.string().min(8).max(128).regex(/^[A-Za-z0-9_-]+$/),
  answers: z.array(answerSchema).min(1).max(8),
  retryOfAttemptId: z.string().min(1).max(128).optional(),
}).strict();

type StoredAttempt = Prisma.StrategyLearningAttemptGetPayload<{
  include: { result: true; masteryEvents: true };
}>;

function canonicalAnswers(
  learningModule: StrategyLearningModule,
  answers: readonly StrategyLearningAnswer[],
): StrategyLearningAnswer[] {
  const byQuestion = new Map(answers.map(answer => [answer.questionId, answer.optionId]));
  return learningModule.curriculum.questions.map(question => ({
    questionId: question.id,
    optionId: byQuestion.get(question.id)!,
  }));
}

function sameAnswers(stored: Prisma.JsonValue, expected: readonly StrategyLearningAnswer[]): boolean {
  const parsed = z.array(answerSchema).safeParse(stored);
  if (!parsed.success || parsed.data.length !== expected.length) return false;
  const byQuestion = new Map(parsed.data.map(answer => [answer.questionId, answer.optionId]));
  return byQuestion.size === expected.length
    && expected.every(answer => byQuestion.get(answer.questionId) === answer.optionId);
}

function attemptResponse(
  attempt: StoredAttempt,
  payload: Prisma.JsonValue,
  status: number,
  masteryEvents = attempt.masteryEvents,
): NextResponse {
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
    result: payload,
    mastery: strategyLearningMasteryState(masteryEvents, attempt.sealedAt),
  }, { status });
}

function authzResponse(error: unknown): Response | null {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: Response }).response;
  }
  return null;
}

function isRetryableCreateConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002' || error.code === 'P2034';
  }
  return Boolean(error && typeof error === 'object' && 'code' in error
    && ['P2002', 'P2034'].includes(String((error as { code: unknown }).code)));
}

async function createSealedAttempt(input: {
  userId: string;
  idempotencyKey: string;
  answers: StrategyLearningAnswer[];
  retryOfId: string | null;
  policy: CompiledStrategyLearningModulePolicy;
  complianceTag: 'EDUCATIONAL_ONLY';
  fixture: StrategyLearningFixture;
}): Promise<{ attempt: StoredAttempt; created: boolean }> {
  for (let tries = 0; tries < 3; tries++) {
    try {
      const attempt = await prisma.$transaction(async tx => {
        const priorAttempts = await tx.strategyLearningAttempt.count({
          where: { userId: input.userId, setupId: input.policy.setupId },
        });
        return tx.strategyLearningAttempt.create({
          data: {
            userId: input.userId,
            setupId: input.policy.setupId,
            setupVersion: input.policy.setupVersion,
            questionSetVersion: input.policy.questionSetVersion,
            policyVersion: input.policy.policyVersion,
            policyHash: input.policy.policyHash,
            complianceTag: input.complianceTag,
            attemptNumber: priorAttempts + 1,
            idempotencyKey: input.idempotencyKey,
            answers: input.answers as unknown as Prisma.InputJsonValue,
            compiledPolicy: input.policy.params as unknown as Prisma.InputJsonValue,
            replayConfig: {
              fixtureVersion: input.fixture.fixtureVersion,
              interval: input.fixture.interval,
              setupId: input.policy.setupId,
              setupVersion: input.policy.setupVersion,
              fillModel: 'dailySeries' in input.fixture
                ? 'INTRADAY_NEXT_OPEN_VOLATILITY_SLIPPAGE_10BPS_COMMISSION_PARTICIPATION_CAP'
                : 'DECIDE_CLOSE_FILL_NEXT_OPEN_10BPS_COMMISSION_5BPS_SLIPPAGE',
              riskEnvelope: 'dailySeries' in input.fixture ? 'DEFAULT_INTRADAY_LIMITS' : 'DEFAULT_BT_LIMITS',
              comparisonSymbols: ['SPUS', 'SPY'],
            },
            dataProvenance: {
              capturedAt: input.fixture.capturedAt,
              warmupStart: input.fixture.warmupStart,
              sources: Array.from(new Set(input.fixture.series.map(series => series.source))).sort(),
              strategyUniverse: input.fixture.strategyUniverse,
              sharia: input.fixture.sharia,
            },
            retryOfId: input.retryOfId,
            sealedAt: new Date(),
          },
          include: { result: true, masteryEvents: true },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { attempt, created: true };
    } catch (error) {
      if (!isRetryableCreateConflict(error)) throw error;
      const existing = await prisma.strategyLearningAttempt.findUnique({
        where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
        include: { result: true, masteryEvents: true },
      });
      if (existing) return { attempt: existing, created: false };
    }
  }
  throw new Error('learning_attempt_create_conflict');
}

async function ensureCompletionMastery(attempt: StoredAttempt) {
  const award = await awardStrategyLearningMastery({
    attempt: { id: attempt.id, userId: attempt.userId },
    kind: 'COMPLETION',
  });
  const events = attempt.masteryEvents ?? [];
  return events.some(event => event.kind === 'COMPLETION')
    ? events
    : [...events, award.event];
}

async function persistReplayResult(
  attempt: StoredAttempt,
  answers: readonly StrategyLearningAnswer[],
  fixture: StrategyLearningFixture,
  learningModule: StrategyLearningModule,
): Promise<Prisma.JsonValue> {
  if (attempt.result) return attempt.result.payload;
  const replay = learningModule.replay(answers, fixture);
  try {
    const result = await prisma.strategyLearningResult.create({
      data: { attemptId: attempt.id, payload: replay as unknown as Prisma.InputJsonValue },
    });
    return result.payload;
  } catch (error) {
    if (!isRetryableCreateConflict(error)) throw error;
    const completed = await prisma.strategyLearningAttempt.findUnique({
      where: { id: attempt.id },
      include: { result: true, masteryEvents: true },
    });
    if (completed?.result) return completed.result.payload;
    throw error;
  }
}

/** Public, non-executable lesson content. The policy compiler and replay remain server-only. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const locale = url.searchParams.get('locale') === 'ar' ? 'ar' : 'en';
  const setupId = url.searchParams.get('setupId') ?? DEFAULT_STRATEGY_LEARNING_SETUP_ID;
  if (!isStrategyLearningSetupId(setupId)) {
    return NextResponse.json({ error: 'learning_module_unavailable' }, { status: 404 });
  }
  const learningModule = getStrategyLearningModule(setupId);
  const curriculum = learningModule.curriculum;
  return NextResponse.json({
    setupId: curriculum.setupId,
    setupVersion: curriculum.setupVersion,
    questionSetVersion: curriculum.questionSetVersion,
    complianceTag: curriculum.complianceTag,
    title: curriculum.title[locale],
    questions: curriculum.questions.map(question => ({
      id: question.id,
      role: question.role,
      area: question.area,
      prompt: question.prompt[locale],
      options: question.options.map(option => ({
        id: option.id,
        label: option.label[locale],
        feedback: option.feedback[locale],
      })),
      ...(question.role === 'KNOWLEDGE_CHECK'
        ? {
          correctOptionId: question.correctOptionId,
          explanation: question.explanation[locale],
        }
        : { teamOptionId: question.teamOptionId }),
    })),
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const sessionUser = await requireSession();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = completionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const userId = parsed.data.userId ?? sessionUser.id;
    await authorizeAccess(sessionUser, userId);

    const learningModule = getStrategyLearningModule(parsed.data.setupId);
    let policy: CompiledStrategyLearningModulePolicy;
    try {
      policy = learningModule.compile(parsed.data.answers);
    } catch {
      return NextResponse.json({ error: 'invalid_learning_answers' }, { status: 400 });
    }
    const answers = canonicalAnswers(learningModule, parsed.data.answers);
    const existing = await prisma.strategyLearningAttempt.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey: parsed.data.idempotencyKey } },
      include: { result: true, masteryEvents: true },
    });
    if (existing) {
      if (existing.policyHash !== policy.policyHash || !sameAnswers(existing.answers, answers)) {
        return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 });
      }
      if (existing.retryOfId !== (parsed.data.retryOfAttemptId ?? null)) {
        return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 });
      }
      if (existing.result) {
        const masteryEvents = await ensureCompletionMastery(existing);
        return attemptResponse(existing, existing.result.payload, 200, masteryEvents);
      }
    }

    let retryOfId: string | null = null;
    if (parsed.data.retryOfAttemptId) {
      const retryOf = await prisma.strategyLearningAttempt.findUnique({
        where: { id: parsed.data.retryOfAttemptId },
        include: { result: true, masteryEvents: true },
      });
      if (!retryOf) return NextResponse.json({ error: 'retry_attempt_not_found' }, { status: 404 });
      if (retryOf.userId !== userId) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      if (retryOf.setupId !== policy.setupId || retryOf.setupVersion !== policy.setupVersion) {
        return NextResponse.json({ error: 'retry_setup_mismatch' }, { status: 400 });
      }
      retryOfId = retryOf.id;
    }

    const fixture = learningModule.loadFixture();
    const sealed = existing
      ? { attempt: existing, created: false }
      : await createSealedAttempt({
        userId,
        idempotencyKey: parsed.data.idempotencyKey,
        answers,
        retryOfId,
        policy,
        complianceTag: learningModule.curriculum.complianceTag,
        fixture,
      });
    if (sealed.attempt.policyHash !== policy.policyHash || !sameAnswers(sealed.attempt.answers, answers)) {
      return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 });
    }
    if (sealed.attempt.retryOfId !== retryOfId) {
      return NextResponse.json({ error: 'idempotency_conflict' }, { status: 409 });
    }
    const payload = await persistReplayResult(sealed.attempt, answers, fixture, learningModule);
    const masteryEvents = await ensureCompletionMastery(sealed.attempt);
    return attemptResponse(sealed.attempt, payload, sealed.created ? 201 : 200, masteryEvents);
  } catch (error) {
    const authResponse = authzResponse(error);
    if (authResponse) return authResponse;
    console.error('Strategy learning completion failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
