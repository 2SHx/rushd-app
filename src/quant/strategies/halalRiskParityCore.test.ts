// Pure decision-logic tests for halal-risk-parity-core v1 (hand-built arithmetic inputs test the
// weighting/capping/breadth-floor rules only — validation evidence comes solely from real-bar runs
// through the CLI, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  capAndRedistribute,
  HALAL_RISK_PARITY_CORE_V1,
  HalalRiskParityCoreParamsSchema,
  halalRiskParityCoreBookPolicy,
  halalRiskParityCoreSetup,
  inverseVolatilityWeights,
} from './halalRiskParityCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 1);
const HISTORY_DATES = Array.from({ length: 253 }, (_, i) => new Date(START + i * DAY));
const MONTH_END = HISTORY_DATES.at(-1)!; // last bar of its month given daily spacing

type Row = { ts: Date; close: number; volume: number };

/** `n` symbols with full 253-bar history; volatility strictly increasing in symbol index (SYM000
 * is lowest-vol, so it earns the largest raw inverse-vol weight before capping). */
function makeBook(n: number, opts: { short?: string[] } = {}): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const delta = 0.002 + s * 0.0004; // strictly increasing daily-return magnitude ⇒ increasing σ
    let price = 100;
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      if (i > 0) price *= 1 + (i % 2 === 0 ? delta : -delta);
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
  halalRiskParityCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-risk-parity-core v1 — capAndRedistribute / inverseVolatilityWeights (hand-computable)', () => {
  it('normalizes 1/σ weights and leaves them uncapped when the cap does not bind', () => {
    // σ = 0.01, 0.02, 0.04 → raw 1/σ = 100, 50, 25 → sum 175 → normalized 4/7, 2/7, 1/7.
    const weights = inverseVolatilityWeights(new Map([['A', 0.01], ['B', 0.02], ['C', 0.04]]), 1);
    expect(weights.get('A')).toBeCloseTo(4 / 7, 10);
    expect(weights.get('B')).toBeCloseTo(2 / 7, 10);
    expect(weights.get('C')).toBeCloseTo(1 / 7, 10);
    const sum = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('caps at 50% and redistributes the excess proportionally to the uncapped names', () => {
    // Normalized weights 4/7≈0.571429, 2/7≈0.285714, 1/7≈0.142857; cap 0.5.
    // A→0.5 (excess 0.071429); remaining B,C sum 0.428571 share it proportionally.
    const capped = capAndRedistribute(new Map([['A', 4 / 7], ['B', 2 / 7], ['C', 1 / 7]]), 0.5);
    expect(capped.get('A')).toBeCloseTo(0.5, 10);
    expect(capped.get('B')).toBeCloseTo(1 / 3, 8);
    expect(capped.get('C')).toBeCloseTo(1 / 6, 8);
    const sum = Array.from(capped.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 8);
  });

  it('leaves partial cash when total capacity (cap × count) is below 1', () => {
    // Three names, 20% cap: max deployable is 0.6 — every name pins at the cap; 40% cash residual.
    const capped = capAndRedistribute(new Map([['A', 4 / 7], ['B', 2 / 7], ['C', 1 / 7]]), 0.20);
    expect(capped.get('A')).toBeCloseTo(0.20, 10);
    expect(capped.get('B')).toBeCloseTo(0.20, 10);
    expect(capped.get('C')).toBeCloseTo(0.20, 10);
    const sum = Array.from(capped.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0.6, 10);
    expect(sum).toBeLessThanOrEqual(1);
  });

  it('excludes non-positive/non-finite volatility from ranking', () => {
    const weights = inverseVolatilityWeights(new Map([['A', 0.01], ['B', 0], ['C', -0.02], ['D', NaN]]), 1);
    expect(weights.has('B')).toBe(false);
    expect(weights.has('C')).toBe(false);
    expect(weights.has('D')).toBe(false);
    expect(weights.get('A')).toBeCloseTo(1, 10);
  });

  it('rejects an out-of-range cap', () => {
    expect(() => capAndRedistribute(new Map([['A', 1]]), 0)).toThrow();
    expect(() => capAndRedistribute(new Map([['A', 1]]), 1.5)).toThrow();
  });
});

