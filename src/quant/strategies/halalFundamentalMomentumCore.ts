// halal-fundamental-momentum-core v1 — ISOLATED point-in-time FUNDAMENTAL-GATE A/B against
// `halal-fast-momentum-core@v1` (top-5, WEEKLY, 63d/skip2; terminal card: OOS CAGR 105.92%,
// MC book-day p95 DD 68.40%, OOS DSR 0.874, 1,390 trades).
//
// EXACTLY ONE NEW SELECTION VARIABLE: a point-in-time, cross-sectional trailing-annual REVENUE-GROWTH
// percentile gate on admission to the top-5. Ranking (dualMomentumMetrics, imported unchanged), the
// absolute filter, inverse-volatility sizing, the 25% per-name cap, the 2-name cash floor, the weekly
// ISO-week cadence, decide-close/fill-next-open and the 60-name C1 sleeve are byte-identical to the
// baseline. Sizing, exits and cadence do not move. Params are copied verbatim from
// docs/quant-experiments/halal-fundamental-momentum-core-v1.json — no retune.
//
// A-PRIORI HYPOTHESIS (frozen in the manifest before any run): a pure price signal cannot separate a
// run driven by business acceleration from one driven by multiple re-rating or crowding — both look
// identical to a 63d/skip2 relative rank. Trailing-annual revenue growth is the one axis in the
// database that is (a) never a function of price and (b) directly measures whether the business
// behind the run is growing, so it can veto exactly the names momentum alone cannot distinguish.
// The manifest predicts REJECTED: this lane is EXPLORATORY, it SCREENS and CANNOT PROMOTE.
//
// THE RULE (verbatim from the manifest's selectionRule):
//  1. 63d/skip2 relative momentum + absolute filter (>0) over the 60-name sleeve — the identical
//     ranked survivor list the comparator uses.
//  2. For EVERY sleeve name compute revenueGrowth from rows PIT-sliced to `releasedAt <= decision
//     close`, then assertNoLookahead(rows, asOf, 'releasedAt').
//  3. ELIGIBLE = sleeve names with a finite revenueGrowth at this decision date. Percentile =
//     (rank among ELIGIBLE ascending) / (|ELIGIBLE| − 1). |ELIGIBLE| < 2 ⇒ everyone unconditioned.
//  4. Walk the momentum-ranked survivor list in rank order; ADMIT when the name is not ELIGIBLE
//     (fallback) or its percentile >= minRevenueGrowthPercentile. Stop at topN; a shortfall is held
//     in cash exactly as cashFloor already permits.
//  5. Everything downstream is byte-identical to the comparator.
//
// ADMIT_UNCONDITIONED, and why it is ADMIT and never EXCLUDE: a name without two usable consecutive
// filings is ADMITTED. Excluding would make the rule a covert bet on FILING COVERAGE rather than on
// business quality (coverage rises from 18/60 conditioned names in 2018 to 57-58/60 in 2026, so an
// EXCLUDE rule would mechanically hold cash in the early sample and stocks in the late one). ADMIT
// also makes total inertness of the fundamental collapse the book EXACTLY onto the comparator, which
// is what makes falsification condition F1 (INERT AXIS) detectable at all.
//
// THE ONE PLACE LOOK-AHEAD CAN ENTER THIS DESIGN: `prepareUniverse` is SYNCHRONOUS, so the filings
// cannot be read from the DB inside a decision. The harness loads the RAW, UNSLICED table (runLab.ts,
// mirroring `benchmarkDailyBarsBySymbol`) and THIS FILE does the point-in-time slice. The slice keys
// on `releasedAt` — when the filing became public — and NEVER on `asOf`, which is the fiscal period
// the filing DESCRIBES. A 10-K describes a year that ended months before anyone could read it
// (measured staleness median 300-345 days, max 1,570), so an `asOf` gate would hand every decision
// figures that were not yet public. `assertNoLookahead(rows, asOf, 'releasedAt')` runs on every read,
// against the raw rows, so the assertion is live in production and not a tautology over a pre-sliced
// harness feed.
//
// Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — minRevenueGrowthPercentile ∈
// {0.35,0.50,0.65} × topN ∈ {4,5,6}, center = {0.50,5}. `lookbackDays` is pinned to a zod LITERAL 63
// (and skipRecentDays to 2) because the comparator's own plateau already established that 42d is
// where the price signal turns noisy; re-sweeping it here would guarantee a plateau failure driven by
// the OLD axis and mask the NEW one.
// QDR-14: this id is in PIT_MEMBERSHIP_REQUIRED_SETUP_IDS. Historical membership, delisting lifecycle
// and per-name point-in-time Sharia evidence do not exist for this window, so EVERY run of this
// version is unverified-diagnostic-only and cannot produce a terminal card. The fence opens only by
// the QDR-14 disclosure-bound waiver, never silently.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot), unchanged.
// Execution remains paper/simulated only per standing RUSHD policy.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import { inverseVolatilityWeights } from './halalRiskParityCore';
import { dualMomentumMetrics } from './dualMomentumRotation';
import { selectTopNByMomentum } from './halalFastMomentumCore';
import { median } from './gapperCalibration';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID = 'halal-fundamental-momentum-core' as const;

