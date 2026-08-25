// Pure decision-logic tests for halal-hysteretic-fast-momentum-core v1. Hand-built arithmetic price
// paths test the ONE new variable (retainRank) and nothing else; validation evidence comes solely
// from real-bar runs through the CLI, per docs/STRATEGY_LAB.md. NO live DB, no fixtures on disk.
//
// The load-bearing test in this file is BASELINE EQUIVALENCE: at retainRank === topN this setup must
// reproduce `halal-fast-momentum-core@v1`'s weight map BYTE-IDENTICALLY, including the internal null
// control cell {retainRank: 6, topN: 6}. Divergence there is an implementation defect, never a result
// (manifest `plateau.internalNullControl`, falsification F6).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_FAST_MOMENTUM_CORE_V1,
  halalFastMomentumCoreSetup,
  type HalalFastMomentumCoreParams,
} from './halalFastMomentumCore';
import {
  HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_ID,
  HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1,
  HalalHystereticFastMomentumCoreParamsSchema,
  halalHystereticFastMomentumCoreBookPolicy,
  halalHystereticFastMomentumCoreSetup,
  hystereticDecisionCacheKey,
  selectWithHysteresis,
  type HalalHystereticFastMomentumCoreParams,
} from './halalHystereticFastMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday, and the calendar is CONSECUTIVE days, so every ISO week's max timestamp is
// its Sunday: week ends land on indices 6, 13, ... 97, plus index 99 (chronologically last bar of
// its own week). Momentum needs index >= lookbackDays (63), so the DECIDING week ends are
// 69, 76, 83, 90, 97, 99 and everything at or before index 62 is below the cash floor (0 rankable).
const START = Date.UTC(2023, 0, 2);
const BARS = 100;
const DATES = Array.from({ length: BARS }, (_, i) => new Date(START + i * DAY));
const WEEK_END_INDICES = [69, 76, 83, 90, 97, 99] as const;
const FIRST_DECISION = DATES[69];
const SECOND_DECISION = DATES[76];
const THIRD_DECISION = DATES[83];
const SYMBOLS = Array.from({ length: 12 }, (_, s) => `S${String(s).padStart(2, '0')}`);

type Row = { ts: Date; close: number; volume: number };
type Shocks = Readonly<Record<string, Readonly<Record<number, number>>>>;

/**
 * Twelve names on a strictly-ordered geometric drift (S00 fastest ... S11 slowest) with a strictly
 * INCREASING alternating oscillation, mirroring the comparator's own fixture: with no shocks the
 * relative-momentum rank order is exactly the symbol order, every absolute momentum is positive, and
 * S00 also carries the lowest volatility, so rank and inverse-vol weight never conflict. The
 * oscillation is not decoration — a perfectly smooth path has zero return variance and every name
 * would be dropped as degenerate by the (unchanged, shared) inverse-vol sizing step.
 * `shocks[symbol][barIndex]` applies a one-off multiplicative jump at that bar, which is how a rank
 * is moved on a chosen date without touching any other part of the path.
 */
function makeBook(shocks: Shocks = {}): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  SYMBOLS.forEach((symbol, s) => {
    const drift = 0.010 - s * 0.0005; // strictly decreasing, always > 0
    const volAmp = 0.003 + s * 0.0003; // strictly increasing
    let price = 100;
    const rows: Row[] = DATES.map((ts, i) => {
      if (i > 0) price *= (1 + drift) * (1 + (i % 2 === 0 ? volAmp : -volAmp)) * (shocks[symbol]?.[i] ?? 1);
      return { ts, close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  });
  return { symbols: [...SYMBOLS], closesBySymbol: new Map(), dailyBarsBySymbol };
}

/**
 * Independent re-derivation of the frozen rank order straight from the fixture prices
 * (relative = close[d-2]/close[d-63] - 1, absolute = close[d]/close[d-63] - 1, absolute > 0 filter,
 * relative DESC then symbol ASC). Deliberately NOT the implementation's code path: the retention
 * tests below assert against ranks computed here, so a rank claim cannot be self-fulfilling.
 */
function ranksAt(book: UniversePrepareInput, barIndex: number, lookback = 63, skip = 2): string[] {
  const rows: { symbol: string; relative: number }[] = [];
  for (const [symbol, bars] of Array.from(book.dailyBarsBySymbol!.entries())) {
    const base = bars[barIndex - lookback].close;
    const relative = bars[barIndex - skip].close / base - 1;
    const absolute = bars[barIndex].close / base - 1;
    if (absolute > 0) rows.push({ symbol, relative });
  }
  return rows
    .sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol))
    .map((row) => row.symbol);
}

