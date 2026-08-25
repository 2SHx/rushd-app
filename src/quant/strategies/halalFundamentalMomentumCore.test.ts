// Pure decision-logic tests for halal-fundamental-momentum-core v1. The six load-bearing claims (the
// ones a wrong implementation would silently break, corrupting the experiment's conclusion):
//   (a) a name whose PIT revenue-growth percentile is BELOW the floor is EXCLUDED from the top-5 even
//       though its momentum rank alone would have admitted it;
//   (b) a name with NO usable pair of consecutive filings is ADMITTED (ADMIT_UNCONDITIONED), never
//       excluded -- otherwise the rule becomes a covert bet on filing coverage;
//   (c) a filing whose `releasedAt` is AFTER the decision close is NOT used even when its `asOf` is
//       before it -- the look-ahead trap, tested on the value AND on the resulting book;
//   (d) with the gate set so nothing is filtered, the selected top-5 is byte-identical to
//       `halal-fast-momentum-core` on the same fixture -- the isolation guarantee of the A/B;
//   (e) the frozen plateau grid resolves 9 distinct cells centred on (0.50, 5);
//   (f) `medianWeeklyGatedSkips` is computed and exposed on the run's evidence -- F1 depends on it.
// Validation evidence comes solely from real-bar CLI runs (docs/STRATEGY_LAB.md); nothing here is a
// performance claim. ZERO backtests were run to produce this file.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { LookaheadError, assertNoLookahead } from '../data/pointInTime';
import { trialCountEvidence } from '../backtest/trialFamilies';
import { requiresPointInTimeMembership } from '../universe/pointInTimeMembership';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import { HALAL_FAST_MOMENTUM_CORE_V1, halalFastMomentumCoreSetup } from './halalFastMomentumCore';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  GATED_SKIP_PROBE_DEPTH,
  HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID,
  HALAL_FUNDAMENTAL_MOMENTUM_CORE_V1,
  HalalFundamentalMomentumCoreParamsSchema,
  type FundamentalFilingRow,
  type HalalFundamentalMomentumCoreParams,
  halalFundamentalMomentumCoreBookPolicy,
  halalFundamentalMomentumCoreSetup,
  medianWeeklyGatedSkips,
  pointInTimeRevenueGrowth,
  revenueGrowthPercentiles,
  selectGatedTopN,
} from './halalFundamentalMomentumCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
// 2023-01-02 is a Monday, so the synthetic calendar's trading days map 1:1 onto weekdays and the last
// bar is guaranteed to be its own ISO week's max timestamp. Same fixture shape as the baseline's.
const START = Date.UTC(2023, 0, 2);
const HISTORY_DATES = Array.from({ length: 64 }, (_, i) => new Date(START + i * DAY));
const WEEK_END = HISTORY_DATES.at(-1)!;

type Row = { ts: Date; close: number; volume: number };
const P = HALAL_FUNDAMENTAL_MOMENTUM_CORE_V1;
/** Gate disabled: every percentile is >= 0, so nothing can ever be filtered. */
const OPEN_GATE: HalalFundamentalMomentumCoreParams = { ...P, minRevenueGrowthPercentile: 0 };

function symbolAt(i: number): string {
  return `SYM${String(i).padStart(3, '0')}`;
}

/** Byte-identical price fixture to halalFastMomentumCore.test.ts's, so (d) compares like with like. */
function makeBars(n: number): Map<string, Row[]> {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  for (let s = 0; s < n; s++) {
    const trendPerBar = 0.014 - s * 0.00022; // strictly decreasing, always > 0 for s < 63
    const volAmp = 0.003 + s * 0.0003; // strictly increasing
    let price = 100;
    dailyBarsBySymbol.set(symbolAt(s), HISTORY_DATES.map((ts, i) => {
      if (i > 0) price *= (1 + trendPerBar) * (1 + (i % 2 === 0 ? volAmp : -volAmp));
      return { ts, close: price, volume: 1_000_000 };
    }));
  }
  return dailyBarsBySymbol;
}

