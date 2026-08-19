// Pure decision-logic tests for halal-fast-momentum-cash-core v1. The five load-bearing claims (the
// ones a wrong implementation would silently break, corrupting a CONFIRMATORY lane's conclusion):
//   (a) with the engine selecting names, book target weights sum to the sealed 0.30, never 1.0;
//   (b) the reserve leg is INERT -- no remuneration, no growth term, nothing in the executable code
//       that could pay a return on cash (a paid reserve is riba and would void Sharia compliance);
//   (c) the 3pp no-trade band suppresses the allocation trade under 3pp of drift and restores the
//       sealed share above it, end to end through `targetWeight`;
//   (d) per-name RELATIVE weights inside the engine sleeve are bit-for-bit `halal-fast-momentum-
//       core`'s on the same fixture -- the allocation scales the book, it never re-ranks it;
//   (e) the frozen plateau grid resolves 9 distinct cells centered on (0.30, 0.03).
// NO backtest of any kind was run to produce this file; nothing here is a performance claim.
import { readFileSync } from 'node:fs';
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import { trialCountEvidence } from '../backtest/trialFamilies';
import { requiresPointInTimeMembership } from '../universe/pointInTimeMembership';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import { halalFastMomentumCoreSetup } from './halalFastMomentumCore';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_FAST_MOMENTUM_CASH_CORE_ID,
  HALAL_FAST_MOMENTUM_CASH_CORE_V1,
  HalalFastMomentumCashCoreParamsSchema,
  driftedSleeveShare,
  halalFastMomentumCashCoreBookPolicy,
  halalFastMomentumCashCoreSetup,
  resolveSleeveShare,
} from './halalFastMomentumCashCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday. Index 69 and index 74 are both their ISO week's last observed bar and both
// carry >= 63 trailing bars, so the fixture has exactly two usable consecutive decision dates.
const START = Date.UTC(2023, 0, 2);
const DATES = Array.from({ length: 75 }, (_, i) => new Date(START + i * DAY));
const DECISION_1 = DATES[69];
const DECISION_2 = DATES[74];
const MID_WEEK = DATES[72];

const P = HALAL_FAST_MOMENTUM_CASH_CORE_V1;
type Row = { ts: Date; close: number; volume: number };

