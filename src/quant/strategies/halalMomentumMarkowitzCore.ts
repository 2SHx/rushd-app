// halal-momentum-markowitz-core v1 — PRE-REGISTERED SYNTHESIS: the one untried corner this
// session's seven prior REJECTED results point to. Every prior setup used momentum SELECTION with
// a correlation-BLIND SIZER (inverse-vol), OR covariance-aware SIZING with NO directional selection
// at all — never both together. This setup combines momentum SELECTION (the proven CAGR engine)
// with Markowitz covariance-aware SIZING (the proven best-all-round diversified sizer) at weekly
// cadence, on the a-priori hypothesis that a covariance-aware sizer is the one tool this lab has
// built that explicitly models the correlation momentum selection creates — attacking the exact,
// repeatedly-diagnosed root cause of every momentum-selection setup's tail risk.
//
// Seven prior results, cited exactly, and the specific lesson each contributes to this synthesis:
//   1) halal-risk-parity-core   (inverse-vol, 40 names, monthly): OOS CAGR 39.62%, MC p95 45.90%,
//      OOS DSR 0.898 — best tail-risk of the pure-diversification family, but no directional signal
//      caps CAGR well below the momentum-selection setups.
//   2) halal-markowitz-core     (Markowitz tangency, 40 names, monthly): OOS CAGR 56.57%, MC p95
//      50.78%, OOS DSR 0.899 — the BEST ALL-ROUND diversified result of the whole session: highest
//      diversified CAGR, second-best diversified MC p95, best diversified DSR. Covariance-aware
//      sizing alone (no directional signal) already beats every pure-inverse-vol variant on every
//      axis simultaneously — the single decisive prior fact this synthesis is built on.
//   3) halal-momentum-risk-parity-core (top-50%-of-60 momentum SELECTION + inverse-vol SIZING,
//      monthly): OOS CAGR 51.17%, MC p95 60.18% (WORST of the diversified family), OOS DSR 0.753
//      (WORST of the diversified family) — momentum selection concentrates the book into a
//      correlated cluster (semiconductor/AI-rally names), and inverse-vol sizing — own-volatility
//      only, correlation-BLIND by its own a-priori design — cannot see or fix that concentration.
//      This is the decisive DIAGNOSIS: the sizer, not the selector, is where the fix must land.
//   4) halal-sector-capped-risk-parity-core (sector cap + inverse-vol, 40 names, monthly): MC p95
//      44.95%, OOS DSR 0.900 — constraining WHAT is held helps a little; constraining correlation
//      directly (Markowitz) helps more (see #2).
//   5) halal-sector-capped-risk-parity-wide (same, 100 names, monthly): MC p95 42.26% (best tail of
//      the whole session), OOS DSR 0.802 — breadth traded DSR for lower drawdown; still correlation-
//      BLIND sizing, still no directional signal.
//   6) halal-concentrated-momentum-core (fixed top-10 WEEKLY momentum SELECTION + inverse-vol
//      SIZING): OOS CAGR 69.66% (HIGHEST of the whole session), MC p95 64.68% (WORST of the whole
//      session), OOS DSR 0.750 — confirms momentum selection is the CAGR engine, and confirms (at a
//      MORE extreme, weekly/top-10 setting) that inverse-vol sizing cannot manage the concentration
//      it creates. This setup's own header explicitly names the fix never yet tried: "a correlation-
//      AWARE sizer (Markowitz-style) applied AFTER this concentrated weekly selection."
//   7) halal-managed-momentum-core (SAME weekly top-10 momentum book + 3 down-only vol-target/
//      drawdown/regime governors, still inverse-vol SIZING): OOS CAGR 44.45%, MC p95 50.70%, OOS DSR
//      0.733 — stacking down-only overlays on a correlation-BLIND sizer is Pareto-DOMINATED by
//      halal-markowitz-core's plain covariance sizing (#2) on all three axes simultaneously. The
//      lesson: overlays that trim exposure cannot substitute for a sizer that actually understands
//      cross-name correlation. This closes off "more overlays" as a lever and points directly at
//      THIS synthesis instead.
//
// A-PRIORI HYPOTHESIS (frozen before any run; PRE-REGISTRATION IS BINDING — no retune after any
// result, including the 1Y diagnostic): a Markowitz tangency sizer applied to the SAME weekly
// momentum-selected subset that produced #6's 69.66% OOS CAGR will retain MORE of that CAGR than
// the diversified-monthly setups (#1, #2, #4, #5) achieved, because it starts from a directionally-
// filtered, momentum-tilted subset rather than the whole sleeve — while landing BELOW #6's 64.68%
// MC p95 tail, because the covariance sizer explicitly down-weights the correlated cluster #3 and #6
// both diagnosed. This lands at a genuinely NEW point on the CAGR/tail-risk frontier this lab has
// mapped this session, ideally beating #2's 56.57%/50.78%/0.899 on at least the CAGR axis. The
// honest, unmodified QDR-6 result is reported regardless of which way it lands.
//
// A-PRIORI v1 SPEC (frozen before any run; changes require a new version, never a retune):
// - Universe: C1 Sharia-VERIFIED sleeve ONLY (buildVerifiedUniverse + selectDollarVolumeSleeve,
//   maxNames=60 — matching #3/#6/#7's ranking-pool breadth). universeCompatibility = 'halal-only'.
// - Cadence: WEEKLY — one rebalance decision per ISO week, on that week's LAST observed trading
//   date (byte-identical ISO-week-key boundary detection to `halalConcentratedMomentumCore`,
//   reimplemented locally since the source function is private/unexported there — never a different
//   convention). The book holds between week-ends.
// - Selection (momentum SELECTION step, reusing `dualMomentumMetrics`'s exact proven formula from
//   `dualMomentumRotation` and `selectTopNByMomentum`'s exact proven fixed-count/floor logic from
//   `halalConcentratedMomentumCore`, BOTH imported UNCHANGED, never reimplemented): lookbackDays=126,
//   skipRecentDays=5, absoluteThreshold=0 — SAME faster weekly-appropriate lookback as #6/#7 (a
//   252-day lookback barely moves week to week; reusing it here would make the faster cadence
//   pointless noise). From names with absolute momentum STRICTLY greater than absoluteThreshold,
//   select the FIXED TOP topN=20 by relative-momentum rank (ties by symbol ascending) —
//   DELIBERATELY WIDER than #6/#7's top-10: a Markowitz covariance estimate needs enough names to be
//   well-conditioned (an N×N covariance matrix over N<10 names is unstable/degenerate-prone, as
//   `halal-markowitz-core`'s own 15-name breadth floor already establishes for its 40-name monthly
//   sleeve), so top-20 keeps a strong momentum tilt while giving the covariance sizer real
//   cross-sectional material to diversify across, unlike a fixed top-10 that leaves the sizer almost
//   nothing to work with.
// - Cash floor: cashFloor=10 applies to the ELIGIBLE (post-absolute-filter) count, via
//   `selectTopNByMomentum`'s own floor semantics (below-floor ⇒ empty selection ⇒ whole book holds
//   cash that week) — chosen a priori as the exact minimum breadth at which a Markowitz covariance
//   estimate over a 126-observation trailing window stops being degenerate/ill-conditioned in this
//   universe's scale (an N×N covariance fit with N<10 on a book that is ALSO meant to cap any single
//   name at 25% cannot meaningfully diversify — 10 names × 25% cap already forces the sizer to spread
//   real weight across at least four names even in the most concentrated feasible outcome, the same
//   reasoning `halal-concentrated-momentum-core`'s own cashFloor=3 header used at its 10-name/25%-cap
//   scale, scaled up here for a genuine covariance fit rather than a single-name inverse-vol ratio).
// - Sizing (SIZING step, the untried synthesis element): the selected ≤20 names' trailing
//   lookbackDays=126 daily returns (`dailyReturns`, SAME window as the momentum signal, matching
//   both risk-parity siblings' convention of aligning the vol/covariance estimate to the signal's
//   own horizon) feed `markowitzFrontier()` (`../portfolio/frontier`, imported UNCHANGED — no
//   reimplementation of the Markowitz math), seed=42, portfolios=10,000, riskFreeRate=0,
//   tradingDaysPerYear=252 — BYTE-IDENTICAL study parameters to `halal-markowitz-core`, so any
//   difference in the resulting risk/return profile is attributable to the momentum pre-selection,
//   not to a different Markowitz configuration. `.tangency.weights` (aligned to `.symbols`) are the
//   raw target weights, capped at perNameCap=0.25 (matching #6/#7's concentrated-book cap, not the
//   diversified family's tighter 0.20 — appropriate for a ≤20-name selected subset) via the imported,
//   UNCHANGED `capAndRedistribute` water-filling pass (`halalRiskParityCore`).
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — topN ∈ {15,20,25} ×
//   lookbackDays ∈ {105,126,147}, center = {20,126}. cashFloor, perNameCap, and every Markowitz
//   study parameter (seed/portfolios/riskFreeRate/tradingDaysPerYear) stay FIXED (not re-swept).
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot) — completely
// unchanged and non-negotiable, independent of the CAGR-focused pivot. Execution remains
// paper/simulated only per standing RUSHD policy.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns, markowitzFrontier } from '../portfolio/frontier';
import { capAndRedistribute } from './halalRiskParityCore';
import { selectTopNByMomentum } from './halalConcentratedMomentumCore';
import { dualMomentumMetrics } from './dualMomentumRotation';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HalalMomentumMarkowitzCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  cashFloor: z.literal(10),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  seed: z.literal(42),
  portfolios: z.literal(10_000),
  riskFreeRate: z.literal(0),
  tradingDaysPerYear: z.literal(252),
  validationTrials: z.literal(9),
});
export type HalalMomentumMarkowitzCoreParams = z.infer<typeof HalalMomentumMarkowitzCoreParamsSchema>;