/** Two consecutive 10-Ks, both public well before the fixture window, yielding exactly `growth`. */
function filingsFor(growth: number): FundamentalFilingRow[] {
  return [
    { asOf: new Date(Date.UTC(2020, 11, 31)), releasedAt: new Date(Date.UTC(2021, 1, 15)), totalRevenueUsd: 1_000 },
    { asOf: new Date(Date.UTC(2021, 11, 31)), releasedAt: new Date(Date.UTC(2022, 1, 15)), totalRevenueUsd: 1_000 * (1 + growth) },
  ];
}

function prepareInput(
  filings: Map<string, FundamentalFilingRow[]>,
  n = 10,
): UniversePrepareInput {
  const dailyBarsBySymbol = makeBars(n);
  return {
    symbols: Array.from(dailyBarsBySymbol.keys()),
    closesBySymbol: new Map(),
    dailyBarsBySymbol,
    fundamentalsBySymbol: filings,
  };
}

function ctx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], snapshot: null,
    positionQty: new D(0), entryPrice: null, entryTs: null, replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

/** Symbols carrying weight at the fixture's single week-end, in canonical order. */
function selected(
  setup: { targetWeight?: (c: StrategyPointInTimeContext, p?: any) => number | null },
  params: unknown,
  scope: object,
  n = 10,
): string[] {
  const out: string[] = [];
  for (let s = 0; s < n; s++) {
    const symbol = symbolAt(s);
    const weight = setup.targetWeight!(ctx(symbol, WEEK_END, scope), params as any);
    if (weight !== null && weight > 0) out.push(symbol);
  }
  return out;
}

describe('halal-fundamental-momentum-core v1 — frozen manifest params, not a retune', () => {
  it('parses the manifest defaults and pins every non-numeric gate clause as versioned config', () => {
    expect(HalalFundamentalMomentumCoreParamsSchema.parse(P)).toEqual(P);
    expect(P.lookbackDays).toBe(63);
    expect(P.skipRecentDays).toBe(2);
    expect(P.absoluteThreshold).toBe(0);
    expect(P.topN).toBe(5);
    expect(P.cashFloor).toBe(2);
    expect(P.perNameCap).toBe(0.25);
    expect(P.maxNames).toBe(60);
    expect(P.minRevenueGrowthPercentile).toBe(0.5);
    expect(P.revenueGrowthMissingPolicy).toBe('ADMIT_UNCONDITIONED');
    expect(P.revenueGrowthPercentileBasis)
      .toBe('cross_sectional_rank_over_eligible_sleeve_names_at_this_decision_date_only');
    expect(P.minEligibleNamesGuard).toBe(0);
  });

  it('rejects a sweep of the FROZEN price axis, so lookbackDays can never mask the new one', () => {
    expect(() => HalalFundamentalMomentumCoreParamsSchema.parse({ ...P, lookbackDays: 42 })).toThrow();
    expect(() => HalalFundamentalMomentumCoreParamsSchema.parse({ ...P, skipRecentDays: 5 })).toThrow();
    expect(() => HalalFundamentalMomentumCoreParamsSchema.parse({ ...P, revenueGrowthMissingPolicy: 'EXCLUDE' }))
      .toThrow();
  });

  it('is registered in the catalog, inside the QDR-14 fence, and in the trial family', () => {
    expect(STRATEGY_SETUP_CATALOG[HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID]).toBe(halalFundamentalMomentumCoreSetup);
    expect(requiresPointInTimeMembership(HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID)).toBe(true);
    const trials = trialCountEvidence(HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID, P.validationTrials);
    expect(trials.tier).toBe('EXPLORATORY');
    expect(trials.familyTrials).toBe(135);
    expect(trials.relatedSetups).toBe(15);
    expect(halalFundamentalMomentumCoreBookPolicy(P))
      .toEqual({ maxGrossFraction: 1, maxOpenPositions: 60, decisionHistoryBars: 68 });
  });
});