/**
 * Shock factors chosen (solved numerically off the unshocked series, then frozen as literals) so
 * that at the SECOND deciding week end the four incumbents S01..S04 land on ranks 6, 7, 8 and 9
 * exactly, i.e. astride the retainRank = 8 band. The jump is at bar 70 — AFTER the first decision
 * (bar 69) and inside the following week — so the first week's decided set is untouched.
 */
const RANK_6_TO_9_SHOCKS: Shocks = Object.freeze({
  S01: { 70: 0.805519 },
  S02: { 70: 0.825081 },
  S03: { 70: 0.845104 },
  S04: { 70: 0.8656 },
});

function ctx(symbol: string, asOf: Date, scope: object, positionQty = 0): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(positionQty), replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

/** A context whose `positionQty` THROWS on read — the structural proof for manifest F6. */
function positionBlindCtx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  const base = {
    symbol, market: 'NASDAQ' as const, asOf, bars: [], replayScope: scope,
  };
  Object.defineProperty(base, 'positionQty', {
    get() { throw new Error('selection path read ctx.positionQty'); },
    enumerable: true,
  });
  return base as unknown as StrategyPointInTimeContext;
}

function prepareBoth(book: UniversePrepareInput, scope: object): void {
  halalHystereticFastMomentumCoreSetup.prepareUniverse({ ...book, replayScope: scope });
  halalFastMomentumCoreSetup.prepareUniverse({ ...book, replayScope: scope });
}

function prepareTreatment(book: UniversePrepareInput, scope: object): void {
  halalHystereticFastMomentumCoreSetup.prepareUniverse({ ...book, replayScope: scope });
}

function treatmentParams(
  patch: Partial<HalalHystereticFastMomentumCoreParams> = {},
): HalalHystereticFastMomentumCoreParams {
  return { ...HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, ...patch };
}

/** The full symbol → target-weight map at one date (weights only, cash names omitted). */
function weightsAt(
  setup: { targetWeight?: (c: StrategyPointInTimeContext, p: never) => number | null },
  params: unknown,
  scope: object,
  asOf: Date,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const symbol of SYMBOLS) {
    const w = setup.targetWeight!(ctx(symbol, asOf, scope), params as never);
    if (w !== null && w > 0) out.set(symbol, w);
  }
  return out;
}

/** Every (date, symbol) target weight, including the nulls of non-week-end bars. */
function fullWeightSurface(
  setup: { targetWeight?: (c: StrategyPointInTimeContext, p: never) => number | null },
  params: unknown,
  scope: object,
): Map<string, number | null> {
  const surface = new Map<string, number | null>();
  for (const asOf of DATES) {
    for (const symbol of SYMBOLS) {
      surface.set(
        `${asOf.toISOString()}|${symbol}`,
        setup.targetWeight!(ctx(symbol, asOf, scope), params as never),
      );
    }
  }
  return surface;
}

