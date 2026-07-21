// Pure decision-logic tests for halal-trend-rider-core v1 (hand-built arithmetic inputs test the
// entry/exit-mode contract, weekly top-N entry selection, trailing/static-stop exit, momentum-
// breakdown exit, and — the core let-winners-run assertion — that a rising, positive-momentum, above-
// stop winner is NEVER exited. Validation evidence comes solely from real-bar runs through the CLI,
// per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_TREND_RIDER_CORE_V1,
  HalalTrendRiderCoreParamsSchema,
  halalTrendRiderCoreBookPolicy,
  halalTrendRiderCoreSetup,
} from './halalTrendRiderCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday — start the synthetic calendar on an ISO week boundary so the LAST bar of the
// run lands on a genuine ISO week-end (mirrors halal-concentrated-momentum-core's WEEK_END convention).
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 127 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!; // 127th daily bar (>= lookbackDays+1 = 127)

type Row = { ts: Date; close: number; volume: number };

/**
 * `n` pure-compounding uptrend symbols, growth rate STRICTLY DECREASING in symbol index — so SYM000
 * always has both the highest relative AND highest absolute 126d/skip5 momentum, with no oscillation
 * needed (this setup has no volatility-weighting step to exercise, unlike the target-weight siblings).
 */
function makeMomentumBook(n: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const trendPerBar = 0.020 - s * 0.0005; // strictly decreasing, positive through s=39
    let price = 100;
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      if (i > 0) price *= (1 + trendPerBar);
      return { ts, close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  }
  return { symbols: Array.from(dailyBarsBySymbol.keys()), closesBySymbol: new Map(), dailyBarsBySymbol };
}

function entryCtx(symbol: string, asOf: Date, scope: object, positionQty = 0): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(positionQty), replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

function prepare(input: UniversePrepareInput, scope: object): void {
  halalTrendRiderCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

function bar(ts: Date, close: number): IntradayBar {
  return { ts, close: new D(close) } as unknown as IntradayBar;
}

function exitCtx(
  symbol: string,
  asOf: Date,
  bars: readonly IntradayBar[],
  entryPrice: number,
  entryTs: Date,
  scope: object,
): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars, positionQty: new D(1),
    entryPrice: new D(entryPrice), entryTs, entrySignalTs: entryTs, replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

describe('halal-trend-rider-core v1 — entry/exit-mode contract', () => {
  it('does NOT define targetWeight (guards the let-winners-run mechanism)', () => {
    expect(halalTrendRiderCoreSetup.targetWeight).toBeUndefined();
  });
});

describe('halal-trend-rider-core v1 — HalalTrendRiderCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalTrendRiderCoreParamsSchema.parse(HALAL_TREND_RIDER_CORE_V1)).toEqual(HALAL_TREND_RIDER_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, bad stop pcts, and wrong maxNames/validationTrials', () => {
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, version: 'v2' })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, lookbackDays: 126.5 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, maxOpenSlots: 0 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, sizeFraction: 0 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, sizeFraction: 1.5 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, staticStopPct: 0 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, trailingStopPct: 1 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, maxNames: 40 })).toThrow();
    expect(() => HalalTrendRiderCoreParamsSchema.parse({ ...HALAL_TREND_RIDER_CORE_V1, validationTrials: 5 })).toThrow();
  });

  it('rejects skipRecentDays >= lookbackDays at decision time', () => {
    const scope = {};
    prepare(makeMomentumBook(20), scope);
    expect(() => halalTrendRiderCoreSetup.entry(
      entryCtx('SYM000', WEEK_END, scope),
      { ...HALAL_TREND_RIDER_CORE_V1, skipRecentDays: 126 },
    )).toThrow();
  });
});

