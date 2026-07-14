import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  dailyUniverseForSetup,
  activeMonthlyBookReturnRecords,
  selectDailyBacktestRoute,
  strategyBookPolicyForSetup,
  validationTrialsForSetup,
} from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  G6B_LINEAR_FACTOR_UNIVERSE,
  G6B_LINEAR_FACTOR_V1,
  g6bLinearFactorBookPolicy,
  g6bLinearFactorSetup,
  momentum12Minus1,
  trailingDollarVolumeProxy,
} from './g6bLinearFactor';

const D = Prisma.Decimal;
const MINUTE = 60_000;
const HISTORY_DATES = Array.from({ length: 253 }, (_, index) => (
  new Date(Date.UTC(2023, 0, 1) + index * MINUTE)
));
const JAN_MONTH_END = HISTORY_DATES.at(-1)!;
const NEXT_MONTH = new Date('2023-02-01T00:00:00.000Z');

type Point = { ts: Date; close: number; volume: number };

function makeBook(opts: { missing?: string; futureShock?: boolean; winner?: string } = {}): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Point[]>();
  const closesBySymbol = new Map<string, { ts: Date; close: number }[]>();
  for (const symbol of G6B_LINEAR_FACTOR_UNIVERSE) {
    const history = HISTORY_DATES.map((ts, index) => ({
      ts,
      close: symbol === opts.winner && index === 231 ? 200 : 100,
      volume: symbol === opts.winner && index >= 232 ? 10_000_000 : 1_000_000,
    }));
    const rows = symbol === opts.missing ? history.slice(0, -1) : history;
    rows.push({ ts: NEXT_MONTH, close: 100, volume: 1_000_000 });
    if (opts.futureShock) {
      rows.push({
        ts: new Date('2023-03-01T00:00:00.000Z'),
        close: symbol === 'VRTX' ? 1_000_000 : 1,
        volume: symbol === 'VRTX' ? 1_000_000_000 : 1,
      });
    }
    dailyBarsBySymbol.set(symbol, rows);
    closesBySymbol.set(symbol, rows.map(({ ts, close }) => ({ ts, close })));
  }
  return { symbols: [...G6B_LINEAR_FACTOR_UNIVERSE], closesBySymbol, dailyBarsBySymbol };
}

function context(
  symbol: string,
  asOf = JAN_MONTH_END,
  positionQty = new D(0),
  replayScope?: object,
): StrategyPointInTimeContext {
  const rows = HISTORY_DATES.filter((ts) => ts <= asOf);
  return {
    symbol, market: 'NASDAQ', asOf,
    bars: rows.map((ts, index) => ({
      id: `${symbol}-${index}`, symbol, market: 'NASDAQ', ts,
      open: new D(100), high: new D(100), low: new D(100), close: new D(100),
      volume: new D(1_000_000), session: 'REGULAR', source: 'YAHOO', createdAt: ts,
    })),
    snapshot: null,
    positionQty,
    replayScope,
  };
}

