import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
  prisma: { intradayBar: { findMany: h.findMany } },
}));

import { backtestResultFilename, loadDbCandidateSymbol } from '../../../scripts/backtest';
import type { SnapshotArtifactCandidate } from '../data/gapperCandidates';

const candidate: SnapshotArtifactCandidate = {
  symbol: 'ABCD',
  date: '2026-01-06',
  mcap: 250_000_000,
  mcapPrice: 12.5,
  sharesOutstanding: 20_000_000,
  endDate: '2025-12-31',
  secFiledDate: '2026-01-05',
  mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
  mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE',
};

function bar(date: string, close: number) {
  return {
    ts: new Date(`${date}T15:01:00.000Z`),
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    session: 'REGULAR' as const,
    market: 'NASDAQ' as const,
    source: 'ALPACA' as const,
  };
}

describe('candidate-scoped intraday DB loading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('excludes stale DB days and uses artifact-authoritative priorClose and PIT mcap', async () => {
    h.findMany.mockResolvedValue([
      bar('2026-01-05', 999),
      bar('2026-01-06', 13),
      bar('2026-01-07', 777),
    ]);

    const series = await loadDbCandidateSymbol('ABCD', [candidate]);

    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ symbol: 'ABCD', market: 'NASDAQ', source: 'ALPACA' }),
    }));
    expect(series.bars.map((item) => item.ts.toISOString().slice(0, 10))).toEqual(['2026-01-06']);
    expect(series.dayContext.get('2026-01-06')).toEqual({
      priorClose: 12.5,
      mcap: 250_000_000,
      mcapSource: 'FUNDAMENTALS',
    });
    expect(series.dayContext.has('2026-01-05')).toBe(false);
    expect(series.dayContext.has('2026-01-07')).toBe(false);
  });

  it('fails closed when an artifact candidate pair has no minute bars', async () => {
    h.findMany.mockResolvedValue([bar('2026-01-05', 10)]);
    await expect(loadDbCandidateSymbol('ABCD', [candidate])).rejects.toThrow(
      /Candidate pair\(s\) have no minute bars: ABCD 2026-01-06/,
    );
  });

  it.each([
    ['wrong market', { market: 'TASI' }],
    ['wrong source', { source: 'YAHOO' }],
  ])('rejects a selected %s row even if a DB mock ignores the query', async (_label, override) => {
    h.findMany.mockResolvedValue([{ ...bar('2026-01-06', 13), ...override }]);
    await expect(loadDbCandidateSymbol('ABCD', [candidate])).rejects.toThrow(/Non-NASDAQ\/Alpaca/);
  });

  it('uses the artifact digest in candidate filenames without changing legacy filenames', () => {
    const digestA = '0123456789abcdefaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const digestB = 'fedcba9876543210bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    expect(backtestResultFilename('gapper-orb', '2026-01-01', '2026-02-01')).toBe(
      'gapper-orb-2026-01-01-2026-02-01.json',
    );
    expect(backtestResultFilename('gapper-orb', '2026-01-01', '2026-02-01', digestA)).toBe(
      'gapper-orb-2026-01-01-2026-02-01-0123456789abcdef.json',
    );
    expect(backtestResultFilename('gapper-orb', '2026-01-01', '2026-02-01', digestA)).not.toBe(
      backtestResultFilename('gapper-orb', '2026-01-01', '2026-02-01', digestB),
    );
  });
});
