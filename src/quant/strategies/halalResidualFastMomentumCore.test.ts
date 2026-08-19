import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  selectDailyBacktestRoute,
  strategyBookPolicyForSetup,
  validationTrialsForSetup,
} from '../../../scripts/backtest';
import { trialCountEvidence } from '../backtest/trialFamilies';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1,
  HalalResidualFastMomentumCoreParamsSchema,
  clippedOlsBeta,
  halalResidualFastMomentumCoreBookPolicy,
  halalResidualFastMomentumCoreSetup,
  residualMomentumMetrics,
} from './halalResidualFastMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 2);
type Row = { ts: Date; close: number; volume: number };

function closesFromLogReturns(returns: readonly number[], start = 100): number[] {
  const closes = [start];
  for (const value of returns) closes.push(closes.at(-1)! * Math.exp(value));
  return closes;
}

function rows(closes: readonly number[]): Row[] {
  return closes.map((close, index) => ({
    ts: new Date(START + index * DAY), close, volume: 1_000_000,
  }));
}

function fixture(alphas: readonly number[], futureBenchmarkReturn?: number): UniversePrepareInput {
  const benchmarkReturns = Array.from({ length: 170 }, (_, index) => index % 2 === 0 ? 0.002 : -0.001);
  const benchmarkCloses = closesFromLogReturns(benchmarkReturns);
  const dailyBarsBySymbol = new Map<string, Row[]>();
  alphas.forEach((alpha, index) => {
    const stockReturns = benchmarkReturns.map((benchmarkReturn) => 1.2 * benchmarkReturn + alpha);
    dailyBarsBySymbol.set(`S${index}`, rows(closesFromLogReturns(stockReturns)));
  });
  const benchmarkRows = rows(closesFromLogReturns(benchmarkReturns));
  if (futureBenchmarkReturn !== undefined) {
    const previous = benchmarkRows.at(-1)!;
    benchmarkRows.push({
      ts: new Date(previous.ts.getTime() + DAY),
      close: previous.close * Math.exp(futureBenchmarkReturn),
      volume: previous.volume,
    });
  }
  return {
    symbols: Array.from(dailyBarsBySymbol.keys()),
    closesBySymbol: new Map(),
    dailyBarsBySymbol,
    benchmarkDailyBarsBySymbol: new Map([['SPUS', benchmarkRows]]),
  };
}

function decisionDate(input: UniversePrepareInput): Date {
  return input.dailyBarsBySymbol!.values().next().value!.at(-1)!.ts;
}

function ctx(symbol: string, asOf: Date, replayScope: object): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(0), replayScope,
  } as unknown as StrategyPointInTimeContext;
}

function prepare(input: UniversePrepareInput, replayScope: object): void {
  halalResidualFastMomentumCoreSetup.prepareUniverse({ ...input, replayScope });
}

describe('halal-residual-fast-momentum-core v1 pure beta/residual math', () => {
  it('computes hand-checkable OLS beta with intercept and clips it to [0,2]', () => {
    expect(clippedOlsBeta([0.03, 0.05, -0.01], [0.01, 0.02, -0.01])).toBeCloseTo(2, 12);
    expect(clippedOlsBeta([-0.01, -0.02, 0.01], [0.01, 0.02, -0.01])).toBe(0);
    expect(clippedOlsBeta([1, 1, 1], [1, 1, 1])).toBeNull();
  });

  it('matches the existing 63d/skip2 endpoints and a trailing-126 beta', () => {
    const benchmarkReturns = Array.from({ length: 126 }, (_, index) => index % 2 === 0 ? 0.01 : -0.005);
    const stockReturns = benchmarkReturns.map((value) => 1.5 * value + 0.002);
    const metrics = residualMomentumMetrics(
      closesFromLogReturns(stockReturns),
      closesFromLogReturns(benchmarkReturns),
      63,
      2,
      126,
    );
    expect(metrics?.beta).toBeCloseTo(1.5, 12);
    expect(metrics?.residualScore).toBeCloseTo((63 - 2) * 0.002, 12);
    expect(metrics?.rawMomentum).toBeGreaterThan(0);
  });

  it('keeps raw momentum as an independent positive gate even when residual momentum is positive', () => {
    const benchmarkReturns = Array.from({ length: 126 }, (_, index) => index % 2 === 0 ? -0.008 : -0.012);
    const stockReturns = benchmarkReturns.map((value) => 1.2 * value + 0.005);
    const metrics = residualMomentumMetrics(
      closesFromLogReturns(stockReturns), closesFromLogReturns(benchmarkReturns), 63, 2, 126,
    );
    expect(metrics?.beta).toBeCloseTo(1.2, 12);
    expect(metrics?.residualScore).toBeGreaterThan(0);
    expect(metrics?.rawMomentum).toBeLessThan(0);
  });
});

