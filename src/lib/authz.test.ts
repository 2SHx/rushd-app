// src/lib/authz.test.ts
// The 401/403 session guard (SYSTEM_DESIGN.md §8). Mocks '@/auth' at the
// module boundary — never the guard itself.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const auth = vi.fn();

vi.mock('@/auth', () => ({
  auth: (...args: unknown[]) => auth(...args),
}));

import { requireSession, requireParent, requireUltraTier, AuthzError, can, TIER_CAPABILITIES, type Capability } from './authz';

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

describe('can (DR-16 tier capability matrix)', () => {
  it('denies BASIC: NASDAQ trading, Economics track, advanced analytics', () => {
    const session = { tier: 'BASIC' as const };
    expect(can(session, 'trading:nasdaq')).toBe(false);
    expect(can(session, 'academy:track:economics')).toBe(false);
    expect(can(session, 'analytics:advanced')).toBe(false);
  });

  it('allows BASIC its own capabilities', () => {
    const session = { tier: 'BASIC' as const };
    expect(can(session, 'trading:tasi')).toBe(true);
    expect(can(session, 'market:overview:nasdaq')).toBe(true);
    expect(can(session, 'academy:track:foundations')).toBe(true);
    expect(can(session, 'academy:strategy-team:lesson1')).toBe(true);
    expect(can(session, 'workspace:unlock')).toBe(true);
  });

  it('denies PREMIUM the Advanced Analysis track but allows Economics + NASDAQ trading', () => {
    const session = { tier: 'PREMIUM' as const };
    expect(can(session, 'academy:track:advanced-financial-analysis')).toBe(false);
    expect(can(session, 'academy:track:economics')).toBe(true);
    expect(can(session, 'trading:nasdaq')).toBe(true);
    expect(can(session, 'ai:signals')).toBe(true);
    expect(can(session, 'workspace:unmetered')).toBe(true);
  });

  it('allows ULTRA every capability in the matrix', () => {
    const session = { tier: 'ULTRA' as const };
    for (const capability of TIER_CAPABILITIES.ULTRA) {
      expect(can(session, capability)).toBe(true);
    }
    expect(can(session, 'academy:track:advanced-financial-analysis')).toBe(true);
    expect(can(session, 'academy:capstones')).toBe(true);
    expect(can(session, 'analytics:advanced')).toBe(true);
    expect(can(session, 'analytics:quant')).toBe(true);
    expect(can(session, 'ai:priority')).toBe(true);
  });

  it('fails closed on an unknown capability', () => {
    const session = { tier: 'ULTRA' as const };
    expect(can(session, 'not:a:real:capability' as Capability)).toBe(false);
  });

  it('fails closed on a missing or undefined tier', () => {
    expect(can(undefined, 'quiz:access')).toBe(false);
    expect(can(null, 'quiz:access')).toBe(false);
    expect(can({ tier: undefined } as unknown as { tier: 'BASIC' }, 'quiz:access')).toBe(false);
  });
});
