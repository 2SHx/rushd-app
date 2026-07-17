import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const authorizeAccess = vi.fn();
const attemptFindFirst = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
  authorizeAccess: (...args: unknown[]) => authorizeAccess(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategyLearningAttempt: { findFirst: (...args: unknown[]) => attemptFindFirst(...args) },
  },
}));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ id: 'child-1', role: 'CHILD', parentId: 'parent-1' });
  authorizeAccess.mockResolvedValue(undefined);
  attemptFindFirst.mockResolvedValue(null);
});

describe('latest strategy learning attempt API', () => {
  it('returns no content when the learner has no completed attempt', async () => {
    const response = await GET(new Request('http://localhost/api/learning/strategy-attempts/latest'));

    expect(response.status).toBe(204);
    expect(attemptFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'child-1', setupId: 'bollinger-mr-long-v2' }),
    }));
  });

  it('authorizes a requested learner before returning the resumable mastery state', async () => {
    attemptFindFirst.mockResolvedValue({
      id: 'attempt-1',
      setupId: 'bollinger-mr-long-v2',
      attemptNumber: 2,
      answers: [{ questionId: 'q1', optionId: 'a1' }],
      sealedAt: new Date('2026-07-13T09:00:00.000Z'),
      createdAt: new Date('2026-07-13T09:00:00.000Z'),
      result: { payload: { series: {}, metrics: {} } },
      masteryEvents: [{
        id: 'event-1', attemptId: 'attempt-1', kind: 'COMPLETION', response: null,
        correct: null, xp: 20, createdAt: new Date('2026-07-13T09:01:00.000Z'),
      }],
    });

    const response = await GET(new Request(
      'http://localhost/api/learning/strategy-attempts/latest?userId=child-2',
    ));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(authorizeAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'child-1' }), 'child-2');
    expect(data).toMatchObject({
      attempt: { id: 'attempt-1', attemptNumber: 2 },
      mastery: { completion: { earned: true }, earnedXp: 20, maxXp: 50 },
    });
  });

  it('returns a lightweight exact-team completion summary for the league gate', async () => {
    attemptFindFirst.mockResolvedValue({
      id: 'attempt-1',
      setupId: 'bollinger-mr-long-v2',
      attemptNumber: 1,
      answers: [],
      sealedAt: new Date('2026-07-13T09:00:00.000Z'),
      createdAt: new Date('2026-07-13T09:00:00.000Z'),
      result: { payload: { large: 'replay-payload' } },
      masteryEvents: [],
    });

    const response = await GET(new Request(
      'http://localhost/api/learning/strategy-attempts/latest?setupId=bollinger-mr-long-v2&summary=1',
    ));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({
      completed: true,
      attempt: {
        id: 'attempt-1',
        setupId: 'bollinger-mr-long-v2',
        attemptNumber: 1,
        sealedAt: '2026-07-13T09:00:00.000Z',
      },
    });
    expect(data).not.toHaveProperty('result');
  });

  it("does not reuse another team's completion for the selected team", async () => {
    const response = await GET(new Request(
      'http://localhost/api/learning/strategy-attempts/latest?setupId=tom-overlay&summary=1',
    ));

    expect(response.status).toBe(204);
    expect(attemptFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'child-1',
        setupId: 'tom-overlay',
        result: { isNot: null },
      }),
    }));
  });

  it('fails closed when a strategy has no reviewed learning module', async () => {
    const response = await GET(new Request(
      'http://localhost/api/learning/strategy-attempts/latest?setupId=gapper-orb&summary=1',
    ));

    expect(response.status).toBe(404);
    expect(attemptFindFirst).not.toHaveBeenCalled();
  });
});