describe('halal-trend-rider-core v1 — weekly top-N entry selection (hand-computable)', () => {
  it('enters exactly the top maxOpenSlots (10) by relative momentum rank, sized at sizeFraction', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope); // maxOpenSlots=10 -> exactly SYM000..SYM009 selected
    const results = Array.from({ length: 30 }, (_, s) => {
      const symbol = `SYM${String(s).padStart(3, '0')}`;
      return { symbol, s, check: halalTrendRiderCoreSetup.entry(entryCtx(symbol, WEEK_END, scope), HALAL_TREND_RIDER_CORE_V1) };
    });
    const matched = results.filter((r) => r.check.matched);
    expect(matched).toHaveLength(10);
    expect(matched.every((r) => r.s <= 9)).toBe(true);
    expect(matched.every((r) => r.check.sizeFraction === HALAL_TREND_RIDER_CORE_V1.sizeFraction)).toBe(true);
    const unmatched = results.filter((r) => !r.check.matched);
    expect(unmatched.every((r) => r.s >= 10)).toBe(true);
    expect(unmatched.find((r) => r.s === 10)!.check.reasons).toContain('not_ranked_this_week');
  });

  it('never proposes an entry for a symbol already held (screen short-circuits on positionQty > 0)', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const held = halalTrendRiderCoreSetup.entry(entryCtx('SYM000', WEEK_END, scope, 1), HALAL_TREND_RIDER_CORE_V1);
    expect(held.matched).toBe(false);
    expect(held.reasons).toContain('already_held');
  });

  it('holds (no entry) between week-ends', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const midWeek = HISTORY_DATES[HISTORY_DATES.length - 3];
    const check = halalTrendRiderCoreSetup.entry(entryCtx('SYM000', midWeek, scope), HALAL_TREND_RIDER_CORE_V1);
    expect(check.matched).toBe(false);
    expect(check.reasons).toContain('not_week_end');
  });

  it('excludes a name with negative absolute momentum even at a high relative rank', () => {
    const scope = {};
    const book = makeMomentumBook(9); // 9 normal uptrend names
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      let close: number;
      if (i <= 121) close = 100 + (150 - 100) * (i / 121); // rises to 150 by t-skip
      else close = 150 + (40 - 150) * ((i - 121) / (126 - 121)); // crashes to 40 by t
      return { ts, close, volume: 1_000_000 };
    });
    const dailyBarsBySymbol = new Map(book.dailyBarsBySymbol);
    dailyBarsBySymbol.set('SPECIAL', rows);
    prepare({ ...book, symbols: [...book.symbols, 'SPECIAL'], dailyBarsBySymbol }, scope);
    const special = halalTrendRiderCoreSetup.entry(entryCtx('SPECIAL', WEEK_END, scope), HALAL_TREND_RIDER_CORE_V1);
    expect(special.matched).toBe(false);
    expect(special.reasons).toContain('not_ranked_this_week');
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeMomentumBook(30), scope);
    const first = halalTrendRiderCoreSetup.entry(entryCtx('SYM003', WEEK_END, scope), HALAL_TREND_RIDER_CORE_V1);
    const second = halalTrendRiderCoreSetup.entry(entryCtx('SYM003', WEEK_END, scope), HALAL_TREND_RIDER_CORE_V1);
    expect(second.matched).toBe(first.matched);
    expect(second.reasons).toEqual(first.reasons);

    const otherScope = {};
    prepare(makeMomentumBook(30), otherScope);
    const third = halalTrendRiderCoreSetup.entry(entryCtx('SYM003', WEEK_END, otherScope), HALAL_TREND_RIDER_CORE_V1);
    expect(third.matched).toBe(first.matched);
  });
});

describe('halal-trend-rider-core v1 — exit: trailing/static stop (hand-computable)', () => {
  const p = { ...HALAL_TREND_RIDER_CORE_V1, lookbackDays: 5, skipRecentDays: 1 };

  it('fires TRAILING_STOP on a breach, and the incremental peak survives beyond the trailing bars window', () => {
    const scope = {};
    prepare(makeMomentumBook(1), scope); // any valid prepareUniverse call initializes the peak-state map
    const entryTs = HISTORY_DATES[0];
    // Sequence: 100 (entry) -> ... -> 180 (peak, day3) -> gentle pullback/chop -> crash to 100 (day9).
    // By day9 a 6-bar (lookbackDays+1) window no longer contains day3's 180 close — the peak MUST come
    // from this setup's own incremental state, not from re-scanning the (already-truncated) bars window.
    const closes = [100, 120, 150, 180, 170, 172, 174, 176, 178, 100];
    const call = (day: number) => {
      const windowStart = Math.max(0, day - 5); // last 6 bars ending at `day`, mirroring decisionHistoryBars
      const bars = closes.slice(windowStart, day + 1).map((c, k) => bar(HISTORY_DATES[windowStart + k], c));
      return halalTrendRiderCoreSetup.exit(exitCtx('WINNER', HISTORY_DATES[day], bars, 100, entryTs, scope), p);
    };
    // day3: the actual peak day (close=180) — this call is what seeds the incremental peak state to
    // 180 in the first place; still well above the trailing stop (180 > 180*0.80=144) — not exited.
    const atPeak = call(3);
    expect(atPeak.matched).toBe(false);
    // day4: right after the peak, still well above the trailing stop (170 > 180*0.80=144) — not exited.
    const soonAfterPeak = call(4);
    expect(soonAfterPeak.matched).toBe(false);
    // days 5-8: advance the incremental peak state day by day (as the real engine would call exit()
    // every day). Not asserted here — depending on the exact 5-day window alignment, a legitimate
    // momentum-breakdown signal (a DIFFERENT, correctly-designed exit path, tested in isolation below)
    // may also fire on one of these days without affecting what this test verifies: that the TRUE
    // peak (180) is retained in this setup's own state and used correctly on the crash day.
    for (let day = 5; day <= 8; day++) call(day);
    // day9: crash to 100. The 6-bar window here is [170,172,174,176,178,100] — day3's 180 close is
    // NOT visible in it — yet the trailing stop must still bind off the TRUE peak of 180.
    const crash = call(9);
    expect(crash.matched).toBe(true);
    expect(crash.reasons).toContain('trailing_stop');
    const peakEvidence = crash.evidence.find((e) => e.ref === 'peak_close_since_entry')!;
    expect(Number(peakEvidence.value)).toBeCloseTo(180, 6); // true peak, not the truncated window's 178
  });

  it('fires STATIC_STOP when the static floor binds before any trailing stop exists (flat-then-drop)', () => {
    const scope = {};
    prepare(makeMomentumBook(1), scope);
    const entryTs = HISTORY_DATES[0];
    // Peak barely above entry (102) so trailingStop (102*0.80=81.6) sits BELOW staticStop (100*0.85=85).
    const closes = [100, 101, 102, 101, 100, 84];
    const bars = closes.map((c, i) => bar(HISTORY_DATES[i], c));
    const result = halalTrendRiderCoreSetup.exit(exitCtx('WINNER', HISTORY_DATES[5], bars, 100, entryTs, scope), p);
    expect(result.matched).toBe(true);
    expect(result.reasons).toContain('static_stop');
  });
});

