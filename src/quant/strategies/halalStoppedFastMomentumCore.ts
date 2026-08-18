// halal-stopped-fast-momentum-core v1 — ISOLATED catastrophic-stop A/B against
// `halal-fast-momentum-core@v1` (top-5, WEEKLY, 63d/skip2; terminal card: OOS CAGR 105.92%,
// MC book-day p95 DD 68.40%, OOS DSR 0.874, 1,390 trades).
//
// EXACTLY ONE NEW VARIABLE: an entry-anchored catastrophic stop. Ranking, absolute filter, fixed
// top-N selection, inverse-volatility sizing, the 25% per-name cap, the 2-name cash floor, the
// 60-name C1 sleeve and EVERY week-end decision are byte-identical to the baseline (the week-end
// branch of `targetWeight` below is the baseline's, unchanged). Nothing else moves. There is no
// second variable and no retune: the frozen params are copied verbatim from the sealed manifest
// docs/quant-experiments/halal-stopped-fast-momentum-core-v1.json.
//
// A-PRIORI HYPOTHESIS (frozen before any run): the baseline's 68.40% modelled tail is produced by
// holding a collapsing name for up to a full ISO week, because the ONLY exit is the next week-end
// re-rank. If that is true, a hard entry-anchored floor at −20% cuts the tail materially while
// costing less CAGR per point of tail than `halal-managed-momentum-core`'s realized 1.803 pp/pp
// exchange rate. This is NOT a promotion claim — the manifest predicts REJECTED and this experiment
// measures an exchange rate. The whipsaw channel is the obvious way it fails: a fast-momentum book
// selling −20% dips and (with no cooldown) re-buying the same name at the next week-end can pay the
// 15bps round trip repeatedly for nothing. Reported either way.
//
// THE STOP RULE (verbatim from the sealed manifest):
//  - reference:  the engine's AVERAGE ENTRY COST BASIS (`ctx.entryPrice`, maintained by
//    portfolioEngine across adds). ENTRY-ANCHORED, never a trailing high — a position trading ABOVE
//    its entry basis can never fire, at any drawdown from an interim peak.
//  - trigger:    close ≤ (1 − stopLossPct) × entry basis, i.e. inclusive at exactly −20%.
//  - evaluation: completed NON-week-end session closes only. On a week-end the re-rank governs and
//    the stop is not consulted at all, which is what keeps every weekly decision byte-identical.
//  - fill:       next session open, through the engine's existing 15bps/ADV cost model.
//  - freed cash: idle, non-interest-bearing, until the next ISO-week re-rank. No re-entry cooldown.
//
// WHY THE STOP LIVES IN `targetWeight` AND NOT IN `exit()`: portfolioEngine.ts:1123-1134 `continue`s
// unconditionally for any setup that exposes `targetWeight`, so `exit()` is DEAD CODE on this path.
// A stop implemented there would be a silent no-op indistinguishable from "the stop never helped" —
// a false negative that would corrupt the experiment's conclusion. `targetWeight` therefore returns
// exactly `0` (an emitted flatten order) on a triggered day, never `null` (which means "no opinion,
// hold" to the engine). `exit()` mirrors the rule only so a non-targetWeight consumer stays
// coherent; it is not the load-bearing path.
//
// Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — lookbackDays ∈ {42,63,84} ×
// stopLossPct ∈ {0.15,0.20,0.25}, center = {63,0.20}. topN/cashFloor/perNameCap stay FIXED.
// QDR-14: this id is in PIT_MEMBERSHIP_REQUIRED_SETUP_IDS. Historical membership, delisting
// lifecycle and per-name point-in-time Sharia evidence do not exist, so every run of this version is
// unverified-diagnostic-only and cannot produce a terminal card.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot), unchanged.
// Execution remains paper/simulated only per standing RUSHD policy.
import { Prisma } from '@prisma/client';
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

export const HALAL_STOPPED_FAST_MOMENTUM_CORE_ID = 'halal-stopped-fast-momentum-core' as const;

/**
 * The stop's non-numeric clauses are part of the VERSIONED CONFIG, not implementation trivia
 * (QDR-6: "screener parameters are a versioned config, never hardcoded"). They are pinned as
 * literals so a manifest that silently redefines the reference, the evaluation window, the fill or
 * the cooldown fails closed at parse time instead of running a different experiment under this id.
 */
export const HalalStoppedFastMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  cashFloor: z.literal(2),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
  stopLossPct: z.number().positive().max(1),
  stopReference: z.literal('engine_average_entry_cost_basis'),
  stopEvaluation: z.literal('non_week_end_completed_session_close_only'),
  stopFill: z.literal('next_session_open'),
  stopFreedCash: z.literal('idle_non_interest_bearing_until_next_iso_week_end'),
  stopReentryCooldownDays: z.literal(0),
});
export type HalalStoppedFastMomentumCoreParams = z.infer<typeof HalalStoppedFastMomentumCoreParamsSchema>;

