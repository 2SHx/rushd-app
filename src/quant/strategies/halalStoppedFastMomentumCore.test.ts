// Pure decision-logic tests for halal-stopped-fast-momentum-core v1. The five load-bearing claims
// (the ones a wrong implementation would silently break, corrupting the experiment's conclusion):
//   (a) the stop FIRES on a non-week-end day when close <= 0.80 x entry basis, via `targetWeight`;
//   (b) a position trading ABOVE its entry basis NEVER fires, at any drawdown from an interim high
//       -- this is what proves the anchor is the ENTRY, not a trailing peak;
//   (c) with the stop untriggered, every WEEK-END decision is byte-equal to `halal-fast-momentum-
//       core` on the same fixture -- the isolation guarantee of the A/B;
//   (d) a triggered day returns exactly `0`, never `null` (portfolioEngine.ts:1123-1134 `continue`s
//       past a `null`, so a `null` here is the silent-no-op bug that looks like "the stop never
//       helped");
//   (e) the frozen plateau grid resolves 9 distinct cells centered on (63, 0.20).
// Validation evidence comes solely from real-bar CLI runs (docs/STRATEGY_LAB.md); nothing here is a
// performance claim.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import { trialCountEvidence } from '../backtest/trialFamilies';
import { requiresPointInTimeMembership } from '../universe/pointInTimeMembership';
import { HALAL_FAST_MOMENTUM_CORE_V1, halalFastMomentumCoreSetup } from './halalFastMomentumCore';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_STOPPED_FAST_MOMENTUM_CORE_ID,
  HALAL_STOPPED_FAST_MOMENTUM_CORE_V1,
  HalalStoppedFastMomentumCoreParamsSchema,
  catastrophicStopTriggered,
  halalStoppedFastMomentumCoreBookPolicy,
  halalStoppedFastMomentumCoreSetup,
} from './halalStoppedFastMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday, so the synthetic calendar's trading days map 1:1 onto weekdays and the
// last bar is guaranteed to be its own ISO week's max timestamp. Same fixture shape as the baseline.
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 64 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!;
const MID_WEEK = HISTORY_DATES[HISTORY_DATES.length - 3]; // not that ISO week's last observed bar

type Row = { ts: Date; close: number; volume: number };
type Bar = { ts: Date; close: Prisma.Decimal };

/** Byte-identical fixture to halalFastMomentumCore.test.ts's, so (c) compares like with like. */
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

