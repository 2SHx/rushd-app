// src/quant/backtest/runLab.observationUnit.test.ts — the frozen STATISTICAL OBSERVATION UNIT must
// be read from the lane's own sealed manifest, not from a hardcoded setup id. Before this suite the
// five-session unit was keyed to `halal-spus-vol-managed-beta` alone, so a second lane that sealed
// `validation.observationUnit: "non-overlapping-five-session-book-return"` fell through to the
// per-route default and would have had its Sharpe/DSR/plateau measured — and GATED — in a unit it
// never preregistered. Pins: (a) the new lane resolves the sealed unit, (b) the live SPUS lane is
// byte-identical with and without a gate config, (c) an undeclared lane keeps the default, and
// (d) the resolved unit is the one that actually reaches the DSR number the gate reads.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeMetrics, type EquityPoint } from './metrics';
import {
  FIVE_SESSION_BOOK_OBSERVATION_UNIT,
  metricsForSetup,
  resolveObservationUnit,
  validationReturnInputs,
} from './runLab';
import { HALAL_FAST_MOMENTUM_CASH_CORE_ID } from '../strategies/halalFastMomentumCashCore';
import {
  HALAL_SPUS_VOL_MANAGED_BETA_ID,
  fiveSessionMetricCurve,
  nonOverlappingFiveSessionBookReturns,
} from '../strategies/halalSpusVolManagedBeta';

/** Exactly what `runBacktestCli` threads into `RunLabOptions.gateConfig`: `config.validation`. */
function sealedValidationBlock(manifest: string): unknown {
  const path = join(process.cwd(), 'docs/quant-experiments', `${manifest}.json`);
  return (JSON.parse(readFileSync(path, 'utf-8')) as {
    config: { validation?: unknown };
  }).config.validation;
}

const CASH_CORE_GATE = sealedValidationBlock('halal-fast-momentum-cash-core-v1');
const SPUS_GATE = sealedValidationBlock('halal-spus-vol-managed-beta-v1');

/** Deterministic, seeded NAV curve: 505 points ⇒ 504 book-days ⇒ 100 whole five-session blocks. */
function navCurve(points = 505): EquityPoint[] {
  let state = 20260816;
  let equity = 100_000;
  const curve: EquityPoint[] = [{ ts: new Date(Date.UTC(2020, 0, 2)), equity }];
  for (let index = 1; index < points; index++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    equity *= 1 + ((state / 2147483648) - 0.46) * 0.02;
    curve.push({ ts: new Date(Date.UTC(2020, 0, 2) + index * 86_400_000), equity });
  }
  return curve;
}

const METRIC_OPTS = { trades: 100, turnover: 100, annualization: 'fixed' as const, trials: 117 };

