import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  bars: [] as any[],
  snapshotUpsert: vi.fn(),
  marketFindFirst: vi.fn(),
  fundamentalsFindFirst: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    intradayBar: {
      findFirst: vi.fn().mockResolvedValue(null),
      createMany: vi.fn(async ({ data }: { data: any[] }) => {
        h.bars.push(...data);
        return { count: data.length };
      }),
      findMany: vi.fn(async () => [...h.bars].sort((a, b) => a.ts.getTime() - b.ts.getTime())),
    },
    marketBar: { findFirst: h.marketFindFirst },
    fundamentals: { findFirst: h.fundamentalsFindFirst },
    symbolSnapshot: { upsert: h.snapshotUpsert },
  },
}));

import { ingestIntradayBars } from './intraday';
import { computeAndUpsertSnapshot } from './snapshot';

describe('zero-key real-fixture pipeline', () => {
  beforeEach(() => {
    h.bars.length = 0;
    vi.clearAllMocks();
    delete process.env.MARKET_DATA_MODE;
    delete process.env.ALPACA_API_KEY;
    h.snapshotUpsert.mockResolvedValue({ id: 'snapshot' });
  });

  it('loads captured SNDL bars and derives a screening-complete historical snapshot', async () => {
    const ingest = await ingestIntradayBars('SNDL', 'NASDAQ');
    expect(ingest.tier).toBe('fixtures');
    expect(ingest.created).toBeGreaterThan(0);
    expect(ingest.fixtureSnapshots).toHaveLength(1);
    const fixture = ingest.fixtureSnapshots[0];

    await computeAndUpsertSnapshot('SNDL', 'NASDAQ', fixture.asOf, fixture.barsSource, fixture);

    const create = h.snapshotUpsert.mock.calls[0][0].create;
    expect(Number(create.premarketMovePct)).toBeGreaterThan(5);
    expect(Number(create.cumVolume)).toBeGreaterThan(10_000_000);
    expect(Number(create.mcap)).toBeGreaterThan(10_000_000);
    expect(create).toMatchObject({ source: 'ALPACA', mcapSource: 'FUNDAMENTALS' });
    expect(h.marketFindFirst).not.toHaveBeenCalled();
    expect(h.fundamentalsFindFirst).not.toHaveBeenCalled();
  });
});
