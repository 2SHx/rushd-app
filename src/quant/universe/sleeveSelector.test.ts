import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { selectDollarVolumeSleeve } from './sleeveSelector';
import type { UniverseEntry } from './types';

const asOf = new Date('2026-07-17T00:00:00.000Z');

const entry = (symbol: string): UniverseEntry => ({
  symbol,
  name: `${symbol} Corp`,
  market: 'NASDAQ',
  tier: 'index-provider-screened',
  provenance: 'test',
  purificationRatioBps: 'n/a — not computed',
  reasonCodes: [],
  asOf: '2026-07-17',
});

const bar = (close: number, volume: number) => ({
  id: 'x', symbol: 'X', market: 'NASDAQ', interval: 'DAY', ts: asOf,
  open: close, high: close, low: close, close, volume, source: 'ALPACA', createdAt: new Date(),
});

describe('selectDollarVolumeSleeve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ranks by real average dollar volume, descending', async () => {
    (prisma.marketBar.findMany as any)
      .mockResolvedValueOnce([bar(100, 1_000_000)]) // AAA: $100M
      .mockResolvedValueOnce([bar(10, 100_000)]); // BBB: $1M

    const { sleeve, excluded } = await selectDollarVolumeSleeve([entry('AAA'), entry('BBB')], { asOf });
    expect(sleeve.map((s) => s.symbol)).toEqual(['AAA', 'BBB']);
    expect(sleeve[0].avgDollarVolumeUsd.toNumber()).toBe(100_000_000);
    expect(excluded).toEqual([]);
  });

  it('fail-closed excludes a barless name with a reason, rather than dropping it silently', async () => {
    (prisma.marketBar.findMany as any).mockResolvedValueOnce([]);
    const { sleeve, excluded } = await selectDollarVolumeSleeve([entry('NOBAR')], { asOf });
    expect(sleeve).toEqual([]);
    expect(excluded).toEqual([{ symbol: 'NOBAR', reasonCode: 'no_market_bars' }]);
  });

  it('caps the sleeve at maxNames (default 100)', async () => {
    const entries = Array.from({ length: 150 }, (_, i) => entry(`S${i}`));
    (prisma.marketBar.findMany as any).mockImplementation(async () => [bar(10, 1_000)]);
    const { sleeve } = await selectDollarVolumeSleeve(entries, { asOf });
    expect(sleeve.length).toBe(100);
  });

  it('queries no-look-ahead bars at-or-before asOf for each symbol', async () => {
    (prisma.marketBar.findMany as any).mockResolvedValue([bar(10, 1_000)]);
    await selectDollarVolumeSleeve([entry('AAA')], { asOf, lookbackDays: 20 });
    const query = (prisma.marketBar.findMany as any).mock.calls[0][0];
    expect(query.where.symbol).toBe('AAA');
    expect(query.where.ts.lte).toBe(asOf);
  });
});