describe('halal-fundamental-momentum-core v1 — (c) the look-ahead trap: releasedAt, never asOf', () => {
  const decisionClose = new Date(Date.UTC(2023, 0, 2));
  // FY2021 (public 2022-02-15) and FY2022 (public 2023-02-15). At a 2023-01-02 decision the FY2022
  // row DESCRIBES a period that already ended (asOf 2022-12-31 < decision) but was NOT YET PUBLIC.
  const rows: FundamentalFilingRow[] = [
    { asOf: new Date(Date.UTC(2020, 11, 31)), releasedAt: new Date(Date.UTC(2021, 1, 15)), totalRevenueUsd: 100 },
    { asOf: new Date(Date.UTC(2021, 11, 31)), releasedAt: new Date(Date.UTC(2022, 1, 15)), totalRevenueUsd: 110 },
    { asOf: new Date(Date.UTC(2022, 11, 31)), releasedAt: new Date(Date.UTC(2023, 1, 15)), totalRevenueUsd: 500 },
  ];

  it('uses ONLY the pair public at the close: +10%, never the +354.5% not-yet-filed year', () => {
    expect(pointInTimeRevenueGrowth(rows, decisionClose)).toBeCloseTo(0.1, 12);
    // The trap value an `asOf`-keyed filter would have produced, stated explicitly so the mutation is
    // impossible to miss: (500 - 110) / 110.
    expect((500 - 110) / 110).toBeCloseTo(3.545454545, 9);
    expect(pointInTimeRevenueGrowth(rows, decisionClose)).not.toBeCloseTo(3.545454545, 6);
  });

  it('admits the filing the day it becomes public and not one millisecond earlier', () => {
    const released = new Date(Date.UTC(2023, 1, 15));
    expect(pointInTimeRevenueGrowth(rows, new Date(released.getTime() - 1))).toBeCloseTo(0.1, 12);
    expect(pointInTimeRevenueGrowth(rows, released)).toBeCloseTo((500 - 110) / 110, 9);
  });

  it('throws LookaheadError rather than silently trading a future filing', () => {
    const future = [{
      asOf: new Date(Date.UTC(2022, 11, 31)),
      releasedAt: new Date(Date.UTC(2030, 0, 1)),
      totalRevenueUsd: 999,
    }];
    // The slice removes it; forcing it past the slice is what the runtime assertion exists for.
    expect(pointInTimeRevenueGrowth(future, decisionClose)).toBeNull();
    expect(() => {
      const slice = future.filter((r) => r.asOf.getTime() <= decisionClose.getTime()); // the BUG
      assertNoLookahead(slice, decisionClose, 'releasedAt');
    }).toThrow(LookaheadError);
  });

  it('excludes a name from the book on the value that was public, not the one that was not', () => {
    // SYM000 has the strongest momentum, so it is admitted or rejected purely on its revenue growth.
    // Public pair ⇒ −50% growth (worst in the cross-section, percentile 0 ⇒ REJECTED at floor 0.50).
    // Not-yet-public pair ⇒ +900% (best, percentile 1 ⇒ would be ADMITTED). One trap, two outcomes.
    const filings = new Map<string, FundamentalFilingRow[]>();
    filings.set(symbolAt(0), [
      { asOf: new Date(Date.UTC(2020, 11, 31)), releasedAt: new Date(Date.UTC(2021, 1, 15)), totalRevenueUsd: 200 },
      { asOf: new Date(Date.UTC(2021, 11, 31)), releasedAt: new Date(Date.UTC(2022, 1, 15)), totalRevenueUsd: 100 },
      { asOf: new Date(Date.UTC(2022, 11, 31)), releasedAt: new Date(Date.UTC(2023, 11, 31)), totalRevenueUsd: 1_000 },
    ]);
    for (let s = 1; s < 10; s++) filings.set(symbolAt(s), filingsFor(0.10 + s * 0.01));
    const scope = {};
    halalFundamentalMomentumCoreSetup.prepareUniverse({ ...prepareInput(filings), replayScope: scope });
    expect(selected(halalFundamentalMomentumCoreSetup, P, scope)).not.toContain(symbolAt(0));
  });
});

