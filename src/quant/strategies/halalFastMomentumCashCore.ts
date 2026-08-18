// halal-fast-momentum-cash-core v1 — ISOLATED ALLOCATION transport of `halal-fast-momentum-core@v1`
// (top-5, WEEKLY, 63d/skip2; terminal card REJECTED: OOS CAGR 105.92%, MC book-day p95 DD 68.40%,
// OOS DSR 0.874). Preregistered in docs/quant-experiments/halal-fast-momentum-cash-core-v1.json
// (QDR-15). CONFIRMATORY-intended lane: forward-only, zero diagnostic runs.
//
// EXACTLY ONE NEW VARIABLE: the fraction of the BOOK handed to the frozen engine. Ranking, the
// absolute filter, fixed top-N selection, inverse-volatility sizing, the 25% per-name cap, the
// 2-name cash floor, the 60-name C1 sleeve and every ISO-week decision date are byte-identical to
// the baseline. No engine parameter may move, and this file enforces that structurally: every
// engine field is a zod LITERAL, so a manifest that redefines one fails closed at parse time
// instead of silently running a different experiment under this id.
//
// THE MECHANISM (verbatim from the sealed manifest): Sharpe is scale-invariant and a
// non-interest-bearing reserve has zero volatility and zero correlation, so a fixed 30% allocation
// to the frozen engine transports the engine's whole risk-adjusted return through the 30% Monte
// Carlo p95 drawdown breaker without touching the engine. The reserve leg is CASH held flat: it
// earns nothing, accrues nothing, and is never remunerated. That is a Sharia requirement first and
// a modelling choice second — a remunerated reserve would be riba and would void compliance — and
// it is also exactly what makes the transport arithmetic exact.
//
// HOW THE ALLOCATION IS APPLIED. `targetWeight` returns `sleeveShare x engineWeight(symbol)`. The
// engine's own relative weights are multiplied by ONE common scalar, so per-name RELATIVE weights
// are bit-for-bit the baseline's: the allocation scales the book, it can never re-rank it. The
// engine's internal cash (the absolute-momentum de-risk, and any cap-exhausted residual) is
// preserved proportionally rather than normalised away — that cash is the engine's own risk
// management, not this lane's allocation, and removing it would be a second variable.
//
// THE 3pp NO-TRADE BAND. `w_actual` is the engine sleeve's share of the book — its names PLUS the
// cash it is itself holding — measured at each ISO-week decision. Per the manifest's rebalance rule
// the sealed 30% is restored only when |w_actual - 0.30| > 0.03 (STRICTLY greater; the boundary is
// measure-zero on real paths and is pinned by test rather than left to a reader). Inside the band
// the sleeve is re-ranked as usual but its total book share is left at its drifted value, so no
// cash<->sleeve trade is generated. There is no intra-week rebalance of any kind.
//
// WHY THE BOOK POLICY KEEPS maxGrossFraction = 1. The manifest's `portfolio.maxGrossFraction: 0.3`
// is the DESIGN's gross ceiling and is realised through the emitted target weights above. Setting
// it on the engine policy instead would arm portfolioEngine's continuous gross governor, which
// trims any appreciation above the ceiling AT THE NEXT OPEN, on any day. That is (i) an intra-week
// rebalance, which the manifest forbids by name, and (ii) a one-sided ratchet that shaves upside
// and never adds on the downside — which would break the scale-invariance the whole hypothesis
// rests on. The policy is therefore byte-identical to the baseline's, and the ONLY behavioural
// difference between the two setups is the scalar in `targetWeight`.
//
// WHY THE ALLOCATION LIVES IN `targetWeight` AND NOT IN `exit()`: portfolioEngine.ts:1123-1133
// `continue`s unconditionally for any setup that exposes `targetWeight`, so `exit()` is DEAD CODE
// on this path. `exit()` below mirrors the baseline only so a non-targetWeight consumer stays
// coherent; it is not the load-bearing path.
//
// HONEST LIMIT OF THE BAND MEASUREMENT. `StrategyPointInTimeContext` carries no NAV and no cash, so
// the setup cannot read the book's realised sleeve share. `w_actual` is therefore MODELLED forward
// from the share this setup itself last emitted, drifted by the realised close-to-close moves of
// the names it held, against a reserve that is flat by construction. The model is exact except for
// execution costs and ADV throttling at the fill, and it is self-correcting: every decision re-sets
// the share to a value the engine then applies against real NAV, so the error cannot accumulate.
// Closes are used because `UniversePrepareInput.dailyBarsBySymbol` carries no opens. Deterministic,
// PIT-safe (only bars at or before `asOf` are read), and reported here rather than buried.
//
// Plateau robustness (QDR-6): 2 axes, frozen 3x3 grid (9 trials) — fastMomentumTargetWeight in
// {0.25,0.30,0.35} x rebalanceBand in {0.02,0.03,0.05}, center = {0.30,0.03}. No engine axis is
// swept, because no engine parameter exists to sweep in this lane.
// QDR-14: this id is in PIT_MEMBERSHIP_REQUIRED_SETUP_IDS. It inherits the baseline's audited C1
// sleeve and therefore its survivorship fence; omitting it would silently relax that fence.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot), unchanged.
// Execution remains paper/simulated only per standing RUSHD policy.
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
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HALAL_FAST_MOMENTUM_CASH_CORE_ID = 'halal-fast-momentum-cash-core' as const;

