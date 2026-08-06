import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { simulateStrategyBook, type StrategyBookSeries } from '../backtest/portfolioEngine';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import type { StrategyPointInTimeContext } from './types';
import {
  HALAL_SPUS_FORWARD_START,
  HALAL_SPUS_VOL_MANAGED_BETA_ID,
  HALAL_SPUS_VOL_MANAGED_BETA_UNIVERSE,
  HALAL_SPUS_VOL_MANAGED_BETA_V1,
  HalalSpusVolManagedBetaParamsSchema,
  annualizedPopulationLogVolatility,
  assertHalalSpusForwardRunAllowed,
  assertHalalSpusTerminalEvidenceReady,
  fiveSessionMetricCurve,
  halalSpusVolManagedBetaBookPolicy,
  halalSpusVolManagedBetaSetup,
  meanOosFiveSessionBookReturn,
  nonOverlappingFiveSessionBookReturns,
} from './halalSpusVolManagedBeta';
import {
  dailyUniverseForSetup,
  limitsForDailySetup,
  metricsForSetup,
  runLab,
  selectDailyBacktestRoute,
  strategyBookPolicyForSetup,
  validationReturnInputs,
  validationTrialsForSetup,
} from '../backtest/runLab';

const D = Prisma.Decimal;

function rows(count = 60, logReturn = 0.01): { ts: Date; close: number }[] {
  let close = 100;
  return Array.from({ length: count }, (_, index) => {
    if (index > 0) close *= Math.exp(index % 2 === 0 ? logReturn : -logReturn);
    return { ts: new Date(Date.UTC(2027, 0, 1 + index)), close };
  });
}

function prepare(source = rows(), replayScope?: object): void {
  halalSpusVolManagedBetaSetup.prepareUniverse!({
    symbols: ['SPUS'],
    closesBySymbol: new Map([['SPUS', source]]),
    replayScope,
  });
}

function context(
  source: readonly { ts: Date; close: number }[],
  index: number,
  replayScope?: object,
  positionQty = new D(0),
): StrategyPointInTimeContext {
  return {
    symbol: 'SPUS', market: 'NASDAQ', asOf: source[index].ts, snapshot: null, positionQty, replayScope,
    bars: source.slice(0, index + 1).map((row, barIndex) => ({
      id: `SPUS-${barIndex}`, symbol: 'SPUS', market: 'NASDAQ', ts: row.ts,
      open: new D(row.close), high: new D(row.close), low: new D(row.close), close: new D(row.close),
      volume: new D(1_000_000_000), session: 'REGULAR', source: 'YAHOO', createdAt: row.ts,
    })),
  };
}

function series(source: readonly { ts: Date; close: number }[]): StrategyBookSeries[] {
  return [{
    symbol: 'SPUS', market: 'NASDAQ',
    bars: source.map((row) => ({
      ts: row.ts,
      open: new D(row.close), high: new D(row.close), low: new D(row.close), close: new D(row.close),
      volume: new D(1_000_000_000), source: 'YAHOO',
    })),
  }];
}

