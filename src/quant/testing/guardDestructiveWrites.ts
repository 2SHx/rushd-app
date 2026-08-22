// Test-only safety interlock.
//
// On 2026-08-22 a `beforeEach` in portfolio.test.ts ran six unconditional
// `prisma.<model>.deleteMany({})` calls. The local .env points at NEON_BRANCH=production, so the
// suite deleted every User row in the shared database — including the one named by
// QUANT_INCUBATION_OWNER_USER_ID. Market data survived only because commit 1e0fdd1 had already
// scoped the MarketBar cleanup by id.
//
// Scoping that one file fixes that one file. This makes the whole class impossible: a bulk write
// with no `where` filter cannot reach a non-disposable database from a test process, whichever
// file issues it. It is installed by vitest.setup.ts and is never loaded by application code.
//
// A database is DISPOSABLE when it is explicitly marked as such — not when it merely looks
// non-production. The check fails closed: an unrecognised branch is treated as production.
import { prisma } from '@/lib/prisma';

const BULK_WRITE_ACTIONS = new Set(['deleteMany', 'updateMany']);

/** Explicit opt-in. A throwaway Neon branch or local Postgres sets this; production never does. */
export function databaseIsDisposable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.RUSHD_DISPOSABLE_TEST_DB === '1') return true;
  const branch = (env.NEON_BRANCH ?? '').trim().toLowerCase();
  return branch !== '' && branch !== 'production' && branch.startsWith('test-');
}

/** True when a bulk write would hit every row: no `where`, or one that filters nothing. */
export function isUnscopedBulkWrite(action: string, args: unknown): boolean {
  if (!BULK_WRITE_ACTIONS.has(action)) return false;
  const where = (args as { where?: Record<string, unknown> } | undefined)?.where;
  return where === undefined || Object.keys(where).length === 0;
}

export function installDestructiveWriteGuard(): void {
  prisma.$use(async (params, next) => {
    if (isUnscopedBulkWrite(params.action, params.args) && !databaseIsDisposable()) {
      throw new Error(
        `Refusing ${params.model ?? 'unknown'}.${params.action}({}) — an unscoped bulk write ` +
          `against a database that is not marked disposable (NEON_BRANCH=` +
          `${process.env.NEON_BRANCH ?? 'unset'}). Scope the write to rows this test created, or ` +
          `point DATABASE_URL at a throwaway branch and set RUSHD_DISPOSABLE_TEST_DB=1. ` +
          `See src/quant/testing/guardDestructiveWrites.ts.`,
      );
    }
    return next(params);
  });
}