/**
 * Every FROZEN field is a zod literal. The engine block is frozen because the manifest says "no
 * engine parameter may move"; the reserve block is frozen because a remunerated or shortable
 * reserve is a different (and non-compliant) experiment. Only the two declared plateau axes —
 * `fastMomentumTargetWeight` and `rebalanceBand` — are numeric ranges, because the sealed 3x3 grid
 * varies exactly those two and nothing else.
 */
export const HalalFastMomentumCashCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.literal(63),
  skipRecentDays: z.literal(2),
  absoluteThreshold: z.literal(0),
  topN: z.literal(5),
  cashFloor: z.literal(2),
  perNameCap: z.literal(0.25),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
  fastMomentumTargetWeight: z.number().positive().max(1),
  rebalanceBand: z.number().nonnegative().max(1),
  reserve: z.literal('non_interest_bearing_cash'),
  reserveRemuneration: z.literal('none_zero_return_non_interest_bearing'),
  rebalanceTrigger: z.literal('iso_week_engine_decision_only'),
  intraWeekRebalance: z.literal(false),
  longOnlyCash: z.literal(true),
  bandReference: z.literal('engine_sleeve_share_of_book_versus_target'),
});
export type HalalFastMomentumCashCoreParams = z.infer<typeof HalalFastMomentumCashCoreParamsSchema>;

export const HALAL_FAST_MOMENTUM_CASH_CORE_V1: HalalFastMomentumCashCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 63,
  skipRecentDays: 2,
  absoluteThreshold: 0,
  topN: 5,
  cashFloor: 2,
  perNameCap: 0.25,
  maxNames: 60,
  validationTrials: 9,
  fastMomentumTargetWeight: 0.3,
  rebalanceBand: 0.03,
  reserve: 'non_interest_bearing_cash',
  reserveRemuneration: 'none_zero_return_non_interest_bearing',
  rebalanceTrigger: 'iso_week_engine_decision_only',
  intraWeekRebalance: false,
  longOnlyCash: true,
  bandReference: 'engine_sleeve_share_of_book_versus_target',
});

/** Byte-identical to `halalFastMomentumCoreBookPolicy` — see the header note on maxGrossFraction. */
export function halalFastMomentumCashCoreBookPolicy(
  params?: HalalFastMomentumCashCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching the baseline's convention exactly.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

/** One previously-held name: its engine RELATIVE weight and the close it was marked at. */
interface SleeveHolding {
  readonly weight: number;
  readonly close: number;
}

/** The allocation chain for one (targetWeight, band) cell: what this setup last emitted. */
interface SleeveChain {
  readonly decisionMs: number;
  readonly share: number;
  readonly holdings: ReadonlyMap<string, SleeveHolding>;
}

export interface SleeveAllocation {
  /** Book share handed to the engine sleeve for THIS decision. */
  readonly share: number;
  /** Modelled pre-decision share; null at the first decision of a cell (nothing to drift from). */
  readonly observedShare: number | null;
  readonly rebalanced: boolean;
}

interface CashCoreState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying param — a date-only key leaks the center cell's decisions into
  // every plateau neighbor (the regression the monthly siblings document).
  readonly decisionCache: Map<string, CashCoreDecision>;
  /** allocation signature -> chain. Plateau cells share one replay scope, so they must not share a chain. */
  readonly sleeveChains: Map<string, SleeveChain>;
  readonly sleeveCache: Map<string, SleeveAllocation>;
}

