import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOLLINGER_MR_LONG_V2_CURRICULUM } from '@/quant/learning/bollingerMrLongV2Curriculum';

const events: string[] = [];
const requireSession = vi.fn();
const authorizeAccess = vi.fn();
const attemptFindUnique = vi.fn();
const attemptCount = vi.fn();
const attemptCreate = vi.fn();
const resultCreate = vi.fn();
const transaction = vi.fn();
const replay = vi.fn();
const loadFixture = vi.fn();
const savingsJarUpdate = vi.fn();
const transactionCreate = vi.fn();
const portfolioItemUpdate = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
  authorizeAccess: (...args: unknown[]) => authorizeAccess(...args),
}));

const tx = {
  strategyLearningAttempt: {
    count: (...args: unknown[]) => attemptCount(...args),
    create: (...args: unknown[]) => attemptCreate(...args),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategyLearningAttempt: {
      findUnique: (...args: unknown[]) => attemptFindUnique(...args),
    },
    strategyLearningResult: {
      create: (...args: unknown[]) => resultCreate(...args),
    },
    $transaction: (...args: unknown[]) => transaction(...args),
    savingsJar: { update: (...args: unknown[]) => savingsJarUpdate(...args) },
    transaction: { create: (...args: unknown[]) => transactionCreate(...args) },
    portfolioItem: { update: (...args: unknown[]) => portfolioItemUpdate(...args) },
  },
}));

vi.mock('@/quant/learning/strategyLearningReplay', () => ({
  loadBollingerMrLongV2LearningFixture: () => loadFixture(),
  replayBollingerMrLongV2LearningPolicy: (...args: unknown[]) => replay(...args),
}));

import { POST } from './route';
import { GET, PATCH } from './[attemptId]/route';

const teamAnswers = BOLLINGER_MR_LONG_V2_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));
const replayResult = {
  setupId: 'bollinger-mr-long-v2',
  setupVersion: 'v2',
  policyHash: 'sha256:policy',
  interval: { start: '2025-11-11T00:00:00.000Z', end: '2026-02-11T00:00:00.000Z' },
  series: { learner: [], team: [], spus: [], spy: [] },
  metrics: {},
};
const fixture = {
  fixtureVersion: 'bollinger-mr-long-v2.learning-replay.v1',
  capturedAt: '2026-07-15T07:51:00.565Z',
  warmupStart: '2025-01-15T00:00:00.000Z',
  interval: {
    start: '2025-11-11T00:00:00.000Z',
    end: '2026-02-11T00:00:00.000Z',
    oosStart: '2025-11-11T00:00:00.000Z',
  },
  strategyUniverse: ['AAPL'],
  series: [{ source: 'YAHOO' }],
};

const body = (overrides: Record<string, unknown> = {}) => ({
  userId: 'child-1',
  setupId: 'bollinger-mr-long-v2',
  idempotencyKey: 'completion-1',
  answers: teamAnswers,
  ...overrides,
});

function request(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/learning/strategy-attempts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body(overrides)),
  });
}

const storedAttempt = (overrides: Record<string, unknown> = {}) => ({
  id: 'attempt-1',
  userId: 'child-1',
  setupId: 'bollinger-mr-long-v2',
  setupVersion: 'v2',
  questionSetVersion: 'bollinger-mr-long-v2.questions.v1',
  policyVersion: 'bollinger-mr-long-v2.policy.v1',
  policyHash: 'sha256:placeholder',
  complianceTag: 'EDUCATIONAL_ONLY',
  attemptNumber: 1,
  idempotencyKey: 'completion-1',
  answers: teamAnswers,
  compiledPolicy: {},
  replayConfig: {},
  dataProvenance: {},
  retryOfId: null,
  sealedAt: new Date('2026-07-15T08:00:00.000Z'),
  createdAt: new Date('2026-07-15T08:00:00.000Z'),
  result: null,
  ...overrides,
});

beforeEach(() => {
  events.length = 0;
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ id: 'parent-1', role: 'PARENT', tier: 'ULTRA', parentId: null });
  authorizeAccess.mockResolvedValue(undefined);
  attemptFindUnique.mockResolvedValue(null);
  attemptCount.mockResolvedValue(0);
  loadFixture.mockReturnValue(fixture);
  replay.mockImplementation(() => {
    events.push('replay');
    return replayResult;
  });
  transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
  attemptCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    events.push('attempt.create');
    return storedAttempt({ ...data, policyHash: String(data.policyHash) });
  });
  resultCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
    events.push('result.create');
    return { id: 'result-1', attemptId: data.attemptId, payload: data.payload, createdAt: new Date() };
  });
});