function ctx(
  symbol: string,
  asOf: Date,
  scope: object,
  position?: { qty: number; entryPrice: number; bars: Bar[] },
): StrategyPointInTimeContext {
  return {
    symbol,
    market: 'NASDAQ',
    asOf,
    bars: position?.bars ?? [],
    positionQty: new D(position?.qty ?? 0),
    entryPrice: position ? new D(position.entryPrice) : null,
    entryTs: position ? HISTORY_DATES[0] : null,
    replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

/** A bar path ending at `asOf`; `path` closes are dated backwards from `asOf`, oldest first. */
function bars(asOf: Date, path: readonly number[]): Bar[] {
  return path.map((close, i) => ({
    ts: new Date(asOf.getTime() - (path.length - 1 - i) * DAY),
    close: new D(close),
  }));
}

function prepareBoth(input: UniversePrepareInput, scope: object): void {
  halalStoppedFastMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });
  halalFastMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

const P = HALAL_STOPPED_FAST_MOMENTUM_CORE_V1;

describe('halal-stopped-fast-momentum-core v1 — catastrophicStopTriggered (hand-computable)', () => {
  it('fires at exactly the threshold and below, and not one tick above it', () => {
    expect(catastrophicStopTriggered(new D(100), new D(80), 0.2)).toBe(true); // inclusive boundary
    expect(catastrophicStopTriggered(new D(100), new D(79.99), 0.2)).toBe(true);
    expect(catastrophicStopTriggered(new D(100), new D(80.01), 0.2)).toBe(false);
    expect(catastrophicStopTriggered(new D(100), new D(85), 0.15)).toBe(true);
    expect(catastrophicStopTriggered(new D(100), new D(80), 0.25)).toBe(false);
  });

  it('is a no-op without an entry anchor or a usable close', () => {
    expect(catastrophicStopTriggered(null, new D(1), 0.2)).toBe(false);
    expect(catastrophicStopTriggered(new D(100), null, 0.2)).toBe(false);
    expect(catastrophicStopTriggered(new D(0), new D(1), 0.2)).toBe(false);
  });
});

describe('halal-stopped-fast-momentum-core v1 — params are the sealed manifest, not a retune', () => {
  it('accepts the frozen defaults and pins every stop clause as versioned config', () => {
    expect(HalalStoppedFastMomentumCoreParamsSchema.parse(P)).toEqual(P);
    expect(P.lookbackDays).toBe(63);
    expect(P.skipRecentDays).toBe(2);
    expect(P.topN).toBe(5);
    expect(P.cashFloor).toBe(2);
    expect(P.perNameCap).toBe(0.25);
    expect(P.stopLossPct).toBe(0.2);
    expect(P.stopReference).toBe('engine_average_entry_cost_basis');
    expect(P.stopEvaluation).toBe('non_week_end_completed_session_close_only');
    expect(P.stopFill).toBe('next_session_open');
    expect(P.stopReentryCooldownDays).toBe(0);
  });

  it('rejects a redefined stop clause, a bad stopLossPct, and a wrong version', () => {
    expect(() => HalalStoppedFastMomentumCoreParamsSchema.parse({ ...P, stopReference: 'trailing_peak_close' })).toThrow();
    expect(() => HalalStoppedFastMomentumCoreParamsSchema.parse({ ...P, stopEvaluation: 'every_close' })).toThrow();
    expect(() => HalalStoppedFastMomentumCoreParamsSchema.parse({ ...P, stopReentryCooldownDays: 5 })).toThrow();
    expect(() => HalalStoppedFastMomentumCoreParamsSchema.parse({ ...P, stopLossPct: 0 })).toThrow();
    expect(() => HalalStoppedFastMomentumCoreParamsSchema.parse({ ...P, stopLossPct: 1.5 })).toThrow();
    expect(() => HalalStoppedFastMomentumCoreParamsSchema.parse({ ...P, version: 'v2' })).toThrow();
  });
});

describe('halal-stopped-fast-momentum-core v1 — (a)+(d) the stop provably fires via targetWeight', () => {
  it('returns 0 on a non-week-end day when close <= 0.80 x the entry cost basis', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    const stopped = halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 92, 80]) }),
      P,
    );
    expect(stopped).toBe(0);
  });

  it('(d) returns the NUMBER 0, never null — a null would be the silent-no-op bug', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    const position = { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 92, 79.5]) };
    const stopped = halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope, position), P);
    expect(stopped).not.toBeNull();
    expect(typeof stopped).toBe('number');
    expect(Object.is(stopped, 0)).toBe(true);
    // The baseline, on the identical context, emits `null` — that difference IS the new variable.
    expect(halalFastMomentumCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope, position), HALAL_FAST_MOMENTUM_CORE_V1))
      .toBeNull();
  });

  it('holds (null) mid-week with no position, with a shallow loss, and once already flat', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope), P)).toBeNull();
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 90, 81]) }), P,
    )).toBeNull();
    // Freed cash sits idle: qty 0 after the fill ⇒ no opinion on every following non-week-end day.
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, { qty: 0, entryPrice: 100, bars: bars(MID_WEEK, [100, 90, 40]) }), P,
    )).toBeNull();
  });

  it('tracks stopLossPct: the same −18% day fires at 0.15 and holds at 0.20/0.25', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    const position = { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 90, 82]) };
    const at = (stopLossPct: number): number | null => halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, position), { ...P, stopLossPct },
    );
    expect(at(0.15)).toBe(0);
    expect(at(0.2)).toBeNull();
    expect(at(0.25)).toBeNull();
  });

  it('ignores a stale bar: a context whose last bar is not dated asOf cannot trigger', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    const stale = bars(new Date(MID_WEEK.getTime() - DAY), [100, 40]);
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, { qty: 10, entryPrice: 100, bars: stale }), P,
    )).toBeNull();
  });
});

