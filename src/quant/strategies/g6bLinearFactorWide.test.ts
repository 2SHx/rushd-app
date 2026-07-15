// Pure decision-logic tests for the R3-4 wide factor (hand-built arithmetic
// inputs test bucketing/floor/cap rules only — validation evidence comes solely
// from real-bar runs through the CLI).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  G6B_LINEAR_FACTOR_WIDE_V2,
  g6bLinearFactorWideBookPolicy,
  g6bLinearFactorWideSetup,
} from './g6bLinearFactorWide';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 1);
const HISTORY_DATES = Array.from({ length: 253 }, (_, i) => new Date(START + i * DAY));
const MONTH_END = HISTORY_DATES.at(-1)!; // last bar of its month given daily spacing

type Row = { ts: Date; close: number; volume: number };

/** `n` symbols with full 253-bar history; SYM000 has the strongest momentum. */
function makeBook(n: number, opts: { illiquid?: string[]; cheap?: string[]; short?: string[] } = {}): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const base = opts.cheap?.includes(symbol) ? 1 : 100;
    // Momentum decreasing in s: SYM000 doubled a year ago, later symbols flat.
    const rows: Row[] = HISTORY_DATES.map((ts, i) => ({
      ts,
      close: i < 1 ? base : base * (1 + Math.max(0, (n - s) / n) * Math.min(1, i / 200)),
      volume: opts.illiquid?.includes(symbol) ? 100 : 1_000_000,
    }));
    dailyBarsBySymbol.set(symbol, opts.short?.includes(symbol) ? rows.slice(-50) : rows);
  }
  return {
    symbols: Array.from(dailyBarsBySymbol.keys()),
    closesBySymbol: new Map(),
    dailyBarsBySymbol,
  };
}

function ctx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  return {
    symbol,
    market: 'NASDAQ',
    asOf,
    bars: [],
    positionQty: new D(0),
    replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

function prepare(input: UniversePrepareInput, scope: object): void {
  g6bLinearFactorWideSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('g6b-linear-factor-wide v2', () => {
  it('holds cash below the 100-name breadth floor', () => {
    const scope = {};
    prepare(makeBook(60), scope);
    const weight = g6bLinearFactorWideSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2);
    expect(weight).toBe(0);
    const screened = g6bLinearFactorWideSetup.screen(ctx('SYM000', MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('insufficient_breadth');
  });

  it('selects the top decile (N = ceil(0.10 × rankable)) with equal weights', () => {
    const scope = {};
    prepare(makeBook(120), scope);
    const weight = g6bLinearFactorWideSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2);
    expect(weight).toBeCloseTo(1 / 12, 10); // ceil(120×0.1)=12
    const laggard = g6bLinearFactorWideSetup.targetWeight!(ctx('SYM119', MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2);
    expect(laggard).toBe(0);
  });

  it('caps the book at 50 positions on a large universe', () => {
    const scope = {};
    prepare(makeBook(900), scope);
    const weight = g6bLinearFactorWideSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2);
    expect(weight).toBeCloseTo(1 / 50, 10); // ceil(900×0.1)=90 → capped at 50
  });

  it('excludes illiquid, sub-$5, and short-history names from ranking', () => {
    const scope = {};
    prepare(makeBook(120, { illiquid: ['SYM001'], cheap: ['SYM002'], short: ['SYM003'] }), scope);
    for (const excluded of ['SYM001', 'SYM002', 'SYM003']) {
      expect(
        g6bLinearFactorWideSetup.targetWeight!(ctx(excluded, MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2),
      ).toBe(0);
    }
    // 117 rankable names remain — still above the breadth floor, book still forms.
    expect(
      g6bLinearFactorWideSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), G6B_LINEAR_FACTOR_WIDE_V2),
    ).toBeCloseTo(1 / 12, 10);
  });

  it('holds (null) between month-ends', () => {
    const scope = {};
    prepare(makeBook(120), scope);
    const midMonth = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(
      g6bLinearFactorWideSetup.targetWeight!(ctx('SYM000', midMonth, scope), G6B_LINEAR_FACTOR_WIDE_V2),
    ).toBeNull();
  });

  it('is registered: shared route, 50-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('g6b-linear-factor-wide', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('g6b-linear-factor-wide', undefined)).toEqual(g6bLinearFactorWideBookPolicy());
    expect(g6bLinearFactorWideBookPolicy().maxOpenPositions).toBe(50);
    expect(validationTrialsForSetup('g6b-linear-factor-wide', G6B_LINEAR_FACTOR_WIDE_V2)).toBe(9);
  });
});
