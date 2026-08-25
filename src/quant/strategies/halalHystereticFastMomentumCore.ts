// halal-hysteretic-fast-momentum-core v1 — ISOLATED SELECTION-time hysteresis A/B against
// `halal-fast-momentum-core@v1` (comparator run 218716ac, OOS CAGR 105.92% / MC p95 66.5473%
// (moving-block-20, QDR-21 correction) / OOS DSR@9 0.874 / measured 8.09%/yr cost drag).
// Preregistration: docs/quant-experiments/halal-hysteretic-fast-momentum-core-v1.json (QDR-22).
//
// THE ONE NEW VARIABLE — `retainRank` (default 8), acting at SELECTION:
//   an incumbent already in the PREVIOUS ISO-week DECIDED set is RETAINED while its relative-
//   momentum rank among the eligible names is <= retainRank, instead of being sold the moment it
//   leaves the top `topN`. Everything else — the 63d/skip2 `dualMomentumMetrics` formula, the
//   absolute filter, the ISO-week cadence, `inverseVolatilityWeights` + `capAndRedistribute` sizing
//   at a 25% per-name cap, cashFloor 2, and the C1-verified 60-name dollar-volume sleeve — is
//   byte-identical to the comparator.
//
// WHY THIS IS A COPY OF THE COMPARATOR'S DECISION PATH, NOT A SHARED PARAMETERISATION: the frozen
// manifest lists `src/quant/strategies/halalFastMomentumCore.ts` under `filesForbidden` ("the
// comparator engine is frozen; do NOT parameterise it"). A published terminal card rests on that
// file byte-for-byte, so the A/B arm is duplicated here deliberately. The only symbol imported from
// it is the pure, already-exported `selectTopNByMomentum`, whose comparator (relative DESC, symbol
// ASC) is REUSED VERBATIM as this file's ranking and tie-break.
//
// BASELINE EQUIVALENCE (a theorem, and a test): at retainRank === topN, Retain is a subset of the
// top-`topN` by rank, and the fill step takes the best-ranked non-retained names, which are exactly
// the remaining members of the top-`topN`. The union is precisely the comparator's top-`topN`, so
// the weight map is byte-identical. That perfect nesting is what makes `retainRank` ONE NESTED
// VARIABLE rather than a new strategy. The plateau cell {retainRank: 6, topN: 6} is the internal
// null control: it MUST reproduce the comparator at topN = 6 exactly.
//
// THE HONEST COUNTERWEIGHT, PREDICTED HERE AND NOT DISCOVERED LATER: this book's confirmed edge is
// ROTATION VELOCITY, so hysteresis deliberately slows the exact mechanism that produces the return.
// Some of the ~1.8–3.1%/yr cost saving is handed straight back as lost signal quality; the manifest
// predicts a 3.5pp OOS CAGR give-back explicitly. THIS LANE IS EXPLORATORY AND CANNOT PROMOTE:
// at the derived family trial floor a ~2.55-year OOS window cannot reach DSR > 0.95, so REJECTED is
// the EXPECTED terminal label and is not the question being asked. No parameter is retuned after any
// result, diagnostic included.
//
// EVALUATION RESOLUTION (frozen): cadence stays 'daily' and `targetWeight` returns null on every
// non-week-end bar, exactly as the comparator does. The retain test is evaluated ONLY at ISO-week-end
// decision dates; a DAILY retain test would be a second variable and a DIFFERENT strategy.
//
// INCUMBENCY SOURCE (frozen): `previousDecidedSet` is the PRIOR WEEK-END DECISION's weight-key set,
// computed over the prepared universe's ordered week-end times and memoised on the decision cache
// (whose key GAINS retainRank). It MUST NOT read `ctx.positionQty`: realised holdings are downstream
// of envelope clamps, ADV limits and fills, so keying selection off them would make the decision
// depend on execution, break determinism across plateau cells, and silently add a second variable.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time; Sharia stays non-negotiable. Execution remains
// paper/simulated only per standing RUSHD policy, independent of this card's terminal verdict.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import { inverseVolatilityWeights } from './halalRiskParityCore';
import { dualMomentumMetrics } from './dualMomentumRotation';
import { selectTopNByMomentum } from './halalFastMomentumCore';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_ID = 'halal-hysteretic-fast-momentum-core' as const;

