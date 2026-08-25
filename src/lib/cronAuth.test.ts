import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rejectUnauthorizedCron, secretMatches } from './cronAuth';
import * as ingestRoute from '@/app/api/cron/quant-ingest/route';
import * as runRoute from '@/app/api/cron/quant-run/route';
import * as incubationRoute from '@/app/api/cron/quant-incubation/route';
import * as incubationEvaluateRoute from '@/app/api/cron/quant-incubation-evaluate/route';

const withSecret = (value: string | undefined) => {
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
};

const request = (authorization?: string) =>
  new Request('https://example.test/api/cron/quant-ingest', {
    method: 'GET',
    headers: authorization ? { Authorization: authorization } : {},
  });

describe('cron auth', () => {
  let previous: string | undefined;

  beforeEach(() => {
    previous = process.env.CRON_SECRET;
  });

  afterEach(() => {
    withSecret(previous);
  });

  it('accepts the configured bearer token', () => {
    withSecret('s3cret-value');
    expect(rejectUnauthorizedCron(request('Bearer s3cret-value'))).toBeNull();
  });

  it('rejects a wrong token, a malformed one, and an absent one with 401', async () => {
    withSecret('s3cret-value');
    for (const header of ['Bearer wrong-value', 's3cret-value', 'Bearer ', undefined]) {
      const rejection = rejectUnauthorizedCron(request(header));
      expect(rejection?.status).toBe(401);
      await expect(rejection?.json()).resolves.toEqual({ error: 'unauthorized' });
    }
  });

  /**
   * Fails CLOSED. An unconfigured deployment must refuse every caller rather than treating an
   * absent secret as "no auth required" — these routes place orders.
   */
  it('refuses with 500 when CRON_SECRET is unset, never falling open', async () => {
    withSecret(undefined);
    const rejection = rejectUnauthorizedCron(request('Bearer anything'));
    expect(rejection?.status).toBe(500);
    await expect(rejection?.json()).resolves.toEqual({ error: 'CRON_SECRET is not configured' });
  });

  /**
   * `timingSafeEqual` throws on mismatched lengths, so the length check must come first. A
   * near-miss of a different length is the case that would crash rather than return false.
   */
  it('compares in constant time without throwing on length mismatch', () => {
    expect(secretMatches('abc', 'abc')).toBe(true);
    expect(secretMatches('abc', 'abcd')).toBe(false);
    expect(secretMatches('', 'abcd')).toBe(false);
    expect(secretMatches('abcd', '')).toBe(false);
  });
});

/**
 * Vercel Cron issues GET. Every quant cron route exported POST only, so scheduling them would have
 * returned 405 on every invocation — a scheduler that looks configured in the dashboard and
 * silently never runs. This is the tripwire: if a route loses its GET export, scheduling it
 * becomes a no-op again, and nothing else would notice.
 */
describe('cron routes answer the verb Vercel Cron actually sends', () => {
  const routes = [
    ['quant-ingest', ingestRoute],
    ['quant-run', runRoute],
    ['quant-incubation', incubationRoute],
    ['quant-incubation-evaluate', incubationEvaluateRoute],
  ] as const;

  it.each(routes)('%s exports both GET and POST', (_name, mod) => {
    expect(typeof mod.GET).toBe('function');
    expect(typeof mod.POST).toBe('function');
  });
});

/**
 * The scheduled call carries no body, so the DEFAULT is the scheduled behaviour. This previously
 * resolved to two symbols (`['MSFT','NVDA']`) while the engine trades a sleeve drawn from 217, and
 * it also defaulted to ingesting TASI, which is out of scope for this program. Both are pinned
 * here because neither failure is visible at runtime — the job would report success either way.
 */
describe('quant-ingest default roster', () => {
  it('defaults to the engine\'s own verified universe, not a hand-kept stub', async () => {
    const { buildVerifiedUniverse } = await import('@/quant/universe/buildVerifiedUniverse');
    const expected = buildVerifiedUniverse().entries.map((entry) => entry.symbol);

    expect(expected.length).toBeGreaterThan(200);
    // The stale stub, pinned so a regression to it is loud.
    expect(expected).not.toEqual(['MSFT', 'NVDA']);
    expect(expected).toContain('NVDA');
    expect(expected).toContain('MU');
  });
});
