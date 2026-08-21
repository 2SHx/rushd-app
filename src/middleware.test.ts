// Edge regression: middleware must compose the edge-safe auth config without loading Prisma.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mutableEnv = process.env as Record<string, string | undefined>;
const ORIGINAL_AUTH_SECRET = mutableEnv.AUTH_SECRET;
const edgeResponse = { runtime: 'edge-ok' };
const intlMiddleware = vi.fn(() => edgeResponse);

vi.mock('next-intl/middleware', () => ({
  default: () => intlMiddleware,
}));

vi.mock('next-auth', () => ({
  default: () => ({ auth: (handler: unknown) => handler }),
}));

vi.mock('@/lib/prisma', () => {
  throw new Error('Prisma must not load in middleware');
});

beforeEach(() => {
  vi.resetModules();
  mutableEnv.AUTH_SECRET = 'edge-test-secret';
  intlMiddleware.mockClear();
});

afterEach(() => {
  mutableEnv.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
});

describe('edge middleware auth composition', () => {
  it('loads and handles a request without importing the server-only Prisma tier refresh', async () => {
    const { default: middleware } = await import('./middleware');
    const request = {
      nextUrl: { pathname: '/en/dashboard' },
      url: 'https://rushd.test/en/dashboard',
    };

    expect(await middleware(request as never, {} as never)).toBe(edgeResponse);
    expect(intlMiddleware).toHaveBeenCalledWith(request);
  });
});