export const HalalHystereticFastMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  /** THE ONE NEW VARIABLE. retainRank === topN recovers the comparator byte-identically. */
  retainRank: z.number().int().positive(),
  cashFloor: z.literal(2),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
});
export type HalalHystereticFastMomentumCoreParams =
  z.infer<typeof HalalHystereticFastMomentumCoreParamsSchema>;

export const HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1: HalalHystereticFastMomentumCoreParams =
  Object.freeze({
    version: 'v1',
    lookbackDays: 63,
    skipRecentDays: 2,
    absoluteThreshold: 0,
    topN: 5,
    retainRank: 8,
    cashFloor: 2,
    perNameCap: 0.25,
    maxNames: 60,
    validationTrials: 9,
  });

export function halalHystereticFastMomentumCoreBookPolicy(
  params?: HalalHystereticFastMomentumCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching the comparator's convention byte-for-byte.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface HystereticState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  /** Week-end decision times ASCENDING — the recursion axis for `previousDecidedSet`. */
  readonly orderedWeekEnds: readonly number[];
  /** Week-end time → its index in `orderedWeekEnds`, so incumbency lookup stays O(1). */
  readonly weekEndIndex: ReadonlyMap<number, number>;
  // Keyed by asOf AND every varying plateau param INCLUDING retainRank: a key without retainRank
  // would let one plateau cell's decisions leak into another cell (and, because the incumbency
  // recursion reads this cache, would corrupt every LATER week of the neighbour too).
  readonly decisionCache: Map<string, HystereticDecision>;
}

interface HystereticDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly retained: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

const NOT_WEEK_END: HystereticDecision = Object.freeze({
  reason: 'not_week_end', rankable: 0, eligible: 0, retained: 0, selected: 0, weights: new Map(),
});

let UNSCOPED_STATE: HystereticState | null = null;
const SCOPED_STATES = new WeakMap<object, HystereticState>();

function paramsOrDefault(
  params?: HalalHystereticFastMomentumCoreParams,
): HalalHystereticFastMomentumCoreParams {
  const parsed = HalalHystereticFastMomentumCoreParamsSchema.parse(
    params ?? HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1,
  );
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  // Frozen validity constraint (manifest `plateau.validityConstraint`): all nine plateau cells
  // satisfy retainRank >= topN. A cell below it is not a softer retain band — it degenerates back to
  // the comparator — so it is rejected rather than silently run as a duplicate of the baseline.
  if (parsed.retainRank < parsed.topN) {
    throw new Error('retainRank must be >= topN');
  }
  return parsed;
}

