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
const ORIGINAL_PUBLIC_DEMO_MODE = mutableEnv.PUBLIC_DEMO_MODE;

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
  mutableEnv.PUBLIC_DEMO_MODE = ORIGINAL_PUBLIC_DEMO_MODE;
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

  it('returns null when SKIP_AUTH=1 but NODE_ENV=production without PUBLIC_DEMO_MODE', async () => {
    mutableEnv.SKIP_AUTH = '1';
    mutableEnv.NODE_ENV = 'production';
    delete mutableEnv.PUBLIC_DEMO_MODE;
    nextAuthInnerAuth.mockResolvedValue(null);

    const { auth } = await import('./auth');
    const session = await auth();

    expect(session).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('passes through a real session untouched', async () => {
    delete mutableEnv.SKIP_AUTH;
    delete mutableEnv.PUBLIC_DEMO_MODE;
    mutableEnv.NODE_ENV = 'production';
    const realSession = { user: { id: 'real-user', role: 'CHILD', tier: 'BASIC', parentId: 'p1' } };
    nextAuthInnerAuth.mockResolvedValue(realSession);

    const { auth } = await import('./auth');
    await expect(auth()).resolves.toBe(realSession);
  });

  it('fabricates the mock ULTRA/PARENT session ONLY when SKIP_AUTH=1 AND NODE_ENV!=production, and warns once', async () => {
    mutableEnv.SKIP_AUTH = '1';
    delete mutableEnv.PUBLIC_DEMO_MODE;
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

  it('fabricates the mock ULTRA/PARENT session in production when PUBLIC_DEMO_MODE=1', async () => {
    delete mutableEnv.SKIP_AUTH;
    mutableEnv.PUBLIC_DEMO_MODE = '1';
    mutableEnv.NODE_ENV = 'production';
    nextAuthInnerAuth.mockResolvedValue(null);
    findUnique.mockResolvedValue({ id: 'mock-child-id', role: 'PARENT', tier: 'ULTRA' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { auth } = await import('./auth');
    const session = await auth();

    expect(session?.user?.id).toBe('mock-child-id');
    expect(session?.user?.role).toBe('PARENT');
    expect(session?.user?.tier).toBe('ULTRA');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(/PUBLIC_DEMO_MODE/);

    warnSpy.mockRestore();
  });
});

describe('subscription tier refresh', () => {
  it('removes paid capabilities after a database downgrade without requiring re-login', async () => {
    mutableEnv.NODE_ENV = 'test';
    findUnique.mockResolvedValue({ tier: 'BASIC' });

    const { refreshSubscriptionTierToken, TIER_REFRESH_TTL_MS } = await import('./auth');
    const { can } = await import('./lib/authz');
    const refreshed = await refreshSubscriptionTierToken({
      userId: 'parent-1',
      tier: 'ULTRA',
      tierRefreshedAt: 1_000,
    }, false, 1_000 + TIER_REFRESH_TTL_MS);

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      select: { tier: true },
    });
    expect(refreshed.tier).toBe('BASIC');
    expect(can({ tier: refreshed.tier as 'BASIC' }, 'analytics:quant')).toBe(false);
  });

  it('does not query Prisma while the five-minute tier stamp is fresh', async () => {
    mutableEnv.NODE_ENV = 'test';

    const { refreshSubscriptionTierToken, TIER_REFRESH_TTL_MS } = await import('./auth');
    const token = { userId: 'parent-1', tier: 'ULTRA', tierRefreshedAt: 1_000 };
    const refreshed = await refreshSubscriptionTierToken(token, false, 1_000 + TIER_REFRESH_TTL_MS - 1);

    expect(refreshed.tier).toBe('ULTRA');
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('fails closed to BASIC on a refresh error and leaves the token eligible for retry', async () => {
    mutableEnv.NODE_ENV = 'test';
    findUnique.mockRejectedValue(new Error('sensitive database detail'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { refreshSubscriptionTierToken } = await import('./auth');
    const refreshed = await refreshSubscriptionTierToken({
      userId: 'parent-1',
      tier: 'ULTRA',
      tierRefreshedAt: 1_000,
    }, false, 500_000);

    expect(refreshed.tier).toBe('BASIC');
    expect(refreshed.tierRefreshedAt).toBe(1_000);
    expect(errorSpy).toHaveBeenCalledWith(
      '[AUTH_AUDIT] Subscription tier refresh failed; defaulting to BASIC.',
    );
    errorSpy.mockRestore();
  });
});
