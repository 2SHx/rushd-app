// Pure decision-logic tests for halal-fast-momentum-core v1 (hand-built arithmetic inputs test the
// week-boundary/selection/weighting/cash-floor rules only — validation evidence comes solely from
// real-bar runs through the CLI, per docs/STRATEGY_LAB.md). Mirrors
// halalConcentratedMomentumCore.test.ts's structure exactly, retuned for the faster/tighter params
// (lookbackDays 63, skipRecentDays 2, topN 5, cashFloor 2) this isolated A/B changes.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_FAST_MOMENTUM_CORE_V1,
  HalalFastMomentumCoreParamsSchema,
  halalFastMomentumCoreBookPolicy,
  halalFastMomentumCoreSetup,
  selectTopNByMomentum,
} from './halalFastMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday — start the synthetic calendar on an ISO week boundary so trading days map
// 1:1 onto weekdays; the LAST bar of the run is guaranteed to be its own ISO week's max timestamp
// regardless of which weekday it lands on (it is chronologically last by construction).
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 64 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!; // 64th daily bar (>= lookbackDays+1 = 64)

type Row = { ts: Date; close: number; volume: number };

/**
 * `n` uptrend symbols with full 64-bar history. Trend is STRICTLY DECREASING and volatility
 * amplitude STRICTLY INCREASING in symbol index — so SYM000 has both the HIGHEST relative momentum
 * (top-selected) and the LOWEST volatility (largest inverse-vol weight), and the two effects never
 * conflict. Absolute momentum is positive for every name (trend always dominates the oscillation).
 */
function makeMomentumBook(n: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const trendPerBar = 0.014 - s * 0.00022; // strictly decreasing, always > 0 for s < 63
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
 * lookbackDays=63, skipRecentDays=2 ⇒ lookback−skip = 61 (rise segment), then 61→63 (crash segment).
 */
function addSpecialAbsoluteFailure(input: UniversePrepareInput): UniversePrepareInput {
  const rows: Row[] = HISTORY_DATES.map((ts, i) => {
    let close: number;
    if (i <= 61) close = 100 + (150 - 100) * (i / 61); // idx0=100 → idx61=150 (lookback−skip=61)
    else close = 150 + (40 - 150) * ((i - 61) / (63 - 61)); // idx61=150 → idx63=40
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
  halalFastMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-fast-momentum-core v1 — selectTopNByMomentum (hand-computable, generic pure function)', () => {
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

describe('halal-fast-momentum-core v1 — HalalFastMomentumCoreParamsSchema', () => {
  it('accepts the frozen default params (lookbackDays 63 / skipRecentDays 2 / topN 5 / cashFloor 2)', () => {
    expect(HalalFastMomentumCoreParamsSchema.parse(HALAL_FAST_MOMENTUM_CORE_V1))
      .toEqual(HALAL_FAST_MOMENTUM_CORE_V1);
    expect(HALAL_FAST_MOMENTUM_CORE_V1.lookbackDays).toBe(63);
    expect(HALAL_FAST_MOMENTUM_CORE_V1.skipRecentDays).toBe(2);
    expect(HALAL_FAST_MOMENTUM_CORE_V1.topN).toBe(5);
    expect(HALAL_FAST_MOMENTUM_CORE_V1.cashFloor).toBe(2);
  });

  it('rejects a wrong version, non-integer lookback, bad topN/cap, and wrong maxNames/cashFloor', () => {
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, lookbackDays: 63.5 })).toThrow();
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, topN: 0 })).toThrow();
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, topN: 5.5 })).toThrow();
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, maxNames: 40 })).toThrow();
    expect(() => HalalFastMomentumCoreParamsSchema.parse({ ...HALAL_FAST_MOMENTUM_CORE_V1, cashFloor: 3 })).toThrow();
  });

  it('rejects skipRecentDays >= lookbackDays at decision time', () => {
    const scope = {};
    prepare(makeMomentumBook(20), scope);
    expect(() => halalFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_FAST_MOMENTUM_CORE_V1, skipRecentDays: 63 },
    )).toThrow();
  });
});

