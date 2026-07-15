// src/auth.config.test.ts
// AUTH_SECRET resolution (positive gate): the insecure dev fallback is used
// ONLY when NODE_ENV is explicitly "development"; any other value, including
// NODE_ENV being unset, must throw at module load when AUTH_SECRET is unset.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// NODE_ENV is typed `readonly` in @types/node; cast to mutate it per-case.
// Mutate process.env's own keys (never reassign process.env itself) so this
// stays the same object reference the freshly re-imported module reads.
const mutableEnv = process.env as Record<string, string | undefined>;
const ORIGINAL_AUTH_SECRET = mutableEnv.AUTH_SECRET;
const ORIGINAL_NODE_ENV = mutableEnv.NODE_ENV;
const ORIGINAL_NEXT_PHASE = mutableEnv.NEXT_PHASE;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  mutableEnv.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
  mutableEnv.NODE_ENV = ORIGINAL_NODE_ENV;
  mutableEnv.NEXT_PHASE = ORIGINAL_NEXT_PHASE;
});

describe('authConfig secret resolution', () => {
  it('throws when AUTH_SECRET is unset and NODE_ENV is unset', async () => {
    delete process.env.AUTH_SECRET;
    delete mutableEnv.NODE_ENV;

    await expect(import('./auth.config')).rejects.toThrow(/AUTH_SECRET must be set/);
  });

  it('throws when AUTH_SECRET is unset and NODE_ENV is "production"', async () => {
    delete process.env.AUTH_SECRET;
    mutableEnv.NODE_ENV = 'production';

    await expect(import('./auth.config')).rejects.toThrow(/AUTH_SECRET must be set/);
  });

  it('boots with the insecure dev fallback when NODE_ENV="development" and AUTH_SECRET is unset', async () => {
    delete process.env.AUTH_SECRET;
    mutableEnv.NODE_ENV = 'development';

    const mod = await import('./auth.config');
    expect(mod.authConfig.secret).toBeTruthy();
  });

  it('uses AUTH_SECRET when provided, regardless of NODE_ENV', async () => {
    process.env.AUTH_SECRET = 'a-real-provisioned-secret';
    mutableEnv.NODE_ENV = 'production';

    const mod = await import('./auth.config');
    expect(mod.authConfig.secret).toBe('a-real-provisioned-secret');
  });
});

// Security gate (MED): NEXT_PHASE=phase-production-build lets a keyless `next build`
// import this module — but if that env var leaks into a RUNNING server, the session
// callback must refuse to mint a session under the public fallback secret.
describe('build-phase fallback must never serve requests', () => {
  const sessionArgs = {
    session: { user: { name: 'x', email: 'x@x' } },
    token: { userId: 'u1', role: 'PARENT', tier: 'ULTRA', parentId: null },
  } as never;

  it('module loads keyless under NEXT_PHASE, but the session callback throws', async () => {
    delete process.env.AUTH_SECRET;
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.NEXT_PHASE = 'phase-production-build';

    const { authConfig } = await import('./auth.config');
    expect(authConfig.secret).toBeTruthy();

    await expect(authConfig.callbacks.session(sessionArgs)).rejects.toThrow(/must never serve requests/);
  });

  it('with AUTH_SECRET provisioned, the session callback serves normally even if NEXT_PHASE leaked', async () => {
    process.env.AUTH_SECRET = 'a-real-provisioned-secret';
    mutableEnv.NODE_ENV = 'production';
    mutableEnv.NEXT_PHASE = 'phase-production-build';

    const { authConfig } = await import('./auth.config');
    const session = await authConfig.callbacks.session(sessionArgs);
    expect((session as { user: { id: string } }).user.id).toBe('u1');
  });
});