interface CashCoreDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol -> engine relative weight (sum <= 1)
}

let UNSCOPED_STATE: CashCoreState | null = null;
const SCOPED_STATES = new WeakMap<object, CashCoreState>();

function paramsOrDefault(
  params?: HalalFastMomentumCashCoreParams,
): HalalFastMomentumCashCoreParams {
  return HalalFastMomentumCashCoreParamsSchema.parse(params ?? HALAL_FAST_MOMENTUM_CASH_CORE_V1);
}

/** ISO-8601 week key (year x 100 + ISO week number) — byte-identical to the baseline's. */
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
    throw new Error(`${HALAL_FAST_MOMENTUM_CASH_CORE_ID} requires dailyBarsBySymbol for its resolved C1 sleeve`);
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const weekEnds = new Map<number, number>(); // ISO week key -> max ts
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
  const state: CashCoreState = {
    seriesBySymbol,
    weekEndTimes: new Set(weekEnds.values()),
    decisionCache: new Map(),
    sleeveChains: new Map(),
    sleeveCache: new Map(),
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

/** Last close dated AT OR BEFORE `targetMs`, or null. Never reads a bar after the decision date. */
function closeAtOrBefore(series: CompactSeries, targetMs: number): number | null {
  let lo = 0;
  let hi = series.ts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.ts[mid] <= targetMs) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 ? series.close[found] : null;
}

/** Sample (n-1) standard deviation — identical definition to the baseline's private helper. */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Drift the engine sleeve's book share forward, pure and hand-computable.
 *
 * The sleeve is its names PLUS the cash the engine itself is holding; the reserve is FLAT — it has
 * no return term of any kind, which is the whole point of a non-interest-bearing reserve. So with
 * `previousShare = a`, engine relative weights `w_i` (sum <= 1) and price relatives `r_i`:
 *   sleeve value = a * (1 - sum(w) + sum(w_i * r_i))      // the (1 - sum w) part cannot move
 *   book  value  = (1 - a) + sleeve value                 // the reserve cannot move either
 * and the drifted share is sleeve / book. With every `r_i = 1` this returns exactly `a`.
 */
export function driftedSleeveShare(
  previousShare: number,
  holdings: readonly { readonly weight: number; readonly priceRelative: number }[],
): number {
  if (!Number.isFinite(previousShare) || previousShare <= 0) return 0;
  let invested = 0;
  let grown = 0;
  for (const holding of holdings) {
    if (!Number.isFinite(holding.weight) || holding.weight <= 0) continue;
    const relative = Number.isFinite(holding.priceRelative) && holding.priceRelative > 0
      ? holding.priceRelative
      : 1;
    invested += holding.weight;
    grown += holding.weight * relative;
  }
  const sleeve = previousShare * (1 - invested + grown);
  const book = (1 - previousShare) + sleeve;
  if (!(book > 0) || !Number.isFinite(sleeve)) return 0;
  return Math.min(1, Math.max(0, sleeve / book));
}

/**
 * The no-trade band, pure. `null` (no prior decision for this cell) initialises at the sealed
 * target. Otherwise the target is restored only when the drift STRICTLY exceeds the band, exactly
 * as the manifest's rebalance rule is written: `|w_actual - 0.30| > 0.03`.
 */
export function resolveSleeveShare(
  observedShare: number | null,
  targetShare: number,
  band: number,
): { readonly rebalanced: boolean; readonly share: number } {
  if (observedShare === null || !Number.isFinite(observedShare)) {
    return { rebalanced: true, share: targetShare };
  }
  const rebalanced = Math.abs(observedShare - targetShare) > band;
  return { rebalanced, share: rebalanced ? targetShare : observedShare };
}

/**
 * Week-end decision — a byte-identical clone of `halal-fast-momentum-core`'s `wideDecision`. Cloned
 * rather than imported because the baseline does not export it and that file is frozen; it must
 * never diverge, which the byte-equality test in this setup's spec file pins.
 */
