// Export the irreplaceable half of the database into git.
//
// WHY: the forward lane must survive ten years unattended, and no free managed database reliably
// does — free tiers pause, expire, or change terms. Rather than bet a decade of unbackfillable
// evidence on one provider's pricing page, this makes the DATABASE DISPOSABLE and git the durable
// store.
//
// Almost nothing in the database is actually irreplaceable:
//   MarketBar    — re-ingestable from the price feed
//   Fundamentals — re-ingestable from SEC EDGAR, free
//   Membership   — UNBACKFILLABLE. A day not observed is gone. This is the crown jewel.
//
// This repo has already been saved once by exactly this pattern: the 2026-08-19 migration wipe
// cost nothing irreplaceable ONLY because `results/` had been un-gitignored two days earlier.
//
// Format is a compact monthly NDJSON — one line per capture day. The verbose row form is ~110KB/day
// (270MB per decade) because it repeats a uuid, provenance string and two timestamps 219 times.
// The compact form drops everything reconstructible and keeps what cannot be recovered: which
// symbols were in the universe that day, which were rejected and why, and the content hash.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';

export const MEMBERSHIP_EXPORT_DIR = path.join(process.cwd(), 'data', 'membership');

export interface MembershipDayRecord {
  /** Capture date, YYYY-MM-DD. */
  d: string;
  /** Included symbol count, so a truncated line is detectable. */
  n: number;
  /** sha256 over the sorted included list + exclusions; detects silent edits. */
  h: string;
  /** Included symbols, sorted. */
  in: string[];
  /** [symbol, reason] pairs for names the screen rejected. */
  ex: [string, string][];
}

export function dayRecordHash(included: readonly string[], excluded: readonly [string, string][]): string {
  return createHash('sha256')
    .update(JSON.stringify({ in: [...included].sort(), ex: [...excluded].sort() }))
    .digest('hex');
}

/** Deterministic: same day in, same bytes out, so a re-export is a no-op in git. */
export function serializeDay(record: MembershipDayRecord): string {
  return JSON.stringify({ d: record.d, n: record.n, h: record.h, in: record.in, ex: record.ex });
}

export async function exportMembershipDay(day: Date): Promise<{
  file: string; record: MembershipDayRecord; written: boolean;
}> {
  const dayKey = day.toISOString().slice(0, 10);
  const rows = await prisma.universeMembershipCapture.findMany({
    where: { captureDate: day },
    select: { symbol: true, included: true, exclusionReason: true },
    orderBy: { symbol: 'asc' },
  });
  if (rows.length === 0) throw new Error(`No membership capture for ${dayKey}`);

  const included = rows.filter((r) => r.included).map((r) => r.symbol).sort();
  const excluded = rows
    .filter((r) => !r.included)
    .map((r) => [r.symbol, r.exclusionReason ?? 'unknown'] as [string, string])
    .sort();

  const record: MembershipDayRecord = {
    d: dayKey,
    n: included.length,
    h: dayRecordHash(included, excluded),
    in: included,
    ex: excluded,
  };

  mkdirSync(MEMBERSHIP_EXPORT_DIR, { recursive: true });
  const file = path.join(MEMBERSHIP_EXPORT_DIR, `${dayKey.slice(0, 7)}.ndjson`);
  const line = serializeDay(record);

  // Append-only, and idempotent: a day already present is left exactly as it is rather than
  // rewritten, so re-running never produces a spurious git diff or edits history.
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (existing.split('\n').some((l) => l.startsWith(`{"d":"${dayKey}"`))) {
    return { file, record, written: false };
  }
  writeFileSync(file, existing + line + '\n');
  return { file, record, written: true };
}
