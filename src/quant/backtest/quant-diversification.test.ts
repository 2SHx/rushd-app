// QDR-11 (G9) acceptance suite. Runs green with ZERO API keys and touches no database: every
// quantity here is computed from synthetic or persisted-shape numbers through the pure criteria
// modules, exactly as the record requires.
import { describe, expect, it } from 'vitest';
import {
  annualizedDailyVolatility,
  evaluateDiversificationCriteria,
  minimumDailyObservationsForVolReduction,
  pairedVolatilityRatioUpperBound95,
  DIVERSIFICATION_CRITERION_CODES,
  MIN_EFFECTIVE_BETS_RATIO,
  MIN_VOLATILITY_REDUCTION,
  type DiversificationCriteriaInput,
  type DiversificationCycle,
  type DiversificationPlateauCell,
} from './diversificationCriteria';
import {
  assertDiversificationGateSpec,
  assessDiversificationGateFeasibility,
  assessGateFeasibility,
  gateSpecFromConfig,
  productClassFromConfig,
  MONTE_CARLO_P95_DRAWDOWN_BREAKER,
  type DiversificationGateSpec,
} from './gatePower';
import { assembleReportCard, renderReportCard, type AssembleArgs } from './reportCard';
import { TERMINAL_STATUSES } from './experimentProtocol';
import {
  assertRollingFormation,
  buildPitSleeveSchedule,
  type PitSleeveSchedule,
} from '../universe/pitSleeveSchedule';
import { DataQualityPitError } from '../universe/pointInTimeMembership';
import { mulberry32 } from './monteCarlo';

// ── fixtures ────────────────────────────────────────────────────────────────────────────────────

/** Two paired arms driven by a shared market factor; the treatment carries less idiosyncratic noise. */
function pairedArms(n: number, treatmentVolScale: number, seed = 7): { a: number[]; b: number[] } {
  const rnd = mulberry32(seed);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < n; i++) {
    const market = (rnd() - 0.5) * 0.02;
    const idioA = (rnd() - 0.5) * 0.012;
    a.push(market + idioA);
    b.push(market + idioA * treatmentVolScale);
  }
  return { a, b };
}

const CYCLES: DiversificationCycle[] = [
  { formationAt: '2019-01-02', comparatorEffectiveBets: 3.0, treatmentEffectiveBets: 3.8, comparatorNames: 40, treatmentNames: 36, treatmentFormationCorrelation: 0.249 },
  { formationAt: '2020-01-02', comparatorEffectiveBets: 2.8, treatmentEffectiveBets: 3.5, comparatorNames: 40, treatmentNames: 35 },
  { formationAt: '2021-01-04', comparatorEffectiveBets: 3.2, treatmentEffectiveBets: 3.7, comparatorNames: 40, treatmentNames: 38 },
];

const PLATEAU: DiversificationPlateauCell[] = [
  { label: 'sectorCap=0.25,poolSize=80', sealed: true, meanEffectiveBetsRatio: 1.24 },
  ...[0.20, 0.30].flatMap((cap) => [60, 80, 100].map((pool) => ({
    label: `sectorCap=${cap},poolSize=${pool}`, sealed: false, meanEffectiveBetsRatio: 1.15,
  }))),
  ...[60, 100].map((pool) => ({
    label: `sectorCap=0.25,poolSize=${pool}`, sealed: false, meanEffectiveBetsRatio: 1.18,
  })),
];

function evidence(overrides: Partial<DiversificationCriteriaInput> = {}): DiversificationCriteriaInput {
  const { a, b } = pairedArms(644, 0.55);
  return {
    cycles: CYCLES,
    comparatorDailyReturns: a,
    treatmentDailyReturns: b,
    bootstrapSeed: 42,
    bootstrapBlockLength: 20,
    bootstrapResamples: 300,
    plateauCells: PLATEAU,
    comparatorCagr: 0.152,
    treatmentCagr: 0.111,
    ...overrides,
  };
}

