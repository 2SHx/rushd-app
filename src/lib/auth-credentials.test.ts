// src/lib/auth-credentials.test.ts
// DR-1: lockout-aware Credentials branches. Mocks prisma at the module
// boundary; bcrypt runs for real (cost 4 fixtures — compare doesn't care
// about the cost the hash was produced with).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const findUnique = vi.fn();
const update = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));

import { authorizeParent, authorizeChild } from './auth-credentials';

const PASSWORD = 'correct-horse-battery-staple';
const PIN = '4242';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);
const PIN_HASH = bcrypt.hashSync(PIN, 4);

function baseParent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'parent-1',
    role: 'PARENT',
    tier: 'BASIC',
    parentId: null,
    email: 'parent@example.com',
    passwordHash: PASSWORD_HASH,
    familyCode: 'ABCDEF',
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function baseChild(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'child-1',
    role: 'CHILD',
    tier: 'BASIC',
    parentId: 'parent-1',
    username: 'kiddo',
    passwordHash: PIN_HASH,
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

beforeEach(() => {
  findUnique.mockReset();
  update.mockReset();
  vi.useRealTimers();
});

describe('authorizeParent', () => {
  it('happy path: correct email/password returns the session shape and resets counters', async () => {
    const parent = baseParent();
    findUnique.mockResolvedValue(parent);

    const result = await authorizeParent({ email: parent.email, password: PASSWORD });

    expect(result).toEqual({ id: 'parent-1', role: 'PARENT', tier: 'BASIC', parentId: null });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  it('wrong password returns null and increments failedLoginCount without locking', async () => {
    findUnique.mockResolvedValue(baseParent({ failedLoginCount: 2 }));

    const result = await authorizeParent({ email: 'parent@example.com', password: 'nope' });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { failedLoginCount: 3, lockedUntil: null },
    });
  });

  it('5th consecutive failure locks the account for ~15 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T00:00:00.000Z'));
    findUnique.mockResolvedValue(baseParent({ failedLoginCount: 4 }));

    const result = await authorizeParent({ email: 'parent@example.com', password: 'nope' });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { failedLoginCount: 5, lockedUntil: new Date('2026-07-06T00:15:00.000Z') },
    });
  });

  it('a locked account rejects even the correct password, and registers no further attempt', async () => {
    findUnique.mockResolvedValue(
      baseParent({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 10 * 60_000) })
    );

    const result = await authorizeParent({ email: 'parent@example.com', password: PASSWORD });

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('once the lock window has passed, a correct password logs in again and resets counters', async () => {
    findUnique.mockResolvedValue(
      baseParent({ failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) })
    );

    const result = await authorizeParent({ email: 'parent@example.com', password: PASSWORD });

    expect(result).not.toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  });

  it('rejects malformed input via zod without ever touching the DB', async () => {
    const result = await authorizeParent({ email: 'not-an-email', password: '' });
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('never reveals a missing user vs. a wrong password (both return null uniformly)', async () => {
    findUnique.mockResolvedValue(null);
    const result = await authorizeParent({ email: 'ghost@example.com', password: PASSWORD });
    expect(result).toBeNull();
  });

  it('runs a dummy bcrypt compare when the account does not exist (timing side-channel closed)', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    findUnique.mockResolvedValue(null);

    const result = await authorizeParent({ email: 'ghost@example.com', password: PASSWORD });

    expect(result).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith(PASSWORD, expect.any(String));
    compareSpy.mockRestore();
  });

  it('an expired lock resets the counter: a single wrong attempt after expiry does not immediately re-lock', async () => {
    findUnique.mockResolvedValue(
      baseParent({ failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) })
    );

    const result = await authorizeParent({ email: 'parent@example.com', password: 'nope' });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      data: { failedLoginCount: 1, lockedUntil: null },
    });
  });
});

describe('authorizeChild', () => {
  it('happy path: familyCode -> parent -> child chain with correct PIN succeeds', async () => {
    const parent = baseParent();
    const child = baseChild();
    findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ('familyCode' in args.where) return parent;
      if ('parentId_username' in args.where) return child;
      return null;
    });

    const result = await authorizeChild({ familyCode: 'ABCDEF', username: 'kiddo', pin: PIN });

    expect(result).toEqual({ id: 'child-1', role: 'CHILD', tier: 'BASIC', parentId: 'parent-1' });
    expect(findUnique).toHaveBeenCalledWith({
      where: { parentId_username: { parentId: 'parent-1', username: 'kiddo' } },
    });
  });

  it('wrong PIN returns null and increments the child failedLoginCount', async () => {
    findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ('familyCode' in args.where) return baseParent();
      return baseChild({ failedLoginCount: 1 });
    });

    const result = await authorizeChild({ familyCode: 'ABCDEF', username: 'kiddo', pin: 'wrong' });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { failedLoginCount: 2, lockedUntil: null },
    });
  });

  it('an unknown familyCode returns null without a second lookup', async () => {
    findUnique.mockResolvedValue(null);
    const result = await authorizeChild({ familyCode: 'ZZZZZZ', username: 'kiddo', pin: PIN });
    expect(result).toBeNull();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('an unknown username (valid familyCode) still returns null, running a dummy compare', async () => {
    const compareSpy = vi.spyOn(bcrypt, 'compare');
    findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ('familyCode' in args.where) return baseParent();
      return null;
    });

    const result = await authorizeChild({ familyCode: 'ABCDEF', username: 'ghost', pin: PIN });

    expect(result).toBeNull();
    expect(compareSpy).toHaveBeenCalledTimes(1);
    expect(compareSpy).toHaveBeenCalledWith(PIN, expect.any(String));
    compareSpy.mockRestore();
  });

  it('an expired lock resets the counter: a single wrong PIN after expiry does not immediately re-lock', async () => {
    findUnique.mockImplementation(async (args: { where: Record<string, unknown> }) => {
      if ('familyCode' in args.where) return baseParent();
      return baseChild({ failedLoginCount: 5, lockedUntil: new Date(Date.now() - 1000) });
    });

    const result = await authorizeChild({ familyCode: 'ABCDEF', username: 'kiddo', pin: 'wrong' });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledWith({
      where: { id: 'child-1' },
      data: { failedLoginCount: 1, lockedUntil: null },
    });
  });

  it('rejects malformed input via zod without ever touching the DB', async () => {
    const result = await authorizeChild({ familyCode: '', username: 'kiddo', pin: '' });
    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