/** Same fixture SHAPE as halalFastMomentumCore.test.ts's, so claim (d) compares like with like. */
function makeMomentumBook(n: number, trendPerBarBase: number): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const symbol = `SYM${String(s).padStart(3, '0')}`;
    const trendPerBar = trendPerBarBase - s * (trendPerBarBase / 100); // strictly decreasing, > 0
    const volAmp = 0.003 + s * 0.0003; // strictly increasing
    let price = 100;
    const rows: Row[] = DATES.map((ts, i) => {
      if (i > 0) price *= (1 + trendPerBar) * (1 + (i % 2 === 0 ? volAmp : -volAmp));
      return { ts, close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  }
  return { symbols: Array.from(dailyBarsBySymbol.keys()), closesBySymbol: new Map(), dailyBarsBySymbol };
}

function ctx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(0), replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

function bookWeights(
  symbols: readonly string[],
  asOf: Date,
  scope: object,
  params = P,
): Map<string, number> {
  const weights = new Map<string, number>();
  for (const symbol of symbols) {
    const weight = halalFastMomentumCashCoreSetup.targetWeight!(ctx(symbol, asOf, scope), params);
    if (weight !== null && weight > 0) weights.set(symbol, weight);
  }
  return weights;
}

function sum(weights: ReadonlyMap<string, number>): number {
  return Array.from(weights.values()).reduce((total, weight) => total + weight, 0);
}

function evidenceValue(symbol: string, asOf: Date, scope: object, ref: string, params = P): string {
  const item = halalFastMomentumCashCoreSetup
    .screen(ctx(symbol, asOf, scope), params)
    .evidence.find((e) => e.ref === ref);
  if (!item) throw new Error(`missing evidence ${ref}`);
  return String(item.value);
}

describe('halal-fast-momentum-cash-core v1 — the engine is frozen by the type system', () => {
  it('accepts the sealed manifest params verbatim', () => {
    expect(HalalFastMomentumCashCoreParamsSchema.parse(P)).toEqual(P);
    expect(P.lookbackDays).toBe(63);
    expect(P.skipRecentDays).toBe(2);
    expect(P.absoluteThreshold).toBe(0);
    expect(P.topN).toBe(5);
    expect(P.cashFloor).toBe(2);
    expect(P.perNameCap).toBe(0.25);
    expect(P.maxNames).toBe(60);
    expect(P.fastMomentumTargetWeight).toBe(0.3);
    expect(P.rebalanceBand).toBe(0.03);
    expect(P.validationTrials).toBe(9);
  });

  it('rejects ANY engine parameter that moves — this lane changes allocation only', () => {
    for (const override of [
      { lookbackDays: 42 }, { lookbackDays: 84 }, { skipRecentDays: 5 }, { absoluteThreshold: 0.01 },
      { topN: 4 }, { topN: 10 }, { cashFloor: 3 }, { perNameCap: 0.2 }, { maxNames: 100 },
      { version: 'v2' }, { validationTrials: 12 },
    ]) {
      expect(() => HalalFastMomentumCashCoreParamsSchema.parse({ ...P, ...override })).toThrow();
    }
  });

  it('rejects a redefined reserve clause, so a paid reserve can never run under this id', () => {
    for (const override of [
      { reserve: 'short_duration_bond_fund' },
      { reserveRemuneration: 'overnight_deposit_return' },
      { rebalanceTrigger: 'every_session' },
      { intraWeekRebalance: true },
      { longOnlyCash: false },
      { bandReference: 'invested_fraction_only' },
      { fastMomentumTargetWeight: 0 },
      { fastMomentumTargetWeight: 1.5 },
      { rebalanceBand: -0.01 },
    ]) {
      expect(() => HalalFastMomentumCashCoreParamsSchema.parse({ ...P, ...override })).toThrow();
    }
  });

  it('accepts every sealed plateau cell value on the two declared axes', () => {
    for (const fastMomentumTargetWeight of [0.25, 0.3, 0.35]) {
      for (const rebalanceBand of [0.02, 0.03, 0.05]) {
        expect(() => HalalFastMomentumCashCoreParamsSchema.parse({
          ...P, fastMomentumTargetWeight, rebalanceBand,
        })).not.toThrow();
      }
    }
  });
});

describe('halal-fast-momentum-cash-core v1 — (a) the book is 30% engine, 70% reserve', () => {
  it('sums selected target weights to exactly the sealed 0.30, never 1.0', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.01);
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    const weights = bookWeights(input.symbols, DECISION_1, scope);

    expect(weights.size).toBe(5); // topN, unchanged
    expect(sum(weights)).toBeCloseTo(0.3, 12);
    expect(sum(weights)).toBeLessThan(0.9);
    for (const weight of Array.from(weights.values())) expect(weight).toBeLessThanOrEqual(0.3 * 0.25 + 1e-12);
  });

  it('holds no opinion between ISO-week decisions, so nothing rebalances intra-week', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.01);
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });

    expect(halalFastMomentumCashCoreSetup.targetWeight!(ctx('SYM000', MID_WEEK, scope), P)).toBeNull();
    expect(halalFastMomentumCashCoreSetup.targetWeight!(
      { ...ctx('SYM000', DECISION_1, scope), market: 'TADAWUL' } as unknown as StrategyPointInTimeContext,
      P,
    )).toBe(0);
  });
});

describe('halal-fast-momentum-cash-core v1 — (b) the reserve leg is inert', () => {
  it('has no remuneration term anywhere in the executable code', () => {
    const source = readFileSync(new URL('./halalFastMomentumCashCore.ts', import.meta.url), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/non_interest_bearing/g, '')
      .replace(/non-interest-bearing/g, '');

    expect(code).not.toMatch(/interest/i);
    expect(code).not.toMatch(/yield/i);
    expect(code).not.toMatch(/accru/i);
    expect(code).not.toMatch(/coupon/i);
    expect(code).not.toMatch(/\bapy\b/i);
    expect(code).not.toMatch(/risk[-_]?free/i);
    expect(P.reserve).toBe('non_interest_bearing_cash');
    expect(P.reserveRemuneration).toBe('none_zero_return_non_interest_bearing');
  });

  it('never moves the sleeve share when prices are flat, over any number of periods', () => {
    const flat = [{ weight: 0.5, priceRelative: 1 }, { weight: 0.5, priceRelative: 1 }];
    let share = 0.3;
    for (let period = 0; period < 500; period++) share = driftedSleeveShare(share, flat);

    expect(share).toBe(0.3); // exact: a paid reserve would drag this DOWN every single period
    expect(driftedSleeveShare(0.3, [])).toBe(0.3); // an all-cash engine week cannot drift either
    expect(driftedSleeveShare(0.3, [{ weight: 1, priceRelative: 1 }])).toBe(0.3);
  });

  it('drifts by price alone, and hand-computably so', () => {
    // Sleeve doubles, reserve does nothing: 0.3*2 / (0.7 + 0.6) = 0.6/1.3.
    expect(driftedSleeveShare(0.3, [{ weight: 1, priceRelative: 2 }])).toBeCloseTo(0.6 / 1.3, 15);
    // Sleeve halves: 0.15 / (0.7 + 0.15).
    expect(driftedSleeveShare(0.3, [{ weight: 1, priceRelative: 0.5 }])).toBeCloseTo(0.15 / 0.85, 15);
    // Half the sleeve is the engine's OWN cash, which is inert too: growth = 0.5 + 0.5*2 = 1.5.
    expect(driftedSleeveShare(0.3, [{ weight: 0.5, priceRelative: 2 }])).toBeCloseTo(0.45 / 1.15, 15);
  });
});

