import { describe, expect, it } from 'vitest';
import type { BetaCriteriaInput } from './betaCriteria';
import { stableConfigHash } from './experimentProtocol';
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

    expect(rendered).toContain('DSR trial count:      99 family-wide (9 local plateau');
    expect(rendered).toContain('DSR trial tier:       EXPLORATORY (fail-closed) — unproved: SEALED_CONFIG_HASH_VERIFIED');
  });

  it('makes a confirmatory N=1 deflation visible next to the DSR line', () => {
    const sealedConfig = { setup: 'halal-spus-vol-managed-beta', seed: 42 };
    const trialCount = trialCountEvidence('halal-spus-vol-managed-beta', 108, {
      config: sealedConfig,
      configHash: stableConfigHash(sealedConfig),
      historicalMode: 'FORWARD_ONLY_NO_HISTORICAL_FULL',
      diagnosticRuns: 0,
      sealedAt: '2026-08-06T12:00:00.000Z',
      forwardBoundary: '2026-08-07T20:00:00.000Z',
      earliestObservation: '2026-08-14T20:00:00.000Z',
      terminalEvaluations: 1,
    });
    const card = assembleReportCard(args({ trialCount }));
    const rendered = renderReportCard(card, false);

    expect(card.trialCount).toMatchObject({ tier: 'CONFIRMATORY', familyTrials: 1 });
    expect(rendered).toContain('DSR trial count:      1 confirmatory (108 local plateau');
    expect(rendered).toContain('DSR trial tier:       CONFIRMATORY N=1 — all 6 structural conditions proved; exploratory fallback 108');
    // The tier is evidence, not a gate: thresholds and reason-code ordering are untouched.
    expect(card.checklist.deflatedSharpeOk).toBe(assembleReportCard(args()).checklist.deflatedSharpeOk);
    expect(card.rejectionReasonCodes).toEqual(assembleReportCard(args()).rejectionReasonCodes);
  });

  it('QDR-10: absent productClass resolves to ALPHA and the card is unchanged', () => {
    const card = assembleReportCard(args());

    expect(card.productClass).toBe('ALPHA');
    expect(card.betaCriterionFailures).toBeUndefined();
    expect(card.status).toBe('ACCEPTED');
    expect(renderReportCard(card, false)).not.toContain('productClass=BETA');
    expect(renderReportCard(card, false)).not.toContain('BETA criteria');
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

/** Deterministic near-Gaussian five-session series with an exact annualized volatility. */
function observationsWithVolatility(annualVol: number, n: number, drift = 0.001): number[] {
  const raw = Array.from({ length: n }, (_, i) => Math.sin((i + 1) * 2.399963229728653));
  const mean = raw.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(raw.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const scale = annualVol / Math.sqrt(252 / 5) / sd;
  return raw.map((v) => drift + (v - mean) * scale);
}

describe('QDR-10 BETA-class report card', () => {
  const betaEvidence: BetaCriteriaInput = {
    observationReturns: observationsWithVolatility(0.1, 216),
    observationsPerYear: 252 / 5,
    volCeiling: 0.13,
    volFloor: 0.06,
    upCapture: 0.71,
    downCapture: 0.635,
    oosCagr: 0.06,
    benchmarkCagr: 0.09,
    betaVsBenchmark: 0.62,
    sealedCostModel: { commissionBpsPerSide: 10, slippageBpsPerSide: 5, advParticipationCap: 0.05 },
    realizedCostModel: { commissionBpsPerSide: 10, slippageBpsPerSide: 5, advParticipationCap: 0.05 },
    realizedAnnualTurnover: 3,
    maxAnnualTurnover: 4,
    realizedAnnualCostDragBps: 35,
    maxAnnualCostDragBps: 60,
  };
  const betaArgs = (evidence: Partial<BetaCriteriaInput> = {}, override: Partial<AssembleArgs> = {}) =>
    args({ productClass: 'BETA', betaEvidence: { ...betaEvidence, ...evidence }, ...override });

  it('admits a book that meets all three promotion criteria as ACCEPTED_BETA — never bare ACCEPTED', () => {
    const card = assembleReportCard(betaArgs());

    expect(card.status).toBe('ACCEPTED_BETA');
    expect(card.betaCriterionFailures).toEqual([]);
    expect(card.rejectionReasonCodes).toEqual([]);
    expect(card.acceptanceMeaning).toBe('AUTO_PAPER_ADMISSION_ONLY');
  });

  it.each([
    ['VOLATILITY_BAND', { observationReturns: observationsWithVolatility(0.16, 216) }],
    ['RELATIVE_SHORTFALL', { oosCagr: -0.02 }],
    ['COST_ENVELOPE', { realizedAnnualCostDragBps: 90 }],
  ] as const)('rejects the identical card as REJECTED_BETA when %s alone is breached', (code, breach) => {
    const card = assembleReportCard(betaArgs(breach));

    expect(card.status).toBe('REJECTED_BETA');
    expect(card.betaCriterionFailures).toEqual([code]);
    // BETA criterion failures land in OOS_FAILURE's existing position and add no new code.
    expect(card.rejectionReasonCodes).toEqual(['OOS_FAILURE']);
    expect(card.rejectionReasonCodes).not.toContain('DSR_FAILURE');
  });

  it('never emits DSR_FAILURE for BETA, and prints the DSR as reported-not-a-gate', () => {
    const card = assembleReportCard(betaArgs({}, { oos: metrics({ trades: 35, deflatedSharpe: 0.1 }) }));

    expect(card.checklist.deflatedSharpeOk).toBe(false); // the ALPHA computation is untouched
    expect(card.rejectionReasonCodes).not.toContain('DSR_FAILURE');
    expect(card.status).toBe('ACCEPTED_BETA');
    expect(renderReportCard(card, false)).toContain('reported, not a gate; this version makes no edge claim');
  });

  it('(c3) a negative OOS return in a negative benchmark window is not a BETA failure, but is under ALPHA', () => {
    const downMarket = { oosCagr: -0.05, benchmarkCagr: -0.06 };
    const beta = assembleReportCard(betaArgs(downMarket, { oos: metrics({ trades: 35, cagr: -0.05 }) }));
    const alpha = assembleReportCard(args({ oos: metrics({ trades: 35, cagr: -0.05 }) }));
    const rendered = renderReportCard(beta, false);

    expect(beta.status).toBe('ACCEPTED_BETA');
    expect(beta.rejectionReasonCodes).toEqual([]);
    expect(rendered).toContain('delivered a negative return over the tested window; the benchmark did too');
    expect(alpha.status).toBe('REJECTED');
    expect(alpha.rejectionReasonCodes).toContain('OOS_FAILURE');
  });

  it('fails closed when a BETA card carries no criteria evidence at all', () => {
    const card = assembleReportCard(args({ productClass: 'BETA' }));

    expect(card.status).toBe('REJECTED_BETA');
    expect(card.betaCriterionFailures)
      .toEqual(['VOLATILITY_BAND', 'RELATIVE_SHORTFALL', 'COST_ENVELOPE']);
    expect(renderReportCard(card, false)).toContain('BETA evidence MISSING');
  });

  it('prints the class, both captures, the honest trade, and the no-edge disclaimer', () => {
    const rendered = renderReportCard(assembleReportCard(betaArgs()), false);

    expect(rendered).toContain('productClass=BETA');
    expect(rendered).toContain('Capture up/down:      0.710 / 0.635  (down/up 0.894)');
    expect(rendered).toContain(
      'capture convexity is reported for transparency and is not a promotion criterion; the effect is '
      + 'too small to resolve inside a product horizon (measured: \u226444% power at 10.3 years)',
    );
    expect(rendered).toContain('ACCEPTED_BETA has NOT been shown to have an edge');
    // (c1) withdrawn: an ACCEPTED_BETA must never be described as having demonstrated convexity.
    expect(rendered).not.toContain('favorable capture convexity');
    expect(rendered).toContain('no shortfall against its own delivered beta');
    expect(rendered).toContain('STATUS: ACCEPTED_BETA');
  });

  it('(c1 WITHDRAWN) a 0.99 capture ratio is ACCEPTED_BETA and CAPTURE_CONVEXITY is never emitted', () => {
    const card = assembleReportCard(betaArgs({ upCapture: 0.71, downCapture: 0.7029 }));

    expect(card.betaSummary!.captureRatio).toBeCloseTo(0.99, 4);
    expect(card.status).toBe('ACCEPTED_BETA');
    expect(card.betaCriterionFailures).toEqual([]);
    expect(JSON.stringify(card)).not.toContain('CAPTURE_CONVEXITY');
    expect(renderReportCard(card, false)).not.toContain('CAPTURE_CONVEXITY');
  });

  it('keeps every hard safety gate byte-identical for BETA', () => {
    const drawdown = assembleReportCard(betaArgs({}, {
      bootstrap: { ...bootstrap, maxDrawdown: { p5: 0.05, p50: 0.2, p95: 0.31 } },
    }));
    const ruin = assembleReportCard(betaArgs({}, { bootstrap: { ...bootstrap, riskOfRuin: 0.06 } }));
    const sharia = assembleReportCard(betaArgs({}, { shariaState: 'UNSCREENED_EXECUTION_BLOCKED' }));
    const sample = assembleReportCard(betaArgs({}, { full: metrics({ trades: 99 }) }));
    const implausible = assembleReportCard(betaArgs({}, { full: metrics({ sharpe: 3.4, implausible: true }) }));

    expect(drawdown.rejectionReasonCodes).toEqual(['DRAWDOWN_RISK_FAILURE']);
    expect(ruin.rejectionReasonCodes).toEqual(['DRAWDOWN_RISK_FAILURE']);
    expect(sharia.rejectionReasonCodes).toEqual(['SHARIA_UNVERIFIABLE']);
    expect(sample.rejectionReasonCodes).toEqual(['INSUFFICIENT_SAMPLE']);
    expect(implausible.rejectionReasonCodes).toEqual(['IMPLAUSIBLE_RESULT']);
    for (const card of [drawdown, ruin, sharia, sample, implausible]) expect(card.status).toBe('REJECTED_BETA');
  });
});