/**
 * F1's probe depth. `medianWeeklyGatedSkips` counts, per decision week, how many names inside the
 * MOMENTUM-ranked top-15 the revenue-growth gate skipped. 15 is fixed by the manifest's falsification
 * clause and is deliberately independent of `topN` so the statistic does not move when topN sweeps.
 */
export const GATED_SKIP_PROBE_DEPTH = 15;

/**
 * The gate's non-numeric clauses are part of the VERSIONED CONFIG, not implementation trivia
 * (QDR-6: "screener parameters are a versioned config, never hardcoded"). They are pinned as zod
 * literals so a manifest that silently redefines the source, the pairing, the percentile basis or the
 * missing-data policy fails closed at parse time instead of running a different experiment under this
 * id. `lookbackDays`/`skipRecentDays` are literals for the same reason: they are FROZEN by the
 * manifest's plateau note and must not become a second moving axis.
 */
export const HalalFundamentalMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.literal(63),
  skipRecentDays: z.literal(2),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  cashFloor: z.literal(2),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
  minRevenueGrowthPercentile: z.number().min(0).max(1),
  revenueGrowthSource: z.literal(
    'Fundamentals.metrics.totalRevenueUsd (form 10-K only; the only form present in all 3,813 rows)',
  ),
  revenueGrowthPairing: z.literal(
    "current = the row selected by PointInTimeStore.fundamentals(symbol,'NASDAQ',decisionClose) i.e. orderBy [releasedAt desc, asOf desc] over releasedAt <= decisionClose; prior = among rows with releasedAt <= decisionClose the one with the greatest asOf strictly less than current.asOf; growth = (current.totalRevenueUsd - prior.totalRevenueUsd) / prior.totalRevenueUsd, requires both non-null and prior > 0",
  ),
  revenueGrowthPercentileBasis: z.literal(
    'cross_sectional_rank_over_eligible_sleeve_names_at_this_decision_date_only',
  ),
  revenueGrowthMissingPolicy: z.literal('ADMIT_UNCONDITIONED'),
  minEligibleNamesGuard: z.literal(0),
});
export type HalalFundamentalMomentumCoreParams = z.infer<typeof HalalFundamentalMomentumCoreParamsSchema>;

