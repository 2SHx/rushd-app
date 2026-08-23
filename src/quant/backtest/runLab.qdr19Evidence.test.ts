// src/quant/backtest/runLab.qdr19Evidence.test.ts — QDR-19 says the terminal card MUST publish the
// BENCHMARK and PATH-SHAPE blocks. `assembleReportCard` has accepted both since e27f063, but
// `runLab` passed neither, so every card silently omitted them. These pins hold the wiring:
// (a) PATH-SHAPE is populated and reaches the renderer, (b) partial benchmark coverage publishes
// with `declarable: false` rather than being dropped, (c) an unmatched benchmark OMITS the block
// instead of forward-filling a curve, (d) a five-session lane annualizes at 252/5, not 252, and
// (e) neither block can move the checklist or a rejection code.
import { describe, expect, it } from 'vitest';
import { computeMetrics, type EquityPoint } from './metrics';
import { bootstrapTradeOutcomes } from './monteCarlo';
import { assembleReportCard, renderReportCard, type AssembleArgs } from './reportCard';
import {
  FIVE_SESSION_BOOK_OBSERVATION_UNIT,
  benchmarkEvidenceForSetup,
  observationPeriodsPerYear,
  pathShapeEvidenceForSetup,
} from './runLab';

const FIVE_SESSION_GATE = { observationUnit: FIVE_SESSION_BOOK_OBSERVATION_UNIT };

/** Deterministic seeded NAV: 505 points ⇒ 504 book-days ⇒ exactly 100 whole five-session blocks. */
function navCurve(points = 505, seed = 20260822): EquityPoint[] {
  let state = seed;
  let equity = 100_000;
  const curve: EquityPoint[] = [{ ts: new Date(Date.UTC(2020, 0, 2)), equity }];
  for (let index = 1; index < points; index++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    equity *= 1 + ((state / 2147483648) - 0.46) * 0.02;
    curve.push({ ts: new Date(Date.UTC(2020, 0, 2) + index * 86_400_000), equity });
  }
  return curve;
}

const sessionKey = (ts: Date) => ts.toISOString().slice(0, 10);
const bookDayReturns = (curve: readonly EquityPoint[]) =>
  curve.slice(1).map((point, index) => point.equity / curve[index].equity - 1);

/** A benchmark that trades on the LAST `covered` sessions of the curve and no earlier — SPUS's
 * 2019-12-18 inception against a 2018 start, in miniature. */
function benchmarkCloses(curve: readonly EquityPoint[], covered: number): Map<string, number> {
  const closes = new Map<string, number>();
  let close = 400;
  curve.slice(curve.length - covered).forEach((point, index) => {
    close *= 1 + (index % 7 === 0 ? -0.004 : 0.0016);
    closes.set(sessionKey(point.ts), close);
  });
  return closes;
}

function pathShape(curve: EquityPoint[], gateConfig?: unknown) {
  const returns = bookDayReturns(curve);
  const opts = { resamples: 1000, seed: 7, startEquity: 100_000, observationUnit: 'book-day' as const };
  const bootstrap = bootstrapTradeOutcomes(returns, opts);
  return pathShapeEvidenceForSetup('qdr19-fixture', curve, {
    cagr: computeMetrics(curve, { trades: 100, turnover: 100, annualization: 'fixed', trials: 1 }).cagr,
    bootstrapReturns: returns,
    bootstrapOpts: opts,
    ...(bootstrap.ulcerIndex
      ? { bootstrapUlcer: { p50: bootstrap.ulcerIndex.p50, p95: bootstrap.ulcerIndex.p95 } }
      : {}),
  }, gateConfig);
}

function cardArgs(curve: EquityPoint[], override: Partial<AssembleArgs> = {}): AssembleArgs {
  const returns = bookDayReturns(curve);
  const metricOpts = { trades: 100, turnover: 100, annualization: 'fixed' as const, trials: 1 };
  return {
    setup: 'qdr19-fixture', symbols: ['ABCD'], from: '2020-01-02', to: '2021-05-21',
    dataFeed: 'alpaca-iex', seed: 7, gitSha: 'abc1234',
    full: computeMetrics(curve, metricOpts),
    oos: computeMetrics(curve.slice(Math.floor(curve.length * 0.7)), metricOpts),
    distribution: { count: 10, mean: 0, std: 0.01, min: -0.01, max: 0.01, probDayGe5pct: 0, probDayLe5pct: 0 },
    bootstrap: bootstrapTradeOutcomes(returns, {
      resamples: 1000, seed: 7, startEquity: 100_000, observationUnit: 'book-day',
    }),
    permutation: { pValue: 0.02, observedMean: 0.001, permutations: 1000 },
    kellyFraction: 0.1, kellyClampedQty: 1, oosFraction: 0.3, drawdownBreakerPct: 0.3,
    walkForward: true, profitPlateau: true, shariaState: 'VERIFIED_COMPLIANT',
    dataQualityPitOk: true, reproducible: true,
    ...override,
  };
}