export const HALAL_MOMENTUM_MARKOWITZ_CORE_V1: HalalMomentumMarkowitzCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 126,
  skipRecentDays: 5,
  absoluteThreshold: 0,
  topN: 20,
  cashFloor: 10,
  perNameCap: 0.25,
  maxNames: 60,
  seed: 42,
  portfolios: 10_000,
  riskFreeRate: 0,
  tradingDaysPerYear: 252,
  validationTrials: 9,
});

export function halalMomentumMarkowitzCoreBookPolicy(
  params?: HalalMomentumMarkowitzCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching the concentrated-momentum/markowitz siblings.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface MomentumMarkowitzState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param — a date-only key would leak the center run's
  // decisions into every plateau neighbor (documented regression class across every sibling file).
  readonly decisionCache: Map<string, MomentumMarkowitzDecision>;
}

interface MomentumMarkowitzDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: MomentumMarkowitzState | null = null;
const SCOPED_STATES = new WeakMap<object, MomentumMarkowitzState>();

function paramsOrDefault(params?: HalalMomentumMarkowitzCoreParams): HalalMomentumMarkowitzCoreParams {
  const parsed = HalalMomentumMarkowitzCoreParamsSchema.parse(params ?? HALAL_MOMENTUM_MARKOWITZ_CORE_V1);
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  return parsed;
}