/** ISO-8601 week key (year×100 + ISO week number) — identical to the comparator's helper. */
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
    throw new Error(`${HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_ID} requires dailyBarsBySymbol for its resolved C1 sleeve`);
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
  const orderedWeekEnds = Array.from(new Set(weekEnds.values())).sort((a, b) => a - b);
  const state: HystereticState = {
    seriesBySymbol,
    weekEndTimes: new Set(orderedWeekEnds),
    orderedWeekEnds,
    weekEndIndex: new Map(orderedWeekEnds.map((t, i) => [t, i])),
    decisionCache: new Map(),
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

/** Sample (n−1) standard deviation — identical definition to the comparator's private helper. */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Decision-cache key. EXPORTED so the regression test can pin, structurally, that `retainRank` is
 * part of the key: without it two plateau cells that differ only in the retain band would collide,
 * and because the incumbency recursion READS this cache the collision would silently propagate
 * forward through every later week of the neighbouring cell.
 */
export function hystereticDecisionCacheKey(
  asOfMs: number,
  params: HalalHystereticFastMomentumCoreParams,
): string {
  return [
    asOfMs, params.lookbackDays, params.skipRecentDays, params.absoluteThreshold,
    params.topN, params.retainRank, params.cashFloor, params.perNameCap,
  ].join('|');
}

/**
 * THE NEW VARIABLE, in one pure function (manifest selectionRule steps 1–4).
 *
 * `eligible` has already passed the absolute-momentum filter. Ranking is `selectTopNByMomentum`'s
 * comparator REUSED VERBATIM (relative DESC, symbol ASC). Returns the selected symbols in the frozen
 * order retained-then-filled; the caller only ever consumes it as a SET, so that order is cosmetic.
 *
 *   step2  Retain = { s ∈ previousDecided : s eligible AND rank(s) <= retainRank }
 *   step3  |Retain| <= topN is a THEOREM (|previousDecided| <= topN by construction). The tie-break
 *          is frozen anyway for completeness: keep the topN best-ranked members of Retain.
 *   step4  fill the topN − |Retain| free slots from the best-ranked eligible names NOT in Retain.
 *   step5  entry rank is NOT a parameter: the j-th best non-retained name has rank <= j + |Retain|,
 *          so the last name admitted always has rank <= topN. retainRank is the ONLY new variable.
 *   step6  below `floor` eligible names the whole book holds cash (and previousDecided empties).
 *
 * At retainRank === topN this returns exactly `selectTopNByMomentum(eligible, topN, floor)`'s SET.
 */
export function selectWithHysteresis(
  eligible: readonly { symbol: string; relative: number }[],
  previousDecided: ReadonlySet<string>,
  topN: number,
  retainRank: number,
  floor: number,
): string[] {
  // Ranking AND the cash floor are the frozen comparator's own, REUSED VERBATIM rather than
  // reimplemented: passing topN = eligible.length makes `selectTopNByMomentum` return the ENTIRE
  // eligible set in its frozen rank order (relative DESC, symbol ASC), and it still returns [] below
  // the floor. So this file cannot drift from the comparator's tie-break even by one character.
  const ranked = selectTopNByMomentum(eligible, eligible.length, floor);
  if (ranked.length === 0) return [];
  const retained: string[] = [];
  const retainedSet = new Set<string>();
  for (let rank = 1; rank <= ranked.length && rank <= retainRank; rank++) {
    const symbol = ranked[rank - 1];
    if (!previousDecided.has(symbol)) continue;
    if (retained.length >= topN) break; // step3: provably unreachable, frozen for completeness
    retained.push(symbol);
    retainedSet.add(symbol);
  }
  const selected = [...retained];
  for (const symbol of ranked) {
    if (selected.length >= topN) break;
    if (retainedSet.has(symbol)) continue;
    selected.push(symbol);
  }
  return selected;
}

/** One week-end decision, given the PRIOR week-end decision's weight-key set. Pure given state. */
function decideAt(
  state: HystereticState,
  asOfMs: number,
  params: HalalHystereticFastMomentumCoreParams,
  previousDecided: ReadonlySet<string>,
): HystereticDecision {
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
  // Defensive-only: selectDollarVolumeSleeve already caps the resolved universe at maxNames=60
  // upstream, so this never triggers in a real CLI run. Deterministic alphabetical truncation only.
  if (rankable.length > params.maxNames) {
    rankable = rankable
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .slice(0, params.maxNames);
  }

  // Step 2: absolute-momentum filter (the tail-risk de-risk-to-cash mechanism) — never optional, and
  // it still dumps a RETAINED name the moment its absolute momentum turns negative.
  const eligible = rankable.filter((row) => row.absolute > params.absoluteThreshold);

  // Step 3: hysteretic top-N selection — retain incumbents to rank `retainRank`, then fill by rank.
  const selectedSymbols = new Set(
    selectWithHysteresis(eligible, previousDecided, params.topN, params.retainRank, params.cashFloor),
  );
  const retainedCount = eligible.length < params.cashFloor
    ? 0
    : Array.from(selectedSymbols).filter((symbol) => previousDecided.has(symbol)).length;

  if (selectedSymbols.size === 0) {
    return {
      reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
      retained: 0, selected: 0, weights: new Map(),
    };
  }
  // Step 4: sizing — inverse-volatility risk parity over ONLY the selected survivors, reusing
  // halal-risk-parity-core's UNCHANGED pure functions verbatim, in the comparator's exact iteration
  // order (rankable order) so the floating-point weight map is byte-identical at retainRank = topN.
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
    if (!(sigma > 0) || !Number.isFinite(sigma)) continue; // degenerate/zero-variance names excluded
    volBySymbol.set(row.symbol, sigma);
  }
  const weights = inverseVolatilityWeights(volBySymbol, params.perNameCap);
  return {
    reason: 'ranked', rankable: rankable.length, eligible: eligible.length,
    retained: retainedCount, selected: selectedSymbols.size, weights,
  };
}

/**
 * The decision for `asOf`. Non-week-end bars decide nothing (the book holds), exactly as the
 * comparator. At a week end the incumbency recursion is resolved FORWARD over `orderedWeekEnds`:
 * the earliest uncached week end is found, then every decision from there to `asOf` is computed in
 * chronological order, each consuming only the PRIOR week end's decision. Iterative, not recursive,
 * so an eight-year weekly calendar cannot exhaust the stack. Reads no context and no position.
 */
