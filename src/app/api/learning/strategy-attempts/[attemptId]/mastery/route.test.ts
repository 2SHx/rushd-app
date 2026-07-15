import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOLLINGER_MR_LONG_V2_CURRICULUM } from '@/quant/learning/bollingerMrLongV2Curriculum';

const requireSession = vi.fn();
const authorizeAccess = vi.fn();
const attemptFindUnique = vi.fn();
const awardStrategyLearningMastery = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
  authorizeAccess: (...args: unknown[]) => authorizeAccess(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategyLearningAttempt: { findUnique: (...args: unknown[]) => attemptFindUnique(...args) },
  },
}));

vi.mock('@/services/strategyLearningMastery', async importOriginal => {
  const original = await importOriginal<typeof import('@/services/strategyLearningMastery')>();
  return {
    ...original,
    awardStrategyLearningMastery: (...args: unknown[]) => awardStrategyLearningMastery(...args),
  };
});

import { POST } from './route';

const knowledgeQuestion = BOLLINGER_MR_LONG_V2_CURRICULUM.questions.find(
  question => question.role === 'KNOWLEDGE_CHECK',
)!;

const storedAttempt = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  userId: 'child-1',
  sealedAt: new Date('2026-07-13T09:00:00.000Z'),
  result: { payload: { metrics: { learner: { return: 0.99 } } } },
  masteryEvents: [],
  ...overrides,
});

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/learning/strategy-attempts/attempt-1/mastery', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-15T09:00:00.000Z'));
  requireSession.mockResolvedValue({ id: 'child-1', role: 'CHILD', parentId: 'parent-1' });
  authorizeAccess.mockResolvedValue(undefined);
  attemptFindUnique.mockResolvedValue(storedAttempt());
  awardStrategyLearningMastery.mockImplementation(({ kind, response, correct }) => ({
    event: {
      id: `event-${kind}`, attemptId: 'attempt-1', kind, response, correct: correct ?? null,
      xp: 15, createdAt: new Date(),
    },
    profile: { xp: 35, level: 1, leveledUp: false },
    created: true,
  }));
});

describe('strategy learning mastery API', () => {
  it('requires authentication before reading the attempt', async () => {
    requireSession.mockRejectedValue({
      response: Response.json({ error: 'unauthorized' }, { status: 401 }),
    });

    const response = await POST(request({
      kind: 'REFLECTION', response: 'PROCESS_OVER_OUTCOME',
    }), { params: { attemptId: 'attempt-1' } });

    expect(response.status).toBe(401);
    expect(attemptFindUnique).not.toHaveBeenCalled();
  });

  it('enforces the delayed retrieval window without awarding XP early', async () => {
    attemptFindUnique.mockResolvedValue(storedAttempt({ sealedAt: new Date('2026-07-15T08:00:00.000Z') }));

    const response = await POST(request({
      kind: 'RETRIEVAL', questionId: knowledgeQuestion.id, optionId: knowledgeQuestion.correctOptionId,
    }), { params: { attemptId: 'attempt-1' } });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'retrieval_not_ready' });
    expect(awardStrategyLearningMastery).not.toHaveBeenCalled();
  });

  it('awards fixed retrieval XP after the delay and records correctness, not P&L', async () => {
    const response = await POST(request({
      kind: 'RETRIEVAL', questionId: knowledgeQuestion.id, optionId: knowledgeQuestion.correctOptionId,
    }), { params: { attemptId: 'attempt-1' } });

    expect(response.status).toBe(201);
    expect(awardStrategyLearningMastery).toHaveBeenCalledWith({
      attempt: { id: 'attempt-1', userId: 'child-1' },
      kind: 'RETRIEVAL',
      response: `${knowledgeQuestion.id}:${knowledgeQuestion.correctOptionId}`,
      correct: true,
    });
    expect(JSON.stringify(awardStrategyLearningMastery.mock.calls[0])).not.toContain('return');
  });

  it('awards the same reflection XP for every accepted reflection choice', async () => {
    for (const responseChoice of ['PROCESS_OVER_OUTCOME', 'RISK_OVER_RETURN'] as const) {
      vi.clearAllMocks();
      requireSession.mockResolvedValue({ id: 'child-1', role: 'CHILD', parentId: 'parent-1' });
      authorizeAccess.mockResolvedValue(undefined);
      attemptFindUnique.mockResolvedValue(storedAttempt());
      awardStrategyLearningMastery.mockResolvedValue({
        event: {
          id: 'reflection', attemptId: 'attempt-1', kind: 'REFLECTION', response: responseChoice,
          correct: null, xp: 15, createdAt: new Date(),
        },
        profile: { xp: 35, level: 1 },
        created: true,
      });

      const apiResponse = await POST(request({ kind: 'REFLECTION', response: responseChoice }), {
        params: { attemptId: 'attempt-1' },
      });
      expect(apiResponse.status).toBe(201);
      expect((await apiResponse.json()).award.xp).toBe(15);
    }
  });

  it('returns an identical retry once without creating a second event', async () => {
    const existing = {
      id: 'reflection', attemptId: 'attempt-1', kind: 'REFLECTION', response: 'PROCESS_OVER_OUTCOME',
      correct: null, xp: 15, createdAt: new Date('2026-07-15T08:00:00.000Z'),
    };
    attemptFindUnique.mockResolvedValue(storedAttempt({ masteryEvents: [existing] }));
    awardStrategyLearningMastery.mockResolvedValue({
      event: existing, profile: { xp: 35, level: 1 }, created: false,
    });

    const response = await POST(request({
      kind: 'REFLECTION', response: 'PROCESS_OVER_OUTCOME',
    }), { params: { attemptId: 'attempt-1' } });

    expect(response.status).toBe(200);
    expect((await response.json()).award.created).toBe(false);
  });

  it('rejects changing a mastery response after it is recorded', async () => {
    attemptFindUnique.mockResolvedValue(storedAttempt({
      masteryEvents: [{
        id: 'reflection', attemptId: 'attempt-1', kind: 'REFLECTION',
        response: 'PROCESS_OVER_OUTCOME', correct: null, xp: 15, createdAt: new Date(),
      }],
    }));

    const response = await POST(request({
      kind: 'REFLECTION', response: 'RISK_OVER_RETURN',
    }), { params: { attemptId: 'attempt-1' } });

    expect(response.status).toBe(409);
    expect(awardStrategyLearningMastery).not.toHaveBeenCalled();
  });
});