describe('halal-fast-momentum-cash-core v1 — (c) the 3pp no-trade band', () => {
  it('suppresses under the band, restores strictly over it, per the sealed rebalance rule', () => {
    expect(resolveSleeveShare(0.32, 0.3, 0.03)).toEqual({ rebalanced: false, share: 0.32 });
    expect(resolveSleeveShare(0.28, 0.3, 0.03)).toEqual({ rebalanced: false, share: 0.28 });
    expect(resolveSleeveShare(0.35, 0.3, 0.03)).toEqual({ rebalanced: true, share: 0.3 });
    expect(resolveSleeveShare(0.25, 0.3, 0.03)).toEqual({ rebalanced: true, share: 0.3 });
    expect(resolveSleeveShare(null, 0.3, 0.03)).toEqual({ rebalanced: true, share: 0.3 });
    // The manifest writes the trigger as |w_actual - 0.30| > 0.03, STRICTLY. Pinned on an exactly
    // representable boundary so the reader never has to guess which side it falls on.
    expect(Math.abs(0.75 - 0.5)).toBe(0.25);
    expect(resolveSleeveShare(0.75, 0.5, 0.25)).toEqual({ rebalanced: false, share: 0.75 });
    expect(resolveSleeveShare(0.75, 0.5, 0.2499)).toEqual({ rebalanced: true, share: 0.5 });
  });

  it('suppresses the allocation trade end to end when the week drifts under 3pp', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.002); // ~1% weekly sleeve move
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    bookWeights(input.symbols, DECISION_1, scope);
    const second = bookWeights(input.symbols, DECISION_2, scope);
    const observed = Number(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_observed_share'));

    expect(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_rebalanced')).toBe('false');
    expect(observed).toBeGreaterThan(0.3);
    expect(observed).toBeLessThanOrEqual(0.33);
    expect(sum(second)).toBeCloseTo(observed, 8);
    expect(sum(second)).not.toBeCloseTo(0.3, 8);
  });

  it('restores the sealed 0.30 end to end when the week drifts over 3pp', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.05); // ~27% weekly sleeve move
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    bookWeights(input.symbols, DECISION_1, scope);
    const second = bookWeights(input.symbols, DECISION_2, scope);
    const observed = Number(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_observed_share'));

    expect(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_rebalanced')).toBe('true');
    expect(observed).toBeGreaterThan(0.33);
    expect(sum(second)).toBeCloseTo(0.3, 12);
  });

  it('gives each plateau cell its own chain and honors its OWN band on the same drift', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.032); // drift engineered to land BETWEEN 2pp and 5pp
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    const tight = { ...P, rebalanceBand: 0.02 };
    const wide = { ...P, rebalanceBand: 0.05 };
    bookWeights(input.symbols, DECISION_1, scope, tight);
    bookWeights(input.symbols, DECISION_1, scope, wide);
    const observedTight = Number(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_observed_share', tight));
    const observedWide = Number(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_observed_share', wide));

    expect(observedTight).toBeCloseTo(observedWide, 12); // same drift, two independent chains
    expect(observedTight - 0.3).toBeGreaterThan(0.02);
    expect(observedTight - 0.3).toBeLessThan(0.05);
    expect(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_rebalanced', tight)).toBe('true');
    expect(evidenceValue('SYM000', DECISION_2, scope, 'sleeve_rebalanced', wide)).toBe('false');
    expect(sum(bookWeights(input.symbols, DECISION_2, scope, tight))).toBeCloseTo(0.3, 12);
    expect(sum(bookWeights(input.symbols, DECISION_2, scope, wide))).toBeCloseTo(observedWide, 8);
  });
});

describe('halal-fast-momentum-cash-core v1 — (d) allocation scales, it never re-ranks', () => {
  it('reproduces halal-fast-momentum-core relative weights bit-for-bit at 0.30x', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.01);
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    halalFastMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });

    const cash = bookWeights(input.symbols, DECISION_1, scope);
    const core = new Map<string, number>();
    for (const symbol of input.symbols) {
      const weight = halalFastMomentumCoreSetup.targetWeight!(ctx(symbol, DECISION_1, scope));
      if (weight !== null && weight > 0) core.set(symbol, weight);
    }

    expect(Array.from(cash.keys())).toEqual(Array.from(core.keys())); // identical selection
    expect(sum(core)).toBeCloseTo(1, 12); // the baseline is fully invested; this book is not
    for (const [symbol, weight] of Array.from(core.entries())) {
      expect(Object.is(cash.get(symbol), 0.3 * weight)).toBe(true); // one common scalar, no re-rank
    }
    const ranked = Array.from(cash.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s);
    const coreRanked = Array.from(core.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s);
    expect(ranked).toEqual(coreRanked);
  });

  it('keeps the same relative weights at every plateau allocation, only the scalar moves', () => {
    const scope = {};
    const input = makeMomentumBook(10, 0.01);
    halalFastMomentumCashCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    const at30 = bookWeights(input.symbols, DECISION_1, scope, P);
    const at35 = bookWeights(input.symbols, DECISION_1, scope, { ...P, fastMomentumTargetWeight: 0.35 });

    expect(sum(at35)).toBeCloseTo(0.35, 12);
    for (const [symbol, weight] of Array.from(at30.entries())) {
      expect(at35.get(symbol)! / weight).toBeCloseTo(0.35 / 0.3, 12);
    }
  });
});