describe('halal-residual-fast-momentum-core v1 setup', () => {
  it('accepts only the frozen schema and declares SPUS as benchmark-only', () => {
    expect(HalalResidualFastMomentumCoreParamsSchema.parse(HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1))
      .toEqual(HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1);
    expect(() => HalalResidualFastMomentumCoreParamsSchema.parse({
      ...HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1, topN: 6,
    })).toThrow();
    expect(halalResidualFastMomentumCoreSetup.benchmarkSymbols).toEqual(['SPUS']);
  });

  it('fails closed without explicit SPUS history or when SPUS contaminates the tradable sleeve', () => {
    const missing = fixture([0.003, 0.002]);
    expect(() => prepare({ ...missing, benchmarkDailyBarsBySymbol: undefined }, {})).toThrow(/explicit real SPUS/);
    const contaminated = fixture([0.003, 0.002]);
    const dailyBarsBySymbol = new Map(contaminated.dailyBarsBySymbol);
    dailyBarsBySymbol.set('SPUS', contaminated.benchmarkDailyBarsBySymbol!.get('SPUS')!);
    expect(() => prepare({
      ...contaminated, symbols: [...contaminated.symbols, 'SPUS'], dailyBarsBySymbol,
    }, {})).toThrow(/benchmark-only/);
  });

  it('ranks positive raw/residual momentum, selects top5, caps names, and sums to 100% gross', () => {
    const input = fixture([0.006, 0.005, 0.004, 0.003, 0.002, 0.001, -0.003]);
    const scope = {};
    prepare(input, scope);
    const asOf = decisionDate(input);
    const weights = input.symbols.map((symbol) => ({
      symbol,
      weight: halalResidualFastMomentumCoreSetup.targetWeight!(ctx(symbol, asOf, scope), HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1),
    }));
    expect(weights.filter(({ weight }) => weight! > 0).map(({ symbol }) => symbol)).toEqual(['S0', 'S1', 'S2', 'S3', 'S4']);
    expect(weights.every(({ weight }) => weight === null || weight <= 0.25 + 1e-12)).toBe(true);
    expect(weights.reduce((sum, { weight }) => sum + (weight ?? 0), 0)).toBeCloseTo(1, 12);
    expect(weights.find(({ symbol }) => symbol === 'S6')?.weight).toBe(0);
  });

  it('forms the top60 from trailing 21-session dollar volume without future-volume lookahead', () => {
    const alphas = Array.from({ length: 61 }, () => 0.001);
    alphas[0] = 0.02; // strongest residual score, but deliberately least liquid
    alphas[60] = 0.019; // next-strongest score and liquid enough to enter the top60
    const input = fixture(alphas);
    const lowLiquidityRows = input.dailyBarsBySymbol!.get('S0')! as Row[];
    lowLiquidityRows.forEach((row) => { row.volume = 1; });
    const asOf = decisionDate(input);
    const scope = {};
    prepare(input, scope);
    expect(halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S0', asOf, scope))).toBe(0);
    expect(halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S60', asOf, scope))).toBeGreaterThan(0);

    const withFuture = fixture(alphas);
    const futureRows = withFuture.dailyBarsBySymbol!.get('S0')! as Row[];
    futureRows.forEach((row) => { row.volume = 1; });
    const last = futureRows.at(-1)!;
    futureRows.push({
      ts: new Date(last.ts.getTime() + 7 * DAY), close: last.close, volume: 1e15,
    });
    const futureScope = {};
    prepare(withFuture, futureScope);
    expect(halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S0', asOf, futureScope))).toBe(0);
  });

  it('holds cash below the frozen two-name floor', () => {
    const input = fixture([0.003, -0.003]);
    const scope = {};
    prepare(input, scope);
    const asOf = decisionDate(input);
    expect(halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S0', asOf, scope))).toBe(0);
  });

  it('is deterministic and ignores benchmark rows after the decision close', () => {
    const alphas = [0.006, 0.005, 0.004, 0.003, 0.002, 0.001];
    const base = fixture(alphas);
    const scopeA = {};
    prepare(base, scopeA);
    const asOf = decisionDate(base);
    const first = halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S2', asOf, scopeA));
    expect(halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S2', asOf, scopeA))).toBe(first);

    const withFuture = fixture(alphas, -5);
    const scopeB = {};
    prepare(withFuture, scopeB);
    expect(halalResidualFastMomentumCoreSetup.targetWeight!(ctx('S2', asOf, scopeB))).toBe(first);
  });

  it('declares the frozen 3x3 {42,63,84} x {84,126,168} plateau', () => {
    const plateau = halalResidualFastMomentumCoreSetup.plateauNeighborhood!();
    expect(plateau.axes).toEqual(['momentumDays', 'betaLookbackDays']);
    expect(plateau.center).toEqual(HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1);
    expect(plateau.neighbors).toHaveLength(8);
    expect(plateau.neighbors.map(({ label }) => label)).toContain('momentumDays=42|betaLookbackDays=84');
    expect(plateau.neighbors.map(({ label }) => label)).toContain('momentumDays=84|betaLookbackDays=168');
  });

  it('is cataloged on shared C1/max60 policy with 9 local and 126 family trials', () => {
    expect(STRATEGY_SETUP_CATALOG['halal-residual-fast-momentum-core']).toBe(halalResidualFastMomentumCoreSetup);
    expect(selectDailyBacktestRoute('halal-residual-fast-momentum-core')).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-residual-fast-momentum-core', undefined))
      .toEqual(halalResidualFastMomentumCoreBookPolicy());
    expect(validationTrialsForSetup('halal-residual-fast-momentum-core', HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1)).toBe(9);
    expect(trialCountEvidence('halal-residual-fast-momentum-core', 9)).toMatchObject({
      familyTrials: 126, relatedSetups: 14,
    });
  });
});