describe('halal-hysteretic-fast-momentum-core v1 — params schema', () => {
  it('accepts the frozen v1 params (retainRank 8 on top of the comparator\'s frozen set)', () => {
    expect(HalalHystereticFastMomentumCoreParamsSchema.parse(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1))
      .toEqual(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1);
    expect(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1.retainRank).toBe(8);
    // Every OTHER param is byte-identical to the comparator's frozen set — the isolated-A/B contract.
    const { retainRank, ...rest } = HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1;
    expect(retainRank).toBe(8);
    expect(rest).toEqual({ ...HALAL_FAST_MOMENTUM_CORE_V1 });
    expect(halalHystereticFastMomentumCoreSetup.id).toBe(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_ID);
    expect(halalHystereticFastMomentumCoreBookPolicy())
      .toEqual({ maxGrossFraction: 1, maxOpenPositions: 60, decisionHistoryBars: 68 });
  });

  it('rejects a missing/invalid retainRank and any cell below the frozen retainRank >= topN constraint', () => {
    const scope = {};
    prepareTreatment(makeBook(), scope);
    const { retainRank: _omitted, ...withoutRetain } = HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1;
    expect(() => HalalHystereticFastMomentumCoreParamsSchema.parse(withoutRetain)).toThrow();
    expect(() => HalalHystereticFastMomentumCoreParamsSchema.parse(treatmentParams({ retainRank: 8.5 }))).toThrow();
    expect(() => HalalHystereticFastMomentumCoreParamsSchema.parse(treatmentParams({ retainRank: 0 }))).toThrow();
    expect(() => halalHystereticFastMomentumCoreSetup.targetWeight!(
      ctx('S00', FIRST_DECISION, scope), treatmentParams({ retainRank: 4, topN: 5 }),
    )).toThrow(/retainRank must be >= topN/);
  });

  it('declares the frozen 3x3 plateau on the new axis: retainRank {6,8,10} x topN {4,5,6}, center {8,5}', () => {
    const grid = halalHystereticFastMomentumCoreSetup.plateauNeighborhood!(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1);
    expect(grid.axes).toEqual(['retainRank', 'topN']);
    expect(grid.center).toEqual(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1);
    expect(grid.neighbors).toHaveLength(8); // 9 cells minus the center
    const cells = grid.neighbors.map((n) => [n.params.retainRank, n.params.topN]);
    expect(cells).toEqual([[6, 4], [6, 5], [6, 6], [8, 4], [8, 6], [10, 4], [10, 5], [10, 6]]);
    expect(cells.every(([retain, top]) => retain >= top)).toBe(true);
    expect(HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1.validationTrials).toBe(9);
  });
});

describe('halal-hysteretic-fast-momentum-core v1 — BASELINE EQUIVALENCE (manifest F6)', () => {
  // (a) + (b): the whole weight map, every date, every symbol, against the frozen comparator.
  for (const topN of [4, 5, 6]) {
    it(`retainRank = topN = ${topN} reproduces halal-fast-momentum-core's weight map byte-identically`, () => {
      const book = makeBook(RANK_6_TO_9_SHOCKS);
      const scope = {};
      prepareBoth(book, scope);
      const treatment = fullWeightSurface(
        halalHystereticFastMomentumCoreSetup, treatmentParams({ topN, retainRank: topN }), scope,
      );
      const comparator = fullWeightSurface(
        halalFastMomentumCoreSetup, { ...HALAL_FAST_MOMENTUM_CORE_V1, topN } as HalalFastMomentumCoreParams, scope,
      );
      expect(treatment.size).toBe(BARS * SYMBOLS.length);
      expect(Array.from(treatment.entries())).toEqual(Array.from(comparator.entries()));
      // Non-vacuous: the surface really does contain live weights, not only nulls/zeros.
      expect(Array.from(treatment.values()).filter((w) => w !== null && w > 0).length)
        .toBe(WEEK_END_INDICES.length * topN);
    });
  }

  it('INTERNAL NULL CONTROL {retainRank: 6, topN: 6} matches the comparator at topN = 6 exactly', () => {
    const book = makeBook(RANK_6_TO_9_SHOCKS);
    const scope = {};
    prepareBoth(book, scope);
    for (const index of WEEK_END_INDICES) {
      const asOf = DATES[index];
      const treated = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 6, topN: 6 }), scope, asOf);
      const base = weightsAt(halalFastMomentumCoreSetup, { ...HALAL_FAST_MOMENTUM_CORE_V1, topN: 6 }, scope, asOf);
      expect(Array.from(treated.entries())).toEqual(Array.from(base.entries()));
      expect(treated.size).toBe(6);
    }
  });

  it('selectWithHysteresis degenerates to the frozen top-N set when retainRank = topN, whatever was held', () => {
    const eligible = SYMBOLS.map((symbol, i) => ({ symbol, relative: 1 - i * 0.01 }));
    const held = new Set(['S07', 'S09', 'S11']); // deep incumbents that must NOT survive at band 0
    expect([...selectWithHysteresis(eligible, held, 5, 5, 2)].sort())
      .toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);
    expect([...selectWithHysteresis(eligible, new Set(), 5, 5, 2)].sort())
      .toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);
  });
});

