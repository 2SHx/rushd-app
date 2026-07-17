import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const authorizeAccess = vi.fn();
const userFindUnique = vi.fn();
const progressFindUnique = vi.fn();
const progressUpsert = vi.fn();
const progressFindMany = vi.fn();
const gamificationFindUnique = vi.fn();
const gamificationCreate = vi.fn();
const gamificationUpdate = vi.fn();

const TIER_CAPABILITIES: Record<string, string[]> = {
  BASIC: ['academy:track:foundations'],
  PREMIUM: ['academy:track:foundations', 'academy:track:economics'],
  ULTRA: ['academy:track:foundations', 'academy:track:economics', 'academy:track:advanced-financial-analysis'],
};

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
  authorizeAccess: (...args: unknown[]) => authorizeAccess(...args),
  can: (session: { tier?: string } | null | undefined, capability: string) =>
    !!session?.tier && (TIER_CAPABILITIES[session.tier] ?? []).includes(capability),
}));

const tx = {
  academyProgress: {
    findUnique: (...args: unknown[]) => progressFindUnique(...args),
    upsert: (...args: unknown[]) => progressUpsert(...args),
  },
  gamificationProfile: {
    findUnique: (...args: unknown[]) => gamificationFindUnique(...args),
    create: (...args: unknown[]) => gamificationCreate(...args),
    update: (...args: unknown[]) => gamificationUpdate(...args),
  },
};

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => userFindUnique(...args) },
    academyProgress: {
      findMany: (...args: unknown[]) => progressFindMany(...args),
      findUnique: (...args: unknown[]) => progressFindUnique(...args),
      upsert: (...args: unknown[]) => progressUpsert(...args),
    },
    $transaction: (callback: (client: typeof tx) => unknown) => callback(tx),
  },
}));

import { GET, POST } from './route';

const KIDS_LESSON = {
  userId: 'child-1',
  trackId: 'foundations',
  unitId: 'money-basics',
  lessonId: 'money-basics-kids',
  contentVersion: 1,
  answers: { 'money-basics-kids-cp1': 0 },
};

const TEENS_LESSON = {
  userId: 'child-1',
  trackId: 'foundations',
  unitId: 'money-basics',
  lessonId: 'money-basics-teens',
  contentVersion: 1,
  answers: { 'money-basics-teens-cp1': 0 },
};

const ULTRA_LESSON = {
  userId: 'child-1',
  trackId: 'advanced-analysis',
  unitId: 'fs-deep-dive',
  lessonId: 'adv-u1-intro',
  contentVersion: 1,
  answers: { 'adv-u1-intro-cp': 0 },
};

function postRequest(body: unknown) {
  return new Request('http://localhost/api/academy/progress', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const basicChildRow = {
  id: 'child-1',
  role: 'CHILD',
  tier: 'BASIC',
  ageSegment: 'TEENS',
  parent: { tier: 'BASIC' },
};

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ id: 'child-1', role: 'CHILD', tier: 'BASIC', parentId: 'parent-1' });
  authorizeAccess.mockResolvedValue(undefined);
  userFindUnique.mockResolvedValue(basicChildRow);
  progressFindUnique.mockResolvedValue(null);
  progressUpsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => ({
    id: 'progress-1',
    status: 'COMPLETED',
    ...create,
  }));
  gamificationFindUnique.mockResolvedValue({ userId: 'child-1', xp: 0, level: 1 });
  gamificationUpdate.mockResolvedValue({ userId: 'child-1', xp: 20, level: 1 });
});

describe('POST /api/academy/progress', () => {
  it('writes progress and awards exactly one XP event on first completion', async () => {
    const res = await POST(postRequest(KIDS_LESSON));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.xpAwarded).toBe(true);
    expect(progressUpsert).toHaveBeenCalledTimes(1);
    expect(gamificationUpdate).toHaveBeenCalledTimes(1);
    expect(gamificationUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ xp: 20 }) }));
  });

  it('repeat completion is a no-op: no second XP event', async () => {
    progressFindUnique.mockResolvedValue({
      id: 'progress-1',
      status: 'COMPLETED',
      userId: 'child-1',
      trackId: 'foundations',
      unitId: 'money-basics',
      lessonId: 'money-basics-kids',
    });
    const res = await POST(postRequest(KIDS_LESSON));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.xpAwarded).toBe(false);
    expect(progressUpsert).not.toHaveBeenCalled();
    expect(gamificationUpdate).not.toHaveBeenCalled();
  });

  it('cross-user access is 403', async () => {
    requireSession.mockResolvedValue({ id: 'parent-1', role: 'PARENT', tier: 'BASIC', parentId: null });
    const res = await POST(postRequest({ ...KIDS_LESSON, userId: 'child-1' }));
    expect(res.status).toBe(403);
    expect(progressUpsert).not.toHaveBeenCalled();
  });

  it('requires one valid checkpoint answer before awarding completion XP', async () => {
    const missing = await POST(postRequest({ ...KIDS_LESSON, answers: undefined }));
    expect(missing.status).toBe(400);

    const invalid = await POST(postRequest({
      ...KIDS_LESSON,
      answers: { 'money-basics-kids-cp1': 99 },
    }));
    expect(invalid.status).toBe(400);
    expect(progressUpsert).not.toHaveBeenCalled();
    expect(gamificationUpdate).not.toHaveBeenCalled();
  });

  it('derives checkpoint score server-side while rewarding completion rather than correctness', async () => {
    const res = await POST(postRequest({
      ...KIDS_LESSON,
      answers: { 'money-basics-kids-cp1': 1 },
    }));
    expect(res.status).toBe(201);
    expect(progressUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ score: 0 }),
    }));
    expect(gamificationUpdate).toHaveBeenCalledTimes(1);
  });

  it('BASIC tier is blocked from an ULTRA-gated track lesson', async () => {
    userFindUnique.mockResolvedValue({ ...basicChildRow, ageSegment: 'ADULTS', tier: 'BASIC', parent: { tier: 'BASIC' } });
    const res = await POST(postRequest(ULTRA_LESSON));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('tier_gate');
    expect(progressUpsert).not.toHaveBeenCalled();
  });

  it('a KIDS-segment child requesting a TEENS lesson gets 403', async () => {
    userFindUnique.mockResolvedValue({ ...basicChildRow, ageSegment: 'KIDS', parent: { tier: 'ULTRA' } });
    const res = await POST(postRequest(TEENS_LESSON));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('segment_gate');
    expect(progressUpsert).not.toHaveBeenCalled();
  });

  it('unknown lesson ids 404', async () => {
    const res = await POST(postRequest({ ...KIDS_LESSON, lessonId: 'does-not-exist' }));
    expect(res.status).toBe(404);
  });

  it('a stale contentVersion 409s', async () => {
    const res = await POST(postRequest({ ...KIDS_LESSON, contentVersion: 999 }));
    expect(res.status).toBe(409);
  });
});

describe('GET /api/academy/progress', () => {
  it('returns the caller own progress', async () => {
    progressFindMany.mockResolvedValue([{ id: 'p1' }]);
    const res = await GET(new Request('http://localhost/api/academy/progress'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.progress).toEqual([{ id: 'p1' }]);
    expect(authorizeAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'child-1' }), 'child-1');
  });

  it('cross-user read is 403', async () => {
    const forbidden = new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 });
    authorizeAccess.mockRejectedValue({ response: forbidden });
    const res = await GET(new Request('http://localhost/api/academy/progress?userId=other-child'));
    expect(res.status).toBe(403);
  });
});
