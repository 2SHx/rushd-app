// halal-concentrated-momentum-core v1 — PIVOT setup, pre-registered under an EXPLICIT user redirect
// of this session's objective. Every one of the five prior in-session tests (halal-markowitz-core,
// halal-risk-parity-core, halal-momentum-risk-parity-core, halal-sector-capped-risk-parity-core,
// halal-sector-capped-risk-parity-wide) chased "maximize diversification to survive the QDR-6
// drawdown/DSR gates" — all five were REJECTED, none cleared MC p95<30% or OOS DSR≥0.95. The user has
// now redirected the objective (NASDAQ-only; TASI has 0 real MarketBar rows and stays out of scope):
// maximize REALIZED CAGR for an actively-traded halal book, explicitly accepting that the honestly-
// measured risk profile may NOT clear QDR-6 — Sharia compliance is the ONE constraint that stays
// completely non-negotiable and unchanged; the gate machinery (reportCard.ts, monteCarlo.ts,
// walkForward.ts, profitPlateau.ts, envelope.ts) is untouched and computed IDENTICALLY to every prior
// setup. This file changes only the STRATEGY DESIGN, never the measurement.
//
// Five prior results, cited exactly, and the specific lesson each contributes to this pivot:
//   1) halal-markowitz-core   (mean-variance, 40 names, monthly): OOS CAGR 56.57%, MC p95 50.78%,
//      OOS DSR 0.899 — the HIGHEST OOS CAGR of the five, proving high CAGR is reachable in this
//      universe, but covariance-aware sizing alone did not fix tail risk.
//   2) halal-risk-parity-core (inverse-vol, 40 names, monthly): OOS CAGR 39.62%, MC p95 45.90% (best
//      tail-risk of the five), OOS DSR 0.898 — this session's single best tail-risk mitigant, but pure
//      diversification with no directional signal caps CAGR well below markowitz's.
//   3) halal-momentum-risk-parity-core (top-50% momentum selection + inverse-vol, 60 names, monthly):
//      OOS CAGR 51.17%, MC p95 60.18% (WORST of the five), OOS DSR 0.753 (WORST of the five) — the
//      decisive lesson: momentum SELECTION, even sized by inverse-vol, concentrates the book into a
//      correlated cluster (semiconductor/AI-rally names) that crashes together, and inverse-vol sizing
//      (own-volatility only, correlation-BLIND by its own a-priori design) cannot see or fix that. This
//      is the single most important prior result THIS file must respect: momentum concentration raises
//      tail risk, not just return, so the sizing/cap discipline below is not decorative.
//   4) halal-sector-capped-risk-parity-core (sector cap + inverse-vol, 40 names, monthly): MC p95
//      44.95%, OOS DSR 0.900 — a real but small tail-risk improvement from constraining WHAT is held.
//   5) halal-sector-capped-risk-parity-wide (same, 100 names, monthly): MC p95 42.26% (best-of-five),
//      OOS DSR 0.802 — breadth traded DSR for lower drawdown; the diversification-first family plateaus
//      around DSR 0.75-0.90 and never gets within reach of 0.30/0.95, across five independent tries.
//
// A-PRIORI PIVOT HYPOTHESIS (frozen before any run; the opposite end of the spectrum from all five
// priors): if diversification-first mechanisms cannot clear QDR-6 in this universe, genuine
// CONCENTRATION at a FASTER signal cadence may realize materially higher CAGR than any of the five
// priors (including markowitz's 56.57% OOS ceiling) — at the deliberate, accepted cost of measurably
// worse tail risk, most likely resembling or exceeding lesson (3)'s 60.18% MC p95 / 0.753 DSR, since
// this setup concentrates MORE (fixed top-10 vs top-50%-of-60) than the sibling that already
// demonstrated momentum concentration raises tail risk even under inverse-vol sizing. This is EXPECTED
// and ACCEPTABLE per the user's explicit redirect — the real, honest number is reported regardless of
// which way it lands; no retune after any result, including the 1Y diagnostic.
//
// A-PRIORI v1 SPEC (frozen before any run):
// - Universe: C1 Sharia-VERIFIED sleeve ONLY (buildVerifiedUniverse + selectDollarVolumeSleeve,
//   maxNames=60 — a broad pool to RANK from before concentrating down to 10, matching the momentum-
//   risk-parity sibling's ranking-pool size). universeCompatibility = 'halal-only'.
// - Cadence: WEEKLY — one rebalance decision per ISO week, on that week's LAST trading date (mirrors
//   the monthly siblings' monthOf/monthEndTimes month-boundary detection, at week granularity via an
//   ISO-8601 week key). The book holds between week-ends.
// - Momentum (SELECTION step, `dualMomentumRotation`'s exact proven formula/convention, reused via the
//   imported `dualMomentumMetrics` helper — never a different momentum definition): lookbackDays=126,
//   skipRecentDays=5, absoluteThreshold=0. A SHORTER, faster lookback than the monthly family's 252/21
//   convention, chosen a priori BECAUSE a 252-day lookback barely changes week to week — reusing it at
//   weekly cadence would make the faster rebalance pointless noise, not a genuine faster signal. At
//   each week-end, for every name with ≥ lookbackDays+1 trailing bars ending at asOf:
//   relative = close[t−skip]/close[t−lookback]−1 (rank input); absolute = close[t]/close[t−lookback]−1
//   (filter input, never optional — de-risks toward cash on a broad trend reversal).
// - Selection (genuine CONCENTRATION, not breadth — the deliberate pivot element): from names with
//   absolute momentum STRICTLY greater than absoluteThreshold, select the FIXED TOP topN=10 by
//   relative-momentum rank (ties by symbol ascending) — a fixed COUNT, never a fraction of the pool,
//   unlike the momentum-risk-parity sibling's top-50%-of-60 (≈30 names). If fewer than topN pass the
//   absolute filter, hold however many do, down to a floor of cashFloor=3 names; below that floor the
//   WHOLE book holds cash that week. Floor justification: below 3 eligible names, inverse-vol sizing
//   under a 25% per-name cap cannot meaningfully differentiate risk contribution (1-2 names is just
//   concentrated single/pair-stock risk wearing a sizing formula, not a genuine — if small — book), and
//   even at exactly 3 the cap machinery already forces ≥25% cash (3×25%=75% max invested), so 3 is the
//   smallest count where the capped-sizing step still does real work rather than being a fig leaf.
// - Weighting (SIZING step, unchanged from `halal-risk-parity-core`, imported verbatim — the one
//   mechanism this session's five tests showed consistently reduces tail risk, reused here even though
//   this book is concentrated, not diversified): `inverseVolatilityWeights` over the selected survivors'
//   trailing lookbackDays=126-day daily-return sample stdev (SAME window as the momentum lookback, so
//   the vol estimate matches the signal's own horizon) via a private `stdev` helper (matching both risk-
//   parity siblings' unexported definition verbatim, since `stdev` itself is not exported). Per-name cap
//   perNameCap=0.25 (HIGHER than the diversified siblings' 0.20 — appropriate for a ≤10-name book, but
//   still a REAL, binding cap, never unlimited concentration) via the imported, UNCHANGED
//   `capAndRedistribute` water-filling pass.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — lookbackDays ∈ {105,126,147} ×
//   topN ∈ {8,10,12}, center = {126,10}. cashFloor and perNameCap stay FIXED (not re-swept).
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot) — this constraint is
// completely unchanged by the CAGR-focused pivot. Execution remains paper/simulated only per standing
// RUSHD policy, independent of this card's terminal verdict.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import { capAndRedistribute, inverseVolatilityWeights } from './halalRiskParityCore';
import { dualMomentumMetrics } from './dualMomentumRotation';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HalalConcentratedMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  cashFloor: z.literal(3),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
});
export type HalalConcentratedMomentumCoreParams = z.infer<typeof HalalConcentratedMomentumCoreParamsSchema>;