describe('halal-hysteretic-fast-momentum-core v1 — the retain band (the ONE new variable)', () => {
  it('retains incumbents that fall to rank 6, 7 and 8 at retainRank = 8 and DROPS the one at rank 9', () => {
    const book = makeBook(RANK_6_TO_9_SHOCKS);
    const scope = {};
    prepareBoth(book, scope);

    // Week 1: no incumbents, so the decision is the plain top-5 by rank.
    const first = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, scope, FIRST_DECISION);
    expect(ranksAt(book, 69).slice(0, 5)).toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);
    expect(Array.from(first.keys()).sort()).toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);

    // Week 2: the incumbents have fallen to ranks 1, 6, 7, 8 and 9 (re-derived from the fixture).
    const ranks = ranksAt(book, 76);
    expect(ranks.indexOf('S00') + 1).toBe(1);
    expect(ranks.indexOf('S01') + 1).toBe(6);
    expect(ranks.indexOf('S02') + 1).toBe(7);
    expect(ranks.indexOf('S03') + 1).toBe(8);
    expect(ranks.indexOf('S04') + 1).toBe(9);

    const second = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, scope, SECOND_DECISION);
    // rank 6, 7, 8 RETAINED; rank 9 DROPPED; one free slot filled by the best-ranked non-retained
    // name (S05 at rank 2) — the entry rank falls out of the fill rule, it is not a parameter.
    expect(Array.from(second.keys()).sort()).toEqual(['S00', 'S01', 'S02', 'S03', 'S05']);
    expect(second.has('S04')).toBe(false);

    // The comparator, on the same bars, sells all four boundary-crossers: this is the measured
    // 48.71%-of-exits channel the lane attacks, and the reason the two arms diverge at all.
    const baseline = weightsAt(halalFastMomentumCoreSetup, HALAL_FAST_MOMENTUM_CORE_V1, scope, SECOND_DECISION);
    expect(Array.from(baseline.keys()).sort()).toEqual(['S00', 'S05', 'S06', 'S07', 'S08']);
  });

  it('widening retainRank to 10 retains the rank-9 name too; narrowing to 5 reproduces the comparator', () => {
    const book = makeBook(RANK_6_TO_9_SHOCKS);
    const scope = {};
    prepareBoth(book, scope);
    const wide = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 10 }), scope, SECOND_DECISION);
    expect(Array.from(wide.keys()).sort()).toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);
    const narrow = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 5 }), scope, SECOND_DECISION);
    const baseline = weightsAt(halalFastMomentumCoreSetup, HALAL_FAST_MOMENTUM_CORE_V1, scope, SECOND_DECISION);
    expect(Array.from(narrow.entries())).toEqual(Array.from(baseline.entries()));
  });

  it('carries incumbency forward recursively: the week-3 decided set is built on week 2, not week 1', () => {
    const book = makeBook(RANK_6_TO_9_SHOCKS);
    const scope = {};
    prepareTreatment(book, scope);
    // Asking for week 3 FIRST (cold cache) must still resolve weeks 1 and 2 in order.
    const third = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, scope, THIRD_DECISION);
    expect(Array.from(third.keys()).sort()).toEqual(['S00', 'S01', 'S02', 'S03', 'S05']);
    // S04 was decided in week 1 and dropped in week 2; it must NOT reappear via stale incumbency.
    expect(third.has('S04')).toBe(false);
  });
});

