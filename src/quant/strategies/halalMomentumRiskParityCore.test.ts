// Pure decision-logic tests for halal-momentum-risk-parity-core v1 (hand-built arithmetic inputs
// test the selection/weighting/capping/breadth-floor rules only — validation evidence comes solely
// from real-bar runs through the CLI, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_MOMENTUM_RISK_PARITY_CORE_V1,
  HalalMomentumRiskParityCoreParamsSchema,
  halalMomentumRiskParityCoreBookPolicy,
  halalMomentumRiskParityCoreSetup,
  selectByMomentum,
} from './halalMomentumRiskParityCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 1);
const HISTORY_DATES = Array.from({ length: 253 }, (_, i) => new Date(START + i * DAY));
const MONTH_END = HISTORY_DATES.at(-1)!; // last bar of its month given daily spacing

type Row = { ts: Date; close: number; volume: number };

/**
 * `n` uptrend symbols with full 253-bar history. Trend is STRICTLY DECREASING and volatility
 * amplitude STRICTLY INCREASING in symbol index — so SYM000 has both the HIGHEST relative momentum
 * (top-selected) and the LOWEST volatility (largest inverse-vol weight), and the two effects never
 * conflict: the top-selectionFraction (lowest-index) half is exactly the lowest-vol half. Absolute
 * momentum is positive for every name (trend always dominates the oscillation term).
 */
function makeMomentumBook(n: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const trendPerBar = 0.006 - s * 0.00012; // strictly decreasing, always > 0 for s < 50
    const volAmp = 0.003 + s * 0.0003; // strictly increasing
    let price = 100;
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      if (i > 0) price *= (1 + trendPerBar) * (1 + (i % 2 === 0 ? volAmp : -volAmp));
      return { ts, close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  }
  return { symbols: Array.from(dailyBarsBySymbol.keys()), closesBySymbol: new Map(), dailyBarsBySymbol };
}

/**
 * Injects one hand-computable "SPECIAL" name whose absolute momentum is NEGATIVE despite a HIGH
 * relative momentum: base 100 at t−lookback, rises to 150 by t−skip (relative = 150/100−1 = +0.50,
 * would rank near the top on relative alone), then crashes to 40 by t (absolute = 40/100−1 = −0.60).
 * Must NEVER be selected/weighted regardless of its relative rank — the absolute filter binds first.
 */
function addSpecialAbsoluteFailure(input: UniversePrepareInput): UniversePrepareInput {
  const rows: Row[] = HISTORY_DATES.map((ts, i) => {
    let close: number;
    if (i <= 231) close = 100 + (150 - 100) * (i / 231); // idx0=100 → idx231=150
    else close = 150 + (40 - 150) * ((i - 231) / (252 - 231)); // idx231=150 → idx252=40
    return { ts, close, volume: 1_000_000 };
  });
  const dailyBarsBySymbol = new Map(input.dailyBarsBySymbol);
  dailyBarsBySymbol.set('SPECIAL', rows);
  return { ...input, symbols: [...input.symbols, 'SPECIAL'], dailyBarsBySymbol };
}

function ctx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(0), replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

function prepare(input: UniversePrepareInput, scope: object): void {
  halalMomentumRiskParityCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-momentum-risk-parity-core v1 — selectByMomentum (hand-computable)', () => {
  it('selects round(count × selectionFraction) by relative rank descending, ties by symbol ascending', () => {
    const eligible = [
      { symbol: 'A', relative: 0.10 },
      { symbol: 'B', relative: 0.05 },
      { symbol: 'C', relative: 0.20 },
      { symbol: 'D', relative: -0.01 },
    ];
    // sorted desc: C(0.20), A(0.10), B(0.05), D(-0.01); round(4*0.5)=2 → top 2.
    expect(selectByMomentum(eligible, 0.5)).toEqual(['C', 'A']);
  });

  it('breaks ties by symbol ascending', () => {
    const eligible = [
      { symbol: 'Z', relative: 0.10 },
      { symbol: 'A', relative: 0.10 },
      { symbol: 'M', relative: 0.10 },
    ];
    expect(selectByMomentum(eligible, 1)).toEqual(['A', 'M', 'Z']);
  });

  it('selectionFraction scales the selected count deterministically', () => {
    const eligible = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, relative: 10 - i }));
    expect(selectByMomentum(eligible, 0.4)).toHaveLength(4); // round(10*0.4)=4
    expect(selectByMomentum(eligible, 0.6)).toHaveLength(6); // round(10*0.6)=6
    expect(selectByMomentum(eligible, 1)).toHaveLength(10);
  });

  it('returns empty for an empty eligible set', () => {
    expect(selectByMomentum([], 0.5)).toEqual([]);
  });
});

describe('halal-momentum-risk-parity-core v1 — HalalMomentumRiskParityCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalMomentumRiskParityCoreParamsSchema.parse(HALAL_MOMENTUM_RISK_PARITY_CORE_V1))
      .toEqual(HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, out-of-range selectionFraction/cap, and wrong maxNames/minRankable', () => {
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, lookbackBars: 252.5 })).toThrow();
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, selectionFraction: 0 })).toThrow();
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, selectionFraction: 1.5 })).toThrow();
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, maxNames: 40 })).toThrow();
    expect(() => HalalMomentumRiskParityCoreParamsSchema.parse({ ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, minRankable: 20 })).toThrow();
  });

  it('rejects skipRecentBars >= lookbackBars at decision time', () => {
    const scope = {};
    prepare(makeMomentumBook(20), scope);
    expect(() => halalMomentumRiskParityCoreSetup.targetWeight!(
      ctx('SYM000', MONTH_END, scope),
      { ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, skipRecentBars: 252 },
    )).toThrow();
  });
});

