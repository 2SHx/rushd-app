// Pure decision-logic tests for halal-managed-momentum-core v1 (hand-built arithmetic inputs test the
// week-boundary/regime-gate/selection/weighting/cash-floor rules only — validation evidence comes
// solely from real-bar runs through the CLI, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_MANAGED_MOMENTUM_CORE_V1,
  HalalManagedMomentumCoreParamsSchema,
  halalManagedMomentumCoreBookPolicy,
  halalManagedMomentumCoreSetup,
  managedMomentumRegimeVerdict,
  selectTopNByMomentum,
} from './halalManagedMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday — start every synthetic calendar on an ISO week boundary so the LAST bar of
// a given fixture's history lands on a genuine ISO week-end (mirrors halal-concentrated-momentum-core's
// own WEEK_END convention: the week-end recognized by the engine is the last bar seen for its ISO week
// among the PROVIDED history, not a fixed weekday).
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 127 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!; // Friday, 127th daily bar (>= lookbackDays+1 = 127)

type Row = { ts: Date; close: number; volume: number };

/**
 * `n` uptrend symbols with full 127-bar history. Trend is STRICTLY DECREASING and volatility
 * amplitude STRICTLY INCREASING in symbol index — so SYM000 has both the HIGHEST relative momentum
 * (top-selected) and the LOWEST volatility (largest inverse-vol weight), and the two effects never
 * conflict. Absolute momentum is positive for every name (trend always dominates the oscillation).
 * `regimeSmaPeriod` is overridden to 60 (≤127 bars available) in every test using this fixture — the
 * default 200 needs more history than this fixture provides, and is irrelevant to what these tests
 * check (fixed top-N selection/sizing/absolute filter/cash floor, not the regime gate itself).
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

const HALAL_MOMENTUM_TEST_DEFAULTS = { ...HALAL_MANAGED_MOMENTUM_CORE_V1, regimeSmaPeriod: 60 };

/**
 * Hand-computable equal-weight-index fixture for the regime gate: TWO identical-path symbols so the
 * equal-weight index equals the shared path's own cumulative level (mean-of-identical-returns = that
 * return). Level chains from 100 at +10%/day for 8 days, then a −50% crash on the final day:
 *   L0=100, L1=110, L2=121, L3=133.1, L4=146.41, L5=161.051, L6=177.1561, L7=194.87171,
 *   L8=214.358881, L9=107.1794405 (the crash).
 * With regimeSmaPeriod=3: at day4, SMA(L2,L3,L4)=133.5033 < L4=146.41 ⇒ BULL. At day9,
 * SMA(L7,L8,L9)=172.1367 > L9=107.1794 ⇒ BEAR. Both values are exact base-10 arithmetic, verifiable
 * by hand or calculator. `days` truncates the returns sequence so the LAST bar of the returned fixture
 * is always the dataset's only week-end candidate at that day (isolates the BULL/BEAR checkpoint from
 * any later day in the same ISO week that would otherwise become the recognized week-end instead).
 */
