// src/app/api/quiz/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const requireSession = vi.fn();
const addXP = vi.fn();

const quizAttemptCreate = vi.fn();
const profileFindUnique = vi.fn();
const profileCreate = vi.fn();
const generateObject = vi.fn();
const createOpenAI = vi.fn((_config?: unknown) => vi.fn(() => ({ id: 'app-model' })));

vi.mock('ai', () => ({ generateObject: (...args: unknown[]) => generateObject(...args) }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: (...args: unknown[]) => createOpenAI(args[0]) }));

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
}));

vi.mock('@/services/engines', () => ({
  addXP: (...args: unknown[]) => addXP(...args),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    quizAttempt: {
      create: (...args: unknown[]) => quizAttemptCreate(...args),
    },
    gamificationProfile: {
      findUnique: (...args: unknown[]) => profileFindUnique(...args),
      create: (...args: unknown[]) => profileCreate(...args),
    },
  },
}));

import { GET, POST } from './route';

beforeEach(() => {
  requireSession.mockReset();
  addXP.mockReset();
  quizAttemptCreate.mockReset();
  profileFindUnique.mockReset();
  profileCreate.mockReset();
  generateObject.mockReset();
  createOpenAI.mockClear();
  delete process.env.APP_LLM_MODE;
  delete process.env.APP_LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe('GET /api/quiz', () => {
  it('uses the local bank with zero model calls by default, even with a generic OpenAI key', async () => {
    process.env.OPENAI_API_KEY = 'generic-key';
    const res = await GET(new Request('http://localhost/api/quiz?topic=Risk%20Management'));
    expect(res.status).toBe(200);
    expect((await res.json()).topic).toBe('Risk Management');
    expect(generateObject).not.toHaveBeenCalled();
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  it('generates only when APP_LLM_MODE=live and APP_LLM_API_KEY are both set', async () => {
    process.env.APP_LLM_MODE = 'live';
    process.env.APP_LLM_API_KEY = 'app-key';
    const object = {
      topic: 'Risk Management',
      question: 'q',
      options: ['a', 'b', 'c', 'd'],
      correctOptionIndex: 0,
      explanation: 'e',
      complianceTag: 'EDUCATIONAL_ONLY',
    };
    generateObject.mockResolvedValue({ object });
    const res = await GET(new Request('http://localhost/api/quiz?topic=Risk%20Management'));
    expect(await res.json()).toEqual(object);
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(createOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'app-key' }));
  });
});

describe('POST /api/quiz', () => {
  it('returns 401 if user is unauthenticated', async () => {
    const mockResponse = { status: 401, json: async () => ({ error: 'unauthorized' }) };
    requireSession.mockRejectedValue({ response: mockResponse });

    const req = new Request('http://localhost/api/quiz', {
      method: 'POST',
      body: JSON.stringify({ topic: 'Stock Market Basics', score: 100, passed: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('saves quiz attempt and awards XP on pass', async () => {
    const user = { id: 'u1', role: 'CHILD', tier: 'BASIC', parentId: 'p1' };
    requireSession.mockResolvedValue(user);

    quizAttemptCreate.mockResolvedValue({ id: 'attempt1' });
    profileFindUnique.mockResolvedValue({ userId: 'u1', xp: 100, level: 2 });
    addXP.mockResolvedValue({ xp: 150, level: 2, leveledUp: false });

    const req = new Request('http://localhost/api/quiz', {
      method: 'POST',
      body: JSON.stringify({ topic: 'Stock Market Basics', score: 100, passed: true }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      attemptId: 'attempt1',
      xp: 150,
      level: 2,
      leveledUp: false,
    });

    expect(quizAttemptCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        topic: 'Stock Market Basics',
        score: 100,
        passed: true,
      },
    });
    expect(addXP).toHaveBeenCalledWith('u1', 50);
  });

  it('saves quiz attempt but does not award XP on fail', async () => {
    const user = { id: 'u1', role: 'CHILD', tier: 'BASIC', parentId: 'p1' };
    requireSession.mockResolvedValue(user);

    quizAttemptCreate.mockResolvedValue({ id: 'attempt2' });
    profileFindUnique.mockResolvedValue({ userId: 'u1', xp: 100, level: 2 });

    const req = new Request('http://localhost/api/quiz', {
      method: 'POST',
      body: JSON.stringify({ topic: 'Stock Market Basics', score: 40, passed: false }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      attemptId: 'attempt2',
      xp: 100,
      level: 2,
      leveledUp: false,
    });

    expect(quizAttemptCreate).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        topic: 'Stock Market Basics',
        score: 40,
        passed: false,
      },
    });
    expect(addXP).not.toHaveBeenCalled();
  });
});
