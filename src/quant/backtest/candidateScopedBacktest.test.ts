import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ findMany: vi.fn(), marketFindMany: vi.fn(), snapshotFindMany: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    intradayBar: { findMany: h.findMany },
    marketBar: { findMany: h.marketFindMany },
    symbolSnapshot: { findMany: h.snapshotFindMany },
  },
}));

import {
  assertCandidateValidationConfig,
  assertCandidateWorktreeClean,
  assertAlpacaNasdaqExecutionRows,
  backtestResultFilename,
  loadDbCandidateSymbol,
  loadDbSymbol,
  isReproducibleRun,
  shariaStateForSetup,
  transitionCountInsideSlice,
} from '../../../scripts/backtest';
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

  it('rejects every tracked or untracked non-ignored candidate worktree change', () => {
    expect(() => assertCandidateWorktreeClean('')).not.toThrow();
    expect(() => assertCandidateWorktreeClean('\n')).not.toThrow();
    expect(() => assertCandidateWorktreeClean(' M scripts/backtest.ts\n')).toThrow(/clean Git worktree/);
    expect(() => assertCandidateWorktreeClean('?? scratch.json\n')).toThrow(/clean Git worktree/);
  });

  it('requires a clean worktree, deterministic seed, and known SHA for reproducibility', () => {
    expect(isReproducibleRun(42, 'abc1234', '')).toBe(true);
    expect(isReproducibleRun(42, 'abc1234', ' M messages/en.json\n M src/components/quant/Chart.tsx\n')).toBe(true);
    expect(isReproducibleRun(42, 'abc1234', ' M src/quant/backtest/metrics.ts\n')).toBe(false);
    expect(isReproducibleRun(42, 'abc1234', '?? src/quant/newRuntimeDependency.ts\n')).toBe(false);
    expect(isReproducibleRun(42, 'abc1234', ' M scripts/backtest.ts\n')).toBe(false);
    expect(isReproducibleRun(42, 'unknown', '')).toBe(false);
    expect(isReproducibleRun(-1, 'abc1234', '')).toBe(false);
    expect(isReproducibleRun(42, 'abc1234', null)).toBe(false);
  });

  it('accepts seed 0 and a strict interior OOS fraction', () => {
    expect(() => assertCandidateValidationConfig(0, 0.3)).not.toThrow();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1])(
    'rejects invalid candidate seed %s',
    (seed) => expect(() => assertCandidateValidationConfig(seed, 0.3)).toThrow(/--seed/),
  );

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, 1, -0.1, 1.1])(
    'rejects invalid candidate OOS fraction %s',
    (oos) => expect(() => assertCandidateValidationConfig(42, oos)).toThrow(/--oos/),
  );

  it('counts only trade transitions fully inside the OOS curve slice', () => {
    // 10 trades => 11 curve points; slice starts at point 7 => transitions 7→8, 8→9, 9→10.
    expect(transitionCountInsideSlice(11, 7)).toBe(3);
    expect(transitionCountInsideSlice(1, 0)).toBe(0);
  });
});

describe('shared intraday provenance and setup metadata', () => {
  it('constrains ordinary DB execution loads to NASDAQ/ALPACA and rechecks returned rows', async () => {
    h.findMany.mockResolvedValueOnce([bar('2026-01-06', 10)]);
    h.marketFindMany.mockResolvedValueOnce([]);
    h.snapshotFindMany.mockResolvedValueOnce([]);
    await loadDbSymbol('AAPL', '2026-01-06', '2026-01-06');
    expect(h.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ symbol: 'AAPL', market: 'NASDAQ', source: 'ALPACA' }),
    }));
  });

  it('accepts only NASDAQ/ALPACA execution rows and fails closed on either mismatch', () => {
    expect(() => assertAlpacaNasdaqExecutionRows([{ market: 'NASDAQ', source: 'ALPACA' }])).not.toThrow();
    expect(() => assertAlpacaNasdaqExecutionRows([{ market: 'TASI', source: 'ALPACA' }])).toThrow(/NASDAQ\/ALPACA/);
    expect(() => assertAlpacaNasdaqExecutionRows([{ market: 'NASDAQ', source: 'MOCK' }])).toThrow(/NASDAQ\/ALPACA/);
  });

  it('routes stocks-in-play to the exact execution-blocked Sharia state without changing defaults', () => {
    expect(shariaStateForSetup('stocks-in-play-orb')).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(shariaStateForSetup('vwap-reclaim')).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(shariaStateForSetup('bollinger-mr-long')).toBe('UNVERIFIED');
    expect(shariaStateForSetup('gapper-orb', 'VERIFIED_COMPLIANT')).toBe('VERIFIED_COMPLIANT');
  });
});
