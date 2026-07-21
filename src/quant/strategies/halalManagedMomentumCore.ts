// halal-managed-momentum-core v1 — a PRE-REGISTERED, BINDING attack on the single documented flaw of
// `halal-concentrated-momentum-core` (main, terminal REJECTED): OOS CAGR 69.66%, MC p95 maxDD 64.68%,
// OOS DSR 0.750. That engine's own diagnosis (its file header, unchanged, cited verbatim here) is that
// the 64.68% tail comes from being FULLY INVESTED in a correlated momentum cluster precisely when a
// market-wide crash hits every held name at once. This setup's SELECTION and SIZING are BYTE-IDENTICAL
// to that engine (same weekly ISO-week cadence, same 126d/skip5 relative-momentum rank among absolute-
// positive survivors, same fixed top-10, same inverse-vol sizing at a 25% per-name cap, same 3-name
// cash floor) — the concentrated engine's file is never edited or forked; its exported pure helpers
// (`dualMomentumMetrics`, `capAndRedistribute`, `inverseVolatilityWeights`) are reused verbatim, and the
// selection/sizing math below is a line-for-line replica of that file's `wideDecision`. The ONLY change
// is three DOWN-ONLY, literature-standard momentum-crash mitigants stacked on top, none of which can
// ever inflate a return, only reduce exposure:
//
//   1. VOLATILITY TARGETING (Barroso & Santa-Clara 2015, "Momentum Has Its Moments" — vol-managed
//      momentum roughly doubles raw momentum's Sharpe by scaling exposure inversely to trailing
//      realized vol; crashes are high-vol events by construction, so this cuts exposure exactly when
//      the tail risk is highest). Engine-native (`StrategyBookPolicy.realizedVolLookback` +
//      `targetAnnualVol`, portfolioEngine.ts `trailingBasketAnnualVol`/`strategyBookExposureScalar`):
//      realizedVolLookback=60, targetAnnualVol=0.20 — HIGHER than the diversified siblings' 0.15
//      because this book is a deliberately concentrated, CAGR-focused design and should only shed
//      exposure on a genuine vol spike, not on ordinary concentrated-book variance.
//   2. DRAWDOWN GOVERNOR (a standard peer-to-peak de-risking overlay, e.g. as used by CTA/vol-target
//      funds; distinct mechanism from (1) — it reacts to the BOOK'S OWN drawdown, not to trailing
//      return variance, so it catches a slow bleed that vol-targeting alone would not). Engine-native
//      (`drawdownStartFraction`/`drawdownCashFraction`, portfolioEngine.ts `drawdownExposureScalar`):
//      full exposure through 15% book drawdown, linearly to cash at 35%.
//   3. TREND/REGIME FILTER (Daniel & Moskowitz 2016, "Momentum Crashes" — momentum crashes cluster in
//      panic states following market declines; a market-trend gate on NEW entries is the standard
//      mitigant, also used by Faber 2007's timing model). Strategy-level, reusing the EXACT proven
//      logic of `ts-momentum-halal-basket-v2` (import-only; that file is never modified): an equal-
//      weight, daily-rebalanced index of the CURRENT C1 sleeve, built once from real closes, read
//      point-in-time (≤ asOf only). At each weekly rebalance: if the index is AT OR BELOW its own
//      trailing `regimeSmaPeriod`-day SMA, select NOTHING for that week (hold cash, i.e. exactly the
//      concentrated engine's own `below_cash_floor` cash branch — this is the single most important
//      mitigant here, since it sidesteps market-wide crashes where all correlated held names fall
//      together, the exact mechanism the concentrated engine's own diagnosis blames for its tail).
//      Existing open positions are unaffected by the gate at the decision layer — like the concentrated
//      engine (and v2), a name simply drops out of `decision.weights` the week it is not selected, and
//      the shared engine trims/exits it through its own next-open fill path; there is no separate
//      "existing position survives a bear week" carve-out because the concentrated engine's design
//      re-decides the WHOLE book every week end, never carries an entry-only gate.
//
// One implementation note that is a deliberate, documented engineering choice, not a deviation from
// the design: the regime index is built from `UniversePrepareInput.dailyBarsBySymbol` (already
// required and always fully populated), NOT from `closesBySymbol` (which the shared daily engine's
// memory-bound two-pass `tradableBookSymbols` flow — see runLab.ts `prepareUniverse` pass 1 — legally
// passes as an EMPTY map on the first, symbol-discovery pass). Building the regime index off
// `closesBySymbol` would make `tradableBookSymbols` see an always-"insufficient" regime and union in
// zero names, silently starving the real run. `dailyBarsBySymbol` carries the identical real close
// series (ts, close, +volume dropped), so the regime index is byte-identical either way; only the
// input field differs, to keep the memory-bound sleeve-discovery pass correct.
//
// A-PRIORI HYPOTHESIS (frozen before any run; per the concentrated engine's own diagnosis, restated
// above): stacking these three DOWN-ONLY governors should cut the 64.68% MC p95 drawdown materially —
// the regime filter in particular should remove most of the correlated-cluster crash exposure — at the
// cost of giving back SOME OOS CAGR versus the 69.66% baseline (down-only governors can only ever trim
// return, never add it). The empirical question this run answers is the RATE of that trade: if most of
// the CAGR survives while the drawdown falls well below 64.68% (ideally toward the diversification
// family's 42.26% floor), this is a materially more usable book for an actively-traded halal book at
// high risk appetite, even if it still misses the strict QDR-6 gate (Sharpe/DSR/drawdown envelope,
// unchanged). No parameter here is retuned after any result, including the 1Y diagnostic — every
// number above and in the frozen params below was fixed before the first run of this file.
//
// A-PRIORI v1 SPEC (frozen before any run):
// - Universe / cadence / selection / sizing: IDENTICAL to halal-concentrated-momentum-core v1 (see
//   that file's header for the full a-priori spec of those mechanisms — restated in code, not prose,
//   below). C1 Sharia-VERIFIED sleeve only, maxNames=60, universeCompatibility='halal-only'.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — targetAnnualVol ∈
//   {0.15, 0.20, 0.25} × regimeSmaPeriod ∈ {150, 200, 250}, center = {0.20, 200}. topN=10 and
//   lookbackDays=126 stay FIXED (already characterized by the concentrated baseline's own plateau).
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot) — completely
// unchanged, non-negotiable. Execution remains paper/simulated only per standing RUSHD policy,
// independent of this card's terminal verdict.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import { capAndRedistribute, inverseVolatilityWeights } from './halalRiskParityCore';
import { dualMomentumMetrics } from './dualMomentumRotation';
import { buildEqualWeightIndex, type RegimeIndexPoint } from './tsMomentumHalalBasketV2';
import { sma } from './bollingerMrLongV2';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HalalManagedMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  topN: z.number().int().positive(),
  cashFloor: z.literal(3),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(60),
  regimeSmaPeriod: z.number().int().positive(),
  realizedVolLookback: z.literal(60),
  targetAnnualVol: z.number().positive(),
  drawdownStartFraction: z.literal(0.15),
  drawdownCashFraction: z.literal(0.35),
  validationTrials: z.literal(9),
});
export type HalalManagedMomentumCoreParams = z.infer<typeof HalalManagedMomentumCoreParamsSchema>;