const REGIME_RETURNS = [0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, 0.10, -0.50];
const REGIME_SYMBOLS = ['REG_A', 'REG_B', 'REG_C']; // 3 identical-mean-path names — cashFloor stays
// the frozen literal 3 (byte-identical to the concentrated baseline), so exactly 3 eligible names is
// the smallest fixture that can ever clear the floor and reach the regime-gated selection step.
// Days 1–4 (the lookbackDays=3/skip=1 momentum window under test at the BULL checkpoint) carry a
// small per-symbol epsilon that SUMS TO ZERO across the 3 symbols every day — the EQUAL-WEIGHT INDEX
// mean return, and therefore its level, is untouched (stays the exact hand-computed round numbers
// used in the regimeVerdict tests above), while each symbol's OWN trailing return series is non-
// constant, so per-name inverse-vol sizing has a genuine (nonzero) volatility to divide by.
const REGIME_EPS: Record<string, number[]> = {
  REG_A: [0.002, -0.001, -0.001, 0.001],
  REG_B: [-0.001, 0.002, -0.001, 0.001],
  REG_C: [-0.001, -0.001, 0.002, -0.002],
};
function makeRegimeBook(days: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (const symbol of REGIME_SYMBOLS) {
    let price = 100;
    const rows: Row[] = Array.from({ length: days }, (_, i) => {
      if (i > 0) {
        const eps = i <= 4 ? REGIME_EPS[symbol][i - 1] : 0;
        price *= 1 + REGIME_RETURNS[i - 1] + eps;
      }
      return { ts: HISTORY_DATES[i], close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  }
  return { symbols: REGIME_SYMBOLS, closesBySymbol: new Map(), dailyBarsBySymbol };
}
const REGIME_TEST_PARAMS = {
  ...HALAL_MANAGED_MOMENTUM_CORE_V1,
  lookbackDays: 3,
  skipRecentDays: 1,
  topN: 3,
  perNameCap: 0.4,
  regimeSmaPeriod: 3,
};

function ctx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(0), replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

function prepare(input: UniversePrepareInput, scope: object): void {
  halalManagedMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-managed-momentum-core v1 — selectTopNByMomentum (hand-computable, identical to the concentrated baseline)', () => {
  it('selects the fixed top-N by relative rank descending, ties by symbol ascending', () => {
    const eligible = [
      { symbol: 'A', relative: 0.10 },
      { symbol: 'B', relative: 0.05 },
      { symbol: 'C', relative: 0.20 },
      { symbol: 'D', relative: -0.01 },
    ];
    expect(selectTopNByMomentum(eligible, 2, 3)).toEqual(['C', 'A']);
  });

  it('returns empty (cash) below the floor', () => {
    const eligible = [{ symbol: 'A', relative: 0.10 }, { symbol: 'B', relative: 0.05 }];
    expect(selectTopNByMomentum(eligible, 10, 3)).toEqual([]);
  });
});

describe('halal-managed-momentum-core v1 — HalalManagedMomentumCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalManagedMomentumCoreParamsSchema.parse(HALAL_MANAGED_MOMENTUM_CORE_V1))
      .toEqual(HALAL_MANAGED_MOMENTUM_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, bad topN/cap, wrong maxNames, and wrong frozen governor literals', () => {
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, lookbackDays: 126.5 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, topN: 0 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, perNameCap: 1.5 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, maxNames: 40 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, cashFloor: 5 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, realizedVolLookback: 30 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, drawdownStartFraction: 0.10 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, drawdownCashFraction: 0.40 })).toThrow();
    expect(() => HalalManagedMomentumCoreParamsSchema.parse({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, regimeSmaPeriod: -1 })).toThrow();
  });

  it('rejects skipRecentDays >= lookbackDays at decision time', () => {
    const scope = {};
    prepare(makeMomentumBook(20), scope);
    expect(() => halalManagedMomentumCoreSetup.targetWeight!(
      ctx('SYM000', WEEK_END, scope),
      { ...HALAL_MOMENTUM_TEST_DEFAULTS, skipRecentDays: 126 },
    )).toThrow();
  });
});

describe('halal-managed-momentum-core v1 — governor policy fields (StrategyBookPolicy)', () => {
  it('declares vol-targeting + drawdown-governor fields with the pre-registered frozen values', () => {
    const policy = halalManagedMomentumCoreBookPolicy();
    expect(policy).toEqual({
      realizedVolLookback: 60,
      targetAnnualVol: 0.20,
      maxGrossFraction: 1,
      maxOpenPositions: 60,
      drawdownStartFraction: 0.15,
      drawdownCashFraction: 0.35,
      decisionHistoryBars: 131,
    });
  });

  it('a plateau-neighbor targetAnnualVol flows through into the policy (engine reads it per param set)', () => {
    const neighborPolicy = halalManagedMomentumCoreBookPolicy({ ...HALAL_MANAGED_MOMENTUM_CORE_V1, targetAnnualVol: 0.25 });
    expect(neighborPolicy.targetAnnualVol).toBe(0.25);
    // Down-only governors are frozen, never swept:
    expect(neighborPolicy.drawdownStartFraction).toBe(0.15);
    expect(neighborPolicy.drawdownCashFraction).toBe(0.35);
  });
});

