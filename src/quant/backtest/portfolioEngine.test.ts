import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  getBenchmarkAtOrBefore,
  normalizeSymbolAllowlist,
  runPortfolioBacktest,
  basketVolExposureScalar,
  simulateStrategyBook,
  type StrategyBookBar,
  type StrategyBookPolicy,
  type StrategyBookSeries,
} from './portfolioEngine';
import type { RiskLimits } from '../risk/envelope';
import type { StrategyPointInTimeContext, StrategySetup } from '../strategies/types';
import type { AnalystSignal } from '../types';
import { selectDailyBacktestRoute, validationReturnInputs } from '../../../scripts/backtest';
import {
  TS_MOMENTUM_HALAL_BASKET_V3,
  TsMomentumHalalBasketV3ParamsSchema,
  tsMomentumHalalBasketV3Setup,
  tsMomentumV3BookPolicy,
} from '../strategies/tsMomentumHalalBasketV3';
import { TsMomentumHalalBasketV2ParamsSchema } from '../strategies/tsMomentumHalalBasketV2';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2024-01-02T00:00:00.000Z').getTime();

const LIMITS: RiskLimits = {
  maxNameWeight: 1,
  maxGrossExposure: 10,
  maxOpenPositions: 6,
  maxRiskPct: 100,
  volTargetPct: 100,
  liquidityAdvFraction: 1,
  drawdownHaltPct: 1,
};

function bars(source: StrategyBookBar['source'] = 'YAHOO'): StrategyBookBar[] {
  return Array.from({ length: 4 }, (_, i) => ({
    ts: new Date(BASE + i * DAY),
    open: new D(100 + i), high: new D(101 + i), low: new D(99 + i), close: new D(100 + i),
    volume: new D(1_000_000), source,
  }));
}

function series(symbol: string, source: StrategyBookBar['source'] = 'YAHOO'): StrategyBookSeries {
  return { symbol, market: 'NASDAQ', bars: bars(source) };
}

function signal(ctx: StrategyPointInTimeContext): AnalystSignal {
  return {
    agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
    stance: 'NEUTRAL', conviction: 0, horizonDays: 1, rationaleEn: '', rationaleAr: '',
    evidence: [], determinism: 'deterministic', failureMode: 'ok', costCents: 0,
  };
}

function setup(overrides: Partial<Pick<StrategySetup<undefined>, 'entry' | 'exit'>> = {}): StrategySetup<undefined> {
  return {
    id: 'shared-test', version: 'v1', cadence: 'daily', defaultParams: undefined,
    screen: () => ({ matched: true, reasons: [], evidence: [] }),
    entry: () => ({ matched: true, reasons: ['entry'], evidence: [], sizeFraction: 0.1 }),
    exit: () => ({ matched: false, reasons: [], evidence: [] }),
    signal,
    ...overrides,
  };
}

function run(
  bookSeries: readonly StrategyBookSeries[],
  testSetup: StrategySetup<undefined> = setup(),
  limits: RiskLimits = LIMITS,
  policy?: StrategyBookPolicy,
) {
  return simulateStrategyBook({
    setup: testSetup, series: bookSeries, startingCash: new D(100_000), limits, policy,
  });
}

describe('portfolio backtest isolation helpers', () => {
  it('never attaches a future benchmark point to an earlier portfolio date', () => {
    const point = getBenchmarkAtOrBefore(
      [{ ts: new Date('2024-01-03'), spy: 120, spus: 115 }],
      new Date('2024-01-02'),
      100
    );

    expect(point).toEqual({ spy: 100, spus: 100 });
  });

  it('uses the latest benchmark point available on or before the portfolio date', () => {
    const point = getBenchmarkAtOrBefore(
      [
        { ts: new Date('2024-01-02'), spy: 101, spus: 102 },
        { ts: new Date('2024-01-04'), spy: 120, spus: 121 },
      ],
      new Date('2024-01-03'),
      100
    );

    expect(point).toEqual({ spy: 101, spus: 102 });
  });

  it('normalizes case, whitespace, and duplicates while preserving empty scope', () => {
    expect(normalizeSymbolAllowlist([' msft ', 'MSFT', 'nvda'])).toEqual(['MSFT', 'NVDA']);
    expect(normalizeSymbolAllowlist(['msft'])).toEqual(normalizeSymbolAllowlist(['MSFT']));
    expect(normalizeSymbolAllowlist([' ', ''])).toEqual([]);
    expect(normalizeSymbolAllowlist()).toBeUndefined();
  });

  it('returns an empty result without querying for an empty normalized scope', async () => {
    const result = await runPortfolioBacktest(
      new Date('2024-01-01'),
      new Date('2024-01-31'),
      100,
      [' ', '']
    );

    expect(result.equityCurve).toEqual([]);
  });
});

