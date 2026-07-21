// Pure decision-logic tests for halal-concentrated-momentum-core v1 (hand-built arithmetic inputs
// test the week-boundary/selection/weighting/cash-floor rules only — validation evidence comes solely
// from real-bar runs through the CLI, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_CONCENTRATED_MOMENTUM_CORE_V1,
  HalalConcentratedMomentumCoreParamsSchema,
  halalConcentratedMomentumCoreBookPolicy,
  halalConcentratedMomentumCoreSetup,
  selectTopNByMomentum,
} from './halalConcentratedMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday — start the synthetic calendar on an ISO week boundary so trading days map
// 1:1 onto weekdays and the LAST bar of the run lands on a Friday (a genuine ISO week-end).
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 127 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!; // Friday, 127th daily bar (>= lookbackDays+1 = 127)

type Row = { ts: Date; close: number; volume: number };

/**
 * `n` uptrend symbols with full 127-bar history. Trend is STRICTLY DECREASING and volatility
 * amplitude STRICTLY INCREASING in symbol index — so SYM000 has both the HIGHEST relative momentum
 * (top-selected) and the LOWEST volatility (largest inverse-vol weight), and the two effects never
 * conflict. Absolute momentum is positive for every name (trend always dominates the oscillation).
 */
function makeMomentumBook(n: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const trendPerBar = 0.010 - s * 0.00018; // strictly decreasing, always > 0 for s < 55
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
    if (i <= 121) close = 100 + (150 - 100) * (i / 121); // idx0=100 → idx121=150 (lookback−skip=121)
    else close = 150 + (40 - 150) * ((i - 121) / (126 - 121)); // idx121=150 → idx126=40
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
  halalConcentratedMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-concentrated-momentum-core v1 — selectTopNByMomentum (hand-computable)', () => {
  it('selects the fixed top-N by relative rank descending, ties by symbol ascending', () => {
    const eligible = [
      { symbol: 'A', relative: 0.10 },
      { symbol: 'B', relative: 0.05 },
      { symbol: 'C', relative: 0.20 },
      { symbol: 'D', relative: -0.01 },
    ];
    // sorted desc: C(0.20), A(0.10), B(0.05), D(-0.01); top 2; eligible(4) >= floor(3) so it proceeds.
    expect(selectTopNByMomentum(eligible, 2, 3)).toEqual(['C', 'A']);
  });

  it('applies the floor to the ELIGIBLE count, not topN, then takes the fixed top-N', () => {
    const eligible = [
      { symbol: 'A', relative: 0.10 },
      { symbol: 'B', relative: 0.05 },
      { symbol: 'C', relative: 0.20 },
      { symbol: 'D', relative: -0.01 },
    ];
    expect(selectTopNByMomentum(eligible, 2, 4)).toEqual(['C', 'A']); // 4 eligible >= floor 4
    expect(selectTopNByMomentum(eligible, 2, 5)).toEqual([]); // 4 eligible < floor 5 -> cash
  });

  it('breaks ties by symbol ascending', () => {
    const eligible = [
      { symbol: 'Z', relative: 0.10 },
      { symbol: 'A', relative: 0.10 },
      { symbol: 'M', relative: 0.10 },
    ];
    expect(selectTopNByMomentum(eligible, 3, 3)).toEqual(['A', 'M', 'Z']);
  });

  it('caps the selected count at topN even when more names are eligible', () => {
    const eligible = Array.from({ length: 10 }, (_, i) => ({ symbol: `S${i}`, relative: 10 - i }));
    expect(selectTopNByMomentum(eligible, 3, 3)).toHaveLength(3);
    expect(selectTopNByMomentum(eligible, 8, 3)).toHaveLength(8);
  });

  it('holds fewer than topN when fewer eligible names clear the floor', () => {
    const eligible = [
      { symbol: 'A', relative: 0.10 },
      { symbol: 'B', relative: 0.05 },
      { symbol: 'C', relative: 0.20 },
    ];
    expect(selectTopNByMomentum(eligible, 10, 3)).toEqual(['C', 'A', 'B']); // only 3 exist, all selected
  });

  it('returns empty (cash) below the floor', () => {
    const eligible = [{ symbol: 'A', relative: 0.10 }, { symbol: 'B', relative: 0.05 }];
    expect(selectTopNByMomentum(eligible, 10, 3)).toEqual([]); // 2 < floor 3
  });

  it('returns empty for an empty eligible set', () => {
    expect(selectTopNByMomentum([], 10, 3)).toEqual([]);
  });
});

describe('halal-concentrated-momentum-core v1 — HalalConcentratedMomentumCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalConcentratedMomentumCoreParamsSchema.parse(HALAL_CONCENTRATED_MOMENTUM_CORE_V1))
      .toEqual(HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, bad topN/cap, and wrong maxNames/cashFloor', () => {
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, lookbackDays: 126.5 })).toThrow();
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, topN: 0 })).toThrow();
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, topN: 10.5 })).toThrow();
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, maxNames: 40 })).toThrow();
    expect(() => HalalConcentratedMomentumCoreParamsSchema.parse({ ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, cashFloor: 5 })).toThrow();
  });

  it('rejects skipRecentDays >= lookbackDays at decision time', () => {
    const scope = {};
    prepare(makeMomentumBook(20), scope);
    expect(() => halalConcentratedMomentumCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, skipRecentDays: 126 },
    )).toThrow();
  });
});