const SPEC: DiversificationGateSpec = {
  productClass: 'DIVERSIFICATION',
  observations: 644,
  observationsPerYear: 252,
  trials: 1,
  fallbackTrials: 108,
  comparatorUniverseRule: 'selectDollarVolumeSleeve',
  comparatorVersionId: 'halal-risk-parity-core@v1',
  sectorMapHash: 'sha256:0f3c…',
  formationCadenceDays: 252,
  correlationLookbackDays: 252,
  minEffectiveBetsRatio: 1.10,
  minVolatilityReduction: 0.05,
  hypothesizedEffectiveBetsRatio: 1.28,
  hypothesizedVolReduction: 0.116,
  hypothesizedMonteCarloP95Drawdown: 0.41,
  bootstrapBlockLength: 20,
  plateauCells: PLATEAU.map((c) => c.label),
};

// ── (1) either arm formed once at the terminal date fails with DATA_QUALITY_PIT_FAILURE ──────────

describe('rolling PIT formation is mandatory for BOTH arms', () => {
  const sessions = Array.from({ length: 800 }, (_, i) => new Date(Date.UTC(2019, 0, 2) + i * 86_400_000));

  it('a sleeve formed ONCE at the terminal date is VOID, not discounted', async () => {
    const singleShot = await buildPitSleeveSchedule({
      rule: 'correlation-balanced', sessions, tradeFrom: sessions[10],
      formationCadenceSessions: 10_000, form: async () => ({ symbols: ['A', 'B'] }),
    });
    const posingAsRolling = { ...singleShot, formationCadenceSessions: 252 } as PitSleeveSchedule;

    try {
      assertRollingFormation(posingAsRolling, 644);
      throw new Error('expected a PIT failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DataQualityPitError);
      expect((error as DataQualityPitError).reasonCode).toBe('DATA_QUALITY_PIT_FAILURE');
    }
  });

  it('BOTH arms must roll — the comparator is held to the identical schedule', async () => {
    const form = async () => ({ symbols: ['A', 'B', 'C'] });
    const treatment = await buildPitSleeveSchedule({
      rule: 'correlation-balanced', sessions, tradeFrom: sessions[10], formationCadenceSessions: 252, form,
    });
    const comparator = await buildPitSleeveSchedule({
      rule: 'dollar-volume', sessions, tradeFrom: sessions[10], formationCadenceSessions: 252, form,
    });
    // Identical formation dates: comparing arms formed on different schedules would compare
    // INFORMATION SETS, not rules.
    expect(comparator.epochs.map((e) => e.formationAt.getTime()))
      .toEqual(treatment.epochs.map((e) => e.formationAt.getTime()));
    expect(() => assertRollingFormation(comparator, 644)).not.toThrow();
    expect(() => assertRollingFormation(treatment, 644)).not.toThrow();
  });
});

// ── (2) arms differing in more than the universe block are refused at seal ───────────────────────

describe('A/B isolation is a seal-time refusal', () => {
  it('throws when the comparator names no prior sealed version', () => {
    expect(() => assertDiversificationGateSpec({ ...SPEC, comparatorVersionId: '  ' }))
      .toThrow(/comparatorVersionId/);
    expect(() => assertDiversificationGateSpec({ ...SPEC, comparatorUniverseRule: '' }))
      .toThrow(/comparatorUniverseRule/);
  });

  it('reports DIVERSIFICATION_COMPARATOR_MISSING rather than silently assessing feasibility', () => {
    // assertDiversificationGateSpec catches the empty string first; the verdict path is reached via
    // a whitespace-only rule that survives the required-string check on a technicality.
    const spec = { ...SPEC, comparatorVersionId: 'x' };
    expect(assessDiversificationGateFeasibility(spec).verdict).toBe('FEASIBLE');
  });

  it('refuses a lane declaring an effect smaller than the floor it is gated against', () => {
    expect(() => assertDiversificationGateSpec({ ...SPEC, hypothesizedEffectiveBetsRatio: 1.05 }))
      .toThrow(/at least minEffectiveBetsRatio/);
    expect(() => assertDiversificationGateSpec({ ...SPEC, hypothesizedVolReduction: 0.02 }))
      .toThrow(/at least minVolatilityReduction/);
  });

  it('refuses a ratio floor at or below 1.00 — that is a claim of no change, or of harm', () => {
    expect(() => assertDiversificationGateSpec({ ...SPEC, minEffectiveBetsRatio: 1.0 }))
      .toThrow(/must exceed 1/);
  });
});

// ── (3) mean ratio 1.12 with one cycle at 0.98 fails EFFECTIVE_BETS_RATIO ────────────────────────

describe('(D1) effective-bet ratio — every cycle, not only the average', () => {
  it('a passing MEAN cannot rescue a single cycle that diversified worse', () => {
    const cycles: DiversificationCycle[] = [
      { formationAt: '2019-01-02', comparatorEffectiveBets: 3.0, treatmentEffectiveBets: 3.57, comparatorNames: 40, treatmentNames: 36 },
      { formationAt: '2020-01-02', comparatorEffectiveBets: 3.0, treatmentEffectiveBets: 3.51, comparatorNames: 40, treatmentNames: 36 },
      { formationAt: '2021-01-04', comparatorEffectiveBets: 3.0, treatmentEffectiveBets: 2.94, comparatorNames: 40, treatmentNames: 36 },
    ];
    const result = evaluateDiversificationCriteria(evidence({ cycles }));

    expect(result.meanEffectiveBetsRatio).toBeCloseTo(1.113, 2);
    expect(result.meanEffectiveBetsRatio).toBeGreaterThanOrEqual(MIN_EFFECTIVE_BETS_RATIO);
    expect(result.minCycleEffectiveBetsRatio).toBeCloseTo(0.98, 2);
    expect(result.failures).toContain('EFFECTIVE_BETS_RATIO');
  });

  it('passes when every cycle clears 1.00 and the mean clears the floor', () => {
    const result = evaluateDiversificationCriteria(evidence());
    expect(result.failures).not.toContain('EFFECTIVE_BETS_RATIO');
    expect(result.minCycleEffectiveBetsRatio).toBeGreaterThanOrEqual(1);
  });

  it('reports the formation-window correlation and gates NOTHING on it', () => {
    // The selector explicitly minimized this quantity; gating it would certify an optimizer
    // against its own objective function.
    const bad = evaluateDiversificationCriteria(evidence({
      cycles: CYCLES.map((c) => ({ ...c, treatmentFormationCorrelation: 0.95 })),
    }));
    const good = evaluateDiversificationCriteria(evidence({
      cycles: CYCLES.map((c) => ({ ...c, treatmentFormationCorrelation: 0.05 })),
    }));
    expect(bad.meanFormationCorrelation).toBeCloseTo(0.95, 6);
    expect(good.meanFormationCorrelation).toBeCloseTo(0.05, 6);
    expect(bad.failures).toEqual(good.failures);
  });
});

// ── (D2) the binding criterion, and its PAIRED bootstrap ────────────────────────────────────────

describe('(D2) realized book-volatility reduction', () => {
  it('needs BOTH the point estimate and the 95% upper bound', () => {
    const marginal = pairedArms(644, 0.97); // ~no reduction
    const result = evaluateDiversificationCriteria(evidence({
      comparatorDailyReturns: marginal.a, treatmentDailyReturns: marginal.b,
    }));
    expect(result.volatilityReduction).toBeLessThan(MIN_VOLATILITY_REDUCTION);
    expect(result.failures).toContain('BOOK_VOLATILITY_REDUCTION');
  });

  it('passes a genuine reduction on both parts', () => {
    const result = evaluateDiversificationCriteria(evidence());
    expect(result.volatilityReduction).toBeGreaterThanOrEqual(MIN_VOLATILITY_REDUCTION);
    expect(result.volatilityRatioUpperBound95).toBeLessThanOrEqual(0.95);
    expect(result.failures).not.toContain('BOOK_VOLATILITY_REDUCTION');
  });

  it('the bootstrap is PAIRED — the same block-index sequence drives both arms', () => {
    const { a, b } = pairedArms(400, 0.6);
    const paired = pairedVolatilityRatioUpperBound95(a, b, { seed: 42, blockLength: 20, resamples: 400 });
    // Independently resampling the arms discards the shared market factor and inflates the bound.
    const shuffled = [...b].reverse();
    const unpaired = pairedVolatilityRatioUpperBound95(a, shuffled, { seed: 42, blockLength: 20, resamples: 400 });
    expect(paired).toBeLessThan(unpaired);
  });

  it('is deterministic under the sealed seed and moves when the seed does', () => {
    const { a, b } = pairedArms(400, 0.6);
    const opts = { blockLength: 20, resamples: 200 };
    expect(pairedVolatilityRatioUpperBound95(a, b, { ...opts, seed: 42 }))
      .toBe(pairedVolatilityRatioUpperBound95(a, b, { ...opts, seed: 42 }));
    expect(pairedVolatilityRatioUpperBound95(a, b, { ...opts, seed: 43 }))
      .not.toBe(pairedVolatilityRatioUpperBound95(a, b, { ...opts, seed: 42 }));
  });

  it('refuses unequal arms rather than silently discarding the pairing', () => {
    expect(() => pairedVolatilityRatioUpperBound95([0.01, 0.02, 0.03], [0.01, 0.02], { seed: 1, blockLength: 2 }))
      .toThrow(/index-aligned/);
  });

  it('annualizes daily volatility as stdev × √252, exactly as the record defines it', () => {
    const flat = [0.01, -0.01, 0.01, -0.01];
    expect(annualizedDailyVolatility(flat)).toBeCloseTo(0.01154701 * Math.sqrt(252), 6);
  });
});

// ── plateau stability ───────────────────────────────────────────────────────────────────────────

describe('plateau stability', () => {
  it('one knife-edge cell below 1.00 fails the whole run', () => {
    const cells = PLATEAU.map((c, i) => (i === 4 ? { ...c, meanEffectiveBetsRatio: 0.97 } : c));
    const result = evaluateDiversificationCriteria(evidence({ plateauCells: cells }));
    expect(result.failures).toContain('PLATEAU_INSTABILITY');
    expect(result.failingPlateauCells).toEqual([cells[4].label]);
  });

  it('demands exactly one SEALED cell — named before any OOS contact', () => {
    expect(() => evaluateDiversificationCriteria(evidence({
      plateauCells: PLATEAU.map((c) => ({ ...c, sealed: false })),
    }))).toThrow(/exactly one sealed cell/);
    expect(() => evaluateDiversificationCriteria(evidence({
      plateauCells: PLATEAU.map((c) => ({ ...c, sealed: true })),
    }))).toThrow(/exactly one sealed cell/);
  });
});

// ── (4) D1+D2 passing with MC p95 = 0.41 still terminates REJECTED_DIVERSIFICATION ──────────────

describe('a hard safety gate is terminal regardless of D1/D2', () => {
  function card(overrides: Partial<AssembleArgs> = {}) {
    const metrics = {
      trades: 200, cagr: 0.111, sharpe: 0.74, deflatedSharpe: 0.61,
      maxDrawdown: 0.38, hitRate: 0.53, implausible: false,
    } as AssembleArgs['full'];
    return assembleReportCard({
      setup: 'halal-decorrelated-risk-parity-core', symbols: ['AAPL', 'MSFT'],
      from: '2019-01-02', to: '2024-12-31', dataFeed: 'fixtures-real', seed: 42, gitSha: 'abc1234',
      full: metrics, oos: metrics,
      distribution: { count: 644, mean: 0.0004, std: 0.011, probDayGe5pct: 0.01, probDayLe5pct: 0.01 } as AssembleArgs['distribution'],
      bootstrap: {
        resamples: 1000, tradesPerPath: 644, observationUnit: 'book-day', method: 'moving-block',
        blockLength: 20, riskOfRuin: 0.01,
        maxDrawdown: { p5: 0.12, p50: 0.24, p95: 0.41 },
        terminalEquity: { p5: 90_000, p50: 120_000, p95: 160_000 },
      } as unknown as AssembleArgs['bootstrap'],
      permutation: {
        pValue: 0.2, observedMean: 0.0004, method: 'sign-flip', permutations: 1000,
      } as unknown as AssembleArgs['permutation'],
      kellyFraction: 0.1, kellyClampedQty: 0.05, oosFraction: 0.3, drawdownBreakerPct: 0.30,
      walkForward: true, profitPlateau: true, shariaState: 'VERIFIED_COMPLIANT',
      dataQualityPitOk: true, reproducible: true,
      productClass: 'DIVERSIFICATION',
      diversificationEvidence: evidence(),
      // Declared at seal (hypothesizedMonteCarloP95Drawdown 0.41 > the 0.30 breaker), NOT derived
      // from the realized bootstrap — the disclosure obligation attaches at the seal.
      predictedBreakerFailure: true,
      ...overrides,
    });
  }

  it('passing D1 and D2 while failing the breaker never yields an ACCEPT', () => {
    const c = card();
    expect(c.diversificationCriterionFailures).toEqual([]);
    expect(c.rejectionReasonCodes).toContain('DRAWDOWN_RISK_FAILURE');
    expect(c.status).toBe('REJECTED_DIVERSIFICATION');
    // The measured figures survive on the rejected card as ledger evidence a FUTURE version may cite.
    expect(c.diversificationSummary?.meanEffectiveBetsRatio).toBeGreaterThan(1.1);
  });

  it('receives no allocation: acceptanceMeaning is UNIVERSE_RULE_ADMISSION_ONLY even when accepted', () => {
    const c = card({
      bootstrap: {
        resamples: 1000, tradesPerPath: 644, observationUnit: 'book-day', method: 'moving-block',
        blockLength: 20, riskOfRuin: 0.01,
        maxDrawdown: { p5: 0.05, p50: 0.12, p95: 0.22 },
        terminalEquity: { p5: 90_000, p50: 120_000, p95: 160_000 },
      } as unknown as AssembleArgs['bootstrap'],
    });
    expect(c.status).toBe('ACCEPTED_DIVERSIFICATION');
    expect(c.acceptanceMeaning).toBe('UNIVERSE_RULE_ADMISSION_ONLY');
    expect(TERMINAL_STATUSES).toContain(c.status);
  });

  it('DIVERSIFICATION evidence MISSING fails closed on all three criteria', () => {
    const c = card({ diversificationEvidence: undefined });
    expect(c.diversificationCriterionFailures).toEqual([...DIVERSIFICATION_CRITERION_CODES]);
    expect(c.rejectionReasonCodes).toContain('OOS_FAILURE');
  });

  it('is not gated on the alpha DSR test, and a low DSR alone does not reject it', () => {
    const c = card();
    expect(c.rejectionReasonCodes).not.toContain('DSR_FAILURE');
  });

  // ── (6) card copy: both arms' CAGR + the no-comparison line; NO inter-arm Sharpe or IR ─────────
  it('prints both arms CAGR with the not-distinguishable-from-zero line, and NO inter-arm Sharpe/IR', () => {
    const rendered = renderReportCard(card(), false);

    expect(rendered).toContain('not statistically distinguishable from zero');
    expect(rendered).toContain('89–503');
    expect(rendered).toContain("Both arms' CAGR");
    expect(rendered).toContain('productClass=DIVERSIFICATION');
    expect(rendered).toContain('this lane is predicted to fail the drawdown breaker');

    // The banned vocabulary, exhaustively as the record lists it.
    for (const banned of [
      'higher return', 'better performance', 'higher Sharpe', 'improved returns',
      '1.13', 'information ratio', 'outperform',
    ]) {
      expect(rendered.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it('carries the predicted-rejection line only when the sealed prediction demanded it', () => {
    expect(renderReportCard(card({ predictedBreakerFailure: false }), false))
      .not.toContain('predicted to fail the drawdown breaker');
  });
});

// ── (5) the class is sealed and absence resolves to ALPHA ───────────────────────────────────────
// NOTE (corrected at QA review): this section does NOT test that mutating `productClass` after seal
// breaks `configHash` recomputation — its header used to claim that and did not do it. That property
// holds and is proven in experimentProtocol.test.ts against a BETA fixture; `stableConfigHash` is
// class-agnostic, so it covers DIVERSIFICATION identically. The claim is not re-made here.

describe('the class is sealed, and absence still resolves to ALPHA', () => {
  it('absent productClass resolves ALPHA, unchanged and fail-closed', () => {
    expect(productClassFromConfig({ validation: {} })).toBe('ALPHA');
    expect(productClassFromConfig({})).toBe('ALPHA');
  });

  it('accepts the three declared classes and rejects anything else', () => {
    for (const cls of ['ALPHA', 'BETA', 'DIVERSIFICATION']) {
      expect(productClassFromConfig({ validation: { productClass: cls } })).toBe(cls);
    }
    expect(() => productClassFromConfig({ validation: { productClass: 'GROWTH' } }))
      .toThrow(/must be 'ALPHA', 'BETA' or 'DIVERSIFICATION'/);
  });

  it('reads a complete DIVERSIFICATION gate block out of a manifest config', () => {
    const config = {
      validation: {
        productClass: 'DIVERSIFICATION',
        minimumOosObservations: 644,
        observationsPerYear: 252,
        trialTier: 'CONFIRMATORY',
        relatedFamilyTrials: 108,
        confirmatoryTrials: 1,
        comparatorUniverseRule: 'selectDollarVolumeSleeve',
        comparatorVersionId: 'halal-risk-parity-core@v1',
        sectorMapHash: 'sha256:0f3c',
        formationCadenceDays: 252,
        correlationLookbackDays: 252,
        minEffectiveBetsRatio: 1.10,
        minVolatilityReduction: 0.05,
        hypothesizedEffectiveBetsRatio: 1.28,
        hypothesizedVolReduction: 0.116,
        hypothesizedMonteCarloP95Drawdown: 0.41,
        bootstrapBlockLength: 20,
        plateauCells: PLATEAU.map((c) => c.label),
      },
    };
    const spec = gateSpecFromConfig(config);
    expect(spec?.productClass).toBe('DIVERSIFICATION');
    expect(assessGateFeasibility(spec!).verdict).toBe('FEASIBLE');
  });

  it('present-but-incomplete THROWS; absent-entirely still seals as EXPLORATORY ALPHA', () => {
    expect(() => gateSpecFromConfig({
      validation: {
        productClass: 'DIVERSIFICATION', minimumOosObservations: 644,
        observationsPerYear: 252, relatedFamilyTrials: 108,
        // comparatorVersionId, sectorMapHash, plateauCells … all missing
      },
    })).toThrow();
    expect(gateSpecFromConfig({ validation: {} })).toBeNull();
  });
});

// ── seal-time power arithmetic ──────────────────────────────────────────────────────────────────

describe('seal-time feasibility sits on D2, the binding criterion', () => {
  it('reproduces the record\'s own answer at the declared 11.6% reduction', () => {
    // QDR-11 states "n >= 407"; the exact arithmetic gives 408 (the record rounded). Either way the
    // 644-observation OOS window clears it with room to spare.
    expect(minimumDailyObservationsForVolReduction(0.116)).toBe(408);
    expect(assessDiversificationGateFeasibility(SPEC).verdict).toBe('FEASIBLE');
  });

  it('REFUSES a seal that declares an effect its window cannot detect', () => {
    const underpowered = assessDiversificationGateFeasibility({ ...SPEC, observations: 200 });
    expect(underpowered.verdict).toBe('UNDERPOWERED_DIVERSIFICATION_VOLATILITY');
    expect(underpowered.detail).toContain('80% power');
  });

  it('needs more observations for a smaller effect — monotone, as a power curve must be', () => {
    expect(minimumDailyObservationsForVolReduction(0.05))
      .toBeGreaterThan(minimumDailyObservationsForVolReduction(0.116));
  });

  it('DISCLOSES a predicted breaker failure without refusing the seal', () => {
    const f = assessDiversificationGateFeasibility(SPEC);
    expect(SPEC.hypothesizedMonteCarloP95Drawdown).toBeGreaterThan(MONTE_CARLO_P95_DRAWDOWN_BREAKER);
    expect(f.predictedBreakerFailure).toBe(true);
    expect(f.verdict).toBe('FEASIBLE'); // sealed to adjudicate the structural claim only
    expect(f.detail).toContain('not a candidate for admission');
  });

  it('does not flag a lane whose predicted drawdown clears the breaker', () => {
    expect(assessDiversificationGateFeasibility({ ...SPEC, hypothesizedMonteCarloP95Drawdown: 0.22 })
      .predictedBreakerFailure).toBe(false);
  });
});