describe('halal-risk-parity-core v1 — HalalRiskParityCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalRiskParityCoreParamsSchema.parse(HALAL_RISK_PARITY_CORE_V1)).toEqual(HALAL_RISK_PARITY_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, and out-of-range cap', () => {
    expect(() => HalalRiskParityCoreParamsSchema.parse({ ...HALAL_RISK_PARITY_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalRiskParityCoreParamsSchema.parse({ ...HALAL_RISK_PARITY_CORE_V1, lookbackDays: 252.5 })).toThrow();
    expect(() => HalalRiskParityCoreParamsSchema.parse({ ...HALAL_RISK_PARITY_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalRiskParityCoreParamsSchema.parse({ ...HALAL_RISK_PARITY_CORE_V1, minRankable: 20 })).toThrow();
    expect(() => HalalRiskParityCoreParamsSchema.parse({ ...HALAL_RISK_PARITY_CORE_V1, maxNames: 100 })).toThrow();
  });
});

describe('halal-risk-parity-core v1 — full setup decision logic', () => {
  it('holds cash below the 15-name breadth floor', () => {
    const scope = {};
    prepare(makeBook(10), scope);
    const weight = halalRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    expect(weight).toBe(0);
    const screened = halalRiskParityCoreSetup.screen(ctx('SYM000', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('insufficient_breadth');
  });

  it('assigns positive, capped inverse-vol weights once breadth clears the floor', () => {
    const scope = {};
    prepare(makeBook(20), scope);
    const lowVol = halalRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    const highVol = halalRiskParityCoreSetup.targetWeight!(ctx('SYM019', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    expect(lowVol).not.toBeNull();
    expect(highVol).not.toBeNull();
    expect(lowVol! ).toBeGreaterThan(0);
    expect(highVol!).toBeGreaterThan(0);
    // Lowest-vol name (SYM000) must get at least as much weight as the highest-vol name.
    expect(lowVol!).toBeGreaterThanOrEqual(highVol!);
    expect(lowVol!).toBeLessThanOrEqual(HALAL_RISK_PARITY_CORE_V1.perNameCap + 1e-9);
    // Sum of all 20 target weights must never exceed 1 (the shared engine throws otherwise).
    let sum = 0;
    for (let s = 0; s < 20; s++) {
      sum += halalRiskParityCoreSetup.targetWeight!(
        ctx(`SYM${String(s).padStart(3, '0')}`, MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1,
      )!;
    }
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('excludes short-history names from ranking without breaking the rest of the book', () => {
    const scope = {};
    prepare(makeBook(20, { short: ['SYM005'] }), scope);
    expect(halalRiskParityCoreSetup.targetWeight!(ctx('SYM005', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1)).toBe(0);
    expect(
      halalRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1)!,
    ).toBeGreaterThan(0);
  });

  it('holds (null) between month-ends', () => {
    const scope = {};
    prepare(makeBook(20), scope);
    const midMonth = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(halalRiskParityCoreSetup.targetWeight!(ctx('SYM000', midMonth, scope), HALAL_RISK_PARITY_CORE_V1)).toBeNull();
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeBook(20), scope);
    const first = halalRiskParityCoreSetup.targetWeight!(ctx('SYM003', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    const second = halalRiskParityCoreSetup.targetWeight!(ctx('SYM003', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeBook(20), otherScope);
    const third = halalRiskParityCoreSetup.targetWeight!(ctx('SYM003', MONTH_END, otherScope), HALAL_RISK_PARITY_CORE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed)', () => {
    const scope = {};
    prepare(makeBook(20), scope);
    const center = halalRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_RISK_PARITY_CORE_V1);
    const neighbor = halalRiskParityCoreSetup.targetWeight!(
      ctx('SYM000', MONTH_END, scope),
      { ...HALAL_RISK_PARITY_CORE_V1, perNameCap: 0.05 },
    );
    expect(center).toBeGreaterThan(0);
    expect(neighbor).toBeLessThan(center!); // a tighter cap can only shrink (never grow) the weight
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params', () => {
    const neighborhood = halalRiskParityCoreSetup.plateauNeighborhood!(HALAL_RISK_PARITY_CORE_V1);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'perNameCap']);
    expect(neighborhood.center).toEqual(HALAL_RISK_PARITY_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 40-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-risk-parity-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-risk-parity-core', undefined)).toEqual(halalRiskParityCoreBookPolicy());
    expect(halalRiskParityCoreBookPolicy().maxOpenPositions).toBe(40);
    expect(validationTrialsForSetup('halal-risk-parity-core', HALAL_RISK_PARITY_CORE_V1)).toBe(9);
  });
});
