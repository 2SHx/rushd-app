// halal-momentum-risk-parity-core v1 — R6: COMBINES two mechanisms already independently tested
// this session, at real breadth, over the C1 Sharia-verified halal universe:
//   1) dual-momentum SELECTION (the proven signal family from `dual-momentum-rotation`, which
//      validated the direction — OOS DSR 0.701, positive OOS CAGR — but was REJECTED on
//      `INSUFFICIENT_SAMPLE` because it ran on a 7-name fixed sleeve with max-1-position sizing);
//   2) inverse-volatility risk-parity SIZING (the proven best-yet tail-risk mitigant from
//      `halal-risk-parity-core`, which cut MC p95 book-day drawdown to 45.90% — the lowest of any
//      multi-name setup ever tried in this lab — but carried NO directional signal of its own and
//      still missed the 30% breaker and OOS DSR 0.95).
// A-PRIORI HYPOTHESIS (frozen before any run): layering the proven momentum signal on top of the
// proven risk-parity weighting, at genuine breadth (15-30+ simultaneous positions, unlike dual-
// momentum-rotation's 1), clears BOTH the sample-size gate (dual-momentum-rotation's structural
// problem) and pushes the drawdown/DSR gates further than either single mechanism sibling
// (halal-risk-parity-core 45.90%/0.898, halal-markowitz-core 50.78%/0.899) — because the absolute-
// momentum filter is a textbook tail-risk mitigant (de-risks toward cash when the broad trend turns
// down), which pure diversification alone lacks.
//
// A-PRIORI v1 SPEC (frozen before any run; PRE-REGISTRATION IS BINDING — no retune after seeing any
// result, including the 1Y diagnostic; a bad FULL number is reported REJECTED as measured):
// - Universe: the C1 Sharia-VERIFIED sleeve ONLY (`buildVerifiedUniverse` + `selectDollarVolumeSleeve`,
//   maxNames=60 — wider than the two single-mechanism siblings' 40, because this setup RANKS then
//   SELECTS a subset and needs real breadth to select FROM before narrowing to a genuinely
//   diversified ~15-30-name final book). universeCompatibility = 'halal-only'.
// - Cadence: monthly — one rebalance decision per calendar month-end trading date; the book holds
//   between month-ends (same month-end architecture as both siblings).
// - Momentum (SELECTION step, `dualMomentumRotation`'s exact proven convention/formulas, reused via
//   the imported `dualMomentumMetrics` helper — never a different momentum definition):
//   lookbackBars=252, skipRecentBars=21, absoluteThreshold=0. At each month-end, for every name with
//   ≥ lookbackBars+1 trailing bars ending at asOf: relative = close[t−skip]/close[t−lookback]−1
//   (rank input), absolute = close[t]/close[t−lookback]−1 (filter input).
// - Selection (the new element): from names with absolute momentum STRICTLY greater than
//   absoluteThreshold, select the top `selectionFraction` (default 0.5 = top half) by relative-
//   momentum rank, count = round(eligibleCount × selectionFraction) (ties broken by symbol ascending,
//   matching dualMomentumRotation's convention). Names failing the absolute filter are NEVER selected
//   regardless of relative rank — this is the tail-risk de-risk-toward-cash mechanism; it is not
//   optional and this file must never drop it.
// - Breadth floor: fewer than minRankable=15 names selected (after both filters) ⇒ the WHOLE book
//   holds cash that month (mirrors both siblings' precedent).
// - Weighting (SIZING step, unchanged from `halal-risk-parity-core`): `inverseVolatilityWeights`
//   (imported UNCHANGED, never reimplemented) over ONLY the selected survivors' trailing
//   lookbackBars-day daily-return sample stdev (same volatility definition halal-risk-parity-core
//   uses — reimplemented locally here as a private `stdev` helper, matching that file's definition
//   exactly, since `stdev` itself is not exported). A survivor with non-finite/non-positive σ is
//   excluded from weighting by `inverseVolatilityWeights` itself (never divides by zero). Per-name
//   cap 20% via the imported, UNCHANGED `capAndRedistribute` water-filling pass.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — lookbackBars ∈ {231,252,273} ×
//   selectionFraction ∈ {0.4,0.5,0.6}, center = {252, 0.5}. perNameCap stays FIXED at 0.20 (already
//   validated by both siblings) rather than re-sweeping it.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot). Execution remains
// paper/simulated only per standing RUSHD policy, independent of this card's terminal verdict.
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

export const HalalMomentumRiskParityCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackBars: z.number().int().positive(),
  skipRecentBars: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  selectionFraction: z.number().positive().max(1),
  minRankable: z.literal(15),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
});
export type HalalMomentumRiskParityCoreParams = z.infer<typeof HalalMomentumRiskParityCoreParamsSchema>;

export const HALAL_MOMENTUM_RISK_PARITY_CORE_V1: HalalMomentumRiskParityCoreParams = Object.freeze({
  version: 'v1',
  lookbackBars: 252,
  skipRecentBars: 21,
  absoluteThreshold: 0,
  selectionFraction: 0.5,
  minRankable: 15,
  perNameCap: 0.20,
  maxNames: 60,
  validationTrials: 9,
});

export function halalMomentumRiskParityCoreBookPolicy(
  params?: HalalMomentumRiskParityCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackBars + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching both siblings' convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface MomentumRiskParityState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly monthEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class both siblings document).
  readonly decisionCache: Map<string, MomentumRiskParityDecision>;
}

interface MomentumRiskParityDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'insufficient_breadth';
  readonly rankable: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: MomentumRiskParityState | null = null;
const SCOPED_STATES = new WeakMap<object, MomentumRiskParityState>();

