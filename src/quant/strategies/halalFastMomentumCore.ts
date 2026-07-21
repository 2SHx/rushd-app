// halal-fast-momentum-core v1 — ISOLATED velocity+concentration A/B against
// `halal-concentrated-momentum-core` (top-10, WEEKLY, 126d/skip5, REJECTED, session-best OOS CAGR
// 69.66% / MC p95 64.68% / OOS DSR 0.750), testing this session's NEWEST empirical finding.
//
// THE FINDING THIS SETUP TESTS (from `halal-trend-rider-core`'s REJECT, the ninth setup this
// session): letting winners run (never trimming, 232 full-period trades) produced a WORSE OOS CAGR
// (45.44%) than the concentrated engine's weekly re-rank-and-trim discipline (2,317 trades, 69.66%).
// The diagnosed mechanism was ROTATION VELOCITY, not position longevity: the concentrated book
// re-ranks its ENTIRE top-10 every week, continuously replacing decelerating names with whatever is
// CURRENTLY hottest, capturing sequential exposure to many different winners across the 2018-2026
// bull even though each individual position gets trimmed. This is the direct, load-bearing prior for
// this dispatch, cited exactly.
//
// ALL NINE prior in-session results (momentum-family CAGR ranking, OOS CAGR / MC p95 / OOS DSR):
//   `halal-concentrated-momentum-core` (top-10, WEEKLY, 126d/skip5)      69.66% / 64.68% / 0.750 (BEST CAGR)
//   `halal-momentum-markowitz-core`    (top-20, momentum+Markowitz)      52.95% / 60.51% / 0.746
//   `halal-momentum-risk-parity-core`  (top-50%, monthly, inverse-vol)   51.17% / 60.18% / 0.753
//   `halal-managed-momentum-core`      (top-10 + 3 down-only governors)  44.45% / 50.70% / 0.733
//   `halal-trend-rider-core`           (let-winners-run, never trims)    45.44% / 62.04% / 0.630 (WORST DSR)
//   `halal-markowitz-core`             (undirected Markowitz, monthly)   56.57% / 50.78% / 0.899 (BEST ALL-ROUND)
//   `halal-risk-parity-core`, `halal-sector-capped-risk-parity-core/-wide` (diversification-first): 23-40% / 42-46% / 0.80-0.90
//
// A-PRIORI HYPOTHESIS (frozen before any run — the empirical question this dispatch answers): if
// ROTATION VELOCITY (re-ranking into fresh momentum every week) is genuinely the edge — not
// winner-trimming per se — then a FASTER momentum signal (63d/skip2, roughly HALF the baseline's
// 126d/skip5 lookback, so the ranking reacts to ~3-month-old information instead of ~6-month-old)
// combined with TIGHTER concentration (top-5, so each rotation event reallocates a LARGER share of
// the book into the currently-hottest names) pushes rotation velocity and per-rotation impact to
// their sensible maximum, and could beat the 69.66% OOS CAGR ceiling. This is EXPLICITLY NOT
// guaranteed: a faster signal is also more prone to noise/whipsaw (reacting to shorter-horizon price
// moves that regress rather than persist), and this is the empirical question being tested, not a
// foregone conclusion — the real number is reported regardless of which way it lands. Faster
// rebalancing signal ALSO means more trades, i.e. more cost drag (15bps/side, unchanged), and tighter
// concentration (top-5 vs top-10) raises single-name tail risk further — this is explicitly the
// aggressive extreme of the momentum family tested this session, and the REAL MC p95 drawdown is
// reported however large, with no attempt to soften it. No retune after any result, including the 1Y
// diagnostic.
//
// A-PRIORI v1 SPEC (frozen before any run) — an ISOLATED change from `halal-concentrated-momentum-
// core`'s file: identical weekly ISO-week rebalance, identical `dualMomentumMetrics` relative+
// absolute momentum formula (imported unchanged), identical `inverseVolatilityWeights`/
// `capAndRedistribute` sizing (imported unchanged, 25% per-name cap), identical C1-verified 60-name
// dollar-volume sleeve. ONLY THREE PARAMETERS CHANGE:
//   1) lookbackDays: 126 → 63 (half the baseline — the FASTER signal being tested).
//   2) skipRecentDays: 5 → 2 (proportionally faster skip window, keeping skip/lookback well below
//      unity so the relative-momentum rank still has a meaningful measurement window: 2/63 ≈ 0.032,
//      close to the baseline's 5/126 ≈ 0.040 ratio).
//   3) topN: 10 → 5 (half the baseline — the TIGHTER concentration being tested).
// cashFloor is adjusted PROPORTIONALLY to topN, not held fixed: the baseline's floor/topN ratio is
// 3/10 = 0.30; scaled to topN=5 that is 1.5, rounded up to cashFloor=2 (the smallest integer at or
// above the proportional value). 2 is also independently justified as the smallest count where
// inverse-vol sizing still differentiates AT ALL between two names (at exactly 1 eligible name,
// weighting is trivially 100%/no-differentiation, not a genuine sizing decision); at exactly 2, with
// perNameCap=0.25, the cap machinery already forces ≥50% cash (2×25%=50% max invested), so the cap
// still does real, binding work rather than being a fig leaf, mirroring the baseline's own floor
// justification at its own concentration level.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — lookbackDays ∈ {42,63,84} ×
//   topN ∈ {4,5,6}, center = {63,5}. cashFloor and perNameCap stay FIXED (not re-swept), matching the
//   baseline's precedent.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot) — this constraint is
// completely unchanged; Sharia stays non-negotiable regardless of this book's risk profile. Execution
// remains paper/simulated only per standing RUSHD policy, independent of this card's terminal verdict.
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

