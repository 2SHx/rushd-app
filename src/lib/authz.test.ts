// src/lib/authz.test.ts
// The 401/403 session guard (SYSTEM_DESIGN.md §8). Mocks '@/auth' at the
// module boundary — never the guard itself.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();

vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => auth(...args),
}));

import { requireSession, requireParent, requireUltraTier, AuthzError } from './authz';

beforeEach(() => {
  auth.mockReset();
});

describe('requireSession', () => {
  it('throws AuthzError(401) when there is no session', async () => {
    auth.mockResolvedValue(null);
    await expect(requireSession()).rejects.toBeInstanceOf(AuthzError);

    auth.mockResolvedValue(null);
    try {
      await requireSession();
      throw new Error('expected requireSession to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthzError);
      const response = (err as AuthzError).response;
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('returns the session user when a session exists', async () => {
    const user = { id: 'u1', role: 'PARENT', tier: 'BASIC', parentId: null };
    auth.mockResolvedValue({ user });
    await expect(requireSession()).resolves.toEqual(user);
  });
});

describe('requireParent', () => {
  it('throws 401 when there is no session at all', async () => {
    auth.mockResolvedValue(null);
    try {
      await requireParent();
      throw new Error('expected requireParent to throw');
    } catch (err) {
      expect((err as AuthzError).response.status).toBe(401);
    }
  });

  it('throws 403 when the session belongs to a CHILD', async () => {
    auth.mockResolvedValue({ user: { id: 'c1', role: 'CHILD', tier: 'BASIC', parentId: 'p1' } });
    try {
      await requireParent();
      throw new Error('expected requireParent to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AuthzError);
      const response = (err as AuthzError).response;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
  });

  it('passes through the session user when role is PARENT', async () => {
    const user = { id: 'p1', role: 'PARENT', tier: 'BASIC', parentId: null };
    auth.mockResolvedValue({ user });
    await expect(requireParent()).resolves.toEqual(user);
  });
});

describe('requireUltraTier', () => {
  it('throws 401 when there is no session', async () => {
    auth.mockResolvedValue(null);
    await expect(requireUltraTier()).rejects.toMatchObject({ response: expect.any(Response) });
  });

  it('throws 403 for BASIC and PREMIUM users', async () => {
    auth.mockResolvedValue({ user: { id: 'u1', role: 'PARENT', tier: 'BASIC', parentId: null } });
    await expect(requireUltraTier()).rejects.toMatchObject({ response: expect.any(Response) });

    auth.mockResolvedValue({ user: { id: 'u2', role: 'PARENT', tier: 'PREMIUM', parentId: null } });
    try {
      await requireUltraTier();
      throw new Error('expected requireUltraTier to throw');
    } catch (err) {
      const response = (err as AuthzError).response;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'forbidden' });
    }
  });

  it('passes through an ULTRA user', async () => {
    const user = { id: 'u3', role: 'PARENT', tier: 'ULTRA', parentId: null };
    auth.mockResolvedValue({ user });
    await expect(requireUltraTier()).resolves.toEqual(user);
  });
});