export const HALAL_FUNDAMENTAL_MOMENTUM_CORE_V1: HalalFundamentalMomentumCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 63,
  skipRecentDays: 2,
  absoluteThreshold: 0,
  topN: 5,
  cashFloor: 2,
  perNameCap: 0.25,
  maxNames: 60,
  validationTrials: 9,
  minRevenueGrowthPercentile: 0.5,
  revenueGrowthSource:
    'Fundamentals.metrics.totalRevenueUsd (form 10-K only; the only form present in all 3,813 rows)',
  revenueGrowthPairing:
    "current = the row selected by PointInTimeStore.fundamentals(symbol,'NASDAQ',decisionClose) i.e. orderBy [releasedAt desc, asOf desc] over releasedAt <= decisionClose; prior = among rows with releasedAt <= decisionClose the one with the greatest asOf strictly less than current.asOf; growth = (current.totalRevenueUsd - prior.totalRevenueUsd) / prior.totalRevenueUsd, requires both non-null and prior > 0",
  revenueGrowthPercentileBasis:
    'cross_sectional_rank_over_eligible_sleeve_names_at_this_decision_date_only',
  revenueGrowthMissingPolicy: 'ADMIT_UNCONDITIONED',
  minEligibleNamesGuard: 0,
});

export function halalFundamentalMomentumCoreBookPolicy(
  params?: HalalFundamentalMomentumCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

/** One raw filing row as handed over by the harness. NOT pre-sliced to any decision date. */
export interface FundamentalFilingRow {
  /** The fiscal period the filing DESCRIBES. Never a point-in-time key. */
  readonly asOf: Date;
  /** When the filing became PUBLIC. The only legal point-in-time key. */
  readonly releasedAt: Date;
  readonly totalRevenueUsd: number | null;
}

// Compact per-symbol price storage (Float64Array), matching the baseline's convention exactly.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface PercentileSlice {
  /** |ELIGIBLE| — sleeve names carrying a finite revenue growth at this decision close. */
  readonly conditioned: number;
  /** Empty when |ELIGIBLE| < 2: every name is unconditioned that week. */
  readonly percentileBySymbol: ReadonlyMap<string, number>;
}

interface FundamentalMomentumState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  /** Every prepared sleeve name, sorted — the percentile's cross-sectional basis. */
  readonly sleeveSymbols: readonly string[];
  readonly fundamentalsBySymbol: ReadonlyMap<string, readonly FundamentalFilingRow[]>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class the monthly siblings document).
  readonly decisionCache: Map<string, FundamentalMomentumDecision>;
  /** Keyed by decision close only — the percentile slice carries no parameter dependence. */
  readonly percentileCache: Map<number, PercentileSlice>;
  /** Keyed by param signature — the F1 run-level diagnostic, memoized (never a decision input). */
  readonly gatedSkipMedianCache: Map<string, number>;
}

interface FundamentalMomentumDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly conditioned: number;
  readonly gatedSkips: number;
  readonly selected: number;
  readonly percentileBySymbol: ReadonlyMap<string, number>;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

const EMPTY_DECISION: FundamentalMomentumDecision = {
  reason: 'below_cash_floor',
  rankable: 0, eligible: 0, conditioned: 0, gatedSkips: 0, selected: 0,
  percentileBySymbol: new Map(), weights: new Map(),
};

let UNSCOPED_STATE: FundamentalMomentumState | null = null;
const SCOPED_STATES = new WeakMap<object, FundamentalMomentumState>();

function paramsOrDefault(
  params?: HalalFundamentalMomentumCoreParams,
): HalalFundamentalMomentumCoreParams {
  const parsed = HalalFundamentalMomentumCoreParamsSchema.parse(
    params ?? HALAL_FUNDAMENTAL_MOMENTUM_CORE_V1,
  );
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  return parsed;
}

