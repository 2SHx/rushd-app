import { describe, expect, it } from 'vitest';
import type { BacktestMetrics } from './metrics';
import type { BootstrapResult, PermutationResult } from './monteCarlo';
import { assembleReportCard, renderReportCard, type AssembleArgs } from './reportCard';
import { trialCountEvidence } from './trialFamilies';

const metrics = (override: Partial<BacktestMetrics> = {}): BacktestMetrics => ({
  cagr: 0.2,
  sharpe: 1.5,
  deflatedSharpe: 0.97,
  maxDrawdown: 0.1,
  hitRate: 0.55,
  trades: 120,
  turnover: 12,
  implausible: false,
  ...override,
});

const bootstrap: BootstrapResult = {
  resamples: 1000,
  tradesPerPath: 120,
  finalEquity: { p5: 90, p50: 110, p95: 130 },
  maxDrawdown: { p5: 0.05, p50: 0.1, p95: 0.2 },
  riskOfRuin: 0,
};

const permutation: PermutationResult = {
  permutations: 1000,
  observedMean: 0.01,
  pValue: 0.01,
};

function args(override: Partial<AssembleArgs> = {}): AssembleArgs {
  return {
    setup: 'team-a',
    symbols: ['ABCD'],
    from: '2025-01-01',
    to: '2026-01-01',
    dataFeed: 'alpaca-iex',
    seed: 42,
    gitSha: 'abc1234',
    full: metrics(),
    oos: metrics({ trades: 35 }),
    distribution: { count: 10, mean: 0, std: 0.01, min: -0.01, max: 0.01, probDayGe5pct: 0, probDayLe5pct: 0 },
    bootstrap,
    permutation,
    kellyFraction: 0.1,
    kellyClampedQty: 1,
    oosFraction: 0.3,
    drawdownBreakerPct: 0.3,
    walkForward: true,
    profitPlateau: true,
    shariaState: 'VERIFIED_COMPLIANT',
    dataQualityPitOk: true,
    reproducible: true,
    ...override,
  };
}

describe('terminal validation report card', () => {
  it('does not mislabel the trade-count proxy as monetary turnover', () => {
    const rendered = renderReportCard(assembleReportCard(args()), false);
    expect(rendered).toContain('Trades (full/OOS):');
    expect(rendered).not.toContain('Turnover:');
  });

  it('labels shared Monte Carlo paths as book-day observations', () => {
    const rendered = renderReportCard(assembleReportCard(args({
      bootstrap: { ...bootstrap, observationUnit: 'book-day', method: 'moving-block', blockLength: 20 },
      permutation: { ...permutation, method: 'independent-sign-flip' },
    })), false);
    expect(rendered).toContain('book-days/path');
    expect(rendered).toContain('Bootstrap method:     moving-block; block length=20');
    expect(rendered).toContain('Sign-permutation p:');
    expect(rendered).not.toContain('Entry-jitter');
    expect(rendered).not.toContain('120 trades/path');
  });

  it('reports the family-wide DSR trial count separately from the local plateau', () => {
    const trialCount = trialCountEvidence('halal-fast-momentum-core', 9);
    const rendered = renderReportCard(assembleReportCard(args({ trialCount })), false);

    expect(rendered).toContain('DSR trial count:      90 family-wide (9 local plateau');
  });

  it('emits ACCEPTED only when every actual gate passes and explains its limited meaning', () => {
    const card = assembleReportCard(args());
    expect(card.status).toBe('ACCEPTED');
    expect(card.rejectionReasonCodes).toEqual([]);
    expect(renderReportCard(card, false)).toContain(
      'ACCEPTED = admission to AUTO_PAPER only; no profit promise or AUTO_REAL permission.',
    );
    expect(renderReportCard(card, false)).not.toMatch(/PROMOTABLE|FAILED_PROMOTION|INSUFFICIENT_TRADES/);
  });

  it('emits ordered cumulative rejection reasons and preserves explicit walk-forward false', () => {
    const card = assembleReportCard(args({
      full: metrics({ trades: 75, implausible: true }),
      oos: metrics({ cagr: -0.2, deflatedSharpe: 0.2, implausible: true }),
      bootstrap: { ...bootstrap, maxDrawdown: { ...bootstrap.maxDrawdown, p95: 0.8 } },
      walkForward: false,
      profitPlateau: false,
      shariaState: 'UNSCREENED_EXECUTION_BLOCKED',
      dataQualityPitOk: false,
      reproducible: false,
    }));
    expect(card.status).toBe('REJECTED');
    expect(card.checklist.walkForward).toBe(false);
    expect(card.rejectionReasonCodes).toEqual([
      'INSUFFICIENT_SAMPLE',
      'OOS_FAILURE',
      'DSR_FAILURE',
      'DRAWDOWN_RISK_FAILURE',
      'IMPLAUSIBLE_RESULT',
      'NO_PROFIT_PLATEAU_OVERFIT',
      'SHARIA_UNVERIFIABLE',
      'DATA_QUALITY_PIT_FAILURE',
      'REPRODUCIBILITY_FAILURE',
    ]);
    expect(renderReportCard(card, false)).toContain('STATUS: REJECTED');
  });

  it('maps an explicit Sharia hard veto to SHARIA_NON_COMPLIANT', () => {
    const card = assembleReportCard(args({ shariaState: 'VERIFIED_NON_COMPLIANT' }));
    expect(card.status).toBe('REJECTED');
    expect(card.rejectionReasonCodes).toEqual(['SHARIA_NON_COMPLIANT']);
  });

  it('rejects when risk of ruin alone exceeds the versioned limit', () => {
    const card = assembleReportCard(args({ bootstrap: { ...bootstrap, riskOfRuin: 0.051 } }));
    expect(card.status).toBe('REJECTED');
    expect(card.riskOfRuinLimit).toBe(0.05);
    expect(card.checklist.mcMaxDDWithinBreaker).toBe(true);
    expect(card.checklist.mcRiskOfRuinWithinLimit).toBe(false);
    expect(card.rejectionReasonCodes).toEqual(['DRAWDOWN_RISK_FAILURE']);
    expect(renderReportCard(card, false)).toContain('Risk of ruin:         5.10% (limit 5.00%)');
  });

  it('defaults missing walk-forward evidence to false rather than inferring it from trade count', () => {
    const card = assembleReportCard(args({ walkForward: undefined }));
    expect(card.full.trades).toBeGreaterThanOrEqual(100);
    expect(card.checklist.walkForward).toBe(false);
    expect(card.status).toBe('REJECTED');
    expect(card.rejectionReasonCodes).toEqual(['OOS_FAILURE']);
  });

  it('assigns NO_PROFIT_PLATEAU_OVERFIT only to a failed plateau gate', () => {
    const card = assembleReportCard(args({ profitPlateau: false }));
    expect(card.rejectionReasonCodes).toEqual(['NO_PROFIT_PLATEAU_OVERFIT']);
  });
});
