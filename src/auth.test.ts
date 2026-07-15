// src/auth.test.ts
// Pins the session contract for the `auth()` wrapper while auth is hidden
// (user decision, 2026-07-14): development ALWAYS fabricates the mock
// session (no login wall locally); any other non-prod env needs SKIP_AUTH=1;
// production NEVER fabricates, regardless of SKIP_AUTH. Mocks next-auth's
// core at the module boundary (never the wrapper under test).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mutableEnv = process.env as Record<string, string | undefined>;
const ORIGINAL_SKIP_AUTH = mutableEnv.SKIP_AUTH;
const ORIGINAL_NODE_ENV = mutableEnv.NODE_ENV;

const nextAuthInnerAuth = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const savingsJarCreate = vi.fn();
const gamificationProfileCreate = vi.fn();

vi.mock('next-auth', () => ({
  default: () => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: (...args: unknown[]) => nextAuthInnerAuth(...args),
  }),
}));

vi.mock('next-auth/providers/credentials', () => ({
  default: (opts: unknown) => opts,
}));

vi.mock('@/auth.config', () => ({
  authConfig: { providers: [], secret: 'test-secret', session: { strategy: 'jwt' } },
}));

vi.mock('@/lib/auth-credentials', () => ({
  authorizeParent: vi.fn(),
  authorizeChild: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      create: (...args: unknown[]) => create(...args),
      update: vi.fn(),
    },
    savingsJar: { create: (...args: unknown[]) => savingsJarCreate(...args) },
    gamificationProfile: { create: (...args: unknown[]) => gamificationProfileCreate(...args) },
  },
}));

beforeEach(() => {
  vi.resetModules();
  nextAuthInnerAuth.mockReset();
  findUnique.mockReset();
  create.mockReset();
  savingsJarCreate.mockReset();
  gamificationProfileCreate.mockReset();
});

afterEach(() => {
  mutableEnv.SKIP_AUTH = ORIGINAL_SKIP_AUTH;
  mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
});

describe('auth() wrapper — no-session means no-session', () => {
  it('returns null when there is no real session outside development and SKIP_AUTH is unset', async () => {
    delete mutableEnv.SKIP_AUTH;
    mutableEnv.NODE_ENV = 'test';
    nextAuthInnerAuth.mockResolvedValue(null);

    const { auth } = await import('./auth');
    const session = await auth();

    expect(session).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('fabricates the mock session in development even without SKIP_AUTH (auth hidden for now)', async () => {
    delete mutableEnv.SKIP_AUTH;
    mutableEnv.NODE_ENV = 'development';
    nextAuthInnerAuth.mockResolvedValue(null);
    findUnique.mockResolvedValue({ id: 'mock-child-id', role: 'PARENT', tier: 'ULTRA' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { auth } = await import('./auth');
    const session = await auth();

    expect(session?.user?.id).toBe('mock-child-id');
    expect(session?.user?.tier).toBe('ULTRA');

    warnSpy.mockRestore();
  });

  it('returns null when SKIP_AUTH=1 but NODE_ENV=production (both gates required)', async () => {
    mutableEnv.SKIP_AUTH = '1';
    mutableEnv.NODE_ENV = 'production';
    nextAuthInnerAuth.mockResolvedValue(null);

    const { auth } = await import('./auth');
    const session = await auth();

    expect(session).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('passes through a real session untouched', async () => {
    delete mutableEnv.SKIP_AUTH;
    mutableEnv.NODE_ENV = 'production';
    const realSession = { user: { id: 'real-user', role: 'CHILD', tier: 'BASIC', parentId: 'p1' } };
    nextAuthInnerAuth.mockResolvedValue(realSession);

    const { auth } = await import('./auth');
    await expect(auth()).resolves.toBe(realSession);
  });

  it('fabricates the mock ULTRA/PARENT session ONLY when SKIP_AUTH=1 AND NODE_ENV!=production, and warns once', async () => {
    mutableEnv.SKIP_AUTH = '1';
    mutableEnv.NODE_ENV = 'development';
    nextAuthInnerAuth.mockResolvedValue(null);
    findUnique.mockResolvedValue({ id: 'mock-child-id', role: 'PARENT', tier: 'ULTRA' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { auth } = await import('./auth');
    const session = await auth();

    expect(session?.user?.id).toBe('mock-child-id');
    expect(session?.user?.role).toBe('PARENT');
    expect(session?.user?.tier).toBe('ULTRA');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/SKIP_AUTH/);

    await auth();
    expect(warnSpy).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