export const HALAL_STOPPED_FAST_MOMENTUM_CORE_V1: HalalStoppedFastMomentumCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 63,
  skipRecentDays: 2,
  absoluteThreshold: 0,
  topN: 5,
  cashFloor: 2,
  perNameCap: 0.25,
  maxNames: 60,
  validationTrials: 9,
  stopLossPct: 0.2,
  stopReference: 'engine_average_entry_cost_basis',
  stopEvaluation: 'non_week_end_completed_session_close_only',
  stopFill: 'next_session_open',
  stopFreedCash: 'idle_non_interest_bearing_until_next_iso_week_end',
  stopReentryCooldownDays: 0,
});

export function halalStoppedFastMomentumCoreBookPolicy(
  params?: HalalStoppedFastMomentumCoreParams,
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

interface StoppedMomentumState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param — including stopLossPct, which provably does NOT
  // enter the week-end decision today. The key enumerates every plateau AXIS on purpose: a date-only
  // (or stop-free) key is exactly the leak the monthly siblings document, and it would silently
  // return a stale cell the moment the stop ever touched ranking.
  readonly decisionCache: Map<string, StoppedMomentumDecision>;
}

interface StoppedMomentumDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: StoppedMomentumState | null = null;
const SCOPED_STATES = new WeakMap<object, StoppedMomentumState>();