export const HALAL_CONCENTRATED_MOMENTUM_CORE_V1: HalalConcentratedMomentumCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 126,
  skipRecentDays: 5,
  absoluteThreshold: 0,
  topN: 10,
  cashFloor: 3,
  perNameCap: 0.25,
  maxNames: 60,
  validationTrials: 9,
});

export function halalConcentratedMomentumCoreBookPolicy(
  params?: HalalConcentratedMomentumCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching both risk-parity siblings' convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface ConcentratedMomentumState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class the monthly siblings document).
  readonly decisionCache: Map<string, ConcentratedMomentumDecision>;
}

interface ConcentratedMomentumDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: ConcentratedMomentumState | null = null;
const SCOPED_STATES = new WeakMap<object, ConcentratedMomentumState>();

function paramsOrDefault(params?: HalalConcentratedMomentumCoreParams): HalalConcentratedMomentumCoreParams {
  const parsed = HalalConcentratedMomentumCoreParamsSchema.parse(params ?? HALAL_CONCENTRATED_MOMENTUM_CORE_V1);
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  return parsed;
}

/** ISO-8601 week key (year×100 + ISO week number). Trading-day granularity is sufficient — this
 * groups real bars into their ISO week; the last bar seen per key is that week's rebalance date
 * (mirrors monthOf's role in the monthly siblings, one granularity finer). */
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
    throw new Error('halal-concentrated-momentum-core requires dailyBarsBySymbol for its resolved C1 sleeve');
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
  const state: ConcentratedMomentumState = {
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

/** Sample (n−1) standard deviation — identical definition to both risk-parity siblings' private
 * helper (not exported there, so reimplemented here verbatim rather than importing a private
 * symbol). Returns 0 for < 2 observations (excluded upstream as degenerate). */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Selection step: from names passing the absolute-momentum filter, select the FIXED top `topN` by
 * relative-momentum rank (ties by symbol ascending) — a fixed COUNT, never a fraction of the pool.
 * Below `floor` eligible names, selects none (whole book holds cash that week). Pure, deterministic.
 * Exported for direct unit testing of the fixed-count selection math in isolation.
 */
export function selectTopNByMomentum(
  eligible: readonly { symbol: string; relative: number }[],
  topN: number,
  floor: number,
): string[] {
  if (eligible.length < floor) return [];
  const sorted = [...eligible].sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol));
  return sorted.slice(0, Math.min(topN, sorted.length)).map((row) => row.symbol);
}

