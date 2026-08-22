import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/prisma';
import { databaseIsDisposable, isUnscopedBulkWrite } from './guardDestructiveWrites';

describe('destructive write guard', () => {
  it('treats an unrecognised or absent branch as production (fails closed)', () => {
    expect(databaseIsDisposable({})).toBe(false);
    expect(databaseIsDisposable({ NEON_BRANCH: 'production' })).toBe(false);
    // The live configuration on the day of the incident.
    expect(databaseIsDisposable({ NEON_BRANCH: 'Production' })).toBe(false);
    // A branch that merely is not named "production" is NOT thereby disposable.
    expect(databaseIsDisposable({ NEON_BRANCH: 'staging' })).toBe(false);
    expect(databaseIsDisposable({ NEON_BRANCH: 'main' })).toBe(false);
  });

  it('accepts only an explicit opt-in or a test- prefixed branch', () => {
    expect(databaseIsDisposable({ RUSHD_DISPOSABLE_TEST_DB: '1' })).toBe(true);
    expect(databaseIsDisposable({ NEON_BRANCH: 'test-ci-1234' })).toBe(true);
    // The opt-in must be exact; a truthy-looking value is not an opt-in.
    expect(databaseIsDisposable({ RUSHD_DISPOSABLE_TEST_DB: 'true' })).toBe(false);
  });

  it('flags a bulk write with no filter, or one that filters nothing', () => {
    expect(isUnscopedBulkWrite('deleteMany', {})).toBe(true);
    expect(isUnscopedBulkWrite('deleteMany', undefined)).toBe(true);
    expect(isUnscopedBulkWrite('deleteMany', { where: {} })).toBe(true);
    expect(isUnscopedBulkWrite('updateMany', { where: {}, data: {} })).toBe(true);
  });

  it('permits a scoped bulk write and leaves non-bulk actions alone', () => {
    expect(isUnscopedBulkWrite('deleteMany', { where: { userId: 'u1' } })).toBe(false);
    expect(isUnscopedBulkWrite('deleteMany', { where: { id: { in: ['a', 'b'] } } })).toBe(false);
    // Single-row and read actions are out of scope by construction.
    expect(isUnscopedBulkWrite('delete', { where: { id: 'x' } })).toBe(false);
    expect(isUnscopedBulkWrite('findMany', {})).toBe(false);
    expect(isUnscopedBulkWrite('create', { data: {} })).toBe(false);
  });

  /**
   * The end-to-end proof. This is the exact call shape that emptied the User table; it must now be
   * refused. The guard rejects BEFORE delegating to the driver, so running this test issues no
   * statement and deletes nothing — that is why it is safe to assert against the live client.
   * AutoRunClaim is the target because it is the smallest table with no inbound relations.
   */
  it('refuses an unscoped deleteMany through the real client, without touching the database', async () => {
    expect(databaseIsDisposable()).toBe(false); // guard is armed in this environment
    const before = await prisma.autoRunClaim.count();

    await expect(prisma.autoRunClaim.deleteMany({})).rejects.toThrow(
      /Refusing AutoRunClaim\.deleteMany\(\{\}\)/,
    );

    expect(await prisma.autoRunClaim.count()).toBe(before);
    // A scoped delete on the same model still works — the guard blocks breadth, not the operation.
    await expect(
      prisma.autoRunClaim.deleteMany({ where: { key: '__guard-probe-nonexistent__' } }),
    ).resolves.toEqual({ count: 0 });
  }, 30_000);
});