describe('halal-hysteretic-fast-momentum-core v1 — the retain test is WEEK-END ONLY', () => {
  it('returns null on every non-week-end bar and decides only on the six deciding week ends', () => {
    const scope = {};
    prepareTreatment(makeBook(RANK_6_TO_9_SHOCKS), scope);
    const deciding = new Set<number>(WEEK_END_INDICES);
    DATES.forEach((asOf, i) => {
      const weight = halalHystereticFastMomentumCoreSetup.targetWeight!(
        ctx('S00', asOf, scope), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1,
      );
      const isWeekEnd = i === BARS - 1 || new Date(asOf).getUTCDay() === 0;
      if (!isWeekEnd) expect(weight).toBeNull();
      else if (deciding.has(i)) expect(typeof weight).toBe('number');
      else expect(weight).toBe(0); // a week end with nothing rankable yet: cash, never null
      // Between week ends the book HOLDS: exit() never fires a sell on a non-week-end bar.
      if (!isWeekEnd) {
        const exited = halalHystereticFastMomentumCoreSetup.exit(ctx('S00', asOf, scope, 10), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1);
        expect(exited.matched).toBe(false);
        expect(exited.reasons).toEqual(['hold_between_week_ends']);
      }
    });
  });

  it('a MID-WEEK rank collapse changes nothing: only the rank at the week end decides retention', () => {
    // S03 is halved at bar 70 (its absolute momentum goes NEGATIVE, so it is not even eligible
    // mid-week) and recovers at bar 73, landing at rank 8 for the bar-76 decision.
    const book = makeBook({ S03: { 70: 0.5, 73: 1.74715 } });
    const midWeekRanks = ranksAt(book, 72);
    expect(midWeekRanks).not.toContain('S03'); // would have been a daily SELL
    expect(ranksAt(book, 76).indexOf('S03') + 1).toBe(8); // but is rank 8 at the week end

    const orderedScope = {};
    prepareTreatment(book, orderedScope);
    DATES.forEach((asOf) => weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, orderedScope, asOf));
    const withMidWeekReads = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, orderedScope, SECOND_DECISION);

    const sparseScope = {};
    prepareTreatment(book, sparseScope);
    const weekEndsOnly = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, sparseScope, SECOND_DECISION);

    expect(withMidWeekReads.has('S03')).toBe(true); // retained at rank 8 despite the mid-week hole
    expect(Array.from(weekEndsOnly.entries())).toEqual(Array.from(withMidWeekReads.entries()));
  });
});

describe('halal-hysteretic-fast-momentum-core v1 — incumbency NEVER comes from ctx.positionQty (F6)', () => {
  it('throws nothing when positionQty is a throwing getter on the whole selection path', () => {
    const scope = {};
    prepareTreatment(makeBook(RANK_6_TO_9_SHOCKS), scope);
    for (const asOf of [FIRST_DECISION, SECOND_DECISION, THIRD_DECISION, DATES[70]]) {
      for (const symbol of SYMBOLS) {
        const blind = positionBlindCtx(symbol, asOf, scope);
        expect(() => halalHystereticFastMomentumCoreSetup.targetWeight!(blind, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1)).not.toThrow();
        expect(() => halalHystereticFastMomentumCoreSetup.screen(blind, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1)).not.toThrow();
        expect(() => halalHystereticFastMomentumCoreSetup.entry(blind, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1)).not.toThrow();
      }
    }
    expect(() => halalHystereticFastMomentumCoreSetup.tradableBookSymbols!(scope, [HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1])).not.toThrow();
    // Sanity: the guard is real — a context that DOES read the getter still throws.
    expect(() => positionBlindCtx('S00', SECOND_DECISION, scope).positionQty.lte(0)).toThrow();
  });

  it('produces the identical decided set from realised holdings that disagree with the decision', () => {
    const scope = {};
    prepareTreatment(makeBook(RANK_6_TO_9_SHOCKS), scope);
    // exit() is allowed to read positionQty for the `no_long_position` short-circuit (unchanged from
    // the comparator), but the DECISION it reports must not vary with the size of the holding.
    const evidenceFor = (qty: number): string => JSON.stringify(
      halalHystereticFastMomentumCoreSetup.exit(ctx('S04', SECOND_DECISION, scope, qty), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1),
    );
    expect(evidenceFor(1)).toBe(evidenceFor(999_999));
    // S04 fell to rank 9 and is outside the band, so a holder is told to sell whatever the size.
    expect(halalHystereticFastMomentumCoreSetup.exit(ctx('S04', SECOND_DECISION, scope, 5), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1).matched).toBe(true);
    expect(halalHystereticFastMomentumCoreSetup.exit(ctx('S03', SECOND_DECISION, scope, 5), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1).reasons)
      .toEqual(['retain_selected_weighted_name']);
  });
});

