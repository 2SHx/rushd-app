import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  ingestBars: vi.fn(),
  lookupSecMcap: vi.fn(),
  computeAndUpsertSnapshot: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('node:fs', () => ({ default: { readFileSync: h.readFileSync } }));
vi.mock('./ingest', () => ({ ingestBars: h.ingestBars }));
vi.mock('./secFundamentals', () => ({ lookupSecMcap: h.lookupSecMcap }));
vi.mock('./snapshot', () => ({
  computeAndUpsertSnapshot: h.computeAndUpsertSnapshot,
  nasdaqDateKey: vi.fn(),
}));
vi.mock('./checkpoints', () => ({
  tradingDayCheckpoints: (date: string) => [new Date(`${date}T15:00:00.000Z`)],
}));
vi.mock('../../lib/prisma', () => ({
  prisma: {
    symbolSnapshot: { findUnique: h.findUnique },
  },
}));

import { runCandidatesMode } from '../../../scripts/backfill-snapshots';

describe('backfill-snapshots candidate mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.findUnique.mockResolvedValue(null);
    h.computeAndUpsertSnapshot.mockResolvedValue({});
  });

  it('uses artifact PIT inputs without daily ingestion or SEC recomputation', async () => {
    h.readFileSync.mockReturnValue(JSON.stringify({ candidates: [{
      symbol: 'ABCD',
      date: '2026-01-06',
      mcap: 250_000_000,
      mcapPrice: 12.5,
      sharesOutstanding: 20_000_000,
      endDate: '2025-12-31',
      secFiledDate: '2026-01-05',
      mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
      mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE',
    }] }));

    await runCandidatesMode('candidates.json', 1000);

    expect(h.ingestBars).not.toHaveBeenCalled();
    expect(h.lookupSecMcap).not.toHaveBeenCalled();
    expect(h.computeAndUpsertSnapshot).toHaveBeenCalledWith(
      'ABCD',
      'NASDAQ',
      new Date('2026-01-06T15:00:00.000Z'),
      'ALPACA',
      { priorClose: 12.5, mcap: 250_000_000, mcapSource: 'FUNDAMENTALS' },
    );
  });

  it('rejects corrupted artifact arithmetic before snapshot persistence', async () => {
    h.readFileSync.mockReturnValue(JSON.stringify({ candidates: [{
      symbol: 'ABCD',
      date: '2026-01-06',
      mcap: 249_000_000,
      mcapPrice: 12.5,
      sharesOutstanding: 20_000_000,
      endDate: '2025-12-31',
      secFiledDate: '2026-01-05',
      mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
      mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE',
    }] }));

    await expect(runCandidatesMode('candidates.json', 1000)).rejects.toThrow(/mcap≈sharesOutstanding/);
    expect(h.computeAndUpsertSnapshot).not.toHaveBeenCalled();
  });
});