describe('halal-fast-momentum-cash-core v1 — (e) the frozen 3x3 plateau grid', () => {
  it('resolves 9 distinct cells centered on (0.30, 0.03)', () => {
    const neighborhood = halalFastMomentumCashCoreSetup.plateauNeighborhood!(P);
    const cells = [neighborhood.center, ...neighborhood.neighbors.map((n) => n.params)];
    const keys = new Set(cells.map((c) => `${c.fastMomentumTargetWeight}|${c.rebalanceBand}`));

    expect(neighborhood.axes).toEqual(['fastMomentumTargetWeight', 'rebalanceBand']);
    expect(neighborhood.center.fastMomentumTargetWeight).toBe(0.3);
    expect(neighborhood.center.rebalanceBand).toBe(0.03);
    expect(neighborhood.neighbors).toHaveLength(8);
    expect(keys.size).toBe(9);
    expect(P.validationTrials).toBe(9);
    expect(new Set(neighborhood.neighbors.map((n) => n.label)).size).toBe(8);
    for (const cell of cells) {
      expect(HalalFastMomentumCashCoreParamsSchema.parse(cell)).toEqual(cell);
      expect([0.25, 0.3, 0.35]).toContain(cell.fastMomentumTargetWeight);
      expect([0.02, 0.03, 0.05]).toContain(cell.rebalanceBand);
      expect(cell.lookbackDays).toBe(63); // no engine axis is swept, because none exists here
      expect(cell.topN).toBe(5);
    }
  });
});

describe('halal-fast-momentum-cash-core v1 — harness registration', () => {
  it('is catalogued, shared-route, fenced, and counted in the halal-core family', () => {
    expect(STRATEGY_SETUP_CATALOG[HALAL_FAST_MOMENTUM_CASH_CORE_ID]).toBe(halalFastMomentumCashCoreSetup);
    expect(selectDailyBacktestRoute(HALAL_FAST_MOMENTUM_CASH_CORE_ID)).toBe('shared');
    expect(requiresPointInTimeMembership(HALAL_FAST_MOMENTUM_CASH_CORE_ID)).toBe(true);
    expect(validationTrialsForSetup(HALAL_FAST_MOMENTUM_CASH_CORE_ID, P)).toBe(9);
    expect(trialCountEvidence(HALAL_FAST_MOMENTUM_CASH_CORE_ID, 9)).toMatchObject({
      familyId: 'halal-core-2026q3-v1', familyTrials: 126, relatedSetups: 14, tier: 'EXPLORATORY',
    });
  });

  it('keeps the baseline book policy, so the gross governor cannot add an intra-week trade', () => {
    const policy = strategyBookPolicyForSetup(HALAL_FAST_MOMENTUM_CASH_CORE_ID, P);

    expect(policy).toEqual(halalFastMomentumCashCoreBookPolicy(P));
    expect(policy).toEqual({ maxGrossFraction: 1, maxOpenPositions: 60, decisionHistoryBars: 68 });
  });
});