export const HALAL_MANAGED_MOMENTUM_CORE_V1: HalalManagedMomentumCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 126,
  skipRecentDays: 5,
  absoluteThreshold: 0,
  topN: 10,
  cashFloor: 3,
  perNameCap: 0.25,
  maxNames: 60,
  regimeSmaPeriod: 200,
  realizedVolLookback: 60,
  targetAnnualVol: 0.20,
  drawdownStartFraction: 0.15,
  drawdownCashFraction: 0.35,
  validationTrials: 9,
});

export function halalManagedMomentumCoreBookPolicy(
  params?: HalalManagedMomentumCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    realizedVolLookback: p.realizedVolLookback,
    targetAnnualVol: p.targetAnnualVol,
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    drawdownStartFraction: p.drawdownStartFraction,
    drawdownCashFraction: p.drawdownCashFraction,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching halal-concentrated-momentum-core's convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface ManagedMomentumState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  // Point-in-time equal-weight index of the CURRENT sleeve, built once from real closes (Daniel &
  // Moskowitz 2016 regime gate). Sorted ascending by ts — replicates ts-momentum-halal-basket-v2's
  // `buildEqualWeightIndex`/`regimeVerdict` logic exactly, scoped per-replay like the rest of this
  // state (v2's own module-singleton REGIME_INDEX is not reused directly, since a singleton would be
  // unsafe across this engine's concurrent scoped plateau replays).
  readonly regimeIndex: readonly RegimeIndexPoint[];
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class the monthly siblings document).
  readonly decisionCache: Map<string, ManagedMomentumDecision>;
}

type ManagedMomentumReason =
  | 'ranked'
  | 'not_week_end'
  | 'below_cash_floor'
  | 'regime_bearish'
  | 'regime_insufficient';

