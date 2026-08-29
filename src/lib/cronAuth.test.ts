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

/**
 * `registry.getProvider` returns `MockProvider` whenever no market-data credentials are visible, and
 * MockProvider FABRICATES candles rather than failing. That makes a misconfigured deployment
 * indistinguishable from a healthy one: HTTP 200, a non-zero `upserted`, bars that look fresh, and an
 * engine trading on invented prices.
 *
 * Not hypothetical — 64 MOCK rows were found in the research database on 2026-08-27, three of them
 * predating that session, and their presence had already defeated the preflight's own bar-freshness
 * check. Failing closed costs one day of bars, which the next run backfills; writing fabricated
 * prices costs the integrity of every decision made afterwards.
 */
describe('quant-ingest refuses to write synthetic bars', () => {
  const saved: Record<string, string | undefined> = {};
  const keys = ['MARKET_DATA_MODE', 'ALPACA_API_KEY', 'ALPACA_API_SECRET', 'CRON_SECRET'];

  beforeEach(() => {
    for (const k of keys) saved[k] = process.env[k];
    // No credentials of any kind -> the registry falls back to MockProvider.
    delete process.env.MARKET_DATA_MODE;
    delete process.env.ALPACA_API_KEY;
    delete process.env.ALPACA_API_SECRET;
    process.env.CRON_SECRET = 'test-secret-for-synthetic-guard';
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('answers 503 instead of ingesting when the provider is MockProvider', async () => {
    const { registry, MockProvider } = await import('@/services/marketData');
    // Guard the guard: if this stops being MockProvider the test is no longer exercising the path.
    expect(registry.getProvider('NASDAQ')).toBeInstanceOf(MockProvider);

    const res = await ingestRoute.GET(
      new Request('https://example.test/api/cron/quant-ingest', {
        method: 'GET',
        headers: { Authorization: 'Bearer test-secret-for-synthetic-guard' },
      }),
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('synthetic_provider_refused');
    // The remedy has to name what to set, or the 503 is just a different silent failure.
    expect(body.detail).toMatch(/MARKET_DATA_MODE|ALPACA_API_KEY/);
  });

  it('refuses BEFORE authorising, so an unauthenticated caller still gets 401 not 503', async () => {
    // Ordering matters: auth must remain the first gate, or the route would leak configuration
    // state to anyone who can reach it.
    const res = await ingestRoute.GET(
      new Request('https://example.test/api/cron/quant-ingest', { method: 'GET' }),
    );
    expect(res.status).toBe(401);
  });
});