describe('halal-managed-momentum-core v1 — managedMomentumRegimeVerdict (hand-computable)', () => {
  it('reads BULL at the compounding-uptrend checkpoint (day4, SMA3=133.5033 < level=146.41)', () => {
    const scope = {};
    prepare(makeRegimeBook(5), scope);
    // Recover the state's regime index indirectly via the exported verdict function using a fresh
    // hand-built index of the SAME arithmetic (documents the exact numbers independently of internals).
    const verdict = managedMomentumRegimeVerdict(
      [100, 110, 121, 133.1, 146.41].map((level, i) => ({ ts: HISTORY_DATES[i].getTime(), level })),
      HISTORY_DATES[4].getTime(),
      3,
    );
    expect(verdict.state).toBe('bull');
    expect(verdict.level).toBeCloseTo(146.41, 6);
    expect(verdict.sma).toBeCloseTo(133.50333333, 6);
  });

  it('reads BEAR at the crash checkpoint (day9, SMA3=172.1367 > level=107.1794)', () => {
    const levels = [100, 110, 121, 133.1, 146.41, 161.051, 177.1561, 194.87171, 214.358881, 107.1794405];
    const verdict = managedMomentumRegimeVerdict(
      levels.map((level, i) => ({ ts: HISTORY_DATES[i].getTime(), level })),
      HISTORY_DATES[9].getTime(),
      3,
    );
    expect(verdict.state).toBe('bear');
    expect(verdict.level).toBeCloseTo(107.1794405, 4);
    expect(verdict.sma).toBeCloseTo(172.13667017, 4);
  });

  it('reads insufficient before enough index points have accumulated', () => {
    const verdict = managedMomentumRegimeVerdict(
      [100, 110].map((level, i) => ({ ts: HISTORY_DATES[i].getTime(), level })),
      HISTORY_DATES[1].getTime(),
      3,
    );
    expect(verdict.state).toBe('insufficient');
  });
});

describe('halal-managed-momentum-core v1 — regime gate wired into the full setup (hold-cash on bear, select on bull)', () => {
  it('BULL week-end (day4): normal top-N selection proceeds, all eligible names get positive weight', () => {
    const scope = {};
    prepare(makeRegimeBook(5), scope);
    for (const symbol of REGIME_SYMBOLS) {
      const weight = halalManagedMomentumCoreSetup.targetWeight!(ctx(symbol, HISTORY_DATES[4], scope), REGIME_TEST_PARAMS);
      expect(weight).toBeGreaterThan(0);
    }
    const screened = halalManagedMomentumCoreSetup.screen(ctx('REG_A', HISTORY_DATES[4], scope), REGIME_TEST_PARAMS);
    expect(screened.matched).toBe(true);
  });

  it('BEAR week-end (day9): regime gate holds cash — selection is never even attempted', () => {
    const scope = {};
    prepare(makeRegimeBook(10), scope);
    for (const symbol of REGIME_SYMBOLS) {
      const weight = halalManagedMomentumCoreSetup.targetWeight!(ctx(symbol, HISTORY_DATES[9], scope), REGIME_TEST_PARAMS);
      expect(weight).toBe(0);
    }
    const screened = halalManagedMomentumCoreSetup.screen(ctx('REG_A', HISTORY_DATES[9], scope), REGIME_TEST_PARAMS);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('regime_bearish');
    const evidenceLevel = screened.evidence.find((e) => e.ref === 'regime_index_level')!.value;
    const evidenceSma = screened.evidence.find((e) => e.ref === 'regime_index_sma')!.value;
    expect(Number(evidenceLevel)).toBeCloseTo(107.1794, 3);
    expect(Number(evidenceSma)).toBeCloseTo(172.1367, 3);
  });
});