describe('g6b-linear-factor v1', () => {
  it('pins the exact 12−1M endpoints and explicitly proxied dollar volume', () => {
    const closes = Array(253).fill(100) as number[];
    closes[231] = 125;
    expect(momentum12Minus1(closes, 252, 21)).toBeCloseTo(0.25, 12);
    expect(momentum12Minus1(closes.slice(1), 252, 21)).toBeNull();
    expect(trailingDollarVolumeProxy([
      { ts: new Date(0), close: 10, volume: 2 },
      { ts: new Date(1), close: 20, volume: 3 },
    ], 2)).toBe(80);
  });

  it('selects ceil(top quartile)=7, targets equal weights, and breaks ties canonically', () => {
    g6bLinearFactorSetup.prepareUniverse!(makeBook());
    const targets = G6B_LINEAR_FACTOR_UNIVERSE.map((symbol) => ({
      symbol, weight: g6bLinearFactorSetup.targetWeight!(context(symbol)),
    }));
    const selected = targets.filter((item) => item.weight! > 0);

    expect(selected.map((item) => item.symbol).sort()).toEqual([...G6B_LINEAR_FACTOR_UNIVERSE].sort().slice(0, 7));
    expect(selected).toHaveLength(7);
    expect(selected.every((item) => item.weight === 1 / 7)).toBe(true);
    expect(targets.reduce((sum, item) => sum + (item.weight ?? 0), 0)).toBeCloseTo(1, 12);
  });

  it('fails to 100% cash when one declared name lacks the common month-end observation', () => {
    g6bLinearFactorSetup.prepareUniverse!(makeBook({ missing: 'VRTX' }));
    expect(G6B_LINEAR_FACTOR_UNIVERSE.map((symbol) => (
      g6bLinearFactorSetup.targetWeight!(context(symbol))
    ))).toEqual(Array(G6B_LINEAR_FACTOR_UNIVERSE.length).fill(0));
  });

  it('holds between month-ends, ignores future prices, and rejects a future context bar', () => {
    g6bLinearFactorSetup.prepareUniverse!(makeBook());
    const before = G6B_LINEAR_FACTOR_UNIVERSE.map((symbol) => (
      g6bLinearFactorSetup.targetWeight!(context(symbol))
    ));
    g6bLinearFactorSetup.prepareUniverse!(makeBook({ futureShock: true }));
    const after = G6B_LINEAR_FACTOR_UNIVERSE.map((symbol) => (
      g6bLinearFactorSetup.targetWeight!(context(symbol))
    ));
    expect(after).toEqual(before);
    expect(g6bLinearFactorSetup.targetWeight!(context('AAPL', HISTORY_DATES[200]))).toBeNull();

    const clean = context('AAPL');
    expect(() => g6bLinearFactorSetup.targetWeight!({
      ...clean,
      bars: [...clean.bars, { ...clean.bars.at(-1)!, ts: new Date('2024-01-01T00:00:00.000Z') }],
    })).toThrow(/Look-ahead/);
  });

  it('isolates prepared panels and decision caches by replay scope', () => {
    const scopeA = {};
    const scopeB = {};
    g6bLinearFactorSetup.prepareUniverse!({ ...makeBook(), replayScope: scopeA });
    const selectedA = G6B_LINEAR_FACTOR_UNIVERSE.filter((symbol) => (
      g6bLinearFactorSetup.targetWeight!(context(symbol, JAN_MONTH_END, new D(0), scopeA))! > 0
    ));
    g6bLinearFactorSetup.prepareUniverse!({ ...makeBook({ winner: 'VRTX' }), replayScope: scopeB });
    const selectedB = G6B_LINEAR_FACTOR_UNIVERSE.filter((symbol) => (
      g6bLinearFactorSetup.targetWeight!(context(symbol, JAN_MONTH_END, new D(0), scopeB))! > 0
    ));

    expect(selectedA).not.toContain('VRTX');
    expect(selectedB).toContain('VRTX');
    expect(G6B_LINEAR_FACTOR_UNIVERSE.filter((symbol) => (
      g6bLinearFactorSetup.targetWeight!(context(symbol, JAN_MONTH_END, new D(0), scopeA))! > 0
    ))).toEqual(selectedA);
  });

  it('uses active monthly book returns as independent observations, not partial name trims', () => {
    const point = (ts: string, nav: number, exposure: number) => ({
      ts: new Date(ts), cash: new D(nav - exposure), positionsValue: new D(exposure), nav: new D(nav),
      peakNav: new D(Math.max(100, nav)), drawdown: new D(0), realizedVolAnnual: null,
      grossExposureScalar: 1, positions: [],
    });
    const records = activeMonthlyBookReturnRecords([
      point('2024-01-31T00:00:00.000Z', 100, 0),
      point('2024-02-15T00:00:00.000Z', 105, 50),
      point('2024-02-29T00:00:00.000Z', 110, 50),
      point('2024-03-15T00:00:00.000Z', 99, 40),
      point('2024-03-31T00:00:00.000Z', 99, 0),
    ]);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.reason)).toEqual([
      'active_monthly_book_return', 'active_monthly_book_return',
    ]);
    expect(records[0].ret).toBeCloseTo(0.1, 12);
    expect(records[1].ret).toBeCloseTo(-0.1, 12);
  });

  it('pins shared routing, exact universe, policy, nine trials, and the frozen 3×3 plateau', () => {
    expect(selectDailyBacktestRoute(g6bLinearFactorSetup.id)).toBe('shared');
    expect(dailyUniverseForSetup(g6bLinearFactorSetup.id, null)).toEqual(G6B_LINEAR_FACTOR_UNIVERSE);
    expect(() => dailyUniverseForSetup(g6bLinearFactorSetup.id, ['AAPL'])).toThrow(/exact 25-name/);
    expect(validationTrialsForSetup(g6bLinearFactorSetup.id, G6B_LINEAR_FACTOR_V1)).toBe(9);
    expect(strategyBookPolicyForSetup(g6bLinearFactorSetup.id, G6B_LINEAR_FACTOR_V1))
      .toEqual(g6bLinearFactorBookPolicy());

    const plateau = g6bLinearFactorSetup.plateauNeighborhood!(G6B_LINEAR_FACTOR_V1);
    expect(plateau.axes).toEqual(['momentumLookback', 'momentumWeight']);
    expect(plateau.neighbors).toHaveLength(8);
    expect(new Set(plateau.neighbors.map((item) => `${item.params.momentumLookback}|${item.params.momentumWeight}`)))
      .toEqual(new Set(['231|0.4', '231|0.5', '231|0.6', '252|0.4', '252|0.6', '273|0.4', '273|0.5', '273|0.6']));
  });

  it('requires the OHLCV panel and uses bilingual research-only AAOIFI-blocked language', () => {
    const book = makeBook();
    expect(() => g6bLinearFactorSetup.prepareUniverse!({
      symbols: book.symbols, closesBySymbol: book.closesBySymbol,
    })).toThrow(/daily OHLCV universe/);
    g6bLinearFactorSetup.prepareUniverse!(book);
    const signal = g6bLinearFactorSetup.signal(context('AAPL'));
    expect(signal.rationaleEn).toMatch(/dollar-volume.*candidate.*research-only.*AAOIFI-unscreened.*execution blocked/i);
    expect(signal.rationaleAr).toMatch(/مؤشر بديل.*مرشح.*للبحث فقط.*أيوفي.*يُحظر التنفيذ/);
    expect(signal.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'turnover_field', value: 'dollar_volume_proxy_not_true_turnover_rate' }),
    ]));
  });
});