/** ISO-8601 week key (year×100 + ISO week number) — byte-identical to the baseline's. */
function isoWeekKey(tsMs: number): number {
  const date = new Date(Date.UTC(
    new Date(tsMs).getUTCFullYear(),
    new Date(tsMs).getUTCMonth(),
    new Date(tsMs).getUTCDate(),
  ));
  const isoDayOfWeek = date.getUTCDay() || 7; // Mon=1..Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - isoDayOfWeek); // nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return date.getUTCFullYear() * 100 + weekNo;
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  if (!daily || daily.size === 0) {
    throw new Error(`${HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID} requires dailyBarsBySymbol for its resolved C1 sleeve`);
  }
  // FAIL CLOSED. An absent filings feed would leave every name unconditioned, collapsing the book
  // silently onto the comparator — i.e. it would look exactly like an F1 INERT AXIS result while
  // actually being a harness misconfiguration. That confusion must be impossible.
  const filings = input.fundamentalsBySymbol;
  if (!filings || filings.size === 0) {
    throw new Error(`${HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID} requires fundamentalsBySymbol; an absent filings feed is indistinguishable from an inert gate`);
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const weekEnds = new Map<number, number>(); // ISO week key → max ts
  for (const [symbol, rows] of Array.from(daily.entries())) {
    const ts = new Float64Array(rows.length);
    const close = new Float64Array(rows.length);
    let previous = Number.NEGATIVE_INFINITY;
    rows.forEach((row: { ts: Date; close: number }, i: number) => {
      const time = row.ts.getTime();
      if (!Number.isFinite(time) || time <= previous || !Number.isFinite(row.close) || row.close <= 0) {
        throw new Error(`invalid chronological daily history for ${symbol}`);
      }
      previous = time;
      ts[i] = time;
      close[i] = row.close;
      const w = isoWeekKey(time);
      weekEnds.set(w, Math.max(weekEnds.get(w) ?? Number.NEGATIVE_INFINITY, time));
    });
    seriesBySymbol.set(symbol, { ts, close });
  }
  // Filings are stored RAW and UNSLICED, sorted only for determinism. Slicing is a per-decision act.
  const fundamentalsBySymbol = new Map<string, readonly FundamentalFilingRow[]>();
  for (const [symbol, rows] of Array.from(filings.entries())) {
    for (const row of rows) {
      if (!(row.asOf instanceof Date) || !Number.isFinite(row.asOf.getTime())
        || !(row.releasedAt instanceof Date) || !Number.isFinite(row.releasedAt.getTime())) {
        throw new Error(`invalid filing dates for ${symbol}`);
      }
    }
    fundamentalsBySymbol.set(symbol, [...rows].sort((a, b) => (
      a.releasedAt.getTime() - b.releasedAt.getTime() || a.asOf.getTime() - b.asOf.getTime()
    )));
  }
  const state: FundamentalMomentumState = {
    seriesBySymbol,
    sleeveSymbols: Array.from(seriesBySymbol.keys()).sort(),
    fundamentalsBySymbol,
    weekEndTimes: new Set(weekEnds.values()),
    decisionCache: new Map(),
    percentileCache: new Map(),
    gatedSkipMedianCache: new Map(),
  };
  if (input.replayScope) SCOPED_STATES.set(input.replayScope, state);
  else UNSCOPED_STATE = state;
}

/** Index of the bar whose ts === target, or -1. Binary search over epoch-ms. */
function indexOf(series: CompactSeries, targetMs: number): number {
  let lo = 0;
  let hi = series.ts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.ts[mid] === targetMs) return mid;
    if (series.ts[mid] < targetMs) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Sample (n−1) standard deviation — identical definition to the baseline's private helper. */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * THE POINT-IN-TIME READ — the single place look-ahead can enter this design, isolated as a pure
 * function so it is testable without an engine.
 *
 * `rows` are RAW: they may contain filings released long after `asOf`. The slice keys on
 * `releasedAt` (when the filing became public) and NEVER on `asOf` (the period it describes), then
 * `assertNoLookahead` re-checks the sliced rows on the SAME key, so a mis-keyed filter throws
 * instead of quietly trading on tomorrow's revenue.
 *
 * Pairing (manifest `revenueGrowthPairing`, verbatim): `current` is the row
 * `PointInTimeStore.fundamentals` would return — orderBy [releasedAt desc, asOf desc] over the
 * visible rows; `prior` is the visible row with the greatest `asOf` STRICTLY LESS than
 * `current.asOf`. Returns null unless both revenues are non-null, `prior > 0`, and the ratio is
 * finite — null means ADMIT_UNCONDITIONED, never "exclude".
 */
export function pointInTimeRevenueGrowth(
  rows: readonly FundamentalFilingRow[] | undefined,
  asOf: Date,
): number | null {
  if (!rows || rows.length === 0) return null;
  const cutoff = asOf.getTime();
  const visible = rows.filter((row) => row.releasedAt.getTime() <= cutoff);
  assertNoLookahead(visible, asOf, 'releasedAt');
  if (visible.length < 2) return null;
  let current: FundamentalFilingRow | null = null;
  for (const row of visible) {
    if (!current) { current = row; continue; }
    const byReleased = row.releasedAt.getTime() - current.releasedAt.getTime();
    if (byReleased > 0 || (byReleased === 0 && row.asOf.getTime() > current.asOf.getTime())) current = row;
  }
  if (!current) return null;
  let prior: FundamentalFilingRow | null = null;
  for (const row of visible) {
    if (row.asOf.getTime() >= current.asOf.getTime()) continue;
    if (!prior || row.asOf.getTime() > prior.asOf.getTime()) prior = row;
  }
  if (!prior) return null;
  const now = current.totalRevenueUsd;
  const before = prior.totalRevenueUsd;
  if (now === null || before === null || !Number.isFinite(now) || !Number.isFinite(before)) return null;
  if (!(before > 0)) return null;
  const growth = (now - before) / before;
  return Number.isFinite(growth) ? growth : null;
}

/**
 * Cross-sectional percentile of each ELIGIBLE name: (rank among ELIGIBLE ascending) / (|ELIGIBLE|−1).
 * |ELIGIBLE| < 2 returns an EMPTY map — with fewer than two conditioned names the denominator is
 * undefined and every name is left unconditioned for that week (manifest step 3).
 *
 * Ties take the MIDRANK (the mean of the tied positions). A tie-break by symbol would hand the
 * alphabetically-earlier name a strictly lower percentile and turn an exact tie into a covert
 * alphabetical bet; the midrank is symmetric and still fully deterministic.
 */
export function revenueGrowthPercentiles(
  growthBySymbol: ReadonlyMap<string, number>,
): Map<string, number> {
  const entries = Array.from(growthBySymbol.entries()).filter(([, g]) => Number.isFinite(g));
  const out = new Map<string, number>();
  if (entries.length < 2) return out;
  const sorted = entries.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  const denominator = sorted.length - 1;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1][1] === sorted[i][1]) j++;
    const midrank = (i + j) / 2;
    for (let k = i; k <= j; k++) out.set(sorted[k][0], midrank / denominator);
    i = j + 1;
  }
  return out;
}

