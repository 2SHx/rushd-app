import { describe, it, expect, afterAll } from 'vitest';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { captureUniverseMembership } from './captureMembership';
import {
  MEMBERSHIP_EXPORT_DIR, dayRecordHash, exportMembershipDay, serializeDay,
} from './exportMembership';

/** Far-future sentinel so nothing here can collide with a real capture day. */
const SENTINEL = new Date(Date.UTC(2099, 0, 5));
const SENTINEL_FILE = path.join(MEMBERSHIP_EXPORT_DIR, '2099-01.ndjson');

afterAll(async () => {
  await prisma.universeMembershipCapture.deleteMany({ where: { captureDate: SENTINEL } });
  if (existsSync(SENTINEL_FILE)) rmSync(SENTINEL_FILE);
});

describe('membership export', () => {
  it('refuses to write a day with no capture rather than emitting an empty snapshot', async () => {
    await prisma.universeMembershipCapture.deleteMany({ where: { captureDate: SENTINEL } });
    // An empty file would be indistinguishable from "the universe was empty that day" — which is a
    // different and much more alarming fact than "capture did not run".
    await expect(exportMembershipDay(SENTINEL)).rejects.toThrow(/No membership capture/);
  }, 30_000);

  it('writes a compact snapshot far smaller than the row form', async () => {
    await captureUniverseMembership(SENTINEL);
    const { file, record, written } = await exportMembershipDay(SENTINEL);

    expect(written).toBe(true);
    expect(record.n).toBeGreaterThan(200);
    expect(record.in).toEqual([...record.in].sort()); // deterministic ordering
    expect(record.h).toMatch(/^[0-9a-f]{64}$/);

    const bytes = readFileSync(file, 'utf8').length;
    // The verbose row form measures ~110KB/day; the compact form must stay in the low kilobytes or
    // a decade of daily snapshots stops being reasonable to keep in git.
    expect(bytes).toBeLessThan(10_000);
  }, 60_000);

  it('is idempotent — a re-export neither duplicates nor rewrites the day', async () => {
    const before = readFileSync(SENTINEL_FILE, 'utf8');
    const second = await exportMembershipDay(SENTINEL);

    expect(second.written).toBe(false);
    // Byte-identical: a re-run must not produce a spurious git diff, or the archive workflow would
    // commit noise every day and its history would stop meaning anything.
    expect(readFileSync(SENTINEL_FILE, 'utf8')).toBe(before);
    expect(before.trimEnd().split('\n')).toHaveLength(1);
  }, 60_000);

  it('hashes content, so a silent edit to the archive is detectable', () => {
    const base = dayRecordHash(['AAPL', 'MSFT'], [['X', 'reason']]);
    // Order-independent: the hash describes the SET, not the serialization order.
    expect(dayRecordHash(['MSFT', 'AAPL'], [['X', 'reason']])).toBe(base);
    // Any real change moves it.
    expect(dayRecordHash(['AAPL'], [['X', 'reason']])).not.toBe(base);
    expect(dayRecordHash(['AAPL', 'MSFT'], [['X', 'other']])).not.toBe(base);
  });

  it('serializes deterministically', () => {
    const record = { d: '2026-01-01', n: 1, h: 'abc', in: ['AAPL'], ex: [] as [string, string][] };
    expect(serializeDay(record)).toBe(serializeDay({ ...record }));
    expect(serializeDay(record)).toBe('{"d":"2026-01-01","n":1,"h":"abc","in":["AAPL"],"ex":[]}');
  });
});
