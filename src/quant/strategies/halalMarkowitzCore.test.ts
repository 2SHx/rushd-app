// Pure decision-logic tests for halal-markowitz-core v1 (hand-built deterministic price series;
// live validation evidence comes solely from real-bar CLI runs, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_MARKOWITZ_CORE_V1,
  HalalMarkowitzCoreParamsSchema,
  halalMarkowitzCoreBookPolicy,
  halalMarkowitzCoreSetup,
} from './halalMarkowitzCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 1);
const HISTORY_DATES = Array.from({ length: 253 }, (_, i) => new Date(START + i * DAY));
const MONTH_END = HISTORY_DATES.at(-1)!; // last bar of its month given daily spacing

type Row = { ts: Date; close: number; volume: number };

/** `n` symbols with full 253-bar history; deterministic pseudo-random walks per symbol so the
 * covariance matrix is nondegenerate (a Markowitz frontier over identical series is uninteresting). */
function makeBook(n: number, opts: { short?: string[] } = {}): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    let price = 100;
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      // Deterministic per-symbol pseudo-noise (no Math.random — reproducibility).
      const noise = Math.sin((i + 1) * (s + 2) * 0.37) * 0.01;
      const drift = 0.0001 * (s + 1);
      if (i > 0) price *= 1 + drift + noise;
      return { ts, close: price, volume: 1_000_000 };
    });
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
  halalMarkowitzCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-markowitz-core v1', () => {
  it('validates the frozen params schema (rejects a mismatched version/cap)', () => {
    expect(() => HalalMarkowitzCoreParamsSchema.parse(HALAL_MARKOWITZ_CORE_V1)).not.toThrow();
    expect(() => HalalMarkowitzCoreParamsSchema.parse({ ...HALAL_MARKOWITZ_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalMarkowitzCoreParamsSchema.parse({ ...HALAL_MARKOWITZ_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalMarkowitzCoreParamsSchema.parse({ ...HALAL_MARKOWITZ_CORE_V1, minRankable: 20 })).toThrow();
  });

  it('holds cash below the 15-name breadth floor', () => {
    const scope = {};
    prepare(makeBook(10), scope);
    const weight = halalMarkowitzCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_MARKOWITZ_CORE_V1);
    expect(weight).toBe(0);
    const screened = halalMarkowitzCoreSetup.screen(ctx('SYM000', MONTH_END, scope), HALAL_MARKOWITZ_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('insufficient_breadth');
  });

  it('assigns Markowitz tangency weights, each capped at 20%, once breadth clears the floor', () => {
    const scope = {};
    prepare(makeBook(20), scope);
    const weights: number[] = [];
    let sum = 0;
    for (let s = 0; s < 20; s++) {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      const w = halalMarkowitzCoreSetup.targetWeight!(ctx(symbol, MONTH_END, scope), HALAL_MARKOWITZ_CORE_V1);
      expect(w).not.toBeNull();
      expect(w!).toBeGreaterThanOrEqual(0);
      expect(w!).toBeLessThanOrEqual(0.20 + 1e-9); // per-name cap, never exceeded
      weights.push(w!);
      sum += w!;
    }
    expect(sum).toBeLessThanOrEqual(1 + 1e-9); // capping only shrinks — never redistributes above 100%
    expect(weights.some((w) => w > 0)).toBe(true); // at least one name gets real exposure
    const screened = halalMarkowitzCoreSetup.screen(ctx('SYM000', MONTH_END, scope), HALAL_MARKOWITZ_CORE_V1);
    expect(screened.matched).toBe(true);
  });

  it('excludes short-history names from the rankable set', () => {
    const scope = {};
    prepare(makeBook(20, { short: ['SYM001'] }), scope);
    expect(
      halalMarkowitzCoreSetup.targetWeight!(ctx('SYM001', MONTH_END, scope), HALAL_MARKOWITZ_CORE_V1),
    ).toBe(0);
    // 19 rankable names remain — still above the 15-name breadth floor.
    const screened = halalMarkowitzCoreSetup.screen(ctx('SYM000', MONTH_END, scope), HALAL_MARKOWITZ_CORE_V1);
    expect(screened.matched).toBe(true);
  });

  it('holds (null) between month-ends', () => {
    const scope = {};
    prepare(makeBook(20), scope);
    const midMonth = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(
      halalMarkowitzCoreSetup.targetWeight!(ctx('SYM000', midMonth, scope), HALAL_MARKOWITZ_CORE_V1),
    ).toBeNull();
  });

  it('is deterministic: identical inputs + seed produce byte-identical weights', () => {
    const scopeA = {};
    const scopeB = {};
    prepare(makeBook(20), scopeA);
    prepare(makeBook(20), scopeB);
    for (let s = 0; s < 20; s++) {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      const wA = halalMarkowitzCoreSetup.targetWeight!(ctx(symbol, MONTH_END, scopeA), HALAL_MARKOWITZ_CORE_V1);
      const wB = halalMarkowitzCoreSetup.targetWeight!(ctx(symbol, MONTH_END, scopeB), HALAL_MARKOWITZ_CORE_V1);
      expect(wA).toBe(wB);
    }
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed)', () => {
    // Regression: a date-only cache would leak the first-computed param set's decision into every
    // other param set (identical fake weights). An (almost) uncapped run vs a tightly-capped run on
    // the SAME symbol/month MUST differ — that can only hold if each param set recomputed its own
    // Markowitz frontier rather than reusing a cached decision keyed only on the date.
    const scope = {};
    prepare(makeBook(20), scope);
    const symbol = 'SYM015'; // deterministically gets the largest raw tangency weight in this fixture
    const uncapped = halalMarkowitzCoreSetup.targetWeight!(
      ctx(symbol, MONTH_END, scope), { ...HALAL_MARKOWITZ_CORE_V1, perNameCap: 1 },
    );
    const tightlyCapped = halalMarkowitzCoreSetup.targetWeight!(
      ctx(symbol, MONTH_END, scope), { ...HALAL_MARKOWITZ_CORE_V1, perNameCap: 0.02 },
    );
    expect(uncapped).not.toBeNull();
    expect(tightlyCapped).not.toBeNull();
    expect(tightlyCapped!).toBeLessThanOrEqual(0.02 + 1e-9);
    expect(tightlyCapped!).toBeLessThan(uncapped!);
  });

  it('declares the frozen 3×3 plateau grid centered on the default params', () => {
    const neighborhood = halalMarkowitzCoreSetup.plateauNeighborhood!(HALAL_MARKOWITZ_CORE_V1);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'perNameCap']);
    expect(neighborhood.center).toEqual(HALAL_MARKOWITZ_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 40-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-markowitz-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-markowitz-core', undefined)).toEqual(halalMarkowitzCoreBookPolicy());
    expect(halalMarkowitzCoreBookPolicy().maxOpenPositions).toBe(40);
    expect(validationTrialsForSetup('halal-markowitz-core', HALAL_MARKOWITZ_CORE_V1)).toBe(9);
  });
});
