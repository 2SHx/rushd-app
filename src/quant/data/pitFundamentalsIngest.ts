// src/quant/data/pitFundamentalsIngest.ts — maps `PitFundamentalsFiling` (pure, network-free) rows
// onto `Fundamentals` and writes them append-only. Mirrors `ingestBarsBackfill`'s
// `createMany({ skipDuplicates: true })` pattern (src/quant/data/ingest.ts) rather than `upsert`:
// this is a BACKFILL of an immutable historical record (a filing that was public on date X stays
// public on date X forever), so a rerun must insert new rows only and must never overwrite an
// existing [symbol, market, asOf] row — `skipDuplicates` guarantees both idempotency and
// no-mutation-of-existing-rows in one operation, enforced by the schema's own unique constraint.
import type { PrismaClient, Prisma } from '@prisma/client';
import type { PitFundamentalsFiling } from './pitFundamentalsBackfill';

function isoDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Pure mapping — no I/O — so callers/tests can assert the exact row shape without a DB. */
export function toFundamentalsCreateInput(filing: PitFundamentalsFiling): Prisma.FundamentalsCreateManyInput {
  return {
    symbol: filing.symbol,
    market: filing.market,
    asOf: isoDay(filing.asOf),
    releasedAt: isoDay(filing.releasedAt),
    metrics: filing.metrics as unknown as Prisma.InputJsonValue,
    source: 'FUNDAMENTALS',
  };
}

export interface WritePitFundamentalsResult {
  attempted: number;
  inserted: number;
}

/**
 * Append-only, idempotent write. `skipDuplicates: true` relies on the schema's
 * `@@unique([symbol, market, asOf])` (prisma/schema.prisma:348) — a rerun over the same SEC data
 * inserts 0 new rows and never touches an already-persisted row's content.
 */
export async function writePitFundamentals(
  prisma: Pick<PrismaClient, 'fundamentals'>,
  filings: readonly PitFundamentalsFiling[],
): Promise<WritePitFundamentalsResult> {
  if (filings.length === 0) return { attempted: 0, inserted: 0 };
  const data = filings.map(toFundamentalsCreateInput);
  const result = await prisma.fundamentals.createMany({ data, skipDuplicates: true });
  return { attempted: filings.length, inserted: result.count };
}