describe('halal-stopped-fast-momentum-core v1 — (b) entry-anchored, NEVER trailing', () => {
  it('never fires while the close is above the entry basis, however deep the drawdown from the interim high', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    // Entry 100, ran to 200, now 150: −25% from the peak (a 20% TRAILING stop would fire at 160),
    // but +50% versus entry. An entry-anchored stop must hold.
    const runUpThenFall = { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 140, 200, 170, 150]) };
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope, runUpThenFall), P)).toBeNull();
    // Even a −49.5% peak drawdown holds while the close stays above the entry basis.
    const deeper = { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 140, 200, 170, 101]) };
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope, deeper), P)).toBeNull();
    // Only crossing the ENTRY-anchored floor fires, and the same interim peak is irrelevant to it.
    const belowEntryFloor = { qty: 10, entryPrice: 100, bars: bars(MID_WEEK, [100, 140, 200, 170, 79]) };
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope, belowEntryFloor), P)).toBe(0);
  });

  it('anchors on the ENGINE average cost basis, so an add that raises the basis moves the floor', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    const path = bars(MID_WEEK, [100, 150, 120]);
    // Basis 100 ⇒ floor 80; close 120 holds. Basis 160 (averaged up by an add) ⇒ floor 128; it fires.
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, { qty: 10, entryPrice: 100, bars: path }), P,
    )).toBeNull();
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(
      ctx('SYM000', MID_WEEK, scope, { qty: 10, entryPrice: 160, bars: path }), P,
    )).toBe(0);
  });
});