describe('sealed observation-unit routing', () => {
  it('resolves the cash-core lane from its manifest, not from a hardcoded id', () => {
    expect((CASH_CORE_GATE as { observationUnit: string }).observationUnit)
      .toBe(FIVE_SESSION_BOOK_OBSERVATION_UNIT);
    expect(resolveObservationUnit(HALAL_FAST_MOMENTUM_CASH_CORE_ID, CASH_CORE_GATE))
      .toBe(FIVE_SESSION_BOOK_OBSERVATION_UNIT);

    const curve = navCurve();
    const selected = validationReturnInputs(
      'shared', curve, [0.01, -0.02], HALAL_FAST_MOMENTUM_CASH_CORE_ID, CASH_CORE_GATE,
    );
    expect(selected.observationUnit).toBe('five-session-book');
    expect(selected.riskReturns).toEqual(nonOverlappingFiveSessionBookReturns(curve));
    expect(selected.riskReturns).toHaveLength(100);
    // Not the default: a shared book would otherwise have returned 504 book-day returns.
    expect(selected.observationUnit).not.toBe('book-day');
    expect(selected.permutationReturns).not.toEqual([0.01, -0.02]);
  });

  it('keeps the cash-core DRAWDOWN bootstrap on the book-day unit the SAME block sealed', () => {
    // The manifest seals Sharpe/DSR on five-session blocks but the Monte-Carlo breaker on book-day
    // moving blocks. Feeding one unit's series to the other's gate is the defect this routing exists
    // to prevent, so the split is carried explicitly rather than collapsed onto the risk unit.
    expect((CASH_CORE_GATE as { bootstrapObservationUnit: string }).bootstrapObservationUnit)
      .toBe('book-day');
    const curve = navCurve();
    const selected = validationReturnInputs(
      'shared', curve, [0.01], HALAL_FAST_MOMENTUM_CASH_CORE_ID, CASH_CORE_GATE,
    );
    expect(selected.bootstrapBookDayReturns).toHaveLength(504);
    expect(selected.bootstrapBookDayReturns).toEqual(
      validationReturnInputs('shared', curve, [0.01], 'halal-fast-momentum-core').riskReturns,
    );
  });

  it('leaves the live SPUS lane byte-identical, with and without a gate config', () => {
    const curve = navCurve();
    const withoutGate = validationReturnInputs('shared', curve, [0.03], HALAL_SPUS_VOL_MANAGED_BETA_ID);
    // The exact pre-change shape: three keys, no bootstrap split (SPUS seals no separate unit).
    expect(withoutGate).toEqual({
      riskReturns: nonOverlappingFiveSessionBookReturns(curve),
      permutationReturns: nonOverlappingFiveSessionBookReturns(curve),
      observationUnit: 'five-session-book',
    });
    expect(Object.keys(withoutGate).sort()).toEqual(['observationUnit', 'permutationReturns', 'riskReturns']);
    expect(validationReturnInputs('shared', curve, [0.03], HALAL_SPUS_VOL_MANAGED_BETA_ID, SPUS_GATE))
      .toEqual(withoutGate);
    expect(resolveObservationUnit(HALAL_SPUS_VOL_MANAGED_BETA_ID)).toBe(FIVE_SESSION_BOOK_OBSERVATION_UNIT);
    expect(metricsForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, curve, METRIC_OPTS, SPUS_GATE))
      .toEqual(metricsForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, curve, METRIC_OPTS));
  });

  it('leaves a setup with no declared observation unit on the existing default', () => {
    const curve = navCurve();
    expect(resolveObservationUnit('halal-fast-momentum-core')).toBeNull();
    expect(resolveObservationUnit('halal-fast-momentum-core', { minimumOosObservations: 40 })).toBeNull();
    expect(resolveObservationUnit(HALAL_FAST_MOMENTUM_CASH_CORE_ID)).toBeNull();

    const selected = validationReturnInputs('shared', curve, [0.01, -0.02], 'halal-fast-momentum-core');
    expect(selected.observationUnit).toBe('book-day');
    expect(selected.riskReturns).toHaveLength(504);
    expect(selected.permutationReturns).toEqual([0.01, -0.02]);
    expect(selected.bootstrapBookDayReturns).toBeUndefined();
    expect(validationReturnInputs('legacy', null, [0.01], 'halal-fast-momentum-core')).toEqual({
      riskReturns: [0.01], permutationReturns: [0.01], observationUnit: 'trade',
    });
    expect(metricsForSetup('halal-fast-momentum-core', curve, METRIC_OPTS))
      .toEqual(computeMetrics(curve, METRIC_OPTS));
  });

  it('refuses a declared unit this lab does not implement instead of silently defaulting', () => {
    expect(() => resolveObservationUnit('some-lane', { observationUnit: 'active-book-month' }))
      .toThrow(/does not implement/);
  });

  it('carries the resolved unit all the way into the DSR the gate reads', () => {
    const curve = navCurve();
    const bookDay = computeMetrics(curve, METRIC_OPTS);
    const fiveSession = computeMetrics(fiveSessionMetricCurve(curve), {
      ...METRIC_OPTS, annualization: 'fixed', periodsPerYear: 252 / 5,
    });
    expect(fiveSession.deflatedSharpe).not.toBe(bookDay.deflatedSharpe);

    const routed = metricsForSetup(HALAL_FAST_MOMENTUM_CASH_CORE_ID, curve, METRIC_OPTS, CASH_CORE_GATE);
    // The DSR / Sharpe / hit-rate the gate reads come from the SEALED five-session series...
    expect(routed.deflatedSharpe).toBe(fiveSession.deflatedSharpe);
    expect(routed.sharpe).toBe(fiveSession.sharpe);
    expect(routed.hitRate).toBe(fiveSession.hitRate);
    expect(routed.deflatedSharpe).not.toBe(bookDay.deflatedSharpe);
    // ...while CAGR/maxDD stay the daily headline figures, exactly as the SPUS lane behaves.
    expect(routed.cagr).toBe(bookDay.cagr);
    expect(routed.maxDrawdown).toBe(bookDay.maxDrawdown);
    // And with no gate config the same call still collapses to the book-day default — proving the
    // manifest, not the setup id, is what moved the number.
    expect(metricsForSetup(HALAL_FAST_MOMENTUM_CASH_CORE_ID, curve, METRIC_OPTS)).toEqual(bookDay);
  });

  // The lane SEALED on 2026-08-19 (commit 95fae73) and its forward window opens 2026-09-08, so the
  // manifest is no longer a DRAFT. What this test actually guards is unchanged and is the whole
  // point: the seal froze a config that has still NEVER been executed. Zero diagnostic runs and a
  // null fullRun are the QDR-9 CONFIRMATORY preconditions -- either one moving off these values
  // silently downgrades the lane to EXPLORATORY deflation, so they stay pinned. The configHash is
  // pinned too: it IS the seal, and any edit inside it destroys the forward window.
  it('keeps the sealed manifest never-run (no run of any kind was performed for this wiring)', () => {
    const manifest = JSON.parse(readFileSync(
      join(process.cwd(), 'docs/quant-experiments/halal-fast-momentum-cash-core-v1.json'), 'utf-8',
    )) as { state: string; configHash: unknown; diagnosticRuns: number; fullRun: unknown };
    expect(manifest.state).toBe('SEALED');
    expect(manifest.configHash).toBe('115a6b6f471156014cf63deb33dfbceb0929e1fbae951b212691c63dca8188b6');
    expect(manifest.diagnosticRuns).toBe(0);
    expect(manifest.fullRun).toBeNull();
  });
});