describe('halal-managed-momentum-core v1 — full setup decision logic (byte-identical selection/sizing to the concentrated baseline)', () => {
  it('holds cash below the 3-name cash floor (eligible count, not rankable count)', () => {
    const scope = {};
    prepare(makeMomentumBook(2), scope);
    const weight = halalManagedMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(weight).toBe(0);
    const screened = halalManagedMomentumCoreSetup.screen(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('below_cash_floor');
  });

  it('excludes a name with negative absolute momentum even when its relative momentum is high (SPECIAL: relative +0.50, absolute −0.60)', () => {
    const scope = {};
    const book = addSpecialAbsoluteFailure(makeMomentumBook(15));
    prepare(book, scope);
    const specialWeight = halalManagedMomentumCoreSetup.targetWeight!(ctx('SPECIAL', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(specialWeight).toBe(0);
    const specialEntry = halalManagedMomentumCoreSetup.entry(ctx('SPECIAL', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(specialEntry.matched).toBe(false);
    expect(specialEntry.reasons).toContain('not_selected_this_week');
    const lowVolWeight = halalManagedMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(lowVolWeight).toBeGreaterThan(0);
  });

  it('selects exactly the fixed top-10 by relative rank and assigns positive, capped inverse-vol weights', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope); // topN=10 -> exactly SYM000..SYM009 selected
    const weights = Array.from({ length: 30 }, (_, s) => {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      return { symbol, s, weight: halalManagedMomentumCoreSetup.targetWeight!(ctx(symbol, WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS) };
    });
    const selected = weights.filter((w) => w.weight! > 0);
    const unselected = weights.filter((w) => w.weight === 0);
    expect(selected).toHaveLength(10);
    expect(selected.every((w) => w.s <= 9)).toBe(true);
    expect(unselected.every((w) => w.s >= 10)).toBe(true);
    const sym000 = weights.find((w) => w.symbol === 'SYM000')!.weight!;
    const sym009 = weights.find((w) => w.symbol === 'SYM009')!.weight!;
    expect(sym000).toBeGreaterThanOrEqual(sym009);
    expect(sym000).toBeLessThanOrEqual(HALAL_MANAGED_MOMENTUM_CORE_V1.perNameCap + 1e-9);
    const sum = weights.reduce((a, w) => a + (w.weight ?? 0), 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('holds (null) between week-ends', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const midWeek = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(halalManagedMomentumCoreSetup.targetWeight!(ctx('SYM000', midWeek, scope), HALAL_MOMENTUM_TEST_DEFAULTS)).toBeNull();
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const first = halalManagedMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    const second = halalManagedMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeMomentumBook(30), otherScope);
    const third = halalManagedMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, otherScope), HALAL_MOMENTUM_TEST_DEFAULTS);
    expect(third).toBe(first);
  });

  it('declares a frozen 3×3 plateau neighborhood (targetAnnualVol × regimeSmaPeriod) centered on the default params', () => {
    const neighborhood = halalManagedMomentumCoreSetup.plateauNeighborhood!(HALAL_MANAGED_MOMENTUM_CORE_V1);
    expect(neighborhood.axes).toEqual(['targetAnnualVol', 'regimeSmaPeriod']);
    expect(neighborhood.center).toEqual(HALAL_MANAGED_MOMENTUM_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
    expect(neighborhood.neighbors.map((n) => n.params.targetAnnualVol).sort()).toEqual(
      [0.15, 0.15, 0.15, 0.20, 0.20, 0.25, 0.25, 0.25].sort(),
    );
    expect(new Set(neighborhood.neighbors.map((n) => n.params.regimeSmaPeriod))).toEqual(new Set([150, 200, 250]));
  });

  it('is registered: shared route, 60-position policy with governors wired, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-managed-momentum-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-managed-momentum-core', undefined)).toEqual(halalManagedMomentumCoreBookPolicy());
    expect(halalManagedMomentumCoreBookPolicy().maxOpenPositions).toBe(60);
    expect(validationTrialsForSetup('halal-managed-momentum-core', HALAL_MANAGED_MOMENTUM_CORE_V1)).toBe(9);
  });
});