describe('halal-spus-vol-managed-beta v1', () => {
  it('uses exact population log-volatility math and cashes invalid/degenerate histories', () => {
    const logReturns = Array.from({ length: 42 }, (_, index) => index % 2 === 0 ? 0.01 : -0.01);
    const closes = [100];
    for (const value of logReturns) closes.push(closes.at(-1)! * Math.exp(value));

    expect(annualizedPopulationLogVolatility(closes, 42)).toBeCloseTo(0.01 * Math.sqrt(252), 12);
    expect(annualizedPopulationLogVolatility(closes.slice(1), 42)).toBeNull();
    expect(annualizedPopulationLogVolatility(Array(43).fill(100), 42)).toBeNull();
    expect(annualizedPopulationLogVolatility([...closes.slice(0, -1), Infinity], 42)).toBeNull();
  });

  it('decides only each fifth observed close, needs 43 bars, and rejects a future-bar injection', () => {
    const source = rows();
    prepare(source);
    expect(halalSpusVolManagedBetaSetup.targetWeight!(context(source, 39))).toBe(0);
    expect(halalSpusVolManagedBetaSetup.targetWeight!(context(source, 43))).toBeNull();
    expect(halalSpusVolManagedBetaSetup.targetWeight!(context(source, 44)))
      .toBeCloseTo(0.10 / (0.01 * Math.sqrt(252)), 12);
    expect(halalSpusVolManagedBetaSetup.targetWeight!(context(source, 45))).toBeNull();

    const injected = context(source, 44);
    expect(() => halalSpusVolManagedBetaSetup.targetWeight!({
      ...injected,
      bars: [...injected.bars, { ...injected.bars.at(-1)!, ts: source[50].ts }],
    })).toThrow(/Look-ahead/);
  });

  it('declares the frozen 3x3 plateau without moving the center', () => {
    const centerBefore = structuredClone(HALAL_SPUS_VOL_MANAGED_BETA_V1);
    const plateau = halalSpusVolManagedBetaSetup.plateauNeighborhood!(HALAL_SPUS_VOL_MANAGED_BETA_V1);
    const cells = [plateau.center, ...plateau.neighbors.map(({ params }) => params)];

    expect(plateau.axes).toEqual(['volatilityLookbackSessions', 'targetAnnualVolatility']);
    expect(plateau.neighbors).toHaveLength(8);
    expect(new Set(cells.map((params) => `${params.volatilityLookbackSessions}|${params.targetAnnualVolatility}`)))
      .toEqual(new Set(['21|0.08', '21|0.1', '21|0.12', '42|0.08', '42|0.1', '42|0.12', '63|0.08', '63|0.1', '63|0.12']));
    expect(HALAL_SPUS_VOL_MANAGED_BETA_V1).toEqual(centerBefore);
    expect(cells.filter((params) => params.volatilityLookbackSessions === 42 && params.targetAnnualVolatility === 0.10))
      .toEqual([HALAL_SPUS_VOL_MANAGED_BETA_V1]);
    expect(() => HalalSpusVolManagedBetaParamsSchema.parse({
      ...HALAL_SPUS_VOL_MANAGED_BETA_V1, validationTrials: 9,
    })).toThrow();
  });

  it('registers the fixed SPUS shared route, frozen policy, 108 trials, and single-fund limits', () => {
    expect(STRATEGY_SETUP_CATALOG[HALAL_SPUS_VOL_MANAGED_BETA_ID]).toBe(halalSpusVolManagedBetaSetup);
    expect(HALAL_SPUS_VOL_MANAGED_BETA_UNIVERSE).toEqual(['SPUS']);
    expect(halalSpusVolManagedBetaSetup.universeCompatibility).toBe('fixed');
    expect(selectDailyBacktestRoute(HALAL_SPUS_VOL_MANAGED_BETA_ID)).toBe('shared');
    expect(dailyUniverseForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, null)).toEqual(['SPUS']);
    expect(() => dailyUniverseForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, ['HLAL'])).toThrow(/exact SPUS/);
    expect(validationTrialsForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, HALAL_SPUS_VOL_MANAGED_BETA_V1)).toBe(108);
    expect(strategyBookPolicyForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, HALAL_SPUS_VOL_MANAGED_BETA_V1))
      .toEqual(halalSpusVolManagedBetaBookPolicy());
    expect(halalSpusVolManagedBetaBookPolicy()).toEqual({
      maxGrossFraction: 1, maxOpenPositions: 1, decisionHistoryBars: 43,
    });
    expect(limitsForDailySetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, DEFAULT_BT_LIMITS)).toEqual({
      ...DEFAULT_BT_LIMITS, maxOpenPositions: 1, maxNameWeight: 1, volTargetPct: 1, maxRiskPct: 1,
    });
  });

  it('fills the first history-eligible decision at the next observed open and replays identically', () => {
    const source = rows();
    const replay = () => {
      const replayScope = {};
      prepare(source, replayScope);
      return simulateStrategyBook({
        setup: halalSpusVolManagedBetaSetup,
        params: HALAL_SPUS_VOL_MANAGED_BETA_V1,
        series: series(source),
        startingCash: new D(100_000),
        limits: limitsForDailySetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, DEFAULT_BT_LIMITS),
        policy: halalSpusVolManagedBetaBookPolicy(),
        replayScope,
      });
    };
    const first = replay();
    const second = replay();

    expect(first).toEqual(second);
    expect(first.fills[0].signalTs).toEqual(source[44].ts);
    expect(first.fills[0].ts).toEqual(source[45].ts);
    expect(first.daily.every((point) => point.cash.gte(0) && point.positions.length <= 1)).toBe(true);
    expect(first.fills.every((fill) => fill.navAfter.lte(0)
      || fill.positionsValueAfter.div(fill.navAfter).lte(1.00000001))).toBe(true);
  });

  it('forms exact non-overlapping five-session book returns for forward evidence', () => {
    const equities = [100, 101, 102, 103, 104, 110, 111, 112, 113, 114, 121];
    const points = equities.map((equity, index) => ({ ts: new Date(Date.UTC(2030, 0, index + 1)), equity }));
    const returns = nonOverlappingFiveSessionBookReturns(points);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1, 12);
    expect(returns[1]).toBeCloseTo(0.1, 12);
    expect(validationReturnInputs('shared', points, [999], HALAL_SPUS_VOL_MANAGED_BETA_ID)).toEqual({
      riskReturns: returns, permutationReturns: returns, observationUnit: 'five-session-book',
    });
    expect(fiveSessionMetricCurve(points)).toEqual([points[0], points[5], points[10]]);
    expect(meanOosFiveSessionBookReturn(points, 1)).toBeCloseTo(0.1, 12);

    const dailyRisk = metricsForSetup('tom-overlay', points, {
      trades: 0, turnover: 0, annualization: 'fixed', trials: 108,
    });
    const fiveSessionRisk = metricsForSetup(HALAL_SPUS_VOL_MANAGED_BETA_ID, points, {
      trades: 0, turnover: 0, annualization: 'fixed', trials: 108,
    });
    expect(fiveSessionRisk.cagr).toBe(dailyRisk.cagr);
    expect(fiveSessionRisk.maxDrawdown).toBe(dailyRisk.maxDrawdown);
    expect(fiveSessionRisk.sharpe).not.toBe(dailyRisk.sharpe);
  });

  it('hard-blocks diagnostics, historical/pre-boundary runs, and insufficient forward evidence', async () => {
    const eligible = {
      runMode: 'TERMINAL' as const,
      now: new Date('2030-01-02T00:00:00.000Z'),
      from: '2026-08-08', to: '2029-12-31', seed: 42, oosFraction: 1,
      completedSessions: 504, fiveSessionObservations: 100,
    };
    expect(() => assertHalalSpusForwardRunAllowed(eligible)).not.toThrow();
    expect(() => assertHalalSpusForwardRunAllowed({ ...eligible, runMode: 'DIAGNOSTIC_NON_TERMINAL' }))
      .toThrow(/forbids diagnostic/);
    expect(() => assertHalalSpusForwardRunAllowed({ ...eligible, from: '2026-08-07' })).toThrow(/historical/);
    expect(() => assertHalalSpusForwardRunAllowed({
      ...eligible, now: new Date(Date.parse(HALAL_SPUS_FORWARD_START) - 1), to: '2026-08-06',
    })).toThrow(/cannot start before/);
    expect(() => assertHalalSpusForwardRunAllowed({ ...eligible, completedSessions: 503 })).toThrow(/504/);
    expect(() => assertHalalSpusForwardRunAllowed({ ...eligible, fiveSessionObservations: 99 })).toThrow(/100/);
    expect(() => assertHalalSpusForwardRunAllowed({ ...eligible, seed: 7 })).toThrow(/seed=42/);
    expect(() => assertHalalSpusForwardRunAllowed({ ...eligible, oosFraction: 0.3 })).toThrow(/oosFraction=1/);
    expect(() => assertHalalSpusTerminalEvidenceReady()).toThrow(/not independently READY_TO_RUN/);

    await expect(runLab({
      setup: HALAL_SPUS_VOL_MANAGED_BETA_ID,
      from: '2020-01-01', to: '2020-12-31', seed: 42, oosFraction: 1,
      writeResultsFile: true, persistRun: true,
    })).rejects.toThrow(/forward evidence|historical/);
  });

  it('rejects any universe preparation other than one positive chronological SPUS spine', () => {
    expect(() => halalSpusVolManagedBetaSetup.prepareUniverse!({
      symbols: ['HLAL'], closesBySymbol: new Map([['HLAL', rows()]]),
    })).toThrow(/exact SPUS/);
    expect(() => prepare([{ ts: new Date('2030-01-01'), close: 100 }, { ts: new Date('2030-01-01'), close: 101 }]))
      .toThrow(/chronological/);
    expect(() => prepare([{ ts: new Date('2030-01-01'), close: 0 }])).toThrow(/positive/);
  });
});
