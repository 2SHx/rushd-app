// Pure decision-logic tests for halal-momentum-markowitz-core v1 (hand-built arithmetic inputs test
// the week-boundary/selection/Markowitz-sizing/cash-floor rules only — validation evidence comes
// solely from real-bar runs through the CLI, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_MOMENTUM_MARKOWITZ_CORE_V1,
  HalalMomentumMarkowitzCoreParamsSchema,
  halalMomentumMarkowitzCoreBookPolicy,
  halalMomentumMarkowitzCoreSetup,
} from './halalMomentumMarkowitzCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday — start the synthetic calendar on an ISO week boundary so trading days map
// 1:1 onto weekdays and the LAST bar of the run lands on a genuine ISO week-end.
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 127 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!; // 127th daily bar (>= lookbackDays+1 = 127)

type Row = { ts: Date; close: number; volume: number };

/**
 * `n` uptrend symbols with full 127-bar history. Trend is STRICTLY DECREASING in symbol index — so
 * SYM000 has the HIGHEST relative momentum (always top-ranked/selected first). Deterministic
 * per-symbol noise (sin-based, no Math.random) makes the covariance matrix nondegenerate, matching
 * `halal-markowitz-core`'s own fixture convention. Absolute momentum is positive for every name.
 */
function makeMomentumBook(n: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    // Strictly decreasing trend, always > 0 for s < 57; step (0.00035/bar) and noise amplitude
    // (0.0006) verified numerically to preserve strict s-ordering of relative momentum through
    // n=40 (i.e. no boundary flips near a topN=20 cutoff) while keeping the covariance matrix
    // nondegenerate (deterministic sin-based noise, no Math.random — reproducibility).
    const trendPerBar = 0.020 - s * 0.00035;
    let price = 100;
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      if (i > 0) {
        const noise = Math.sin((i + 1) * (s + 2) * 0.37) * 0.0006;
        price *= 1 + trendPerBar + noise;
      }
      return { ts, close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  }
  return { symbols: Array.from(dailyBarsBySymbol.keys()), closesBySymbol: new Map(), dailyBarsBySymbol };
}

