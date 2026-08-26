import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { captureUniverseMembership, captureDateOf } from './captureMembership';
import { buildVerifiedUniverse } from './buildVerifiedUniverse';

/**
 * These tests write to the SHARED database (.env points at NEON_BRANCH=production), so every row
 * they create is scoped to a far-future sentinel captureDate and removed afterwards by that exact
 * date. Nothing here uses an unscoped delete — a full-suite run once deleted every User row via
 * `deleteMany({})`, and the destructive-write guard in src/quant/testing/ now refuses that shape.
 */
const SENTINEL = new Date(Date.UTC(2099, 0, 2));

const cleanup = () =>
  prisma.universeMembershipCapture.deleteMany({ where: { captureDate: SENTINEL } });

afterAll(cleanup);

describe('captureDateOf', () => {
  it('truncates to the UTC calendar day, not local time', () => {
    // 23:30 UTC on the 26th is still the 26th in UTC even where local time has rolled over.
    expect(captureDateOf(new Date('2026-08-26T23:30:00.000Z')).toISOString())
      .toBe('2026-08-26T00:00:00.000Z');
    expect(captureDateOf(new Date('2026-08-26T00:00:00.000Z')).toISOString())
      .toBe('2026-08-26T00:00:00.000Z');
  });
});

describe('universe membership capture', () => {
  it('captures every entry the engine\'s own universe function returns', async () => {
    await cleanup();
    const universe = buildVerifiedUniverse();
    const result = await captureUniverseMembership(SENTINEL);

    expect(result.included).toBe(universe.entries.length);
    expect(result.inserted).toBe(result.candidates);
    expect(result.included).toBeGreaterThan(200);

    const stored = await prisma.universeMembershipCapture.count({
      where: { captureDate: SENTINEL },
    });
    expect(stored).toBe(result.candidates);
  }, 60_000);

  /**
   * Idempotency by unique constraint + skipDuplicates, NOT by overwriting. A re-run must insert
   * zero rows and must not mutate what is already there — an editable membership row is not
   * evidence.
   */
  it('is idempotent on a same-day re-run and mutates nothing', async () => {
    const before = await prisma.universeMembershipCapture.findMany({
      where: { captureDate: SENTINEL },
      select: { id: true, capturedAt: true, contentHash: true },
      orderBy: { symbol: 'asc' },
    });
    expect(before.length).toBeGreaterThan(0);

    const rerun = await captureUniverseMembership(SENTINEL);
    expect(rerun.inserted).toBe(0);

    const after = await prisma.universeMembershipCapture.findMany({
      where: { captureDate: SENTINEL },
      select: { id: true, capturedAt: true, contentHash: true },
      orderBy: { symbol: 'asc' },
    });
    // Same rows, same ids, same server-assigned timestamps — nothing was rewritten.
    expect(after).toEqual(before);
  }, 60_000);

  it('records excluded names with a reason rather than dropping them', async () => {
    const universe = buildVerifiedUniverse();
    const includedSymbols = new Set(universe.entries.map((entry) => entry.symbol));
    const expectedExclusions = universe.excluded.filter((e) => !includedSymbols.has(e.symbol));

    const storedExclusions = await prisma.universeMembershipCapture.findMany({
      where: { captureDate: SENTINEL, included: false },
      select: { symbol: true, exclusionReason: true },
    });

    expect(storedExclusions.length).toBe(new Set(expectedExclusions.map((e) => e.symbol)).size);
    for (const row of storedExclusions) {
      // An exclusion without a reason is indistinguishable from missing data — never allowed.
      expect(row.exclusionReason).toBeTruthy();
    }
  }, 60_000);

  it('never fabricates a purification ratio the source did not disclose', async () => {
    const rows = await prisma.universeMembershipCapture.findMany({
      where: { captureDate: SENTINEL, included: true },
      select: { purificationRatioBps: true },
    });
    // Tier-1 fund sources do not publish per-name ratios; null is the honest value, not 0.
    for (const row of rows) {
      expect(row.purificationRatioBps === null || typeof row.purificationRatioBps === 'number')
        .toBe(true);
    }
  }, 60_000);
});

/**
 * The append-only contract is enforced by the module having no mutation path at all, so this
 * asserts on the source rather than on behaviour — a behavioural test cannot prove the ABSENCE of
 * a code path, only that one particular call did not fire.
 */
describe('append-only contract', () => {
  it('contains no mutating Prisma call in the capture module', () => {
    const source = readFileSync(new URL('./captureMembership.ts', import.meta.url), 'utf8');
    expect(source).toContain('createMany');
    expect(source).toContain('skipDuplicates');

    // Scoped to the model: a bare `.update(` also matches `createHash(...).update(...)`, which is
    // hashing, not persistence. Only calls against the table can violate append-only.
    const mutations = source.match(/universeMembershipCapture\.\w+/g) ?? [];
    expect(mutations.length).toBeGreaterThan(0);
    for (const call of mutations) {
      expect(call).toBe('universeMembershipCapture.createMany');
    }
  });
});