describe('halal-fundamental-momentum-core v1 — pure gate math', () => {
  it('needs two usable consecutive filings, a non-null pair and a positive prior', () => {
    expect(pointInTimeRevenueGrowth(undefined, new Date())).toBeNull();
    expect(pointInTimeRevenueGrowth([], new Date())).toBeNull();
    expect(pointInTimeRevenueGrowth(filingsFor(0.2).slice(0, 1), WEEK_END)).toBeNull();
    const nulled = filingsFor(0.2);
    expect(pointInTimeRevenueGrowth(
      [{ ...nulled[0], totalRevenueUsd: null }, nulled[1]], WEEK_END,
    )).toBeNull();
    expect(pointInTimeRevenueGrowth(
      [{ ...nulled[0], totalRevenueUsd: 0 }, nulled[1]], WEEK_END,
    )).toBeNull();
    expect(pointInTimeRevenueGrowth(filingsFor(0.2), WEEK_END)).toBeCloseTo(0.2, 12);
  });

  it('ranks ascending over |ELIGIBLE|−1 and leaves fewer than two names unconditioned', () => {
    const pct = revenueGrowthPercentiles(new Map([['A', -0.5], ['B', 0], ['C', 0.5], ['D', 2], ['E', 9]]));
    expect(pct.get('A')).toBe(0);
    expect(pct.get('C')).toBe(0.5);
    expect(pct.get('E')).toBe(1);
    expect(revenueGrowthPercentiles(new Map([['A', 0.1]])).size).toBe(0);
    expect(revenueGrowthPercentiles(new Map()).size).toBe(0);
    // Ties take the MIDRANK, so an exact tie never becomes a covert alphabetical bet.
    const tied = revenueGrowthPercentiles(new Map([['A', 1], ['B', 1], ['C', 5]]));
    expect(tied.get('A')).toBe(0.25);
    expect(tied.get('B')).toBe(0.25);
    expect(tied.get('C')).toBe(1);
  });

  it('counts gated skips only inside the momentum-ranked top-15', () => {
    const eligible = Array.from({ length: 20 }, (_, i) => ({ symbol: symbolAt(i), relative: 20 - i }));
    const percentiles = new Map(eligible.map((e, i) => [e.symbol, i < 18 ? 0 : 1]));
    const { selected: picked, gatedSkips } = selectGatedTopN(eligible, percentiles, 5, 2, 0.5);
    expect(picked).toEqual([symbolAt(18), symbolAt(19)]); // only two names clear the floor at all
    expect(gatedSkips).toBe(GATED_SKIP_PROBE_DEPTH);
  });

  it('honours the baseline cash floor: below it nothing is selected, gate or no gate', () => {
    const one = [{ symbol: 'AAA', relative: 1 }];
    expect(selectGatedTopN(one, new Map(), 5, 2, 0).selected).toEqual([]);
  });
});

describe('halal-fundamental-momentum-core v1 — (a) below-floor names are excluded from the top-5', () => {
  it('drops the two strongest-momentum names when their revenue growth is bottom-decile', () => {
    // Momentum rank is strictly decreasing in symbol index (SYM000 strongest). Give the two strongest
    // names the WORST revenue growth in the cross-section and everyone else a clean positive number.
    const filings = new Map<string, FundamentalFilingRow[]>();
    filings.set(symbolAt(0), filingsFor(-0.9));
    filings.set(symbolAt(1), filingsFor(-0.8));
    for (let s = 2; s < 10; s++) filings.set(symbolAt(s), filingsFor(0.10 + s * 0.01));
    const scope = {};
    halalFundamentalMomentumCoreSetup.prepareUniverse({ ...prepareInput(filings), replayScope: scope });

    const gated = selected(halalFundamentalMomentumCoreSetup, P, scope);
    expect(gated).not.toContain(symbolAt(0));
    expect(gated).not.toContain(symbolAt(1));
    // Ten conditioned names ⇒ ranks 0..9 over a denominator of 9; the floor of 0.50 admits ranks
    // 5..9, i.e. SYM005..SYM009 — hand-checkable, and the two hottest names are gone.
    expect(gated).toEqual([symbolAt(5), symbolAt(6), symbolAt(7), symbolAt(8), symbolAt(9)]);
    // and the same names WOULD have been admitted on momentum alone:
    const open = selected(halalFundamentalMomentumCoreSetup, OPEN_GATE, scope);
    expect(open).toEqual([symbolAt(0), symbolAt(1), symbolAt(2), symbolAt(3), symbolAt(4)]);
  });
});