export const HalalFastMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  cashFloor: z.literal(2),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
});
export type HalalFastMomentumCoreParams = z.infer<typeof HalalFastMomentumCoreParamsSchema>;

export const HALAL_FAST_MOMENTUM_CORE_V1: HalalFastMomentumCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 63,
  skipRecentDays: 2,
  absoluteThreshold: 0,
  topN: 5,
  cashFloor: 2,
  perNameCap: 0.25,
  maxNames: 60,
  validationTrials: 9,
});

export function halalFastMomentumCoreBookPolicy(
  params?: HalalFastMomentumCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching the concentrated-momentum sibling's convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface FastMomentumState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class the monthly siblings document).
  readonly decisionCache: Map<string, FastMomentumDecision>;
}

interface FastMomentumDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: FastMomentumState | null = null;
const SCOPED_STATES = new WeakMap<object, FastMomentumState>();

function paramsOrDefault(params?: HalalFastMomentumCoreParams): HalalFastMomentumCoreParams {
  const parsed = HalalFastMomentumCoreParamsSchema.parse(params ?? HALAL_FAST_MOMENTUM_CORE_V1);
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  return parsed;
}

/** ISO-8601 week key (year×100 + ISO week number). Trading-day granularity is sufficient — this
 * groups real bars into their ISO week; the last bar seen per key is that week's rebalance date
 * (identical to the concentrated-momentum sibling, one granularity finer than the monthly siblings). */
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
    throw new Error('halal-fast-momentum-core requires dailyBarsBySymbol for its resolved C1 sleeve');
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
  const state: FastMomentumState = {
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

/** Sample (n−1) standard deviation — identical definition to the concentrated-momentum sibling's
 * private helper (not exported there, so reimplemented here verbatim rather than importing a private
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
  params: HalalFastMomentumCoreParams,
  replayScope?: object,
): FastMomentumDecision {
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

  let result: FastMomentumDecision;
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
  decision: FastMomentumDecision,
  params: HalalFastMomentumCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_fixed_top_n_fast_momentum_selection_plus_inverse_volatility_sizing'),
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

export const halalFastMomentumCoreSetup: StrategySetup<HalalFastMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-fast-momentum-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_FAST_MOMENTUM_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalFastMomentumCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalFastMomentumCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [42, 63, 84].flatMap((lookbackDays) =>
      [4, 5, 6].flatMap((topN) => (
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly fixed top-${p.topN} FAST momentum selection (${p.lookbackDays}d-${p.skipRecentDays}d relative rank, absolute filter>0) then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name. Deliberately max-velocity, max-concentration CAGR extreme; candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بزخم سريع (زخم نسبي ${p.lookbackDays} يوم-${p.skipRecentDays} يوم، وفلتر الزخم المطلق>0) ثم ترجيح عكسي للتقلب (تكافؤ المخاطر) عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم. أقصى سرعة دوران وأقصى تركيز متعمدين لاختبار العائد المركب، مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