describe('halal-momentum-risk-parity-core v1 — full setup decision logic', () => {
  it('holds cash below the 15-name breadth floor (selected count, not rankable count)', () => {
    const scope = {};
    // 20 rankable uptrend names, all pass the absolute filter; selectionFraction 0.5 → selected = 10 < 15.
    prepare(makeMomentumBook(20), scope);
    const weight = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(weight).toBe(0);
    const screened = halalMomentumRiskParityCoreSetup.screen(ctx('SYM000', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('insufficient_breadth');
  });

  it('excludes a name with negative absolute momentum even when its relative momentum is high (SPECIAL: relative +0.50, absolute −0.60)', () => {
    const scope = {};
    const book = addSpecialAbsoluteFailure(makeMomentumBook(30)); // 30 normal + 1 SPECIAL = 31
    prepare(book, scope);
    const specialWeight = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SPECIAL', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(specialWeight).toBe(0);
    // screen() reports the whole-book decision (breadth cleared ⇒ 'ranked' for every symbol); the
    // per-name exclusion is asserted via entry(), matching halal-risk-parity-core's convention.
    const specialScreen = halalMomentumRiskParityCoreSetup.screen(ctx('SPECIAL', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(specialScreen.matched).toBe(true);
    const specialEntry = halalMomentumRiskParityCoreSetup.entry(ctx('SPECIAL', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    // The book itself still clears breadth (30 uptrend names → 15 selected), so SPECIAL's exclusion
    // is attributable ONLY to the absolute filter, not to a whole-book cash month.
    expect(specialEntry.matched).toBe(false);
    expect(specialEntry.reasons).toContain('not_selected_this_month');
    const lowVolWeight = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(lowVolWeight).toBeGreaterThan(0);
  });

  it('selects the top selectionFraction by relative rank and assigns positive, capped inverse-vol weights (lowest-index = highest relative AND lowest vol)', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope); // selectionFraction 0.5 → top 20 (SYM000..SYM019) selected
    const weights = Array.from({ length: 40 }, (_, s) => {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      return { symbol, s, weight: halalMomentumRiskParityCoreSetup.targetWeight!(ctx(symbol, MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1) };
    });
    const selected = weights.filter((w) => w.weight! > 0);
    const unselected = weights.filter((w) => w.weight === 0);
    expect(selected.length).toBeGreaterThanOrEqual(15); // breadth floor cleared
    expect(selected.every((w) => w.s <= 19)).toBe(true); // exactly the top (lowest-index) half
    expect(unselected.every((w) => w.s >= 20)).toBe(true);
    const sym000 = weights.find((w) => w.symbol === 'SYM000')!.weight!;
    const sym019 = weights.find((w) => w.symbol === 'SYM019')!.weight!;
    expect(sym000).toBeGreaterThanOrEqual(sym019); // lowest-vol selected name gets ≥ weight
    expect(sym000).toBeLessThanOrEqual(HALAL_MOMENTUM_RISK_PARITY_CORE_V1.perNameCap + 1e-9); // cap enforced
    const sum = weights.reduce((a, w) => a + (w.weight ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9); // the shared engine throws otherwise
  });

  it('holds (null) between month-ends', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const midMonth = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM000', midMonth, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1)).toBeNull();
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const first = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM003', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    const second = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM003', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeMomentumBook(40), otherScope);
    const third = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM003', MONTH_END, otherScope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed)', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const center = halalMomentumRiskParityCoreSetup.targetWeight!(ctx('SYM000', MONTH_END, scope), HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    // A tighter selectionFraction shrinks (or leaves unchanged, never grows) the selected set, so
    // SYM000 (always top-ranked) stays selected and its cap-bound weight cannot exceed the center's.
    const neighbor = halalMomentumRiskParityCoreSetup.targetWeight!(
      ctx('SYM000', MONTH_END, scope),
      { ...HALAL_MOMENTUM_RISK_PARITY_CORE_V1, selectionFraction: 0.4 },
    );
    expect(center).toBeGreaterThan(0);
    expect(neighbor).not.toBeNull();
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params', () => {
    const neighborhood = halalMomentumRiskParityCoreSetup.plateauNeighborhood!(HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(neighborhood.axes).toEqual(['lookbackBars', 'selectionFraction']);
    expect(neighborhood.center).toEqual(HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 60-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-momentum-risk-parity-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-momentum-risk-parity-core', undefined)).toEqual(halalMomentumRiskParityCoreBookPolicy());
    expect(halalMomentumRiskParityCoreBookPolicy().maxOpenPositions).toBe(60);
    expect(validationTrialsForSetup('halal-momentum-risk-parity-core', HALAL_MOMENTUM_RISK_PARITY_CORE_V1)).toBe(9);
  });
});