interface ManagedMomentumDecision {
  readonly reason: ManagedMomentumReason;
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly regimeLevel: number | null;
  readonly regimeSma: number | null;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: ManagedMomentumState | null = null;
const SCOPED_STATES = new WeakMap<object, ManagedMomentumState>();

function paramsOrDefault(params?: HalalManagedMomentumCoreParams): HalalManagedMomentumCoreParams {
  const parsed = HalalManagedMomentumCoreParamsSchema.parse(params ?? HALAL_MANAGED_MOMENTUM_CORE_V1);
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  return parsed;
}

/** ISO-8601 week key (year×100 + ISO week number). Identical to halal-concentrated-momentum-core's
 * helper — trading-day granularity is sufficient; the last bar seen per key is that week's rebalance
 * date. */
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
    throw new Error('halal-managed-momentum-core requires dailyBarsBySymbol for its resolved C1 sleeve');
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const weekEnds = new Map<number, number>(); // ISO week key → max ts
  const closesForIndex = new Map<string, { ts: Date; close: number }[]>();
  for (const [symbol, rows] of Array.from(daily.entries())) {
    const ts = new Float64Array(rows.length);
    const close = new Float64Array(rows.length);
    const closeRows: { ts: Date; close: number }[] = [];
    let previous = Number.NEGATIVE_INFINITY;
    rows.forEach((row: { ts: Date; close: number }, i: number) => {
      const time = row.ts.getTime();
      if (!Number.isFinite(time) || time <= previous || !Number.isFinite(row.close) || row.close <= 0) {
        throw new Error(`invalid chronological daily history for ${symbol}`);
      }
      previous = time;
      ts[i] = time;
      close[i] = row.close;
      closeRows.push({ ts: row.ts, close: row.close });
      const w = isoWeekKey(time);
      weekEnds.set(w, Math.max(weekEnds.get(w) ?? Number.NEGATIVE_INFINITY, time));
    });
    seriesBySymbol.set(symbol, { ts, close });
    closesForIndex.set(symbol, closeRows);
  }
  const state: ManagedMomentumState = {
    seriesBySymbol,
    weekEndTimes: new Set(weekEnds.values()),
    regimeIndex: buildEqualWeightIndex(closesForIndex),
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

/** Sample (n−1) standard deviation — identical definition to halal-concentrated-momentum-core's
 * private helper (not exported there, so reimplemented here verbatim). Returns 0 for < 2 observations
 * (excluded upstream as degenerate). */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Selection step: from names passing the absolute-momentum filter, select the FIXED top `topN` by
 * relative-momentum rank (ties by symbol ascending) — a fixed COUNT, never a fraction of the pool.
 * Below `floor` eligible names, selects none (whole book holds cash that week). Byte-for-byte identical
 * to halal-concentrated-momentum-core's exported `selectTopNByMomentum`. Reimplemented (not imported)
 * because the concentrated engine's file is never modified/exported-for-reuse beyond its own module
 * boundary conventions and this setup must remain independently testable in isolation.
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

/**
 * Point-in-time regime verdict: is the sleeve's equal-weight index ABOVE its own trailing
 * `period`-day SMA, reading only index points ≤ asOf? Replicates ts-momentum-halal-basket-v2's
 * `regimeVerdict` logic exactly (same `sma` helper, same > comparison), against this file's own
 * scoped `regimeIndex` rather than v2's module-singleton. Exported for direct unit testing.
 */
export function managedMomentumRegimeVerdict(
  regimeIndex: readonly RegimeIndexPoint[],
  asOfMs: number,
  period: number,
): { state: 'bull' | 'bear' | 'insufficient'; level: number | null; sma: number | null } {
  const levels: number[] = [];
  for (const point of regimeIndex) {
    if (point.ts <= asOfMs) levels.push(point.level);
    else break; // regimeIndex is sorted ascending by ts
  }
  const smaVal = sma(levels, period);
  if (smaVal === null) return { state: 'insufficient', level: null, sma: null };
  const level = levels[levels.length - 1];
  return level > smaVal
    ? { state: 'bull', level, sma: smaVal }
    : { state: 'bear', level, sma: smaVal };
}

function emptyDecision(reason: ManagedMomentumReason, regimeLevel: number | null = null, regimeSma: number | null = null): ManagedMomentumDecision {
  return { reason, rankable: 0, eligible: 0, selected: 0, regimeLevel, regimeSma, weights: new Map() };
}

function wideDecision(
  asOf: Date,
  params: HalalManagedMomentumCoreParams,
  replayScope?: object,
): ManagedMomentumDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return emptyDecision('below_cash_floor');
  const asOfMs = asOf.getTime();
  if (!state.weekEndTimes.has(asOfMs)) return emptyDecision('not_week_end');
  const cacheKey = [
    asOfMs, params.lookbackDays, params.skipRecentDays, params.absoluteThreshold,
    params.topN, params.cashFloor, params.perNameCap, params.regimeSmaPeriod,
  ].join('|');
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  // Step 0 (regime gate, Daniel & Moskowitz 2016): the sleeve's equal-weight index must be strictly
  // above its own trailing `regimeSmaPeriod`-day SMA for the week to select anything at all. Below or
  // insufficient ⇒ the whole book holds cash — momentum ranking/sizing is never even attempted, exactly
  // like the concentrated engine's own below-floor cash branch.
  const regime = managedMomentumRegimeVerdict(state.regimeIndex, asOfMs, params.regimeSmaPeriod);
  let result: ManagedMomentumDecision;
  if (regime.state === 'insufficient') {
    result = emptyDecision('regime_insufficient', regime.level, regime.sma);
  } else if (regime.state === 'bear') {
    result = emptyDecision('regime_bearish', regime.level, regime.sma);
  } else {
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

    if (selectedSymbols.size === 0) {
      result = {
        reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
        selected: 0, regimeLevel: regime.level, regimeSma: regime.sma, weights: new Map(),
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
        selected: selectedSymbols.size, regimeLevel: regime.level, regimeSma: regime.sma, weights,
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
  decision: ManagedMomentumDecision,
  params: HalalManagedMomentumCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'weekly_fixed_top_n_momentum_plus_inverse_vol_sizing_plus_vol_target_plus_drawdown_governor_plus_regime_filter'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('top_n', params.topN),
    evidence('cash_floor', params.cashFloor),
    evidence('per_name_cap', params.perNameCap),
    evidence('regime_sma_period', params.regimeSmaPeriod),
    evidence('regime_index_level', decision.regimeLevel === null ? 'na' : decision.regimeLevel.toFixed(4)),
    evidence('regime_index_sma', decision.regimeSma === null ? 'na' : decision.regimeSma.toFixed(4)),
    evidence('realized_vol_lookback', params.realizedVolLookback),
    evidence('target_annual_vol', params.targetAnnualVol),
    evidence('drawdown_start_fraction', params.drawdownStartFraction),
    evidence('drawdown_cash_fraction', params.drawdownCashFraction),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalManagedMomentumCoreSetup: StrategySetup<HalalManagedMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-managed-momentum-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_MANAGED_MOMENTUM_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalManagedMomentumCoreParams);
      for (const t of weekEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalManagedMomentumCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [0.15, 0.20, 0.25].flatMap((targetAnnualVol) =>
      [150, 200, 250].flatMap((regimeSmaPeriod) => (
        targetAnnualVol === center.targetAnnualVol && regimeSmaPeriod === center.regimeSmaPeriod
          ? []
          : [{
            label: `targetAnnualVol=${targetAnnualVol}|regimeSmaPeriod=${regimeSmaPeriod}`,
            params: { ...center, targetAnnualVol, regimeSmaPeriod },
          }]
      )),
    );
    return { axes: ['targetAnnualVol', 'regimeSmaPeriod'], center, neighbors };
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly fixed top-${p.topN} momentum selection (6mo−1wk relative rank, absolute filter>0) then inverse-volatility risk-parity weighting over the C1-verified 60-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name — gated by a ${p.regimeSmaPeriod}d sleeve-index trend filter, a ${(p.targetAnnualVol * 100).toFixed(0)}% volatility target, and a book drawdown governor (all down-only). Managed-momentum tail-risk mitigation of halal-concentrated-momentum-core; candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ اختيار أسبوعي لأعلى ${p.topN} أسهم بالزخم (زخم نسبي 6 أشهر-أسبوع، وفلتر الزخم المطلق>0) ثم ترجيح عكسي للتقلب (تكافؤ المخاطر) عبر سلة الستين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم — مع بوابة اتجاه على مؤشر السلة (${p.regimeSmaPeriod} يوم)، وهدف تقلب ${(p.targetAnnualVol * 100).toFixed(0)}%، وحاكم تراجع للمحفظة (جميعها تخفض التعرض فقط). تخفيف مخاطر الذيل لاستراتيجية الزخم المركّز؛ مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