describe('strategy learning attempt API', () => {
  it('requires authentication before reading or writing attempts', async () => {
    requireSession.mockRejectedValue({
      response: Response.json({ error: 'unauthorized' }, { status: 401 }),
    });

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(attemptFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('seals the attempt before replay reveal and never touches money/order models', async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(events).toEqual(['attempt.create', 'replay', 'result.create']);
    expect(attemptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: 'child-1',
        attemptNumber: 1,
        sealedAt: expect.any(Date),
        complianceTag: 'EDUCATIONAL_ONLY',
      }),
    }));
    expect(savingsJarUpdate).not.toHaveBeenCalled();
    expect(transactionCreate).not.toHaveBeenCalled();
    expect(portfolioItemUpdate).not.toHaveBeenCalled();
  });

  it('returns the existing result for an idempotent completion', async () => {
    const firstPolicyHash = (await import('@/quant/learning/bollingerMrLongV2Curriculum'))
      .compileBollingerMrLongV2Policy(teamAnswers).policyHash;
    attemptFindUnique.mockResolvedValue(storedAttempt({
      policyHash: firstPolicyHash,
      answers: teamAnswers.map(answer => ({ optionId: answer.optionId, questionId: answer.questionId })),
      result: { id: 'result-1', payload: replayResult, createdAt: new Date() },
    }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(attemptCreate).not.toHaveBeenCalled();
    expect(replay).not.toHaveBeenCalled();
    expect(resultCreate).not.toHaveBeenCalled();
  });

  it('resumes a sealed attempt whose result write was interrupted', async () => {
    const firstPolicyHash = (await import('@/quant/learning/bollingerMrLongV2Curriculum'))
      .compileBollingerMrLongV2Policy(teamAnswers).policyHash;
    attemptFindUnique.mockResolvedValue(storedAttempt({ policyHash: firstPolicyHash }));

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(attemptCreate).not.toHaveBeenCalled();
    expect(events).toEqual(['replay', 'result.create']);
  });

  it('creates a newly numbered row for a retry', async () => {
    attemptFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(storedAttempt({ id: 'attempt-0', idempotencyKey: 'old-key' }));
    attemptCount.mockResolvedValue(1);

    const response = await POST(request({
      idempotencyKey: 'completion-2',
      retryOfAttemptId: 'attempt-0',
    }));

    expect(response.status).toBe(201);
    expect(attemptCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ attemptNumber: 2, retryOfId: 'attempt-0' }),
    }));
  });

  it('returns 409 when a client tries to mutate a sealed attempt', async () => {
    attemptFindUnique.mockResolvedValue(storedAttempt());

    const response = await PATCH(
      new Request('http://localhost/api/learning/strategy-attempts/attempt-1', { method: 'PATCH' }),
      { params: { attemptId: 'attempt-1' } },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'learning_attempt_sealed' });
  });

  it('blocks cross-family reads before returning attempt data', async () => {
    attemptFindUnique.mockResolvedValue(storedAttempt());
    authorizeAccess.mockRejectedValue({
      response: Response.json({ error: 'forbidden' }, { status: 403 }),
    });

    const response = await GET(
      new Request('http://localhost/api/learning/strategy-attempts/attempt-1'),
      { params: { attemptId: 'attempt-1' } },
    );

    expect(response.status).toBe(403);
    expect(resultCreate).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused with different answers', async () => {
    const changedAnswers = structuredClone(teamAnswers);
    changedAnswers[0].optionId = 'loss-is-impossible';
    attemptFindUnique.mockResolvedValue(storedAttempt({ answers: changedAnswers }));

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'idempotency_conflict' });
    expect(replay).not.toHaveBeenCalled();
  });

  it('rejects an idempotency key reused for a different retry relationship', async () => {
    const firstPolicyHash = (await import('@/quant/learning/bollingerMrLongV2Curriculum'))
      .compileBollingerMrLongV2Policy(teamAnswers).policyHash;
    attemptFindUnique.mockResolvedValue(storedAttempt({ policyHash: firstPolicyHash }));

    const response = await POST(request({ retryOfAttemptId: 'different-attempt' }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'idempotency_conflict' });
    expect(replay).not.toHaveBeenCalled();
  });
});