/** ISO-8601 week key (year×100 + ISO week number) — byte-identical convention to
 * `halalConcentratedMomentumCore`'s private helper, reimplemented locally since it is not exported
 * there (never a different definition). Groups real bars into their ISO week; the last bar seen per
 * key is that week's rebalance date. */
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
    throw new Error('halal-momentum-markowitz-core requires dailyBarsBySymbol for its resolved C1 sleeve');
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
  const state: MomentumMarkowitzState = {
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

function wideDecision(
  asOf: Date,
  params: HalalMomentumMarkowitzCoreParams,
  replayScope?: object,
): MomentumMarkowitzDecision {
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

  // Step 2: absolute-momentum filter (never optional) — de-risks toward cash on a broad reversal.
  const eligible = rankable.filter((row) => row.absolute > params.absoluteThreshold);

  // Step 3: FIXED top-N SELECTION by relative-momentum rank among eligible survivors, reusing
  // `halalConcentratedMomentumCore`'s exact proven fixed-count/floor logic unchanged. Below
  // cashFloor eligible names, returns [] (whole book holds cash that week) — the floor guarantees a
  // Markowitz covariance fit, when it runs, always sees ≥cashFloor=10 candidate assets.
  const selectedSymbols = new Set(selectTopNByMomentum(eligible, params.topN, params.cashFloor));

  let result: MomentumMarkowitzDecision;
  if (selectedSymbols.size === 0) {
    result = {
      reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
      selected: 0, weights: new Map(),
    };
  } else {
    // Step 4: SIZING — Markowitz covariance-aware tangency weighting over ONLY the momentum-selected
    // survivors, reusing `markowitzFrontier` unchanged (byte-identical study params to
    // `halal-markowitz-core`) so the covariance sizer can down-weight exactly the correlated cluster
    // that inverse-vol sizing (every prior momentum-selection sibling) could not see.
    const returnsBySymbol: Record<string, number[]> = {};
    for (const row of rankable) {
      if (!selectedSymbols.has(row.symbol)) continue;
      try {
        returnsBySymbol[row.symbol] = dailyReturns(row.closes);
      } catch {
        // defensive: malformed close series excluded, never crashes the book
      }
    }
    const usableSymbols = Object.keys(returnsBySymbol);
    if (usableSymbols.length < 2) {
      // Markowitz requires ≥2 assets; the cashFloor=10 pre-condition makes this practically
      // unreachable in a real run, but stay defensive rather than crash the book.
      result = {
        reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
        selected: 0, weights: new Map(),
      };
    } else {
      const frontier = markowitzFrontier(returnsBySymbol, {
        seed: params.seed,
        portfolios: params.portfolios,
        riskFreeRate: params.riskFreeRate,
        tradingDaysPerYear: params.tradingDaysPerYear,
      });
      const rawWeights = new Map<string, number>();
      frontier.symbols.forEach((symbol: string, idx: number) => {
        rawWeights.set(symbol, frontier.tangency.weights[idx]);
      });
      const weights = capAndRedistribute(rawWeights, params.perNameCap);
      result = {
        reason: 'ranked', rankable: rankable.length, eligible: eligible.length,
        selected: usableSymbols.length, weights,
      };
    }
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
  decision: MomentumMarkowitzDecision,
  params: HalalMomentumMarkowitzCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_top_n_momentum_selection_plus_markowitz_tangency_sizing'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('markowitz_seed', params.seed),
    evidence('markowitz_portfolios', params.portfolios),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalMomentumMarkowitzCoreSetup: StrategySetup<HalalMomentumMarkowitzCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-momentum-markowitz-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_MOMENTUM_MARKOWITZ_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalMomentumMarkowitzCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalMomentumMarkowitzCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [15, 20, 25].flatMap((topN) =>
      [105, 126, 147].flatMap((lookbackDays) => (
        topN === center.topN && lookbackDays === center.lookbackDays
          ? []
          : [{
            label: `topN=${topN}|lookbackDays=${lookbackDays}`,
            params: { ...center, topN, lookbackDays },
          }]
      )),
    );
    return { axes: ['topN', 'lookbackDays'], center, neighbors };
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly top-${p.topN} momentum selection (6mo−1wk relative rank, absolute filter>0) then Markowitz tangency (covariance-aware) sizing over the selected subset of the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name. Momentum selection for CAGR, covariance-aware sizing to manage the correlated cluster it creates; candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بالزخم (زخم نسبي 6 أشهر-أسبوع، وفلتر الزخم المطلق>0) ثم ترجيح ماركويتز الظِّلي (واعٍ بالتغاير) عبر المجموعة المختارة من سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم. اختيار بالزخم لتعظيم العائد المركب، وترجيح واعٍ بالتغاير لإدارة التكتل المترابط الذي يخلقه؛ مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