describe('halal-trend-rider-core v1 — exit: momentum breakdown (hand-computable)', () => {
  const p = { ...HALAL_TREND_RIDER_CORE_V1, lookbackDays: 5, skipRecentDays: 1 };

  it('fires on relative momentum <= 0, isolated from the stop (today\'s close stays well above any stop)', () => {
    const scope = {};
    prepare(makeMomentumBook(1), scope);
    const entryTs = HISTORY_DATES[0];
    // closes[0..5]: relative = closes[4]/closes[0]-1 = 95/100-1 = -0.05 <= 0 -> breakdown.
    // today (index5) close=98 stays far above entryPrice=90's static/trailing stop (activeStop=78.4).
    const closes = [100, 96, 94, 92, 95, 98];
    const bars = closes.map((c, i) => bar(HISTORY_DATES[i], c));
    const result = halalTrendRiderCoreSetup.exit(exitCtx('WINNER', HISTORY_DATES[5], bars, 90, entryTs, scope), p);
    expect(result.matched).toBe(true);
    expect(result.reasons).toEqual(['momentum_breakdown']); // stop reasons NOT also present
  });

  it('does not fire on a "no long position" or missing-entry-anchor context', () => {
    const scope = {};
    prepare(makeMomentumBook(1), scope);
    const bars = [bar(HISTORY_DATES[0], 100)];
    const flatCtx = { ...exitCtx('WINNER', HISTORY_DATES[0], bars, 100, HISTORY_DATES[0], scope), positionQty: new D(0) } as StrategyPointInTimeContext;
    const result = halalTrendRiderCoreSetup.exit(flatCtx, p);
    expect(result.matched).toBe(false);
    expect(result.reasons).toContain('no_long_position');
  });
});

describe('halal-trend-rider-core v1 — let-winners-run (core assertion)', () => {
  it('a rising, positive-momentum, above-stop winner is NEVER exited across many days', () => {
    const scope = {};
    prepare(makeMomentumBook(1), scope);
    const entryTs = HISTORY_DATES[0];
    const p = { ...HALAL_TREND_RIDER_CORE_V1, lookbackDays: 5, skipRecentDays: 1 };
    // Monotonic 5%/day compounding growth for 40 trading days (100 -> ~704, a genuine multi-x run) —
    // every day's close is a NEW peak, so the trailing stop (peak*0.80) can never bind, and 126d/skip5-
    // analog relative momentum stays strictly positive throughout by construction.
    const n = 40;
    const closes: number[] = [100];
    for (let i = 1; i < n; i++) closes.push(closes[i - 1] * 1.05);
    for (let day = 5; day < n; day++) {
      const windowStart = Math.max(0, day - 5);
      const bars = closes.slice(windowStart, day + 1).map((c, k) => bar(HISTORY_DATES[windowStart + k], c));
      const result = halalTrendRiderCoreSetup.exit(exitCtx('WINNER', HISTORY_DATES[day], bars, 100, entryTs, scope), p);
      expect(result.matched).toBe(false);
      expect(result.reasons).toEqual(['hold_let_winner_run']);
    }
    expect(closes.at(-1)!).toBeGreaterThan(closes[0] * 6); // genuinely let it run, not a token gain
  });
});

describe('halal-trend-rider-core v1 — plateau neighborhood', () => {
  it('declares a frozen 3×3 plateau over trailingStopPct × maxOpenSlots, centered on the default params', () => {
    const neighborhood = halalTrendRiderCoreSetup.plateauNeighborhood!(HALAL_TREND_RIDER_CORE_V1);
    expect(neighborhood.axes).toEqual(['trailingStopPct', 'maxOpenSlots']);
    expect(neighborhood.center).toEqual(HALAL_TREND_RIDER_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
    expect(neighborhood.neighbors.every((nb) => nb.params.lookbackDays === HALAL_TREND_RIDER_CORE_V1.lookbackDays)).toBe(true);
  });
});

describe('halal-trend-rider-core v1 — registration', () => {
  it('is registered: shared route, maxOpenSlots-capped concurrency policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-trend-rider-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-trend-rider-core', undefined)).toEqual(halalTrendRiderCoreBookPolicy());
    expect(halalTrendRiderCoreBookPolicy().maxOpenPositions).toBe(HALAL_TREND_RIDER_CORE_V1.maxOpenSlots);
    expect(validationTrialsForSetup('halal-trend-rider-core', HALAL_TREND_RIDER_CORE_V1)).toBe(9);
  });
});