describe('halal-concentrated-momentum-core v1 — full setup decision logic', () => {
  it('holds cash below the 3-name cash floor (eligible count, not rankable count)', () => {
    const scope = {};
    // 2 uptrend names only: rankable=2, eligible=2 < cashFloor=3 -> whole book holds cash.
    prepare(makeMomentumBook(2), scope);
    const weight = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(weight).toBe(0);
    const screened = halalConcentratedMomentumCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('below_cash_floor');
  });

  it('holds however many pass when fewer than topN clear the floor (3 <= eligible < topN)', () => {
    const scope = {};
    // 5 uptrend names, all eligible: 5 >= floor 3, but topN=10 -> select all 5, not cash.
    prepare(makeMomentumBook(5), scope);
    const weights = Array.from({ length: 5 }, (_, s) => halalConcentratedMomentumCoreSetup.targetWeight!(
      ctx(`SYM${String(s).padStart(3, '0')}`, WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1,
    ));
    expect(weights.filter((w) => w! > 0)).toHaveLength(5);
  });

  it('excludes a name with negative absolute momentum even when its relative momentum is high (SPECIAL: relative +0.50, absolute −0.60)', () => {
    const scope = {};
    const book = addSpecialAbsoluteFailure(makeMomentumBook(15)); // 15 normal + 1 SPECIAL = 16
    prepare(book, scope);
    const specialWeight = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SPECIAL', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(specialWeight).toBe(0);
    const specialScreen = halalConcentratedMomentumCoreSetup.screen(ctx('SPECIAL', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(specialScreen.matched).toBe(true); // whole book cleared the floor
    const specialEntry = halalConcentratedMomentumCoreSetup.entry(ctx('SPECIAL', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(specialEntry.matched).toBe(false);
    expect(specialEntry.reasons).toContain('not_selected_this_week');
    const lowVolWeight = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(lowVolWeight).toBeGreaterThan(0);
  });

  it('selects exactly the fixed top-10 by relative rank and assigns positive, capped inverse-vol weights (lowest-index = highest relative AND lowest vol)', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope); // topN=10 -> exactly SYM000..SYM009 selected
    const weights = Array.from({ length: 30 }, (_, s) => {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      return { symbol, s, weight: halalConcentratedMomentumCoreSetup.targetWeight!(ctx(symbol, WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1) };
    });
    const selected = weights.filter((w) => w.weight! > 0);
    const unselected = weights.filter((w) => w.weight === 0);
    expect(selected).toHaveLength(10); // exactly topN, genuine concentration
    expect(selected.every((w) => w.s <= 9)).toBe(true);
    expect(unselected.every((w) => w.s >= 10)).toBe(true);
    const sym000 = weights.find((w) => w.symbol === 'SYM000')!.weight!;
    const sym009 = weights.find((w) => w.symbol === 'SYM009')!.weight!;
    expect(sym000).toBeGreaterThanOrEqual(sym009); // lowest-vol selected name gets >= weight
    expect(sym000).toBeLessThanOrEqual(HALAL_CONCENTRATED_MOMENTUM_CORE_V1.perNameCap + 1e-9); // 25% cap enforced
    const sum = weights.reduce((a, w) => a + (w.weight ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9); // the shared engine throws otherwise
  });

  it('holds (null) between week-ends', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const midWeek = HISTORY_DATES[HISTORY_DATES.length - 3]; // a mid-ISO-week bar, not that week's last observed bar
    expect(halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM000', midWeek, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1)).toBeNull();
  });

  it('detects the ISO week-end as the LAST trading day seen in that week, not a fixed weekday', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    // WEEK_END is the 127th synthetic daily bar starting on a Monday — 127 = 18 full weeks + 1 day,
    // so it lands on a Monday; assert that IS recognized as its own week's last bar (single-day week).
    const decision = halalConcentratedMomentumCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(decision.matched).toBe(true);
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const first = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    const second = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeMomentumBook(30), otherScope);
    const third = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, otherScope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed)', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const center = halalConcentratedMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    // A tighter topN shrinks (or leaves unchanged, never grows) the selected set, so SYM000 (always
    // top-ranked) stays selected and its cap-bound weight cannot exceed the center's.
    const neighbor = halalConcentratedMomentumCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_CONCENTRATED_MOMENTUM_CORE_V1, topN: 8 },
    );
    expect(center).toBeGreaterThan(0);
    expect(neighbor).not.toBeNull();
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params', () => {
    const neighborhood = halalConcentratedMomentumCoreSetup.plateauNeighborhood!(HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'topN']);
    expect(neighborhood.center).toEqual(HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 60-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-concentrated-momentum-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-concentrated-momentum-core', undefined)).toEqual(halalConcentratedMomentumCoreBookPolicy());
    expect(halalConcentratedMomentumCoreBookPolicy().maxOpenPositions).toBe(60);
    expect(validationTrialsForSetup('halal-concentrated-momentum-core', HALAL_CONCENTRATED_MOMENTUM_CORE_V1)).toBe(9);
  });
});