describe('deterministic shared-cash daily strategy book', () => {
  it('keeps every existing setup on legacy unless the CLI explicitly opts into shared', () => {
    expect(selectDailyBacktestRoute('ts-momentum-halal-basket-v2')).toBe('legacy');
    expect(selectDailyBacktestRoute('ts-momentum-halal-basket-v2', 'legacy')).toBe('legacy');
    expect(selectDailyBacktestRoute('ts-momentum-halal-basket-v2', 'shared')).toBe('shared');
    expect(() => selectDailyBacktestRoute('x', 'other')).toThrow(/legacy or shared/);
  });

  it('conserves cash + marked positions = NAV after every fill and daily mark', () => {
    const result = run([series('B'), series('A')]);
    expect(result.fills.length).toBeGreaterThan(0);
    for (const fill of result.fills) {
      expect(fill.cashAfter.plus(fill.positionsValueAfter).eq(fill.navAfter)).toBe(true);
    }
    for (const point of result.daily) {
      expect(point.cash.plus(point.positionsValue).eq(point.nav)).toBe(true);
    }
  });

  it('hands actual concurrent positions to applyEnvelope and caps seven signals at six holdings', () => {
    const names = ['G', 'F', 'E', 'D', 'C', 'B', 'A'];
    const result = run(
      names.map((name) => series(name)), setup(), { ...LIMITS, maxOpenPositions: 10 },
      { realizedVolLookback: 60, targetAnnualVol: 0.15, maxOpenPositions: 6 },
    );
    const buyChecks = result.riskChecks.filter((check) => check.action === 'BUY');

    expect(buyChecks.slice(0, 7).map((check) => check.positionsSeen.length)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(result.daily.flatMap((point) => point.positions).length).toBeGreaterThan(0);
    expect(Math.max(...result.daily.map((point) => point.positions.length))).toBe(6);
    expect(result.daily.at(-1)!.positions.map((position) => position.symbol)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('uses canonical-symbol same-day priority and replays identical NAV/drawdown', () => {
    const reversed = ['G', 'F', 'E', 'D', 'C', 'B', 'A'].map((name) => series(name));
    const first = run(reversed);
    const second = run([...reversed].reverse());
    const digest = (result: typeof first) => ({
      fills: result.fills.map((fill) => `${fill.ts.toISOString()}:${fill.action}:${fill.symbol}:${fill.qty}`),
      daily: result.daily.map((point) => `${point.ts.toISOString()}:${point.nav}:${point.drawdown}`),
    });

    expect(digest(first)).toEqual(digest(second));
    expect(first.fills.filter((fill) => fill.action === 'BUY').slice(0, 6).map((fill) => fill.symbol))
      .toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('fails closed on a MOCK bar', () => {
    expect(() => run([series('A', 'MOCK')])).toThrow(/requires YAHOO\/ALPACA bars/);
  });

  it('fails the run when an out-of-order future bar is injected into a decision series', () => {
    const injected = bars();
    injected.splice(2, 0, { ...injected[0], ts: new Date(BASE + 10 * DAY) });
    expect(() => run([{ symbol: 'A', market: 'NASDAQ', bars: injected }]))
      .toThrow(/strictly chronological/);
  });

  it('never lets long-only shared cash go negative', () => {
    const hungry = setup({
      entry: () => ({ matched: true, reasons: ['entry'], evidence: [], sizeFraction: 1 }),
    });
    const result = run(['A', 'B', 'C'].map((name) => series(name)), hungry);
    expect(result.daily.every((point) => point.cash.gte(0))).toBe(true);
    expect(result.fills.every((fill) => fill.cashAfter.gte(0))).toBe(true);
  });

  it('fills exits before entries at the same next open, freeing shared cash deterministically', () => {
    const day0 = BASE;
    const day1 = BASE + DAY;
    const ordered = setup({
      entry: (ctx) => ({
        matched: (ctx.symbol === 'A' && ctx.asOf.getTime() === day0)
          || (ctx.symbol === 'B' && ctx.asOf.getTime() === day1),
        reasons: ['entry'], evidence: [], sizeFraction: 1,
      }),
      exit: (ctx) => ({
        matched: ctx.symbol === 'A' && ctx.asOf.getTime() === day1,
        reasons: ['exit'], evidence: [],
      }),
    });
    const result = run([series('B'), series('A')], ordered, { ...LIMITS, maxOpenPositions: 1 });
    const day2Fills = result.fills.filter((fill) => fill.ts.getTime() === BASE + 2 * DAY);

    expect(day2Fills.map((fill) => `${fill.action}:${fill.symbol}`)).toEqual(['SELL:A', 'BUY:B']);
    expect(day2Fills.at(-1)!.cashAfter.gte(0)).toBe(true);
  });

  it('uses only prior basket NAV and actively sells existing holdings when volatility spikes', () => {
    const volatileBars = (futureMultiplier = 1): StrategyBookBar[] => Array.from({ length: 70 }, (_, i) => {
      const prefixPrice = 100 * (1 + (i % 2 === 0 ? 0.03 : -0.03));
      const price = i < 65 ? prefixPrice : prefixPrice * futureMultiplier;
      return {
        ts: new Date(BASE + i * DAY), open: new D(price), high: new D(price), low: new D(price),
        close: new D(price), volume: new D(1_000_000_000), source: 'YAHOO',
      };
    });
    const fullEntry = setup({
      entry: () => ({ matched: true, reasons: ['entry'], evidence: [], sizeFraction: 1 }),
    });
    const policy = { realizedVolLookback: 60, targetAnnualVol: 0.15, maxOpenPositions: 6 };
    const base = run([{ symbol: 'A', market: 'NASDAQ', bars: volatileBars() }], fullEntry, LIMITS, policy);
    const changedFuture = run([{ symbol: 'A', market: 'NASDAQ', bars: volatileBars(4) }], fullEntry, LIMITS, policy);

    expect(base.daily.slice(0, 65).map((point) => point.grossExposureScalar))
      .toEqual(changedFuture.daily.slice(0, 65).map((point) => point.grossExposureScalar));
    const firstCut = base.daily.findIndex((point) => point.grossExposureScalar < 1);
    expect(firstCut).toBeGreaterThanOrEqual(60);
    expect(base.fills.some((fill) => fill.action === 'SELL' && fill.signalTs.getTime() >= base.daily[firstCut].ts.getTime()))
      .toBe(true);
    expect(base.daily.slice(firstCut + 1).some((point) => point.cash.gt(0))).toBe(true);
  });

  it('maps 30% basket volatility to 50% gross and never scales above one', () => {
    expect(basketVolExposureScalar(0.30, 0.15)).toBeCloseTo(0.5, 12);
    expect(basketVolExposureScalar(0.15, 0.15)).toBe(1);
    expect(basketVolExposureScalar(0.10, 0.15)).toBe(1);
  });

  it('uses exact shared-NAV daily returns for risk while retaining actual trades for permutation', () => {
    const book = run([series('A')]);
    const curve = book.daily.map((point) => ({ ts: point.ts, equity: Number(point.nav) }));
    const actualTrades = [0.91, -0.73];
    const selected = validationReturnInputs('shared', curve, actualTrades);
    const expected = curve.slice(1).map((point, index) => point.equity / curve[index].equity - 1);

    expect(selected).toEqual({
      riskReturns: expected,
      permutationReturns: actualTrades,
      observationUnit: 'book-day',
    });
    expect(selected.riskReturns).not.toBe(actualTrades);
    expect(validationReturnInputs('legacy', null, actualTrades)).toEqual({
      riskReturns: actualTrades,
      permutationReturns: actualTrades,
      observationUnit: 'trade',
    });
  });

  it('completes the frozen v3 center-plus-eight-cell plateau under a bounded heap', () => {
    const plateauSeries: StrategyBookSeries[] = Array.from({ length: 7 }, (_, symbolIndex) => {
      const symbol = `S${String(symbolIndex).padStart(2, '0')}`;
      return {
        symbol,
        market: 'NASDAQ' as const,
        bars: Array.from({ length: 320 }, (_, dayIndex) => {
          const price = 100 + symbolIndex + dayIndex * 0.12 + Math.sin(dayIndex / 11) * 3;
          return {
            ts: new Date(BASE + dayIndex * DAY),
            open: new D(price), high: new D(price + 1), low: new D(price - 1), close: new D(price),
            volume: new D(1_000_000_000), source: 'YAHOO' as const,
          };
        }),
      };
    });
    tsMomentumHalalBasketV3Setup.prepareUniverse({
      symbols: plateauSeries.map((item) => item.symbol),
      closesBySymbol: new Map(plateauSeries.map((item) => [
        item.symbol,
        item.bars.map((bar) => ({ ts: bar.ts, close: Number(bar.close) })),
      ])),
    });
    const grid = tsMomentumHalalBasketV3Setup.plateauNeighborhood!(TS_MOMENTUM_HALAL_BASKET_V3);
    const cells = [grid.center, ...grid.neighbors.map((neighbor) => neighbor.params)];
    const v3Parses = vi.spyOn(TsMomentumHalalBasketV3ParamsSchema, 'parse');
    const v2Parses = vi.spyOn(TsMomentumHalalBasketV2ParamsSchema, 'parse');

    let tradeCounts: number[] = [];
    let v3ParseCount = 0;
    let v2ParseCount = 0;
    try {
      tradeCounts = cells.map((params) => simulateStrategyBook({
        setup: tsMomentumHalalBasketV3Setup,
        params,
        series: plateauSeries,
        startingCash: new D(100_000),
        limits: LIMITS,
        policy: tsMomentumV3BookPolicy(params),
      }).tradeRecords.length);
      v3ParseCount = v3Parses.mock.calls.length;
      v2ParseCount = v2Parses.mock.calls.length;
    } finally {
      v3Parses.mockRestore();
      v2Parses.mockRestore();
    }

    expect(tradeCounts).toHaveLength(9);
    expect(v3ParseCount).toBeLessThanOrEqual(cells.length);
    expect(v2ParseCount).toBeLessThanOrEqual(2 * plateauSeries.length * 320 + cells.length);
  }, 12_000);
});