describe('halal-fundamental-momentum-core v1 — (b) missing filings ADMIT, never exclude', () => {
  it('keeps a name with no usable consecutive pair in the top-5 (ADMIT_UNCONDITIONED)', () => {
    const filings = new Map<string, FundamentalFilingRow[]>();
    filings.set(symbolAt(0), []); // no rows at all — the XOM case
    filings.set(symbolAt(1), filingsFor(0.2).slice(0, 1)); // a single filing, no pair
    filings.set(symbolAt(2), [
      { ...filingsFor(0.2)[0], totalRevenueUsd: null }, filingsFor(0.2)[1],
    ]); // a pair with an unusable revenue figure
    for (let s = 3; s < 10; s++) filings.set(symbolAt(s), filingsFor(0.10 + s * 0.01));
    const scope = {};
    halalFundamentalMomentumCoreSetup.prepareUniverse({ ...prepareInput(filings), replayScope: scope });

    // Even at a floor of 1.0 — where every CONDITIONED name below the maximum is rejected — the three
    // unconditioned names survive. An EXCLUDE policy would have emptied the book of exactly these.
    const strict = selected(halalFundamentalMomentumCoreSetup, { ...P, minRevenueGrowthPercentile: 1 }, scope);
    expect(strict.slice(0, 3)).toEqual([symbolAt(0), symbolAt(1), symbolAt(2)]);
    expect(strict).toContain(symbolAt(9)); // the single conditioned name at percentile 1.0
    expect(selected(halalFundamentalMomentumCoreSetup, P, scope).slice(0, 3))
      .toEqual([symbolAt(0), symbolAt(1), symbolAt(2)]);
  });

  it('fails closed when the harness supplies no filings feed at all', () => {
    const bars = makeBars(10);
    expect(() => halalFundamentalMomentumCoreSetup.prepareUniverse({
      symbols: Array.from(bars.keys()), closesBySymbol: new Map(), dailyBarsBySymbol: bars,
    })).toThrow(/fundamentalsBySymbol/);
  });
});

describe('halal-fundamental-momentum-core v1 — (d) an open gate is byte-identical to the comparator', () => {
  it('selects the same top-5 and the same weights as halal-fast-momentum-core', () => {
    const filings = new Map<string, FundamentalFilingRow[]>();
    for (let s = 0; s < 10; s++) filings.set(symbolAt(s), filingsFor(0.10 + s * 0.01));
    const input = prepareInput(filings);
    const scope = {};
    halalFundamentalMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });
    halalFastMomentumCoreSetup.prepareUniverse({ ...input, replayScope: scope });

    const mine: Record<string, number | null> = {};
    const baseline: Record<string, number | null> = {};
    for (let s = 0; s < 10; s++) {
      const symbol = symbolAt(s);
      mine[symbol] = halalFundamentalMomentumCoreSetup.targetWeight!(ctx(symbol, WEEK_END, scope), OPEN_GATE);
      baseline[symbol] = halalFastMomentumCoreSetup.targetWeight!(
        ctx(symbol, WEEK_END, scope), HALAL_FAST_MOMENTUM_CORE_V1,
      );
    }
    expect(mine).toEqual(baseline);
    expect(Object.values(mine).filter((w) => w !== null && w > 0)).toHaveLength(5);
    expect(medianWeeklyGatedSkips(scope, OPEN_GATE)).toBe(0); // an open gate skips nothing, by construction
  });
});