function wideDecision(
  asOf: Date,
  params: HalalConcentratedMomentumCoreParams,
  replayScope?: object,
): ConcentratedMomentumDecision {
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

  // Step 2: absolute-momentum filter (the tail-risk de-risk-to-cash mechanism) — never optional.
  const eligible = rankable.filter((row) => row.absolute > params.absoluteThreshold);

  // Step 3: FIXED top-N selection by relative-momentum rank among the eligible (post-absolute-
  // filter) set — never a fraction of the wider rankable pool.
  const selectedSymbols = new Set(selectTopNByMomentum(eligible, params.topN, params.cashFloor));

  let result: ConcentratedMomentumDecision;
  if (selectedSymbols.size === 0) {
    result = {
      reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
      selected: 0, weights: new Map(),
    };
  } else {
    // Step 4: sizing — inverse-volatility risk parity over ONLY the selected survivors, reusing
    // halal-risk-parity-core's UNCHANGED pure functions verbatim.
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
  symbol: string,
  decision: ConcentratedMomentumDecision,
  params: HalalConcentratedMomentumCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_fixed_top_n_momentum_selection_plus_inverse_volatility_sizing'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalConcentratedMomentumCoreSetup: StrategySetup<HalalConcentratedMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-concentrated-momentum-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_CONCENTRATED_MOMENTUM_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalConcentratedMomentumCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalConcentratedMomentumCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [105, 126, 147].flatMap((lookbackDays) =>
      [8, 10, 12].flatMap((topN) => (
        lookbackDays === center.lookbackDays && topN === center.topN
          ? []
          : [{
            label: `lookbackDays=${lookbackDays}|topN=${topN}`,
            params: { ...center, lookbackDays, topN },
          }]
      )),
    );
    return { axes: ['lookbackDays', 'topN'], center, neighbors };
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly fixed top-${p.topN} momentum selection (6mo−1wk relative rank, absolute filter>0) then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name. Deliberately concentrated, CAGR-focused pivot; candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بالزخم (زخم نسبي 6 أشهر-أسبوع، وفلتر الزخم المطلق>0) ثم ترجيح عكسي للتقلب (تكافؤ المخاطر) عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم. تركيز متعمد يستهدف العائد المركب، مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
