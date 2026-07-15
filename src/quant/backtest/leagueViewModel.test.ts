import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('@/lib/prisma', () => ({
  prisma: { backtestRun: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import { loadStrategyLeagueViewModel } from './leagueViewModel';
import { buildTradeEvidence } from './tradeEvidence';

function card(setup: string, status: 'ACCEPTED' | 'REJECTED') {
  const metrics = {
    cagr: 0.1, sharpe: 1.1, deflatedSharpe: 0.96, maxDrawdown: 0.1,
    hitRate: 0.55, trades: 120, turnover: 4, implausible: false,
  };
  return {
    setup,
    symbols: ['AAPL'],
    from: '2024-01-01',
    to: '2025-01-01',
    dataFeed: 'alpaca-iex',
    seed: 42,
    gitSha: 'abc123',
    full: metrics,
    oos: { ...metrics, cagr: status === 'REJECTED' ? -0.05 : 0.05 },
    distribution: { count: 250, mean: 0.001, std: 0.01, min: -0.04, max: 0.03, probDayGe5pct: 0, probDayLe5pct: 0 },
    bootstrap: {
      resamples: 1000,
      tradesPerPath: 120,
      finalEquity: { p5: 90_000, p50: 110_000, p95: 130_000 },
      maxDrawdown: { p5: 0.05, p50: 0.1, p95: 0.2 },
      riskOfRuin: 0,
    },
    permutation: { observedMean: 0.001, pValue: 0.04, permutations: 1000 },
    checklist: {
      walkForward: true, oosHoldoutPct: 0.3, oosHoldoutOk: true, enoughTrades: true,
      deflatedSharpeOk: true, profitPlateau: true, mcMaxDDWithinBreaker: true,
      mcRiskOfRuinWithinLimit: true, dataQualityPitOk: true, reproducible: true,
    },
    shariaState: 'VERIFIED_COMPLIANT',
    status,
    rejectionReasonCodes: status === 'REJECTED' ? ['OOS_FAILURE'] : [],
    acceptanceMeaning: 'AUTO_PAPER_ADMISSION_ONLY',
  };
}

function row(id: string, metrics: unknown, createdAt: string) {
  return { id, metrics, createdAt: new Date(createdAt) };
}

beforeEach(() => findMany.mockReset());

describe('loadStrategyLeagueViewModel', () => {
  it('queries terminal research runs once and retains accepted and rejected teams', async () => {
    findMany.mockResolvedValue([
      row('accepted', card('team-a', 'ACCEPTED'), '2026-07-12T12:00:00Z'),
      row('rejected', card('team-b', 'REJECTED'), '2026-07-12T11:00:00Z'),
    ]);

    const result = await loadStrategyLeagueViewModel();

    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: { strategyId: null },
      select: { id: true, metrics: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    expect(result.teams.map((team) => [team.setupId, team.status])).toEqual([
      ['team-a', 'ACCEPTED'],
      ['team-b', 'REJECTED'],
    ]);
    expect(result.teams[1].rejectionReasonCodes).toEqual(['OOS_FAILURE']);
  });

  it('skips legacy and malformed cards, including non-finite required metrics', async () => {
    const nonFinite = card('bad-number', 'REJECTED');
    nonFinite.full.cagr = Number.POSITIVE_INFINITY;
    findMany.mockResolvedValue([
      row('legacy', { full: { cagr: 0.1 }, oos: {} }, '2026-07-12T13:00:00Z'),
      row('bad-status', { ...card('bad-status', 'REJECTED'), status: 'VALIDATING' }, '2026-07-12T12:00:00Z'),
      row('non-finite', nonFinite, '2026-07-12T11:00:00Z'),
      row('valid', card('valid', 'REJECTED'), '2026-07-12T10:00:00Z'),
    ]);

    await expect(loadStrategyLeagueViewModel()).resolves.toMatchObject({
      teams: [{ runId: 'valid', setupId: 'valid' }],
    });
  });

  it('deduplicates to the newest valid run per setup', async () => {
    findMany.mockResolvedValue([
      row('newest', card('same-team', 'REJECTED'), '2026-07-12T12:00:00Z'),
      row('older', card('same-team', 'ACCEPTED'), '2026-07-11T12:00:00Z'),
    ]);

    const result = await loadStrategyLeagueViewModel();

    expect(result.teams).toHaveLength(1);
    expect(result.teams[0]).toMatchObject({ runId: 'newest', setupId: 'same-team', status: 'REJECTED' });
  });

  it('uses null only for absent optional nested numbers', async () => {
    const partial = card('partial-tail', 'REJECTED');
    partial.distribution = {} as typeof partial.distribution;
    findMany.mockResolvedValue([row('partial', partial, '2026-07-12T12:00:00Z')]);

    const { teams: [result] } = await loadStrategyLeagueViewModel();

    expect(result.comparison).toBeNull();
    expect(result.tradeEvidence).toBeNull();
    expect(result.distribution).toEqual({
      count: null, mean: null, std: null, min: null, max: null,
      probDayGe5pct: null, probDayLe5pct: null,
    });
  });

  it('retains reconciled trade evidence for team detail drill-downs', async () => {
    const current = {
      ...card('trade-team', 'ACCEPTED'),
      tradeEvidence: buildTradeEvidence([{
        symbol: 'AAPL',
        entryTs: new Date('2026-01-02T14:30:00.000Z'),
        exitTs: new Date('2026-01-05T14:30:00.000Z'),
        qty: 10,
        entryPrice: 100,
        exitPrice: 110,
        ret: 0.1,
        reason: 'strategy_exit',
        partial: false,
      }], 'SHARED_BOOK'),
    };
    findMany.mockResolvedValue([row('trade-run', current, '2026-07-12T12:00:00Z')]);

    const { teams: [result] } = await loadStrategyLeagueViewModel();

    expect(result.tradeEvidence).toMatchObject({
      basis: 'SHARED_BOOK',
      totalClosedTrades: 1,
      totalNetPnl: 100,
      bySymbol: [{ symbol: 'AAPL', netPnl: 100 }],
    });
  });

  it('rejects contradictory terminal semantics and out-of-domain evidence', async () => {
    const contradictory = card('contradictory', 'ACCEPTED');
    contradictory.rejectionReasonCodes = ['OOS_FAILURE'];
    const corruptRatio = card('corrupt-ratio', 'REJECTED');
    corruptRatio.bootstrap.riskOfRuin = 1.2;
    const corruptCount = card('corrupt-count', 'REJECTED');
    corruptCount.full.trades = -1;
    const wrongOrder = card('wrong-order', 'REJECTED');
    wrongOrder.checklist.deflatedSharpeOk = false;
    wrongOrder.rejectionReasonCodes = ['DSR_FAILURE', 'OOS_FAILURE'];
    const contradictoryGate = card('contradictory-gate', 'ACCEPTED');
    contradictoryGate.full.trades = 0;
    contradictoryGate.oos.deflatedSharpe = 0;
    findMany.mockResolvedValue([
      row('contradictory', contradictory, '2026-07-12T15:00:00Z'),
      row('corrupt-ratio', corruptRatio, '2026-07-12T14:00:00Z'),
      row('corrupt-count', corruptCount, '2026-07-12T13:00:00Z'),
      row('wrong-order', wrongOrder, '2026-07-12T12:00:00Z'),
      row('contradictory-gate', contradictoryGate, '2026-07-12T11:30:00Z'),
      row('valid', card('valid', 'REJECTED'), '2026-07-12T11:00:00Z'),
    ]);

    const result = await loadStrategyLeagueViewModel();

    expect(result.teams.map((team) => team.setupId)).toEqual(['valid']);
  });
});
