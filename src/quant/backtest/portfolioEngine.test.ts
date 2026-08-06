import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  getBenchmarkAtOrBefore,
  normalizeSymbolAllowlist,
  runPortfolioBacktest,
  basketVolExposureScalar,
  strategyBookExposureScalar,
  trailingBasketAnnualVol,
  collapseMaxOnePositionEpisodes,
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
import { tsMomentumV4BookPolicy } from '../strategies/tsMomentumHalalBasketV4';
import { halalManagedMomentumCoreBookPolicy } from '../strategies/halalManagedMomentumCore';

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

function setup(overrides: Partial<Pick<StrategySetup<undefined>, 'entry' | 'exit' | 'targetWeight'>> = {}): StrategySetup<undefined> {
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
  it('collapses partial trims into one qty-weighted closed position episode and excludes open episodes', () => {
    const records = [
      { entryTs: new Date(BASE), exitTs: new Date(BASE + DAY), qty: 2, entryPrice: 100, exitPrice: 110, ret: 0.1, reason: 'risk_trim', partial: true },
      { entryTs: new Date(BASE), exitTs: new Date(BASE + 2 * DAY), qty: 8, entryPrice: 100, exitPrice: 120, ret: 0.2, reason: 'strategy_exit', partial: false },
      { entryTs: new Date(BASE + 3 * DAY), exitTs: new Date(BASE + 4 * DAY), qty: 3, entryPrice: 200, exitPrice: 210, ret: 0.05, reason: 'risk_trim', partial: true },
    ];

    const episodes = collapseMaxOnePositionEpisodes(records);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]).toMatchObject({
      entryTs: new Date(BASE), exitTs: new Date(BASE + 2 * DAY), qty: 10,
      entryPrice: 100, exitPrice: 118,
      reason: 'position_episode_exit', partial: false,
    });
    expect(episodes[0].ret).toBeCloseTo(0.18, 12);
  });

  it('combines volatility and fixed gross ceilings by taking the smaller scale', () => {
    expect(strategyBookExposureScalar(0.3, 0.15, 0.25)).toBe(0.25);
    expect(strategyBookExposureScalar(1, 0.15, 0.8)).toBe(0.15);
    expect(strategyBookExposureScalar(0.3, 0.15)).toBe(basketVolExposureScalar(0.3, 0.15));
  });

  it('fails fast on an invalid fixed gross ceiling', () => {
    for (const maxGrossFraction of [0, -0.1, 1.01]) {
      expect(() => run([series('A')], setup(), LIMITS, {
        maxOpenPositions: 1,
        maxGrossFraction,
      })).toThrow(/maxGrossFraction/);
    }
  });

  it('does not materialize a wide book through Array.flatMap', () => {
    const flatMap = vi.spyOn(Array.prototype, 'flatMap');
    const wide = Array.from({ length: 64 }, (_, index) => series(`S${String(index).padStart(3, '0')}`));
    const neverEnter = setup({
      entry: () => ({ matched: false, reasons: [], evidence: [] }),
    });

    try {
      run(wide, neverEnter);
      expect(flatMap.mock.contexts.some((context) => Array.isArray(context) && context.length >= wide.length)).toBe(false);
    } finally {
      flatMap.mockRestore();
    }
  });

  it('preserves calendar-only dates when a memory-bounded book omits zero-weight symbols', () => {
    const sparse: StrategyBookSeries = {
      symbol: 'A', market: 'NASDAQ', bars: [bars()[0], bars()[2]],
    };
    const neverEnter = setup({
      entry: () => ({ matched: false, reasons: [], evidence: [] }),
    });
    const result = simulateStrategyBook({
      setup: neverEnter,
      series: [sparse],
      startingCash: new D(100_000),
      limits: LIMITS,
      calendar: [new Date(BASE), new Date(BASE + DAY), new Date(BASE + 2 * DAY)],
    } as Parameters<typeof simulateStrategyBook>[0] & { calendar: readonly Date[] });

    expect(result.daily.map((point) => point.ts.toISOString().slice(0, 10)))
      .toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
    expect(result.daily.every((point) => point.nav.eq(100_000))).toBe(true);
  });

  it('trims appreciated concentration next-open to the fixed cap without violating cash invariants', () => {
    const prices = [100, 100, 400, 400, 800, 800, 800];
    const appreciated: StrategyBookSeries = {
      symbol: 'A', market: 'NASDAQ',
      bars: prices.map((price, index) => ({
        ts: new Date(BASE + index * DAY), open: new D(price), high: new D(price), low: new D(price),
        close: new D(price), volume: new D(1_000_000_000), source: 'YAHOO',
      })),
    };
    const enterOnce = setup({
      entry: (ctx) => ({ matched: ctx.asOf.getTime() === BASE, reasons: [], evidence: [], sizeFraction: 1 }),
    });
    const result = run([appreciated], enterOnce, { ...LIMITS, maxNameWeight: 1 }, {
      maxOpenPositions: 1,
      maxGrossFraction: 0.25,
    });
    const sells = result.fills.filter((fill) => fill.action === 'SELL');

    expect(sells).toHaveLength(2);
    expect(sells.map((fill) => Number(fill.positionsValueAfter.div(fill.navAfter).toString())))
      .toEqual([0.25, 0.25]);
    expect(result.fills.every((fill) => fill.cashAfter.gte(0) && fill.cashAfter.plus(fill.positionsValueAfter).eq(fill.navAfter))).toBe(true);
    expect(result.daily.every((point) => point.positions.every((position) => position.qty.gte(0)))).toBe(true);
    expect(Math.max(...result.daily.map((point) => point.positions.length))).toBe(1);
  });

  it('does not trim a position whose marked exposure stays within the fixed ceiling', () => {
    const result = run([series('A')], setup({
      entry: (ctx) => ({ matched: ctx.asOf.getTime() === BASE, reasons: [], evidence: [], sizeFraction: 0.1 }),
    }), LIMITS, { maxOpenPositions: 1, maxGrossFraction: 0.25 });

    expect(result.fills.filter((fill) => fill.action === 'SELL')).toHaveLength(0);
  });

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

  it('rebalances retained positions toward target weights with reductions before additions', () => {
    const targetDates = [0, 1, 2, 3].map((offset) => new Date(BASE + offset * DAY));
    const targetSeries = (symbol: string, prices: number[]): StrategyBookSeries => ({
      symbol, market: 'NASDAQ',
      bars: prices.map((price, index) => ({
        ts: targetDates[index], open: new D(price), high: new D(price), low: new D(price), close: new D(price),
        volume: new D(1_000_000_000), source: 'YAHOO',
      })),
    });
    const targetSetup = setup({
      targetWeight: (ctx) => (ctx.asOf.getTime() === targetDates[0].getTime()
        || ctx.asOf.getTime() === targetDates[2].getTime()) ? 0.5 : null,
    });
    const result = run([
      targetSeries('A', [100, 100, 200, 200]),
      targetSeries('B', [100, 100, 100, 100]),
    ], targetSetup, { ...LIMITS, maxGrossExposure: 1, maxOpenPositions: 2 }, {
      maxGrossFraction: 1, maxOpenPositions: 2,
    });
    const rebalance = result.fills.filter((fill) => fill.ts.getTime() === targetDates[3].getTime());

    expect(rebalance.map((fill) => `${fill.action}:${fill.symbol}`)).toEqual(['SELL:A', 'BUY:B']);
    expect(rebalance[1].positionsAfter.map((position) => position.symbol)).toEqual(['A', 'B']);
    const weights = rebalance[1].positionsAfter.map((position) => (
      Number(position.qty.mul(position.price).div(rebalance[1].navAfter).toString())
    ));
    expect(Math.abs(weights[0] - weights[1])).toBeLessThan(0.005);
    expect(result.fills.every((fill) => fill.cashAfter.gte(0))).toBe(true);
  });

  it('rejects target-weight batches above 100%', () => {
    const overweight = setup({ targetWeight: () => 0.6 });
    expect(() => run([series('A'), series('B')], overweight, {
      ...LIMITS, maxGrossExposure: 1, maxOpenPositions: 2,
    }, { maxGrossFraction: 1, maxOpenPositions: 2 })).toThrow(/target weights exceed 100%/);
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
    const replayScope = {};

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
        replayScope,
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

// ── B1: the realized-volatility feedback loop ────────────────────────────────────────────────────
describe('realized-volatility source (B1 closed loop)', () => {
  const SIGMA_U = 0.222;      // constant underlying sleeve volatility, annualized
  const TARGET = 0.10;        // the volatility the book SELLS
  const LOOKBACK = 63;
  const DAYS = 900;
  const dailyLogMove = SIGMA_U / Math.sqrt(252);

  /** One symbol whose realized annualized volatility is exactly SIGMA_U, forever. */
  function constantVolSeries(): StrategyBookSeries {
    const seriesBars: StrategyBookBar[] = [];
    let price = 100;
    for (let i = 0; i < DAYS; i++) {
      if (i > 0) price *= Math.exp(i % 2 === 0 ? dailyLogMove : -dailyLogMove);
      const p = new D(price.toFixed(8));
      seriesBars.push({
        ts: new Date(BASE + i * DAY), open: p, high: p, low: p, close: p,
        volume: new D(1_000_000_000), source: 'YAHOO',
      });
    }
    return { symbol: 'VOLX', market: 'NASDAQ', bars: seriesBars };
  }

  const volSetup = setup({ entry: () => ({ matched: true, reasons: ['entry'], evidence: [] }) });
  const volLimits: RiskLimits = { ...LIMITS, maxOpenPositions: 1 };
  const volPolicy = (realizedVolSource?: 'book-nav' | 'unmanaged-sleeve'): StrategyBookPolicy => ({
    realizedVolLookback: LOOKBACK,
    targetAnnualVol: TARGET,
    maxOpenPositions: 1,
    maxGrossFraction: 1,
    ...(realizedVolSource ? { realizedVolSource } : {}),
  });

  function annualizedVol(navs: readonly Prisma.Decimal[]): number {
    const returns: number[] = [];
    for (let i = 1; i < navs.length; i++) returns.push(Math.log(Number(navs[i].div(navs[i - 1]).toString())));
    const mean = returns.reduce((sum, v) => sum + v, 0) / returns.length;
    return Math.sqrt(returns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / returns.length) * Math.sqrt(252);
  }

  /**
   * PINS THE MATH, not the plumbing. Composes the engine's OWN two primitives exactly as the call
   * site does, under continuous two-way rebalancing to the cap, and asserts the two FIXED POINTS:
   *   closed loop (book NAV is already exposure-scaled):  e = min(1, T/(e·σu)) ⇒ e* = √(T/σu),
   *                                                       delivered vol = e*·σu = √(T·σu) ≠ T
   *   open loop   (estimate invariant to the scalar):     e* = T/σu, delivered vol = T ✓
   * At T=10% and σu=22.2% that is 67.1% exposure / 14.9% delivered versus 45.1% / 10.0%. If this
   * test ever starts passing with the two branches agreeing, the loop has been reintroduced.
   */
  function exposureFixedPoint(source: 'book-nav' | 'unmanaged-sleeve') {
    const bookNavs = [new D(1)];
    const sleeveNavs = [new D(1)];
    let exposure = 1;
    const exposures: number[] = [];
    const bookReturns: number[] = [];
    for (let t = 1; t < DAYS; t++) {
      const sleeveReturn = Math.exp(t % 2 === 0 ? dailyLogMove : -dailyLogMove) - 1;
      sleeveNavs.push(sleeveNavs[sleeveNavs.length - 1].mul(new D(1 + sleeveReturn)));
      const bookReturn = exposure * sleeveReturn;
      bookNavs.push(bookNavs[bookNavs.length - 1].mul(new D(1 + bookReturn)));
      exposures.push(exposure);
      bookReturns.push(Math.log(1 + bookReturn));
      const history = source === 'book-nav' ? bookNavs : sleeveNavs;
      exposure = strategyBookExposureScalar(
        trailingBasketAnnualVol(history.slice(-(LOOKBACK + 1)), LOOKBACK), TARGET, 1,
      );
    }
    const tailExposure = exposures.slice(-200);
    const tailReturns = bookReturns.slice(-200);
    const mean = tailReturns.reduce((sum, v) => sum + v, 0) / tailReturns.length;
    return {
      exposure: tailExposure.reduce((sum, v) => sum + v, 0) / tailExposure.length,
      deliveredVol: Math.sqrt(
        tailReturns.reduce((sum, v) => sum + (v - mean) ** 2, 0) / tailReturns.length,
      ) * Math.sqrt(252),
    };
  }

  it('book-nav converges to the WRONG fixed point sqrt(T·sigma_u); unmanaged-sleeve delivers T', () => {
    const closed = exposureFixedPoint('book-nav');
    const open = exposureFixedPoint('unmanaged-sleeve');

    expect(closed.exposure).toBeCloseTo(Math.sqrt(TARGET / SIGMA_U), 3);   // 0.6712, not 0.4505
    expect(closed.deliveredVol).toBeCloseTo(Math.sqrt(TARGET * SIGMA_U), 3); // 0.1490, not 0.1000
    expect(closed.deliveredVol).toBeGreaterThan(TARGET * 1.4);
    expect(open.exposure).toBeCloseTo(TARGET / SIGMA_U, 3);                 // 0.4505
    expect(open.deliveredVol).toBeCloseTo(TARGET, 3);                       // 0.1000
  });

  it('the engine estimate itself is contaminated under book-nav and clean under unmanaged-sleeve', () => {
    const closed = run([constantVolSeries()], volSetup, volLimits, volPolicy('book-nav')).daily.slice(-200);
    const open = run([constantVolSeries()], volSetup, volLimits, volPolicy('unmanaged-sleeve')).daily.slice(-200);

    // book-nav "measures" the book it already scaled: ~0.10, not the sleeve's real 22.2% risk, so
    // its scalar drifts back toward 1.0 — it has lost sight of the risk it is supposed to govern.
    expect(closed[closed.length - 1].realizedVolAnnual!).toBeCloseTo(TARGET, 2);
    expect(closed[closed.length - 1].grossExposureScalar).toBeGreaterThan(0.95);
    // unmanaged-sleeve measures the sleeve: exactly sigma_u, and the scalar sits at T/sigma_u.
    expect(open[open.length - 1].realizedVolAnnual!).toBeCloseTo(SIGMA_U, 3);
    expect(open[open.length - 1].grossExposureScalar).toBeCloseTo(TARGET / SIGMA_U, 3);
    expect(annualizedVol(open.map((point) => point.nav))).toBeCloseTo(TARGET, 2);
  });

  it('defaults to book-nav so every published terminal card reproduces byte-identically', () => {
    const bookSeries = [constantVolSeries()];
    const byDefault = run(bookSeries, volSetup, volLimits, volPolicy());
    const explicit = run(bookSeries, volSetup, volLimits, volPolicy('book-nav'));
    const migrated = run(bookSeries, volSetup, volLimits, volPolicy('unmanaged-sleeve'));

    expect(JSON.stringify(byDefault)).toBe(JSON.stringify(explicit));
    expect(JSON.stringify(migrated)).not.toBe(JSON.stringify(explicit));
    expect(() => run(bookSeries, volSetup, volLimits, {
      ...volPolicy(), realizedVolSource: 'nav' as unknown as 'book-nav',
    })).toThrow(/realizedVolSource/);
  });

  it('no setup with a recorded terminal card has been migrated off book-nav', () => {
    const policies: [string, StrategyBookPolicy][] = [
      ['halal-managed-momentum-core', halalManagedMomentumCoreBookPolicy()],
      ['ts-momentum-halal-basket-v3', tsMomentumV3BookPolicy()],
      ['ts-momentum-halal-basket-v4', tsMomentumV4BookPolicy()],
    ];
    for (const [id, policy] of policies) {
      expect(policy.realizedVolLookback, id).toBeGreaterThan(0);
      expect(policy.realizedVolSource, id).toBeUndefined();
    }
  });
});
