import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nasdaqDateKey } from './snapshot';
import { nasdaqMinuteOfDay } from './intraday';
import { checkpointToUtc, tradingDayCheckpoints, DEFAULT_CHECKPOINT_MINUTES } from './checkpoints';

describe('checkpointToUtc', () => {
  it('round-trips EST (winter) wall-clock minutes back to the same date + minute', () => {
    const asOf = checkpointToUtc('2026-01-15', 9 * 60 + 30);
    expect(nasdaqDateKey(asOf)).toBe('2026-01-15');
    expect(nasdaqMinuteOfDay(asOf)).toBe(9 * 60 + 30);
  });

  it('round-trips EDT (summer) wall-clock minutes back to the same date + minute', () => {
    const asOf = checkpointToUtc('2026-07-06', 16 * 60);
    expect(nasdaqDateKey(asOf)).toBe('2026-07-06');
    expect(nasdaqMinuteOfDay(asOf)).toBe(16 * 60);
  });

  it('produces one strictly increasing checkpoint per configured minute', () => {
    const checkpoints = tradingDayCheckpoints('2026-03-10');
    expect(checkpoints).toHaveLength(DEFAULT_CHECKPOINT_MINUTES.length);
    for (let i = 1; i < checkpoints.length; i++) {
      expect(checkpoints[i].getTime()).toBeGreaterThan(checkpoints[i - 1].getTime());
    }
  });
});

// PIT proof: a checkpoint snapshot must never include bars dated after its own asOf. This wires
// a real checkpointToUtc instant into computeAndUpsertSnapshot and asserts the no-look-ahead
// guard trips the moment a post-asOf bar is present in what the (mocked) DB layer returns.
const h = vi.hoisted(() => ({
  intradayFindMany: vi.fn(),
  marketFindFirst: vi.fn(),
  fundamentalsFindFirst: vi.fn(),
  snapshotUpsert: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    intradayBar: { findMany: h.intradayFindMany },
    marketBar: { findFirst: h.marketFindFirst },
    fundamentals: { findFirst: h.fundamentalsFindFirst },
    symbolSnapshot: { upsert: h.snapshotUpsert },
  },
}));

describe('checkpoint snapshots are point-in-time safe (no look-ahead)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.snapshotUpsert.mockResolvedValue({ id: 'snapshot' });
  });

  it('throws LookaheadError if a bar dated after the 10:00 ET checkpoint leaks through', async () => {
    const { computeAndUpsertSnapshot } = await import('./snapshot');
    const { LookaheadError } = await import('./pointInTime');
    const asOf = checkpointToUtc('2026-07-06', 10 * 60); // 10:00 ET checkpoint

    h.intradayFindMany.mockResolvedValue([
      { ts: new Date(asOf.getTime() - 60_000), session: 'REGULAR', close: 10, volume: 100 },
      { ts: new Date(asOf.getTime() + 60_000), session: 'REGULAR', close: 11, volume: 50 }, // after asOf
    ]);

    await expect(
      computeAndUpsertSnapshot('GME', 'NASDAQ', asOf, 'ALPACA', { priorClose: 9, mcap: null, mcapSource: null }),
    ).rejects.toThrow(LookaheadError);
  });

  it('a well-formed checkpoint only ever sums bars at-or-before its own asOf', async () => {
    const { computeAndUpsertSnapshot } = await import('./snapshot');
    const asOf = checkpointToUtc('2026-07-06', 10 * 60); // 10:00 ET checkpoint

    h.intradayFindMany.mockResolvedValue([
      { ts: new Date(asOf.getTime() - 120_000), session: 'REGULAR', close: 10, volume: 100 },
      { ts: asOf, session: 'REGULAR', close: 10.5, volume: 50 },
    ]);

    await computeAndUpsertSnapshot('GME', 'NASDAQ', asOf, 'ALPACA', { priorClose: 9, mcap: null, mcapSource: null });

    const query = h.intradayFindMany.mock.calls[0][0];
    expect(query.where.ts.lte).toBe(asOf);
    expect(h.snapshotUpsert.mock.calls[0][0].create.cumVolume.toString()).toBe('150');
  });
});