/**
 * THE ONE NEW SELECTION VARIABLE. Walks the momentum-ranked survivor list in rank order and admits a
 * name when it is UNCONDITIONED (absent from `percentileBySymbol` ⇒ ADMIT_UNCONDITIONED) or its
 * percentile >= `minPercentile`. Stops at `topN`; a shortfall is simply held in cash.
 *
 * The ordering AND the cash floor come from the baseline's exported `selectTopNByMomentum`, called
 * with `topN = eligible.length` so the full ranked list is produced by the comparator's own function
 * and never reimplemented. With a gate that admits everything, `selected` is therefore byte-identical
 * to `selectTopNByMomentum(eligible, topN, floor)`.
 *
 * `gatedSkips` is the F1 statistic: how many names inside the momentum-ranked top-15 the gate
 * skipped. It is a DIAGNOSTIC output and is never read back into the selection.
 */
export function selectGatedTopN(
  eligible: readonly { symbol: string; relative: number }[],
  percentileBySymbol: ReadonlyMap<string, number>,
  topN: number,
  floor: number,
  minPercentile: number,
): { selected: string[]; gatedSkips: number } {
  const ranked = selectTopNByMomentum(eligible, eligible.length, floor);
  const selected: string[] = [];
  let gatedSkips = 0;
  for (let i = 0; i < ranked.length; i++) {
    const symbol = ranked[i];
    const percentile = percentileBySymbol.get(symbol);
    if (percentile === undefined || percentile >= minPercentile) {
      if (selected.length < topN) selected.push(symbol);
    } else if (i < GATED_SKIP_PROBE_DEPTH) {
      gatedSkips++;
    }
    if (selected.length >= topN && i >= GATED_SKIP_PROBE_DEPTH - 1) break;
  }
  return { selected, gatedSkips };
}