function paramsOrDefault(
  params?: HalalStoppedFastMomentumCoreParams,
): HalalStoppedFastMomentumCoreParams {
  const parsed = HalalStoppedFastMomentumCoreParamsSchema.parse(
    params ?? HALAL_STOPPED_FAST_MOMENTUM_CORE_V1,
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
    throw new Error(`${HALAL_STOPPED_FAST_MOMENTUM_CORE_ID} requires dailyBarsBySymbol for its resolved C1 sleeve`);
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
  const state: StoppedMomentumState = {
    seriesBySymbol,
    weekEndTimes: new Set(weekEnds.values()),
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

/** Sample (n−1) standard deviation — identical definition to the baseline's private helper. */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * THE ONE NEW VARIABLE, isolated as a pure function so it is testable without an engine.
 *
 * Fires when `close ≤ (1 − stopLossPct) × entryBasis`. The threshold is computed in Decimal space
 * (`1 − 0.2` from a decimal literal is exactly `0.8`, unlike the binary float) so the boundary is
 * exact and reproducible. ENTRY-ANCHORED: `entryBasis` is the engine's average entry cost basis and
 * nothing else — no peak, no high-water mark — so a position trading above its entry can never fire
 * regardless of how far it has fallen from an interim high.
 */
export function catastrophicStopTriggered(
  entryBasis: Prisma.Decimal | null | undefined,
  close: Prisma.Decimal | null | undefined,
  stopLossPct: number,
): boolean {
  if (!entryBasis || !close) return false;
  if (!entryBasis.gt(0) || !close.gt(0)) return false;
  const threshold = entryBasis.mul(new Prisma.Decimal(1).minus(new Prisma.Decimal(stopLossPct)));
  return close.lte(threshold);
}

/**
 * Does the catastrophic stop fire for this context? Evaluated ONLY by the non-week-end branch: a
 * held position, a completed bar dated exactly `asOf`, and a close at or below the entry-anchored
 * threshold. Every other case is "no opinion" (hold).
 */
function stopFires(
  ctx: StrategyPointInTimeContext,
  params: HalalStoppedFastMomentumCoreParams,
): boolean {
  if (ctx.positionQty.lte(0)) return false;
  const lastBar = ctx.bars.at(-1);
  if (!lastBar || lastBar.ts.getTime() !== ctx.asOf.getTime()) return false;
  return catastrophicStopTriggered(ctx.entryPrice ?? null, lastBar.close, params.stopLossPct);
}

/**
 * Week-end decision — a byte-identical clone of `halal-fast-momentum-core`'s `wideDecision`. It is
 * cloned rather than imported because the baseline does not export it and that file is frozen; it
 * must never diverge, which the byte-equality test in this setup's spec file pins.
 */
function wideDecision(
  asOf: Date,
  params: HalalStoppedFastMomentumCoreParams,
  replayScope?: object,
): StoppedMomentumDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return { reason: 'below_cash_floor', rankable: 0, eligible: 0, selected: 0, weights: new Map() };
  const asOfMs = asOf.getTime();
  if (!state.weekEndTimes.has(asOfMs)) {
    return { reason: 'not_week_end', rankable: 0, eligible: 0, selected: 0, weights: new Map() };
  }
  const cacheKey = [
    asOfMs, params.lookbackDays, params.skipRecentDays, params.absoluteThreshold,
    params.topN, params.cashFloor, params.perNameCap, params.stopLossPct,
  ].join('|');
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

  // Step 3: FIXED top-N selection by relative-momentum rank among the eligible set, reusing the
  // baseline's exported pure function verbatim (never reimplemented).
  const selectedSymbols = new Set(selectTopNByMomentum(eligible, params.topN, params.cashFloor));

  let result: StoppedMomentumDecision;
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

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(
  ctx: StrategyPointInTimeContext,
  decision: StoppedMomentumDecision,
  params: HalalStoppedFastMomentumCoreParams,
): Evidence[] {
  const weight = decision.weights.get(ctx.symbol);
  const lastBar = ctx.bars.at(-1);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_fixed_top_n_fast_momentum_plus_inverse_vol_sizing_plus_entry_anchored_catastrophic_stop'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('stop_loss_pct', params.stopLossPct),
    evidence('stop_reference', params.stopReference),
    evidence('entry_basis', ctx.entryPrice ? ctx.entryPrice.toFixed(6) : 'n/a'),
    evidence('last_close', lastBar ? lastBar.close.toFixed(6) : 'n/a'),
    evidence('stop_triggered', stopFires(ctx, params) ? 'true' : 'false'),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalStoppedFastMomentumCoreSetup: StrategySetup<HalalStoppedFastMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: HALAL_STOPPED_FAST_MOMENTUM_CORE_ID,
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_STOPPED_FAST_MOMENTUM_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalStoppedFastMomentumCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalStoppedFastMomentumCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [42, 63, 84].flatMap((lookbackDays) =>
      [0.15, 0.2, 0.25].flatMap((stopLossPct) => (
        lookbackDays === center.lookbackDays && stopLossPct === center.stopLossPct
          ? []
          : [{
            label: `lookbackDays=${lookbackDays}|stopLossPct=${stopLossPct}`,
            params: { ...center, lookbackDays, stopLossPct },
          }]
      )),
    );
    return { axes: ['lookbackDays', 'stopLossPct'], center, neighbors };
  },

  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') {
      // THE ONLY BEHAVIOURAL DIVERGENCE FROM THE BASELINE. `0` (flatten at the next open), never
      // `null` — `null` means "no opinion" to portfolioEngine and would make the stop a silent
      // no-op. Freed cash then sits idle: with qty 0 this branch returns `null` on every following
      // non-week-end day, so nothing is re-entered before the next ISO-week re-rank.
      return stopFires(ctx, p) ? 0 : null;
    }
    // Week-end: byte-identical to `halal-fast-momentum-core`. The stop is not consulted at all.
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
   * NOT the load-bearing path: portfolioEngine.ts:1123-1134 never calls `exit()` for a setup that
   * exposes `targetWeight`. Mirrored here only so a direct/non-engine consumer sees the same rule.
   */
  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') {
      const stopped = stopFires(ctx, p);
      return check(
        stopped,
        [stopped ? 'catastrophic_stop' : 'hold_between_week_ends'],
        stopped ? decisionEvidence(ctx, decision, p) : [],
      );
    }
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
    const stopped = stopFires(ctx, p);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    const stopEn = stopped ? ` Entry-anchored catastrophic stop TRIGGERED at −${(p.stopLossPct * 100).toFixed(0)}% versus the average entry cost basis; flatten at the next open.` : '';
    const stopAr = stopped ? ` تم تفعيل وقف الخسارة الكارثي المرتكز على سعر الدخول عند −${(p.stopLossPct * 100).toFixed(0)}% مقارنة بمتوسط تكلفة الدخول؛ الخروج عند الافتتاح التالي.` : '';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly fixed top-${p.topN} FAST momentum selection (${p.lookbackDays}d-${p.skipRecentDays}d relative rank, absolute filter>0) then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name, plus a single new entry-anchored ${(p.stopLossPct * 100).toFixed(0)}% catastrophic stop evaluated on non-week-end closes.${stopEn} Candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بزخم سريع (زخم نسبي ${p.lookbackDays} يوم-${p.skipRecentDays} يوم، وفلتر الزخم المطلق>0) ثم ترجيح عكسي للتقلب عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم، مع متغير واحد جديد فقط: وقف خسارة كارثي عند ${(p.stopLossPct * 100).toFixed(0)}% مرتكز على سعر الدخول ويُقيَّم في جلسات غير نهاية الأسبوع.${stopAr} مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