describe('halal-stopped-fast-momentum-core v1 — (c) week-end decisions are byte-equal to the baseline', () => {
  it('matches halal-fast-momentum-core exactly on every name, even holding a name far below its stop', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    // A catastrophically underwater position on EVERY name. The stop is not evaluated on a week-end,
    // so the re-rank alone decides and the two setups must agree byte-for-byte.
    const wiped = (symbol: string): StrategyPointInTimeContext =>
      ctx(symbol, WEEK_END, scope, { qty: 10, entryPrice: 100, bars: bars(WEEK_END, [100, 60, 1]) });
    const symbols = Array.from({ length: 30 }, (_, s) => `SYM${String(s).padStart(3, '0')}`);
    const stopped = symbols.map((symbol) => halalStoppedFastMomentumCoreSetup.targetWeight!(wiped(symbol), P));
    const baseline = symbols.map((symbol) => halalFastMomentumCoreSetup.targetWeight!(wiped(symbol), HALAL_FAST_MOMENTUM_CORE_V1));
    expect(stopped).toEqual(baseline);
    expect(stopped.filter((w) => (w ?? 0) > 0)).toHaveLength(5); // the fixed top-5 really was selected
    expect(stopped.reduce<number>((a, w) => a + (w ?? 0), 0)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('matches the baseline on the same week-end across all three plateau lookbacks with no position', () => {
    const scope = {};
    prepareBoth(makeMomentumBook(30), scope);
    const symbols = Array.from({ length: 30 }, (_, s) => `SYM${String(s).padStart(3, '0')}`);
    for (const lookbackDays of [42, 63, 84]) {
      const stopped = symbols.map((symbol) => halalStoppedFastMomentumCoreSetup.targetWeight!(
        ctx(symbol, WEEK_END, scope), { ...P, lookbackDays },
      ));
      const baseline = symbols.map((symbol) => halalFastMomentumCoreSetup.targetWeight!(
        ctx(symbol, WEEK_END, scope), { ...HALAL_FAST_MOMENTUM_CORE_V1, lookbackDays },
      ));
      expect(stopped).toEqual(baseline);
    }
  });

  it('keeps the baseline cash-floor and determinism behaviour', () => {
    const scopeOne = {};
    prepareBoth(makeMomentumBook(1), scopeOne); // eligible 1 < cashFloor 2 ⇒ whole book holds cash
    expect(halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM000', WEEK_END, scopeOne), P)).toBe(0);
    expect(halalStoppedFastMomentumCoreSetup.screen(ctx('SYM000', WEEK_END, scopeOne), P).reasons)
      .toContain('below_cash_floor');

    const scopeA = {};
    const scopeB = {};
    prepareBoth(makeMomentumBook(30), scopeA);
    prepareBoth(makeMomentumBook(30), scopeB);
    const a = halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scopeA), P);
    const b = halalStoppedFastMomentumCoreSetup.targetWeight!(ctx('SYM003', WEEK_END, scopeB), P);
    expect(b).toBe(a);
  });
});

describe('halal-stopped-fast-momentum-core v1 — (e) the frozen plateau grid', () => {
  it('resolves 9 distinct cells on {lookbackDays}×{stopLossPct} centered on (63, 0.20)', () => {
    const neighborhood = halalStoppedFastMomentumCoreSetup.plateauNeighborhood!(P);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'stopLossPct']);
    expect(neighborhood.center.lookbackDays).toBe(63);
    expect(neighborhood.center.stopLossPct).toBe(0.2);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 minus the center

    const cells = [
      `${neighborhood.center.lookbackDays}|${neighborhood.center.stopLossPct}`,
      ...neighborhood.neighbors.map((n) => `${n.params.lookbackDays}|${n.params.stopLossPct}`),
    ];
    expect(new Set(cells).size).toBe(9); // 9 DISTINCT cells, no duplicate/center collision
    expect(new Set(cells)).toEqual(new Set([42, 63, 84].flatMap((l) => [0.15, 0.2, 0.25].map((s) => `${l}|${s}`))));
    expect(neighborhood.neighbors.map((n) => n.label)).not.toContain('lookbackDays=63|stopLossPct=0.2');
    // Every neighbour holds the non-swept params fixed — no second variable sneaks into the grid.
    for (const n of neighborhood.neighbors) {
      expect(n.params.topN).toBe(P.topN);
      expect(n.params.cashFloor).toBe(P.cashFloor);
      expect(n.params.perNameCap).toBe(P.perNameCap);
      expect(n.params.skipRecentDays).toBe(P.skipRecentDays);
    }
  });
});

describe('halal-stopped-fast-momentum-core v1 — registration and fences', () => {
  it('is on the shared route with the baseline-identical 60-name policy and 9 local trials', () => {
    expect(selectDailyBacktestRoute(HALAL_STOPPED_FAST_MOMENTUM_CORE_ID, undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup(HALAL_STOPPED_FAST_MOMENTUM_CORE_ID, undefined))
      .toEqual(halalStoppedFastMomentumCoreBookPolicy());
    expect(halalStoppedFastMomentumCoreBookPolicy().maxOpenPositions).toBe(60);
    expect(validationTrialsForSetup(HALAL_STOPPED_FAST_MOMENTUM_CORE_ID, P)).toBe(9);
  });

  it('joins the halal-core trial family at 135 and stays inside the QDR-14 survivorship fence', () => {
    expect(trialCountEvidence(HALAL_STOPPED_FAST_MOMENTUM_CORE_ID, 9)).toMatchObject({
      familyId: 'halal-core-2026q3-v1', familyTrials: 135, relatedSetups: 15, tier: 'EXPLORATORY',
    });
    expect(requiresPointInTimeMembership(HALAL_STOPPED_FAST_MOMENTUM_CORE_ID)).toBe(true);
  });
});