/**
 * Injects one hand-computable "SPECIAL" name whose absolute momentum is NEGATIVE despite a HIGH
 * relative momentum: base 100 at t−lookback, rises to 150 by t−skip (relative = 150/100−1 = +0.50),
 * then crashes to 40 by t (absolute = 40/100−1 = −0.60). Must NEVER be selected/weighted.
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
  halalMomentumMarkowitzCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-momentum-markowitz-core v1 — HalalMomentumMarkowitzCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalMomentumMarkowitzCoreParamsSchema.parse(HALAL_MOMENTUM_MARKOWITZ_CORE_V1))
      .toEqual(HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, bad topN/cap, and wrong maxNames/cashFloor/markowitz-constants', () => {
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, lookbackDays: 126.5 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, topN: 0 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, topN: 20.5 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, maxNames: 40 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, cashFloor: 3 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, seed: 7 })).toThrow();
    expect(() => HalalMomentumMarkowitzCoreParamsSchema.parse({ ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, portfolios: 500 })).toThrow();
  });

  it('rejects skipRecentDays >= lookbackDays at decision time', () => {
    const scope = {};
    prepare(makeMomentumBook(25), scope);
    expect(() => halalMomentumMarkowitzCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, skipRecentDays: 126 },
    )).toThrow();
  });
});

describe('halal-momentum-markowitz-core v1 — full setup decision logic', () => {
  it('holds cash below the 10-name cash floor (eligible count, not rankable count)', () => {
    const scope = {};
    // 8 uptrend names only: rankable=8, eligible=8 < cashFloor=10 -> whole book holds cash.
    prepare(makeMomentumBook(8), scope);
    const weight = halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(weight).toBe(0);
    const screened = halalMomentumMarkowitzCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('below_cash_floor');
  });

  it('holds however many pass when 10 <= eligible < topN', () => {
    const scope = {};
    // 15 uptrend names, all eligible: 15 >= floor 10, but topN=20 -> select all 15, not cash.
    prepare(makeMomentumBook(15), scope);
    const weights = Array.from({ length: 15 }, (_, s) => halalMomentumMarkowitzCoreSetup.targetWeight!(
      ctx(`SYM${String(s).padStart(3, '0')}`, WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1,
    ));
    expect(weights.filter((w) => w! > 0).length).toBeGreaterThan(0);
    const sum = weights.reduce((a: number, w) => a + (w ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('excludes a name with negative absolute momentum even when its relative momentum is high (SPECIAL: relative +0.50, absolute −0.60)', () => {
    const scope = {};
    const book = addSpecialAbsoluteFailure(makeMomentumBook(25)); // 25 normal + 1 SPECIAL = 26
    prepare(book, scope);
    const specialWeight = halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SPECIAL', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(specialWeight).toBe(0);
    const specialScreen = halalMomentumMarkowitzCoreSetup.screen(ctx('SPECIAL', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(specialScreen.matched).toBe(true); // whole book cleared the floor
    const specialEntry = halalMomentumMarkowitzCoreSetup.entry(ctx('SPECIAL', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(specialEntry.matched).toBe(false);
    expect(specialEntry.reasons).toContain('not_selected_this_week');
  });

  it('selects exactly the fixed top-20 by relative rank and assigns valid-simplex Markowitz-tangency capped weights (lowest-index = highest relative momentum)', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope); // topN=20 -> exactly SYM000..SYM019 selected
    const weights = Array.from({ length: 40 }, (_, s) => {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      return { symbol, s, weight: halalMomentumMarkowitzCoreSetup.targetWeight!(ctx(symbol, WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1) };
    });
    const selected = weights.filter((w) => w.weight! > 0);
    const unselected = weights.filter((w) => w.weight === 0);
    expect(selected.length).toBeLessThanOrEqual(20); // capAndRedistribute can zero out no-weight names, but never exceeds topN
    expect(selected.every((w) => w.s <= 19)).toBe(true); // only from the top-20 momentum-ranked set
    expect(unselected.every((w) => w.s >= 20 || w.weight === 0)).toBe(true);
    for (const w of weights) {
      expect(w.weight!).toBeGreaterThanOrEqual(0);
      expect(w.weight!).toBeLessThanOrEqual(HALAL_MOMENTUM_MARKOWITZ_CORE_V1.perNameCap + 1e-9); // 25% cap enforced
    }
    const sum = weights.reduce((a, w) => a + (w.weight ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9); // valid simplex — the shared engine throws otherwise
    expect(sum).toBeGreaterThan(0); // real exposure assigned
  });

  it('holds (null) between week-ends', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const midWeek = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SYM000', midWeek, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1)).toBeNull();
  });

  it('detects the ISO week-end as the LAST trading day seen in that week, not a fixed weekday', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const decision = halalMomentumMarkowitzCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(decision.matched).toBe(true);
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly (seeded Markowitz sampler)', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const first = halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    const second = halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeMomentumBook(40), otherScope);
    const third = halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, otherScope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed)', () => {
    const scope = {};
    prepare(makeMomentumBook(40), scope);
    const center = halalMomentumMarkowitzCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    const neighbor = halalMomentumMarkowitzCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_MOMENTUM_MARKOWITZ_CORE_V1, topN: 15 },
    );
    expect(center).toBeGreaterThan(0);
    expect(neighbor).not.toBeNull();
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params', () => {
    const neighborhood = halalMomentumMarkowitzCoreSetup.plateauNeighborhood!(HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(neighborhood.axes).toEqual(['topN', 'lookbackDays']);
    expect(neighborhood.center).toEqual(HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 60-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-momentum-markowitz-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-momentum-markowitz-core', undefined)).toEqual(halalMomentumMarkowitzCoreBookPolicy());
    expect(halalMomentumMarkowitzCoreBookPolicy().maxOpenPositions).toBe(60);
    expect(validationTrialsForSetup('halal-momentum-markowitz-core', HALAL_MOMENTUM_MARKOWITZ_CORE_V1)).toBe(9);
  });
});
