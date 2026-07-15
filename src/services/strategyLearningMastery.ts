import { Prisma, type StrategyLearningMasteryEvent } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/services/engines';

export const RETRIEVAL_DELAY_MS = 24 * 60 * 60 * 1000;
export const MASTERY_XP = {
  COMPLETION: 20,
  RETRIEVAL: 15,
  REFLECTION: 15,
} as const;

export type StrategyLearningMasteryKind = keyof typeof MASTERY_XP;
type AttemptOwner = { id: string; userId: string };

export class StrategyLearningMasteryResponseConflict extends Error {
  constructor() {
    super('strategy_learning_mastery_response_conflict');
  }
}

function assertSameResponse(
  event: StrategyLearningMasteryEvent,
  input: { response?: string; correct?: boolean },
) {
  if (event.response !== (input.response ?? null) || event.correct !== (input.correct ?? null)) {
    throw new StrategyLearningMasteryResponseConflict();
  }
}

function isRetryableConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2002' || error.code === 'P2034';
  }
  return Boolean(error && typeof error === 'object' && 'code' in error
    && ['P2002', 'P2034'].includes(String((error as { code: unknown }).code)));
}

export function retrievalAvailableAt(sealedAt: Date | string): Date {
  return new Date(new Date(sealedAt).getTime() + RETRIEVAL_DELAY_MS);
}

export function strategyLearningMasteryState(
  events: readonly StrategyLearningMasteryEvent[],
  sealedAt: Date | string,
  now = new Date(),
) {
  const byKind = new Map(events.map(event => [event.kind, event]));
  const availableAt = retrievalAvailableAt(sealedAt);
  const milestone = (kind: StrategyLearningMasteryKind) => {
    const event = byKind.get(kind);
    return event ? {
      earned: true,
      xp: event.xp,
      response: event.response,
      correct: event.correct,
      createdAt: event.createdAt,
    } : { earned: false, xp: MASTERY_XP[kind] };
  };
  return {
    completion: milestone('COMPLETION'),
    retrieval: milestone('RETRIEVAL'),
    reflection: milestone('REFLECTION'),
    earnedXp: events.reduce((sum, event) => sum + event.xp, 0),
    maxXp: Object.values(MASTERY_XP).reduce((sum, xp) => sum + xp, 0),
    retrievalAvailableAt: availableAt,
    retrievalReady: now >= availableAt,
  };
}

export async function awardStrategyLearningMastery(input: {
  attempt: AttemptOwner;
  kind: StrategyLearningMasteryKind;
  response?: string;
  correct?: boolean;
}) {
  for (let tries = 0; tries < 3; tries++) {
    try {
      return await prisma.$transaction(async tx => {
        const existing = await tx.strategyLearningMasteryEvent.findUnique({
          where: { attemptId_kind: { attemptId: input.attempt.id, kind: input.kind } },
        });
        if (existing) {
          assertSameResponse(existing, input);
          const profile = await tx.gamificationProfile.findUniqueOrThrow({
            where: { userId: input.attempt.userId },
          });
          return {
            event: existing,
            profile: { xp: profile.xp, level: profile.level, leveledUp: false },
            created: false,
          };
        }

        const event = await tx.strategyLearningMasteryEvent.create({
          data: {
            attemptId: input.attempt.id,
            kind: input.kind,
            response: input.response,
            correct: input.correct,
            xp: MASTERY_XP[input.kind],
          },
        });
        const profile = await addXP(input.attempt.userId, MASTERY_XP[input.kind], tx);
        return { event, profile, created: true };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isRetryableConflict(error)) throw error;
    }
  }

  const existing = await prisma.strategyLearningMasteryEvent.findUnique({
    where: { attemptId_kind: { attemptId: input.attempt.id, kind: input.kind } },
  });
  const profile = await prisma.gamificationProfile.findUnique({
    where: { userId: input.attempt.userId },
  });
  if (existing && profile) {
    assertSameResponse(existing, input);
    return {
      event: existing,
      profile: { xp: profile.xp, level: profile.level, leveledUp: false },
      created: false,
    };
  }
  throw new Error('strategy_learning_mastery_conflict');
}