function wideDecision(
  asOf: Date,
  params: HalalFastMomentumCashCoreParams,
  replayScope?: object,
): CashCoreDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return { reason: 'below_cash_floor', rankable: 0, eligible: 0, selected: 0, weights: new Map() };
  const asOfMs = asOf.getTime();
  if (!state.weekEndTimes.has(asOfMs)) {
    return { reason: 'not_week_end', rankable: 0, eligible: 0, selected: 0, weights: new Map() };
  }
  const cacheKey = [
    asOfMs, params.lookbackDays, params.skipRecentDays, params.absoluteThreshold,
    params.topN, params.cashFloor, params.perNameCap,
  ].join('|');
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  // Step 1: momentum-rankable names (>= lookbackDays+1 trailing bars ending exactly at asOf).
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

  // Step 3: FIXED top-N selection by relative-momentum rank among the eligible set, reusing the
  // baseline's exported pure function verbatim (never reimplemented).
  const selectedSymbols = new Set(selectTopNByMomentum(eligible, params.topN, params.cashFloor));

  let result: CashCoreDecision;
  if (selectedSymbols.size === 0) {
    result = {
      reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
      selected: 0, weights: new Map(),
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
      selected: selectedSymbols.size, weights,
    };
  }
  state.decisionCache.set(cacheKey, result);
  return result;
}

/** One chain per plateau cell: the cells share a replay scope but never share an allocation path. */
function allocationSignature(params: HalalFastMomentumCashCoreParams): string {
  return `${params.fastMomentumTargetWeight}|${params.rebalanceBand}`;
}

function holdingsAt(
  state: CashCoreState,
  weights: ReadonlyMap<string, number>,
  asOfMs: number,
): ReadonlyMap<string, SleeveHolding> {
  const holdings = new Map<string, SleeveHolding>();
  weights.forEach((weight, symbol) => {
    const series = state.seriesBySymbol.get(symbol);
    const close = series ? closeAtOrBefore(series, asOfMs) : null;
    if (close !== null && close > 0) holdings.set(symbol, { weight, close });
  });
  return holdings;
}

/**
 * The sleeve's book share for this decision date. Memoised per (date, cell) so the per-symbol calls
 * inside one decision all see one answer, and the chain advances exactly once per decision date.
 */
function sleeveAllocation(
  state: CashCoreState,
  asOfMs: number,
  params: HalalFastMomentumCashCoreParams,
  decision: CashCoreDecision,
): SleeveAllocation {
  const signature = allocationSignature(params);
  const cacheKey = `${asOfMs}|${signature}`;
  const cached = state.sleeveCache.get(cacheKey);
  if (cached) return cached;
  const chain = state.sleeveChains.get(signature);
  // Fail closed to the sealed target if a decision date is ever visited out of ascending order:
  // the drift chain cannot be reconstructed backwards, and inventing one would be worse than
  // restoring the preregistered allocation.
  const observedShare = chain && asOfMs > chain.decisionMs
    ? driftedSleeveShare(
      chain.share,
      Array.from(chain.holdings.entries()).map(([symbol, holding]) => {
        const series = state.seriesBySymbol.get(symbol);
        const close = series ? closeAtOrBefore(series, asOfMs) : null;
        return { weight: holding.weight, priceRelative: close !== null ? close / holding.close : 1 };
      }),
    )
    : null;
  const resolved = resolveSleeveShare(observedShare, params.fastMomentumTargetWeight, params.rebalanceBand);
  const allocation: SleeveAllocation = {
    share: resolved.share, observedShare, rebalanced: resolved.rebalanced,
  };
  state.sleeveCache.set(cacheKey, allocation);
  if (!chain || asOfMs > chain.decisionMs) {
    state.sleeveChains.set(signature, {
      decisionMs: asOfMs,
      share: allocation.share,
      holdings: holdingsAt(state, decision.weights, asOfMs),
    });
  }
  return allocation;
}