describe('halal-fast-momentum-core v1 — full setup decision logic', () => {
  it('holds cash below the 2-name cash floor (eligible count, not rankable count)', () => {
    const scope = {};
    // 1 uptrend name only: rankable=1, eligible=1 < cashFloor=2 -> whole book holds cash.
    prepare(makeMomentumBook(1), scope);
    const weight = halalFastMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(weight).toBe(0);
    const screened = halalFastMomentumCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('below_cash_floor');
  });

  it('holds however many pass when fewer than topN clear the floor (2 <= eligible < topN)', () => {
    const scope = {};
    // 3 uptrend names, all eligible: 3 >= floor 2, but topN=5 -> select all 3, not cash.
    prepare(makeMomentumBook(3), scope);
    const weights = Array.from({ length: 3 }, (_, s) => halalFastMomentumCoreSetup.targetWeight!(
      ctx(`SYM${String(s).padStart(3, '0')}`, WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1,
    ));
    expect(weights.filter((w) => w! > 0)).toHaveLength(3);
  });

  it('excludes a name with negative absolute momentum even when its relative momentum is high (SPECIAL: relative +0.50, absolute −0.60)', () => {
    const scope = {};
    const book = addSpecialAbsoluteFailure(makeMomentumBook(15)); // 15 normal + 1 SPECIAL = 16
    prepare(book, scope);
    const specialWeight = halalFastMomentumCoreSetup.targetWeight!(ctx('SPECIAL', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(specialWeight).toBe(0);
    const specialScreen = halalFastMomentumCoreSetup.screen(ctx('SPECIAL', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(specialScreen.matched).toBe(true); // whole book cleared the floor
    const specialEntry = halalFastMomentumCoreSetup.entry(ctx('SPECIAL', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(specialEntry.matched).toBe(false);
    expect(specialEntry.reasons).toContain('not_selected_this_week');
    const lowVolWeight = halalFastMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(lowVolWeight).toBeGreaterThan(0);
  });

  it('selects exactly the fixed top-5 by relative rank and assigns positive, capped inverse-vol weights (lowest-index = highest relative AND lowest vol)', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope); // topN=5 -> exactly SYM000..SYM004 selected
    const weights = Array.from({ length: 30 }, (_, s) => {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      return { symbol, s, weight: halalFastMomentumCoreSetup.targetWeight!(ctx(symbol, WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1) };
    });
    const selected = weights.filter((w) => w.weight! > 0);
    const unselected = weights.filter((w) => w.weight === 0);
    expect(selected).toHaveLength(5); // exactly topN, genuine concentration
    expect(selected.every((w) => w.s <= 4)).toBe(true);
    expect(unselected.every((w) => w.s >= 5)).toBe(true);
    const sym000 = weights.find((w) => w.symbol === 'SYM000')!.weight!;
    const sym004 = weights.find((w) => w.symbol === 'SYM004')!.weight!;
    expect(sym000).toBeGreaterThanOrEqual(sym004); // lowest-vol selected name gets >= weight
    expect(sym000).toBeLessThanOrEqual(HALAL_FAST_MOMENTUM_CORE_V1.perNameCap + 1e-9); // 25% cap enforced
    const sum = weights.reduce((a, w) => a + (w.weight ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9); // the shared engine throws otherwise
  });

  it('holds (null) between week-ends', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const midWeek = HISTORY_DATES[HISTORY_DATES.length - 3]; // a mid-ISO-week bar, not that week's last observed bar
    expect(halalFastMomentumCoreSetup.targetWeight!(ctx('SYM000', midWeek, scope), HALAL_FAST_MOMENTUM_CORE_V1)).toBeNull();
  });

  it('detects the ISO week-end as the LAST trading day seen in that week, not a fixed weekday', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const decision = halalFastMomentumCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(decision.matched).toBe(true);
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const first = halalFastMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    const second = halalFastMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeMomentumBook(30), otherScope);
    const third = halalFastMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, otherScope), HALAL_FAST_MOMENTUM_CORE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed)', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const center = halalFastMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1);
    // A tighter topN shrinks (or leaves unchanged, never grows) the selected set, so SYM000 (always
    // top-ranked) stays selected and its cap-bound weight cannot exceed the center's.
    const neighbor = halalFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_FAST_MOMENTUM_CORE_V1, topN: 4 },
    );
    expect(center).toBeGreaterThan(0);
    expect(neighbor).not.toBeNull();
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params ({42,63,84}×{4,5,6})', () => {
    const neighborhood = halalFastMomentumCoreSetup.plateauNeighborhood!(HALAL_FAST_MOMENTUM_CORE_V1);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'topN']);
    expect(neighborhood.center).toEqual(HALAL_FAST_MOMENTUM_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
    const labels = neighborhood.neighbors.map((n) => n.label).sort();
    expect(labels).toContain('lookbackDays=42|topN=4');
    expect(labels).toContain('lookbackDays=84|topN=6');
    expect(labels).not.toContain('lookbackDays=63|topN=5'); // center excluded
  });

  it('is registered: shared route, 60-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-fast-momentum-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-fast-momentum-core', undefined)).toEqual(halalFastMomentumCoreBookPolicy());
    expect(halalFastMomentumCoreBookPolicy().maxOpenPositions).toBe(60);
    expect(validationTrialsForSetup('halal-fast-momentum-core', HALAL_FAST_MOMENTUM_CORE_V1)).toBe(9);
  });
});