describe('halal-fundamental-momentum-core v1 — (e) the frozen 3×3 plateau grid', () => {
  it('resolves 9 distinct cells on (minRevenueGrowthPercentile, topN) centred on (0.50, 5)', () => {
    const neighborhood = halalFundamentalMomentumCoreSetup.plateauNeighborhood!(P);
    expect(neighborhood.axes).toEqual(['minRevenueGrowthPercentile', 'topN']);
    expect(neighborhood.center.minRevenueGrowthPercentile).toBe(0.5);
    expect(neighborhood.center.topN).toBe(5);
    expect(neighborhood.neighbors).toHaveLength(8);
    const cells = new Set([
      `${neighborhood.center.minRevenueGrowthPercentile}|${neighborhood.center.topN}`,
      ...neighborhood.neighbors.map((n) => `${n.params.minRevenueGrowthPercentile}|${n.params.topN}`),
    ]);
    expect(cells.size).toBe(9);
    expect(Array.from(cells).sort()).toEqual([
      '0.35|4', '0.35|5', '0.35|6', '0.5|4', '0.5|5', '0.5|6', '0.65|4', '0.65|5', '0.65|6',
    ]);
    // Every neighbour keeps the frozen price axis and parses as a valid param set.
    for (const n of neighborhood.neighbors) {
      expect(HalalFundamentalMomentumCoreParamsSchema.parse(n.params).lookbackDays).toBe(63);
    }
    expect(P.validationTrials).toBe(neighborhood.neighbors.length + 1);
  });
});

describe('halal-fundamental-momentum-core v1 — (f) F1 publishes medianWeeklyGatedSkips', () => {
  function fixtureWithSkips(): object {
    // 20 names; the 12 strongest by momentum sit at the bottom of the revenue cross-section. Ranks
    // 0..9 of 19 fall below the 0.50 floor, so the gate skips SYM000..SYM009 — ten of the top-15
    // momentum ranks — and the book takes SYM010..SYM014 instead.
    const filings = new Map<string, FundamentalFilingRow[]>();
    for (let s = 0; s < 20; s++) filings.set(symbolAt(s), filingsFor(s < 12 ? -0.5 + s * 0.001 : 0.5 + s * 0.001));
    const scope = {};
    halalFundamentalMomentumCoreSetup.prepareUniverse({ ...prepareInput(filings, 20), replayScope: scope });
    return scope;
  }

  it('computes the median count of gate-skipped top-15 momentum ranks per decision week', () => {
    const scope = fixtureWithSkips();
    expect(medianWeeklyGatedSkips(scope, P)).toBe(10);
    expect(medianWeeklyGatedSkips(scope, OPEN_GATE)).toBe(0);
    // F1's kill threshold is 2.0; the statistic must be able to land on either side of it.
    expect(medianWeeklyGatedSkips(scope, P)).toBeGreaterThanOrEqual(2);
    expect(medianWeeklyGatedSkips(scope, OPEN_GATE)).toBeLessThan(2);
  });

  it('exposes it, the per-week skip count and the PIT percentile on the run evidence', () => {
    const scope = fixtureWithSkips();
    const signal = halalFundamentalMomentumCoreSetup.signal(ctx(symbolAt(0), WEEK_END, scope), P);
    const refs = new Map(signal.evidence.map((e) => [e.ref, e.value]));
    expect(refs.get('median_weekly_gated_skips')).toBe('10.0000');
    expect(refs.get('gated_skips_top15')).toBe('10');
    expect(refs.get('min_revenue_growth_percentile')).toBe('0.5');
    expect(refs.get('revenue_growth_missing_policy')).toBe('ADMIT_UNCONDITIONED');
    expect(refs.get('conditioned_names')).toBe('20');
    expect(refs.get('revenue_growth_percentile')).toBe('0.000000'); // weakest revenue growth of 20
    expect(refs.get('pit_membership_fence')).toBe('blocked_unverified_diagnostic_only');
    expect(signal.determinism).toBe('deterministic');
    expect(signal.costCents).toBe(0);
  });

  it('is a POST-HOC diagnostic: reading it never changes a single target weight', () => {
    const before = fixtureWithSkips();
    const withoutDiagnostic = selected(halalFundamentalMomentumCoreSetup, P, before, 20);
    const after = fixtureWithSkips();
    expect(medianWeeklyGatedSkips(after, P)).toBe(10);
    expect(selected(halalFundamentalMomentumCoreSetup, P, after, 20)).toEqual(withoutDiagnostic);
  });
});
