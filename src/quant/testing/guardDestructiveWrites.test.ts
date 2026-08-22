import { describe, it, expect } from 'vitest';
import {
  databaseIsDisposable,
  destructiveWriteMiddleware,
  isUnscopedBulkWrite,
} from './guardDestructiveWrites';

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
   * The end-to-end proof: the exact call shape that emptied the User table is refused, and the
   * write never reaches the driver. That second half is asserted against a stub `next` rather than
   * a live connection — "next was not called" IS the property, where a real round-trip only infers
   * it from an unchanged row count, and made this test fail on database latency under full-suite
   * contention. AutoRunClaim is the model because it is the one the incident actually hit.
   */
  it('refuses an unscoped deleteMany and never delegates it to the driver', async () => {
    expect(databaseIsDisposable()).toBe(false); // guard is armed in this environment
    let delegated = 0;
    const next = async () => {
      delegated += 1;
      return { count: 999 };
    };

    await expect(
      destructiveWriteMiddleware({ action: 'deleteMany', model: 'AutoRunClaim', args: {} }, next),
    ).rejects.toThrow(/Refusing AutoRunClaim\.deleteMany\(\{\}\)/);
    expect(delegated).toBe(0);

    // A scoped delete on the same model passes straight through — the guard blocks breadth,
    // not the operation.
    await expect(
      destructiveWriteMiddleware(
        { action: 'deleteMany', model: 'AutoRunClaim', args: { where: { key: 'k' } } },
        next,
      ),
    ).resolves.toEqual({ count: 999 });
    expect(delegated).toBe(1);
  });

  it('delegates every write once the database is explicitly marked disposable', async () => {
    const previous = process.env.RUSHD_DISPOSABLE_TEST_DB;
    process.env.RUSHD_DISPOSABLE_TEST_DB = '1';
    try {
      let delegated = 0;
      const next = async () => {
        delegated += 1;
        return { count: 0 };
      };
      await expect(
        destructiveWriteMiddleware({ action: 'deleteMany', model: 'User', args: {} }, next),
      ).resolves.toEqual({ count: 0 });
      expect(delegated).toBe(1);
    } finally {
      if (previous === undefined) delete process.env.RUSHD_DISPOSABLE_TEST_DB;
      else process.env.RUSHD_DISPOSABLE_TEST_DB = previous;
    }
  });
});