/** PIT percentile slice for one decision close, memoized. Carries no parameter dependence. */
function percentilesAt(state: FundamentalMomentumState, asOf: Date): PercentileSlice {
  const key = asOf.getTime();
  const cached = state.percentileCache.get(key);
  if (cached) return cached;
  const growthBySymbol = new Map<string, number>();
  for (const symbol of state.sleeveSymbols) {
    const growth = pointInTimeRevenueGrowth(state.fundamentalsBySymbol.get(symbol), asOf);
    if (growth !== null) growthBySymbol.set(symbol, growth);
  }
  const slice: PercentileSlice = {
    conditioned: growthBySymbol.size,
    percentileBySymbol: revenueGrowthPercentiles(growthBySymbol),
  };
  state.percentileCache.set(key, slice);
  return slice;
}

function paramKey(params: HalalFundamentalMomentumCoreParams): string {
  return [
    params.lookbackDays, params.skipRecentDays, params.absoluteThreshold,
    params.topN, params.cashFloor, params.perNameCap, params.minRevenueGrowthPercentile,
  ].join('|');
}

/**
 * Week-end decision. Steps 1, 2 and 4 are a clone of `halal-fast-momentum-core`'s `wideDecision`
 * (cloned, not imported, because the baseline does not export it and that file is frozen); step 3 is
 * the ONLY divergence and is delegated to `selectGatedTopN`.
 */