function wideDecision(
  asOf: Date,
  params: HalalHystereticFastMomentumCoreParams,
  replayScope?: object,
): HystereticDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) {
    return {
      reason: 'below_cash_floor', rankable: 0, eligible: 0, retained: 0, selected: 0, weights: new Map(),
    };
  }
  const asOfMs = asOf.getTime();
  const index = state.weekEndIndex.get(asOfMs);
  if (index === undefined) return NOT_WEEK_END;
  const cached = state.decisionCache.get(hystereticDecisionCacheKey(asOfMs, params));
  if (cached) return cached;

  // The cache fills contiguously from index 0 upward for a given param set (computing i needs i−1),
  // so walking back to the first uncached index is enough to find the replay start.
  let start = index;
  while (start > 0
    && !state.decisionCache.has(hystereticDecisionCacheKey(state.orderedWeekEnds[start - 1], params))) {
    start--;
  }
  let decision: HystereticDecision | null = null;
  for (let i = start; i <= index; i++) {
    const timeMs = state.orderedWeekEnds[i];
    const key = hystereticDecisionCacheKey(timeMs, params);
    const memoised = state.decisionCache.get(key);
    if (memoised) { decision = memoised; continue; }
    const previousDecided: ReadonlySet<string> = i === 0
      ? new Set<string>()
      // The FIRST week end has no incumbents; every later one reads the PRIOR WEEK-END DECISION's
      // weight keys — never `ctx.positionQty`, which is downstream of fills and would make the
      // decision depend on execution.
      : new Set(Array.from(
        state.decisionCache.get(hystereticDecisionCacheKey(state.orderedWeekEnds[i - 1], params))!.weights.keys(),
      ));
    decision = decideAt(state, timeMs, params, previousDecided);
    state.decisionCache.set(key, decision);
  }
  return decision!;
}

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(
  symbol: string,
  decision: HystereticDecision,
  params: HalalHystereticFastMomentumCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_hysteretic_top_n_fast_momentum_selection_plus_inverse_volatility_sizing'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('retain_rank', params.retainRank),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('retained_names', decision.retained),
    evidence('selected_names', decision.selected),
    evidence('incumbency_source', 'prior_week_end_decision_weights'),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalHystereticFastMomentumCoreSetup:
StrategySetup<HalalHystereticFastMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_ID,
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_HYSTERETIC_FAST_MOMENTUM_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalHystereticFastMomentumCoreParams);
      for (const t of state.orderedWeekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalHystereticFastMomentumCoreParams> {
    const center = paramsOrDefault(params);
    // Frozen 3×3 grid (manifest `plateau`): retainRank {6,8,10} × topN {4,5,6}, center {8,5}.
    // Axis 1 is the ONE new variable and brackets the MEASURED rank-6-to-8 exit band on both sides;
    // axis 2 is the comparator's OWN second plateau axis, reused unchanged so the two grids compare
    // cell-for-cell. lookbackDays is DELIBERATELY NOT an axis. {retainRank 6, topN 6} is the
    // internal null control (band 0) and must reproduce the comparator at topN = 6 exactly.
    const neighbors = [6, 8, 10].flatMap((retainRank) =>
      [4, 5, 6].flatMap((topN) => (
        (retainRank === center.retainRank && topN === center.topN) || retainRank < topN
          ? []
          : [{
            label: `retainRank=${retainRank}|topN=${topN}`,
            params: { ...center, retainRank, topN },
          }]
      )),
    );
    return { axes: ['retainRank', 'topN'], center, neighbors };
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
      decisionEvidence(ctx.symbol, decision, p),
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
      decisionEvidence(ctx.symbol, decision, p),
    );
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly HYSTERETIC top-${p.topN} fast-momentum selection (${p.lookbackDays}d-${p.skipRecentDays}d relative rank, absolute filter>0) where an incumbent from the previous week's decided set is retained while its rank stays within ${p.retainRank}, then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name. Cost-lever A/B on halal-fast-momentum-core; exploratory, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بزخم سريع (زخم نسبي ${p.lookbackDays} يوم-${p.skipRecentDays} يوم، وفلتر الزخم المطلق>0) مع الإبقاء على السهم المختار في الأسبوع السابق ما دام ترتيبه ضمن ${p.retainRank}، ثم ترجيح عكسي للتقلب (تكافؤ المخاطر) عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم. اختبار لخفض تكلفة التداول مقارنة بالنموذج الأساسي، للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