describe('QDR-19 evidence reaches the report card', () => {
  it('publishes PATH SHAPE on an assembled card and renders the block', () => {
    const curve = navCurve();
    const evidence = pathShape(curve);
    expect(evidence).toBeDefined();
    const card = assembleReportCard(cardArgs(curve, { pathShapeEvidence: evidence }));

    expect(card.pathShapeEvidence?.observations).toBe(curve.length);
    expect(card.pathShapeEvidence?.ulcerIndex).toBeGreaterThan(0);
    expect(card.pathShapeEvidence?.bootstrapUlcer?.p95).toBeGreaterThan(0);
    // QDR-19(B2): the binding path length plus the 0.5x/2x context lengths, ascending.
    expect(card.pathShapeEvidence?.maxDrawdownPathLengthSensitivity?.map((p) => p.pathLength))
      .toEqual([252, 504, 1008]);
    expect(card.pathShapeEvidence?.maxDrawdownPathLengthSensitivity
      ?.filter((p) => p.binding).map((p) => p.pathLength)).toEqual([504]);

    const rendered = renderReportCard(card, false);
    expect(rendered).toContain('QDR-19 PATH SHAPE');
    expect(rendered).toContain('Ulcer Index:');
    expect(rendered).toContain('Max DD p95 by length:');
  });

  it('publishes a partially covered benchmark as declarable=false, never omitted', () => {
    const curve = navCurve();
    const evidence = benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true,
      closesBySession: benchmarkCloses(curve, 300),
    });
    expect(evidence?.declarable).toBe(false);
    expect(evidence?.matchedObservations).toBe(300);
    if (!evidence || evidence.declarable) throw new Error('expected non-declarable evidence');
    expect(evidence.nonDeclarableReason).toBe('PARTIAL_COVERAGE');
    expect(evidence.strategyObservations).toBe(curve.length);

    const rendered = renderReportCard(
      assembleReportCard(cardArgs(curve, { benchmarkEvidence: evidence })), false,
    );
    expect(rendered).toContain('QDR-19 BENCHMARK');
    expect(rendered).toContain('Benchmark:            SPUS');
    expect(rendered).toContain('Information Ratio');
    expect(rendered).toContain('covers only 300 of 505 strategy observations (205 uncovered)');
    expect(rendered).not.toContain('survivor-conditioned equal-weight basket');
  });

  it('declares only a fully covered investable benchmark, and never a reconstructed basket', () => {
    const curve = navCurve();
    const closesBySession = benchmarkCloses(curve, curve.length);
    expect(benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true, closesBySession,
    })?.declarable).toBe(true);
    // QDR-20: a survivor-conditioned equal-weight basket is CONTEXT even at full coverage.
    const basket = benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'UNIVERSE-EW', benchmarkSource: 'reconstructed', investable: false, closesBySession,
    });
    expect(basket?.declarable).toBe(false);
    if (!basket || basket.declarable) throw new Error('expected non-declarable basket evidence');
    expect(basket.nonDeclarableReason).toBe('NOT_INVESTABLE');
  });

  it('omits the benchmark block when nothing matches, rather than fabricating a curve', () => {
    const curve = navCurve();
    const unmatched = new Map([['2015-06-01', 100], ['2015-06-02', 101]]);
    expect(benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true,
      closesBySession: unmatched,
    })).toBeUndefined();
    const rendered = renderReportCard(assembleReportCard(cardArgs(curve)), false);
    expect(rendered).not.toContain('QDR-19 BENCHMARK');
    expect(rendered).not.toContain('QDR-19 PATH SHAPE');
  });

  it('annualizes a five-session lane at 252/5, exactly as metricsForSetup does', () => {
    expect(observationPeriodsPerYear('qdr19-fixture')).toBe(252);
    expect(observationPeriodsPerYear('qdr19-fixture', FIVE_SESSION_GATE)).toBe(252 / 5);

    const curve = navCurve();
    const closesBySession = benchmarkCloses(curve, curve.length);
    const daily = benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true, closesBySession,
    });
    const fiveSession = benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true, closesBySession,
    }, FIVE_SESSION_GATE);

    expect(daily?.years).toBeCloseTo(504 / 252, 10);
    // 505 matched sessions ⇒ 101 five-session boundary points ⇒ 100 blocks at 50.4 blocks/yr.
    expect(fiveSession?.matchedObservations).toBe(101);
    expect(fiveSession?.years).toBeCloseTo(100 / (252 / 5), 10);
    expect(fiveSession?.declarable).toBe(true);
    // Same span, different unit: the tracking error must NOT be the daily one.
    expect(fiveSession?.trackingError).not.toBeCloseTo(daily?.trackingError ?? 0, 6);

    const shape = pathShape(curve, FIVE_SESSION_GATE);
    expect(shape?.observations).toBe(101);

    const partial = benchmarkEvidenceForSetup('qdr19-fixture', curve, {
      benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true,
      closesBySession: benchmarkCloses(curve, 300),
    }, FIVE_SESSION_GATE);
    if (!partial || partial.declarable) throw new Error('expected partial five-session evidence');
    expect(partial.nonDeclarableReason).toBe('PARTIAL_COVERAGE');
    expect(partial.matchedObservations).toBe(60);
    expect(partial.strategyObservations).toBe(101);
  });

  it('cannot move the checklist or a rejection code (reported, never gated)', () => {
    const curve = navCurve();
    const plain = assembleReportCard(cardArgs(curve));
    const withEvidence = assembleReportCard(cardArgs(curve, {
      pathShapeEvidence: pathShape(curve),
      benchmarkEvidence: benchmarkEvidenceForSetup('qdr19-fixture', curve, {
        benchmarkId: 'SPUS', benchmarkSource: 'MarketBar DAY YAHOO', investable: true,
        closesBySession: benchmarkCloses(curve, 300),
      }),
    }));
    expect(withEvidence.checklist).toEqual(plain.checklist);
    expect(withEvidence.rejectionReasonCodes).toEqual(plain.rejectionReasonCodes);
    expect(withEvidence.status).toBe(plain.status);
  });
});
