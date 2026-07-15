import { beforeEach, describe, expect, it, vi } from 'vitest';

const eventFindUnique = vi.fn();
const eventCreate = vi.fn();
const profileFindUniqueOrThrow = vi.fn();
const profileFindUnique = vi.fn();
const transaction = vi.fn();
const addXP = vi.fn();

const tx = {
  strategyLearningMasteryEvent: {
    findUnique: (...args: unknown[]) => eventFindUnique(...args),
    create: (...args: unknown[]) => eventCreate(...args),
  },
  gamificationProfile: {
    findUniqueOrThrow: (...args: unknown[]) => profileFindUniqueOrThrow(...args),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
    strategyLearningMasteryEvent: { findUnique: (...args: unknown[]) => eventFindUnique(...args) },
    gamificationProfile: { findUnique: (...args: unknown[]) => profileFindUnique(...args) },
  },
}));

vi.mock('@/services/engines', () => ({
  addXP: (...args: unknown[]) => addXP(...args),
}));

import {
  MASTERY_XP,
  awardStrategyLearningMastery,
  retrievalAvailableAt,
  strategyLearningMasteryState,
} from './strategyLearningMastery';

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  eventFindUnique.mockResolvedValue(null);
  eventCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: 'event-1',
    createdAt: new Date('2026-07-16T09:00:00.000Z'),
    response: null,
    correct: null,
    ...data,
  }));
  addXP.mockResolvedValue({ xp: 20, level: 1, leveledUp: false });
});

describe('strategy learning mastery rewards', () => {
  it('awards the fixed completion amount through addXP inside the same transaction', async () => {
    const result = await awardStrategyLearningMastery({
      attempt: { id: 'attempt-1', userId: 'child-1' },
      kind: 'COMPLETION',
    });

    expect(eventCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ xp: 20, kind: 'COMPLETION' }) });
    expect(addXP).toHaveBeenCalledWith('child-1', 20, tx);
    expect(result.created).toBe(true);
  });

  it('returns an existing milestone without awarding XP twice', async () => {
    const existing = {
      id: 'event-1', attemptId: 'attempt-1', kind: 'REFLECTION', response: 'PROCESS_OVER_OUTCOME',
      correct: null, xp: 15, createdAt: new Date('2026-07-16T09:00:00.000Z'),
    };
    eventFindUnique.mockResolvedValue(existing);
    profileFindUniqueOrThrow.mockResolvedValue({ xp: 35, level: 1 });

    const result = await awardStrategyLearningMastery({
      attempt: { id: 'attempt-1', userId: 'child-1' },
      kind: 'REFLECTION',
      response: 'PROCESS_OVER_OUTCOME',
    });

    expect(result).toEqual({
      event: existing,
      profile: { xp: 35, level: 1, leveledUp: false },
      created: false,
    });
    expect(eventCreate).not.toHaveBeenCalled();
    expect(addXP).not.toHaveBeenCalled();
  });

  it('rejects a racing response that differs from the recorded milestone', async () => {
    eventFindUnique.mockResolvedValue({
      id: 'event-1', attemptId: 'attempt-1', kind: 'REFLECTION', response: 'PROCESS_OVER_OUTCOME',
      correct: null, xp: 15, createdAt: new Date('2026-07-16T09:00:00.000Z'),
    });

    await expect(awardStrategyLearningMastery({
      attempt: { id: 'attempt-1', userId: 'child-1' },
      kind: 'REFLECTION',
      response: 'RISK_OVER_RETURN',
    })).rejects.toThrow('strategy_learning_mastery_response_conflict');
    expect(addXP).not.toHaveBeenCalled();
  });

  it('keeps every reward independent from replay profit or benchmark rank', () => {
    expect(MASTERY_XP).toEqual({ COMPLETION: 20, RETRIEVAL: 15, REFLECTION: 15 });
    expect(Object.keys(MASTERY_XP)).toEqual(['COMPLETION', 'RETRIEVAL', 'REFLECTION']);
  });

  it('opens retrieval exactly one day after sealing and reports process progress', () => {
    const sealedAt = new Date('2026-07-15T09:00:00.000Z');
    const event = {
      id: 'event-1', attemptId: 'attempt-1', kind: 'COMPLETION', response: null,
      correct: null, xp: 20, createdAt: sealedAt,
    };
    const before = strategyLearningMasteryState([event], sealedAt, new Date('2026-07-16T08:59:59.999Z'));
    const due = strategyLearningMasteryState([event], sealedAt, retrievalAvailableAt(sealedAt));

    expect(before.retrievalReady).toBe(false);
    expect(due.retrievalReady).toBe(true);
    expect(due).toMatchObject({ earnedXp: 20, maxXp: 50, completion: { earned: true } });
  });
});