function wideDecision(
  asOf: Date,
  params: HalalFundamentalMomentumCoreParams,
  replayScope?: object,
): FundamentalMomentumDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return EMPTY_DECISION;
  const asOfMs = asOf.getTime();
  if (!state.weekEndTimes.has(asOfMs)) {
    return { ...EMPTY_DECISION, reason: 'not_week_end' };
  }
  const cacheKey = `${asOfMs}|${paramKey(params)}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  // Step 1: momentum-rankable names (≥ lookbackDays+1 trailing bars ending exactly at asOf).
  let rankable: { symbol: string; relative: number; absolute: number; closes: number[] }[] = [];
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.lookbackDays) continue; // no bar at asOf, or insufficient trailing history
    const closes: number[] = [];
    for (let k = i - params.lookbackDays; k <= i; k++) closes.push(series.close[k]);
    const metrics = dualMomentumMetrics(closes, params.lookbackDays, params.skipRecentDays);
    if (!metrics) continue;
    rankable.push({ symbol, ...metrics, closes });
  }
  // Defensive-only: the resolved universe is already capped at maxNames=60 upstream.
  if (rankable.length > params.maxNames) {
    rankable = rankable
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .slice(0, params.maxNames);
  }

  // Step 2: absolute-momentum filter (the de-risk-to-cash mechanism) — never optional.
  const eligible = rankable.filter((row) => row.absolute > params.absoluteThreshold);

  // Step 3: THE NEW VARIABLE — PIT revenue-growth percentile gate on admission to the top-N.
  const slice = percentilesAt(state, asOf);
  const gated = selectGatedTopN(
    eligible, slice.percentileBySymbol, params.topN, params.cashFloor, params.minRevenueGrowthPercentile,
  );
  const selectedSymbols = new Set(gated.selected);

  let result: FundamentalMomentumDecision;
  if (selectedSymbols.size === 0) {
    result = {
      reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
      conditioned: slice.conditioned, gatedSkips: gated.gatedSkips, selected: 0,
      percentileBySymbol: slice.percentileBySymbol, weights: new Map(),
    };
  } else {
    // Step 4: inverse-volatility sizing over ONLY the selected survivors, reusing
    // halal-risk-parity-core's UNCHANGED pure functions verbatim (cap + redistribute included).
    const volBySymbol = new Map<string, number>();
    for (const row of rankable) {
      if (!selectedSymbols.has(row.symbol)) continue;
      let returns: number[];
      try {
        returns = dailyReturns(row.closes);
      } catch {
        continue; // defensive: malformed close series excluded, never crashes the book
      }
      const sigma = stdev(returns);
      if (!(sigma > 0) || !Number.isFinite(sigma)) continue; // degenerate names excluded
      volBySymbol.set(row.symbol, sigma);
    }
    const weights = inverseVolatilityWeights(volBySymbol, params.perNameCap);
    result = {
      reason: 'ranked', rankable: rankable.length, eligible: eligible.length,
      conditioned: slice.conditioned, gatedSkips: gated.gatedSkips, selected: selectedSymbols.size,
      percentileBySymbol: slice.percentileBySymbol, weights,
    };
  }
  state.decisionCache.set(cacheKey, result);
  return result;
}

/**
 * F1's published statistic: the MEDIAN, across every decision week in the prepared window, of the
 * count of momentum-ranked top-15 names the revenue-growth gate skipped. `< 2.0` (or a realized top-5
 * identical to the comparator's on ≥ 90% of weeks) means the fundamental is decoration on a price
 * signal and the hypothesis is DEAD regardless of the CAGR/DSR numbers.
 *
 * A POST-HOC, WHOLE-SAMPLE DIAGNOSTIC — never an input. `targetWeight`, `screen` and `entry` never
 * call it, and `wideDecision` never reads it; it only aggregates decisions that were each already
 * made from data visible at their own close. It is surfaced on the run's evidence because the
 * manifest requires the run to publish it from its own evidence. NaN when no decision week exists.
 */
export function medianWeeklyGatedSkips(
  replayScope?: object,
  params?: HalalFundamentalMomentumCoreParams,
): number {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return Number.NaN;
  const p = paramsOrDefault(params);
  const key = paramKey(p);
  const cached = state.gatedSkipMedianCache.get(key);
  if (cached !== undefined) return cached;
  // Only weeks where the engine could actually RANK count as decision weeks. A week with zero
  // rankable names is warm-up (insufficient price history), not a decision, and padding the sample
  // with structural zeros would let the length of the warm-up window move an F1 verdict. A week that
  // ranked but was emptied by the ABSOLUTE filter (de-risked to cash) IS a decision and correctly
  // contributes a genuine zero.
  const samples = Array.from(state.weekEndTimes)
    .sort((a, b) => a - b)
    .map((time) => wideDecision(new Date(time), p, replayScope))
    .filter((decision) => decision.rankable > 0)
    .map((decision) => decision.gatedSkips);
  const value = median(samples);
  state.gatedSkipMedianCache.set(key, value);
  return value;
}

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(
  ctx: StrategyPointInTimeContext,
  decision: FundamentalMomentumDecision,
  params: HalalFundamentalMomentumCoreParams,
): Evidence[] {
  const weight = decision.weights.get(ctx.symbol);
  const percentile = decision.percentileBySymbol.get(ctx.symbol);
  const familyMedian = medianWeeklyGatedSkips(ctx.replayScope, params);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_fixed_top_n_fast_momentum_gated_by_pit_revenue_growth_percentile_plus_inverse_vol_sizing'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('min_revenue_growth_percentile', params.minRevenueGrowthPercentile),
    evidence('revenue_growth_missing_policy', params.revenueGrowthMissingPolicy),
    evidence('revenue_growth_percentile', percentile === undefined ? 'unconditioned' : percentile.toFixed(6)),
    evidence('conditioned_names', decision.conditioned),
    evidence('gated_skips_top15', decision.gatedSkips),
    evidence('median_weekly_gated_skips', Number.isFinite(familyMedian) ? familyMedian.toFixed(4) : 'n/a'),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('pit_membership_fence', 'blocked_unverified_diagnostic_only'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalFundamentalMomentumCoreSetup: StrategySetup<HalalFundamentalMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: HALAL_FUNDAMENTAL_MOMENTUM_CORE_ID,
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_FUNDAMENTAL_MOMENTUM_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalFundamentalMomentumCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalFundamentalMomentumCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [0.35, 0.5, 0.65].flatMap((minRevenueGrowthPercentile) =>
      [4, 5, 6].flatMap((topN) => (
        minRevenueGrowthPercentile === center.minRevenueGrowthPercentile && topN === center.topN
          ? []
          : [{
            label: `minRevenueGrowthPercentile=${minRevenueGrowthPercentile}|topN=${topN}`,
            params: { ...center, minRevenueGrowthPercentile, topN },
          }]
      )),
    );
    return { axes: ['minRevenueGrowthPercentile', 'topN'], center, neighbors };
  },

  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') return null;
    return decision.weights.get(ctx.symbol) ?? 0;
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    return check(
      decision.reason === 'ranked',
      decision.reason === 'ranked' ? [] : [decision.reason],
      decisionEvidence(ctx, decision, p),
    );
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const matched = decision.weights.has(ctx.symbol);
    return check(matched, matched ? [] : ['not_selected_this_week'], screened.evidence);
  },

  /**
   * NOT the load-bearing path: portfolioEngine.ts:1123-1133 `continue`s unconditionally for any setup
   * that exposes `targetWeight`, so `exit()` is DEAD CODE here. The gate therefore lives entirely in
   * the decision path (`wideDecision` → `targetWeight`); this mirror exists only so a direct,
   * non-engine consumer sees the same rule.
   */
  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') return check(false, ['hold_between_week_ends'], []);
    const matched = !decision.weights.has(ctx.symbol);
    return check(
      matched,
      matched ? [decision.reason === 'ranked' ? 'not_selected_this_week' : decision.reason] : ['retain_selected_weighted_name'],
      decisionEvidence(ctx, decision, p),
    );
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const percentile = decision.percentileBySymbol.get(ctx.symbol);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    const gateEn = percentile === undefined
      ? ' No two consecutive point-in-time 10-K filings were public at this close, so the name is admitted UNCONDITIONED by the revenue-growth gate.'
      : ` Point-in-time trailing-annual revenue-growth percentile ${(percentile * 100).toFixed(1)}% versus a floor of ${(p.minRevenueGrowthPercentile * 100).toFixed(0)}%.`;
    const gateAr = percentile === undefined
      ? ' لم يتوفّر إفصاحان سنويان متتاليان منشوران قبل هذا الإغلاق، لذلك يُقبل السهم دون تطبيق فلتر نمو الإيرادات.'
      : ` نسبة نمو الإيرادات السنوية عند لحظة القرار في المئين ${(percentile * 100).toFixed(1)}% مقابل حد أدنى ${(p.minRevenueGrowthPercentile * 100).toFixed(0)}%.`;
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly fixed top-${p.topN} FAST momentum selection (${p.lookbackDays}d-${p.skipRecentDays}d relative rank, absolute filter>0) then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name, with a single new variable: a point-in-time cross-sectional revenue-growth percentile gate on admission.${gateEn} Exploratory screening candidate, research-only; cannot promote.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بزخم سريع (زخم نسبي ${p.lookbackDays} يوم-${p.skipRecentDays} يوم، وفلتر الزخم المطلق>0) ثم ترجيح عكسي للتقلب عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم، مع متغير واحد جديد فقط: فلتر مئيني مقطعي لنمو الإيرادات محسوب بمعلومات لحظة القرار.${gateAr} مرشح استكشافي للبحث فقط ولا يصلح للترقية.`,
      evidence: decisionEvidence(ctx, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