function paramsOrDefault(params?: HalalMomentumRiskParityCoreParams): HalalMomentumRiskParityCoreParams {
  const parsed = HalalMomentumRiskParityCoreParamsSchema.parse(params ?? HALAL_MOMENTUM_RISK_PARITY_CORE_V1);
  if (parsed.skipRecentBars >= parsed.lookbackBars) {
    throw new Error('skipRecentBars must be smaller than lookbackBars');
  }
  return parsed;
}

function monthOf(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  if (!daily || daily.size === 0) {
    throw new Error('halal-momentum-risk-parity-core requires dailyBarsBySymbol for its resolved C1 sleeve');
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const monthEnds = new Map<number, number>(); // month index → max ts
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
      const m = monthOf(time);
      monthEnds.set(m, Math.max(monthEnds.get(m) ?? Number.NEGATIVE_INFINITY, time));
    });
    seriesBySymbol.set(symbol, { ts, close });
  }
  const state: MomentumRiskParityState = {
    seriesBySymbol,
    monthEndTimes: new Set(monthEnds.values()),
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

/** Sample (n−1) standard deviation — identical definition to halal-risk-parity-core's private
 * helper (not exported there, so reimplemented here verbatim rather than importing a private
 * symbol). Returns 0 for < 2 observations (excluded upstream as degenerate). */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Selection step: from names passing the absolute-momentum filter, select the top
 * round(count × selectionFraction) by relative-momentum rank (ties by symbol ascending). Pure,
 * deterministic. Exported for direct unit testing of the selection-fraction math in isolation.
 */
export function selectByMomentum(
  eligible: readonly { symbol: string; relative: number }[],
  selectionFraction: number,
): string[] {
  const sorted = [...eligible].sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol));
  const count = Math.round(sorted.length * selectionFraction);
  return sorted.slice(0, count).map((row) => row.symbol);
}

function wideDecision(
  asOf: Date,
  params: HalalMomentumRiskParityCoreParams,
  replayScope?: object,
): MomentumRiskParityDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return { reason: 'insufficient_breadth', rankable: 0, selected: 0, weights: new Map() };
  const asOfMs = asOf.getTime();
  if (!state.monthEndTimes.has(asOfMs)) {
    return { reason: 'not_month_end', rankable: 0, selected: 0, weights: new Map() };
  }
  const cacheKey = [
    asOfMs, params.lookbackBars, params.skipRecentBars, params.absoluteThreshold,
    params.selectionFraction, params.perNameCap,
  ].join('|');
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  // Step 1: momentum-rankable names (≥ lookbackBars+1 trailing bars ending exactly at asOf).
  let rankable: { symbol: string; relative: number; absolute: number; closes: number[] }[] = [];
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.lookbackBars) continue; // no bar at asOf, or insufficient trailing history
    const closes: number[] = [];
    for (let k = i - params.lookbackBars; k <= i; k++) closes.push(series.close[k]);
    const metrics = dualMomentumMetrics(closes, params.lookbackBars, params.skipRecentBars);
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

  // Step 3: selection by relative-momentum rank, top selectionFraction of the ELIGIBLE (post-
  // absolute-filter) set — never the full rankable set.
  const selectedSymbols = new Set(selectByMomentum(eligible, params.selectionFraction));

  let result: MomentumRiskParityDecision;
  if (selectedSymbols.size < params.minRankable) {
    result = { reason: 'insufficient_breadth', rankable: rankable.length, selected: selectedSymbols.size, weights: new Map() };
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
    result = { reason: 'ranked', rankable: rankable.length, selected: selectedSymbols.size, weights };
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
  decision: MomentumRiskParityDecision,
  params: HalalMomentumRiskParityCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'dual_momentum_selection_plus_inverse_volatility_risk_parity_sizing'),
    evidence('lookback_bars', params.lookbackBars),
    evidence('skip_recent_bars', params.skipRecentBars),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('selection_fraction', params.selectionFraction),
    evidence('per_name_cap', params.perNameCap),
    evidence('rankable_names', decision.rankable),
    evidence('selected_names', decision.selected),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalMomentumRiskParityCoreSetup: StrategySetup<HalalMomentumRiskParityCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-momentum-risk-parity-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_MOMENTUM_RISK_PARITY_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const monthEnds = Array.from(state.monthEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalMomentumRiskParityCoreParams);
      for (const t of monthEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalMomentumRiskParityCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [231, 252, 273].flatMap((lookbackBars) =>
      [0.4, 0.5, 0.6].flatMap((selectionFraction) => (
        lookbackBars === center.lookbackBars && selectionFraction === center.selectionFraction
          ? []
          : [{
            label: `lookbackBars=${lookbackBars}|selectionFraction=${selectionFraction}`,
            params: { ...center, lookbackBars, selectionFraction },
          }]
      )),
    );
    return { axes: ['lookbackBars', 'selectionFraction'], center, neighbors };
  },

  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return null;
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
    return check(matched, matched ? [] : ['not_selected_this_month'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return check(false, ['hold_between_month_ends'], []);
    const matched = !decision.weights.has(ctx.symbol);
    return check(
      matched,
      matched ? [decision.reason === 'ranked' ? 'not_selected_this_month' : decision.reason] : ['retain_selected_weighted_name'],
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
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 21,
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly dual-momentum selection (top ${(p.selectionFraction * 100).toFixed(0)}% by 12−1M relative rank, absolute filter>0) then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name. Candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار شهري بزخم مزدوج (أعلى ${(p.selectionFraction * 100).toFixed(0)}% وفق الزخم النسبي 12-1 شهر، وفلتر الزخم المطلق>0) ثم ترجيح عكسي للتقلب (تكافؤ المخاطر) عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم. مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