function allocationFor(
  asOf: Date,
  params: HalalFastMomentumCashCoreParams,
  decision: CashCoreDecision,
  replayScope?: object,
): SleeveAllocation {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state || decision.reason === 'not_week_end') {
    return { share: params.fastMomentumTargetWeight, observedShare: null, rebalanced: true };
  }
  return sleeveAllocation(state, asOf.getTime(), params, decision);
}

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(
  symbol: string,
  decision: CashCoreDecision,
  allocation: SleeveAllocation,
  params: HalalFastMomentumCashCoreParams,
): Evidence[] {
  const engineWeight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_fixed_top_n_fast_momentum_plus_inverse_vol_sizing_transported_to_a_fixed_book_share'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('reserve', params.reserve),
    evidence('reserve_remuneration', params.reserveRemuneration),
    evidence('sleeve_target_share', params.fastMomentumTargetWeight),
    evidence('rebalance_band', params.rebalanceBand),
    evidence('sleeve_observed_share', allocation.observedShare !== null ? allocation.observedShare.toFixed(8) : 'n/a'),
    evidence('sleeve_applied_share', allocation.share.toFixed(8)),
    evidence('sleeve_rebalanced', allocation.rebalanced ? 'true' : 'false'),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected),
    evidence('engine_relative_weight', engineWeight !== undefined ? engineWeight.toFixed(8) : '0'),
    evidence('target_weight', engineWeight !== undefined ? (allocation.share * engineWeight).toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalFastMomentumCashCoreSetup: StrategySetup<HalalFastMomentumCashCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: HALAL_FAST_MOMENTUM_CASH_CORE_ID,
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_FAST_MOMENTUM_CASH_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalFastMomentumCashCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalFastMomentumCashCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [0.25, 0.3, 0.35].flatMap((fastMomentumTargetWeight) =>
      [0.02, 0.03, 0.05].flatMap((rebalanceBand) => (
        fastMomentumTargetWeight === center.fastMomentumTargetWeight
          && rebalanceBand === center.rebalanceBand
          ? []
          : [{
            label: `fastMomentumTargetWeight=${fastMomentumTargetWeight}|rebalanceBand=${rebalanceBand}`,
            params: { ...center, fastMomentumTargetWeight, rebalanceBand },
          }]
      )),
    );
    return { axes: ['fastMomentumTargetWeight', 'rebalanceBand'], center, neighbors };
  },

  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') return null; // no intra-week rebalance, ever
    const engineWeight = decision.weights.get(ctx.symbol);
    if (engineWeight === undefined) return 0;
    // THE ONLY BEHAVIOURAL DIVERGENCE FROM THE BASELINE: one common scalar. Relative weights are
    // untouched, so this can scale the book but can never re-rank it.
    return allocationFor(ctx.asOf, p, decision, ctx.replayScope).share * engineWeight;
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const allocation = allocationFor(ctx.asOf, p, decision, ctx.replayScope);
    return check(
      decision.reason === 'ranked',
      decision.reason === 'ranked' ? [] : [decision.reason],
      decisionEvidence(ctx.symbol, decision, allocation, p),
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
   * NOT the load-bearing path: portfolioEngine.ts:1123-1133 never calls `exit()` for a setup that
   * exposes `targetWeight`. Mirrored from the baseline only so a direct consumer sees the same rule.
   */
  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') return check(false, ['hold_between_week_ends'], []);
    const allocation = allocationFor(ctx.asOf, p, decision, ctx.replayScope);
    const matched = !decision.weights.has(ctx.symbol);
    return check(
      matched,
      matched ? [decision.reason === 'ranked' ? 'not_selected_this_week' : decision.reason] : ['retain_selected_weighted_name'],
      decisionEvidence(ctx.symbol, decision, allocation, p),
    );
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const allocation = allocationFor(ctx.asOf, p, decision, ctx.replayScope);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    const sharePct = (p.fastMomentumTargetWeight * 100).toFixed(0);
    const reservePct = ((1 - p.fastMomentumTargetWeight) * 100).toFixed(0);
    const bandPct = (p.rebalanceBand * 100).toFixed(0);
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; the FROZEN ${p.lookbackDays}d-${p.skipRecentDays}d top-${p.topN} fast-momentum engine, unchanged in every parameter, is allocated ${sharePct}% of the book against a ${reservePct}% non-interest-bearing cash reserve that is never remunerated, restored at each ISO-week decision through a ${bandPct}pp no-trade band. Applied sleeve share ${(allocation.share * 100).toFixed(2)}%. Candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ محرك الزخم السريع المجمَّد (${p.lookbackDays} يوم-${p.skipRecentDays} يوم، أعلى ${p.topN} أسهم) دون تغيير أي معامل، يُخصَّص له ${sharePct}% من المحفظة مقابل ${reservePct}% نقدًا لا يولّد عائدًا ولا يُستثمر بفائدة، مع إعادة الضبط عند كل قرار أسبوعي ضمن نطاق سماح ${bandPct} نقطة مئوية. الحصة المطبَّقة ${(allocation.share * 100).toFixed(2)}%. مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, allocation, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
