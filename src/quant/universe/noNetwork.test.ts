// Proves the zero-cost contract: building the verified universe and selecting the dollar-volume
// sleeve never touches the network — every input is the committed fixture or a mocked DB read.
// tier2XbrlFetch.ts (the optional live-refresh path) is deliberately NOT imported anywhere below.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    marketBar: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { buildVerifiedUniverse } from './buildVerifiedUniverse';
import { selectDollarVolumeSleeve } from './sleeveSelector';

describe('zero network calls', () => {
  beforeEach(() => vi.clearAllMocks());

  it('buildVerifiedUniverse + selectDollarVolumeSleeve never call fetch', async () => {
    const fetchSpy = vi.fn();
    const originalFetch = global.fetch;
    global.fetch = fetchSpy as any;

    try {
      (prisma.marketBar.findMany as any).mockResolvedValue([
        { id: '1', symbol: 'X', market: 'NASDAQ', interval: 'DAY', ts: new Date('2026-07-17'), open: 1, high: 1, low: 1, close: 100, volume: 1000, source: 'ALPACA', createdAt: new Date() },
      ]);

      const result = buildVerifiedUniverse();
      expect(result.entries.length).toBeGreaterThanOrEqual(200);

      const { sleeve } = await selectDollarVolumeSleeve(result.entries.slice(0, 5), {
        asOf: new Date('2026-07-17T00:00:00.000Z'),
      });
      expect(sleeve.length).toBeGreaterThan(0);

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