describe('halal-hysteretic-fast-momentum-core v1 — decision cache key', () => {
  it('includes retainRank, so two plateau cells cannot collide', () => {
    const eight = hystereticDecisionCacheKey(START, treatmentParams({ retainRank: 8 }));
    const ten = hystereticDecisionCacheKey(START, treatmentParams({ retainRank: 10 }));
    expect(eight).not.toBe(ten);
    expect(eight.split('|')).toContain('8');
    expect(hystereticDecisionCacheKey(START, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1))
      .toBe(hystereticDecisionCacheKey(START, treatmentParams()));
  });

  it('keeps cells independent on ONE shared prepared scope, in either evaluation order', () => {
    const book = makeBook(RANK_6_TO_9_SHOCKS);
    const shared = {};
    prepareTreatment(book, shared);
    const wideFirst = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 10 }), shared, SECOND_DECISION);
    const narrowSecond = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 5 }), shared, SECOND_DECISION);
    expect(Array.from(wideFirst.keys()).sort()).toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);
    expect(Array.from(narrowSecond.keys()).sort()).toEqual(['S00', 'S05', 'S06', 'S07', 'S08']);

    const reversed = {};
    prepareTreatment(book, reversed);
    const narrowFirst = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 5 }), reversed, SECOND_DECISION);
    const wideSecond = weightsAt(halalHystereticFastMomentumCoreSetup, treatmentParams({ retainRank: 10 }), reversed, SECOND_DECISION);
    expect(Array.from(narrowFirst.entries())).toEqual(Array.from(narrowSecond.entries()));
    expect(Array.from(wideSecond.entries())).toEqual(Array.from(wideFirst.entries()));
  });

  it('is deterministic: the same prepared universe replays identical weights', () => {
    const book = makeBook(RANK_6_TO_9_SHOCKS);
    const a = {}; const b = {};
    prepareTreatment(book, a);
    prepareTreatment(book, b);
    for (const index of WEEK_END_INDICES) {
      expect(Array.from(weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, a, DATES[index]).entries()))
        .toEqual(Array.from(weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, b, DATES[index]).entries()));
    }
  });
});

describe('halal-hysteretic-fast-momentum-core v1 — cash floor empties incumbency', () => {
  it('holds cash below the 2-name floor (eligible count, not rankable count)', () => {
    const scope = {};
    const single = makeBook();
    const onlyOne = new Map([[SYMBOLS[0], single.dailyBarsBySymbol!.get(SYMBOLS[0])!]]);
    prepareTreatment({ ...single, symbols: [SYMBOLS[0]], dailyBarsBySymbol: onlyOne }, scope);
    expect(halalHystereticFastMomentumCoreSetup.targetWeight!(ctx('S00', FIRST_DECISION, scope), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1)).toBe(0);
    const screened = halalHystereticFastMomentumCoreSetup.screen(ctx('S00', FIRST_DECISION, scope), HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1);
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('below_cash_floor');
    expect(selectWithHysteresis([{ symbol: 'S00', relative: 1 }], new Set(['S00']), 5, 8, 2)).toEqual([]);
  });

  it('empties previousDecidedSet after a cash week: no name is retained across the gap', () => {
    // Every name is halved at bar 74 (absolute momentum negative for all 12 at bar 76 -> 0 eligible
    // -> cash) and doubles back at bar 78, so the bar-83 ranks are the unshocked ranks again.
    const crash: Record<string, Record<number, number>> = {};
    for (const symbol of SYMBOLS) {
      crash[symbol] = { ...(RANK_6_TO_9_SHOCKS[symbol] ?? {}), 74: 0.5, 78: 2 };
    }
    const book = makeBook(crash);
    const scope = {};
    prepareTreatment(book, scope);

    expect(ranksAt(book, 76)).toEqual([]); // nothing survives the absolute filter
    const first = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, scope, FIRST_DECISION);
    expect(Array.from(first.keys()).sort()).toEqual(['S00', 'S01', 'S02', 'S03', 'S04']);
    expect(weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, scope, SECOND_DECISION).size).toBe(0);

    // Week 3: S01/S02/S03 sit at ranks 6/7/8 — inside the band. They are NOT retained, because the
    // cash week emptied the decided set; the book re-enters on rank alone.
    const ranks = ranksAt(book, 83);
    expect([ranks.indexOf('S01') + 1, ranks.indexOf('S02') + 1, ranks.indexOf('S03') + 1]).toEqual([6, 7, 8]);
    const third = weightsAt(halalHystereticFastMomentumCoreSetup, HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1, scope, THIRD_DECISION);
    expect(Array.from(third.keys()).sort()).toEqual(['S00', 'S05', 'S06', 'S07', 'S08']);
  });
});
