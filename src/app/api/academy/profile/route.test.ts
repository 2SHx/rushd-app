import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireSession: () => requireSession(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    learnerProfile: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

// Minimal stand-in for the frozen interface from the parallel diagnostic
// dispatch (src/academy/diagnostic). Scoring itself is out of scope here —
// this route only has to delegate to it correctly. A real zod schema is
// used (questionId -> optionId) so it composes correctly inside the
// route's own z.object({ answers: diagnosticAnswersSchema.optional() }).
const scoreDiagnostic = vi.fn();
const defaultProfile = vi.fn();
vi.mock('@/academy/diagnostic', async () => {
  const { z } = await import('zod');
  return {
    diagnosticAnswersSchema: z.record(z.string(), z.string()),
    scoreDiagnostic: (...args: unknown[]) => scoreDiagnostic(...args),
    defaultProfile: (...args: unknown[]) => defaultProfile(...args),
  };
});

import { GET, POST } from './route';

function postRequest(body: unknown) {
  return new Request('http://localhost/api/academy/profile', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

const AUTHZ_401 = new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });

beforeEach(() => {
  vi.clearAllMocks();
  requireSession.mockResolvedValue({ id: 'child-1', role: 'CHILD', tier: 'BASIC', parentId: 'parent-1' });
  findUnique.mockResolvedValue(null);
  defaultProfile.mockReturnValue({ persona: 'BEGINNER', baselineKnowledge: 0, skillLevel: 1, profileVersion: 1 });
  scoreDiagnostic.mockReturnValue({ persona: 'BUILDER', baselineKnowledge: 3, skillLevel: 2, profileVersion: 1 });
  upsert.mockImplementation(({ create }: { create: Record<string, unknown> }) => ({ id: 'lp-1', ...create }));
});

describe('GET /api/academy/profile', () => {
  it('401s when unauthenticated', async () => {
    requireSession.mockRejectedValue({ response: AUTHZ_401 });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns null when no profile exists yet', async () => {
    findUnique.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.profile).toBeNull();
  });

  it('reads only the caller own profile (self-only by construction)', async () => {
    findUnique.mockResolvedValue({ userId: 'child-1', persona: 'BUILDER' });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'child-1' } });
  });
});

describe('POST /api/academy/profile', () => {
  it('401s when unauthenticated', async () => {
    requireSession.mockRejectedValue({ response: AUTHZ_401 });
    const res = await POST(postRequest({}));
    expect(res.status).toBe(401);
  });

  it('skip path (no answers) stores the default profile', async () => {
    const res = await POST(postRequest({}));
    expect(res.status).toBe(200);
    expect(defaultProfile).toHaveBeenCalledWith({ isChild: true });
    expect(scoreDiagnostic).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'child-1' },
      create: expect.objectContaining({ userId: 'child-1', persona: 'BEGINNER', diagnosticAnswers: {} }),
    }));
  });

  it('CHILD submission is scored with isChild: true, delegated entirely to the scorer', async () => {
    scoreDiagnostic.mockReturnValue({ persona: 'BUILDER', baselineKnowledge: 2, skillLevel: 2, profileVersion: 1 });
    const res = await POST(postRequest({ answers: { q1: 'a' } }));
    expect(res.status).toBe(200);
    expect(scoreDiagnostic).toHaveBeenCalledWith({ q1: 'a' }, { isChild: true });
    const json = await res.json();
    expect(json.profile.persona).not.toMatch(/^ADULT_|^QUANT_CANDIDATE$/);
  });

  it('re-take upserts persona/levels/answers (own row only)', async () => {
    const res = await POST(postRequest({ answers: { q1: 'b' } }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'child-1' },
      update: expect.objectContaining({ persona: 'BUILDER', diagnosticAnswers: { q1: 'b' } }),
    }));
  });

  it('never stores an age/birthdate key in diagnosticAnswers', async () => {
    await POST(postRequest({ answers: { q1: 'a', q2: 'b' } }));
    const call = upsert.mock.calls[0][0];
    const storedKeys = Object.keys(call.create.diagnosticAnswers as Record<string, unknown>);
    expect(storedKeys.some(k => /age|birth/i.test(k))).toBe(false);
  });

  it('rejects a rapid re-take within the cooldown window with 429 + Retry-After', async () => {
    findUnique.mockResolvedValue({ userId: 'child-1', updatedAt: new Date(Date.now() - 2_000) });
    const res = await POST(postRequest({ answers: { q1: 'a' } }));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows a re-take once the cooldown has elapsed', async () => {
    findUnique.mockResolvedValue({ userId: 'child-1', updatedAt: new Date(Date.now() - 11_000) });
    const res = await POST(postRequest({ answers: { q1: 'a' } }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
