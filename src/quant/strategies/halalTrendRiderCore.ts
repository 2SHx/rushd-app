// halal-trend-rider-core v1 — FIRST let-winners-run setup this session, PRE-REGISTERED before any
// FULL run (skills: quant-strategy, risk-management, backtesting-rigor).
//
// THE USER'S CORRECT OBSERVATION: all eight prior in-session setups (halal-markowitz-core,
// halal-risk-parity-core, halal-momentum-risk-parity-core, halal-sector-capped-risk-parity-core,
// halal-sector-capped-risk-parity-wide, halal-concentrated-momentum-core, halal-managed-momentum-core,
// halal-momentum-markowitz-core — ALL REJECTED) used the engine's `targetWeight` REBALANCE-TO-TARGET
// mode. During the 2022-2026 NASDAQ tech/AI bull (NVDA ~10x'd) that mode SYSTEMATICALLY TRIMS WINNERS:
// every rebalance (monthly or weekly) recomputes each name's target weight and sells the excess when a
// winner outgrows its slot, and every setup additionally capped per-name exposure (20-25%). Both
// mechanisms cap upside by construction, regardless of sizing sophistication (inverse-vol vs Markowitz
// made only a modest difference — see the 8-mechanism comparison below). Best OOS CAGR of the eight was
// `halal-concentrated-momentum-core`'s 69.66% (MC p95 64.68%, OOS DSR 0.750); best all-round was
// `halal-markowitz-core` (56.57% / 50.78% / 0.899).
//
// THE MECHANISM (portfolioEngine.ts:1027-1064): this setup deliberately OMITS `targetWeight`. When a
// `StrategySetup` has no `targetWeight` hook, the shared engine's daily loop (line 1040-1047) calls
// `exit()` for a HELD position and, if it does NOT match, does nothing — no rebalance-to-target, no
// trim, the position is left completely untouched and grows exactly with price. A new name matching
// `entry()` is bought once at `sizeFraction × currentNAV / price` (line 1051-1057) and never resized
// again except by its own price action. This is genuine let-winners-run: a winner that goes 10x becomes
// a 10x-larger share of the book, capped only by the number of OTHER names ever entered (never trimmed
// back down). The risk envelope's `maxNameWeight` (risk/envelope.ts, unchanged) can only clamp the SIZE
// of a NEW buy — it has no force-trim path for an already-open, appreciating position — so a winner
// genuinely runs even with the envelope fully active. Confirmed by inspection of envelope.ts and the
// engine's BUY/SELL/HOLD order shapes: there is no periodic "resize existing position toward a target"
// order kind outside the `targetWeight`-driven TARGET path, which this setup never emits.
//
// A-PRIORI DESIGN (frozen before any run; DECIDED, no post-hoc tuning):
// - Universe: C1 Sharia-VERIFIED sleeve ONLY (`buildVerifiedUniverse` + `selectDollarVolumeSleeve`,
//   maxNames=60, matching the momentum-family siblings' ranking-pool size). universeCompatibility =
//   'halal-only'. Sharia stays completely non-negotiable and unchanged — only diversification/weight
//   discipline is relaxed here, per the user's explicit authorization, never the Sharia veto.
// - Entry cadence: WEEKLY, on the ISO-week boundary only (same `isoWeekKey` convention as
//   `halal-concentrated-momentum-core`, reimplemented here verbatim since it is not exported there —
//   controls entry TURNOVER; a name is considered for a NEW position only once per week). Among names
//   with ABSOLUTE 126d/skip5 momentum (`dualMomentumMetrics`, imported UNCHANGED from
//   `dualMomentumRotation`) strictly > 0 that are NOT currently held, rank by RELATIVE momentum
//   descending (ties by symbol ascending, via `selectTopNByMomentum` imported UNCHANGED from
//   `halalConcentratedMomentumCore` with floor=0 — no cash-floor concept is needed in entry/exit mode,
//   since concurrency is already hard-capped structurally, see below) and take the top `maxOpenSlots`
//   (10) as that week's entry candidate list. Each match sizes at `sizeFraction=0.10` of CURRENT NAV
//   (an `entry()` `sizeFraction` hint, engine-applied per line 1051-1057) — a fixed fraction of NAV AT
//   ENTRY TIME only; it is never resized again for that position by this setup.
// - Concurrency cap: `maxOpenPositions: params.maxOpenSlots` in the book policy. This is a STRUCTURAL
//   engine-level cap (risk/envelope.ts:106 blocks any new BUY once `positions.length >= maxOpenPositions`
//   unless the symbol is already held) — the "no new entry until a slot frees" rule from the a-priori
//   spec is enforced by the SAME unmodified risk envelope every other setup in this lab uses, not by
//   strategy-side bookkeeping. Because the weekly candidate list is already capped at `maxOpenSlots`
//   names, this never blocks a candidate the strategy did not already intend to hold. NOTE: when
//   multiple new-entry BUYs compete for fewer free slots on one day, the engine fills them in canonical
//   ASCENDING SYMBOL order (portfolioEngine.ts:615), not momentum-rank order — a pre-existing, documented
//   engine convention this setup does not override; reported here for honesty, not concealed.
// - Exit: checked EVERY trading day (not just weekly — a trailing stop needs daily granularity to bind
//   promptly). A held name exits on EITHER: (a) `evaluateStops` (imported UNCHANGED from `risk/stops.ts`)
//   fires with `trailingStopPct=0.20`/`staticStopPct=0.15` (both explicitly wider than stops.ts's
//   0.10/0.08 defaults — a fast-momentum halal book needs more room before a normal pullback whipsaws
//   it out of a genuine winner), where `peakClose` is the running max close since `ctx.entryTs`,
//   maintained INCREMENTALLY in this setup's own per-(symbol, full-param-set) state (never recomputed
//   from a truncated `ctx.bars` window — see "PEAK TRACKING" below); OR (b) 126d RELATIVE momentum
//   (same `dualMomentumMetrics` formula) turns ≤ 0 (trend breakdown). Neither condition checks whether
//   the name has fallen out of the current week's top-`maxOpenSlots` ranking — that is the entire point:
//   a held winner is NEVER re-evaluated against new entrants' ranks, only against its OWN stop/momentum.
// - `evaluateStops`'s exported `params` type is `typeof STOP_PARAMS`, which TypeScript infers as an
//   object of NUMERIC LITERAL types (0.08/0.1) because `stops.ts` declares it `as const`. Passing this
//   setup's own 0.15/0.20 values therefore requires an explicit, narrowly-scoped `as typeof STOP_PARAMS`
//   cast at the call site (verified empirically: an uncast literal fails `tsc --strict` with
//   "Type '0.15' is not assignable to type '0.08'") — `evaluateStops` itself only reads the numeric
//   fields at runtime and is otherwise imported and called completely unchanged.
// - PEAK TRACKING (why it is stateful, not recomputed from `ctx.bars` each day): `decisionHistoryBars`
//   is fixed at `lookbackDays+5` (≈131 trading days) — the momentum breakdown check only ever needs that
//   trailing window. But a let-winners-run position can stay open for YEARS, far longer than that
//   window, so `ctx.bars` alone cannot answer "what is the peak close since entry" once entry predates
//   the window. This setup instead ratchets `peakClose` INCREMENTALLY in its own per-scope state,
//   keyed by `(symbol, lookbackDays, skipRecentDays, absoluteThreshold, maxOpenSlots, sizeFraction,
//   staticStopPct, trailingStopPct)` — i.e. the FULL param set, not just the symbol — and resets to
//   `entryPrice` whenever the stored entry timestamp differs from `ctx.entryTs` (a fresh episode). The
//   full-param-set key is REQUIRED, not decorative: the frozen 9-trial plateau sweep can share entry
//   timing across trials that differ only in `trailingStopPct` (entry logic never reads that field), so
//   a peak keyed by symbol alone would let one trial's future peak leak into another trial's
//   in-progress decision — a look-ahead bug across trials, not within one. Keying by the full param set
//   makes every trial's peak lineage provably independent regardless of engine execution order.
// - Sizing: NO per-name weighting mechanism at all beyond the one-time `sizeFraction=0.10` entry sizing
//   and the engine's own `maxNameWeight` clamp on NEW buys (via the unchanged risk envelope) — this is
//   the deliberate, user-authorized relaxation. Initial book concentration is bounded only by how many
//   of the `maxOpenSlots` (10) entry slots are filled at any time, never by a rebalance-to-target cap.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — `trailingStopPct` ∈
//   {0.15, 0.20, 0.25} × `maxOpenSlots` ∈ {8, 10, 12}, center = {0.20, 10}. `staticStopPct`,
//   `lookbackDays`, `skipRecentDays`, `absoluteThreshold`, `sizeFraction`, `maxNames` stay FIXED.
//
// HONEST CAVEAT (baked in before any run, not added after): a higher backtested CAGR from riding
// winners harder through a bull market IS, definitionally, MORE concentrated regime/bubble exposure —
// the book's fate becomes increasingly tied to whichever handful of names happened to compound the
// longest, which is exactly the tail-risk mode every prior REJECTED setup in this lab already diagnosed
// (momentum concentration raises tail risk, not just return). The trailing stop is this design's ONLY
// risk control attempting to exit before a real deflation, and it is a REAL but IMPERFECT control (a
// 20% trailing stop cannot avoid a gap-down crash, and by design it never trims a winner pre-emptively).
// This is deliberately a max-CAGR, higher-tail-risk design; the REAL MC p95 drawdown is reported exactly
// as measured, however large, per the mandate's honesty requirement — never massaged to manufacture a
// pass.
//
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (`buildC1ShariaRunSnapshot`) — completely
// unchanged by this design. Execution remains paper/simulated only per standing RUSHD policy,
// independent of this card's terminal verdict.
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { evaluateStops, STOP_PARAMS } from '../risk/stops';
import { dualMomentumMetrics } from './dualMomentumRotation';
import { selectTopNByMomentum } from './halalConcentratedMomentumCore';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;

export const HalalTrendRiderCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  skipRecentDays: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  maxOpenSlots: z.number().int().positive(),
  sizeFraction: z.number().gt(0).lte(1),
  staticStopPct: z.number().gt(0).lt(1),
  trailingStopPct: z.number().gt(0).lt(1),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
});
export type HalalTrendRiderCoreParams = z.infer<typeof HalalTrendRiderCoreParamsSchema>;

/** v1 — reference calibration; DECIDED, frozen before any run (QDR-6 pre-registration). */
export const HALAL_TREND_RIDER_CORE_V1: HalalTrendRiderCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 126,
  skipRecentDays: 5,
  absoluteThreshold: 0,
  maxOpenSlots: 10,
  sizeFraction: 0.10,
  staticStopPct: 0.15,
  trailingStopPct: 0.20,
  maxNames: 60,
  validationTrials: 9,
});

function paramsOrDefault(params?: HalalTrendRiderCoreParams): HalalTrendRiderCoreParams {
  const parsed = HalalTrendRiderCoreParamsSchema.parse(params ?? HALAL_TREND_RIDER_CORE_V1);
  if (parsed.skipRecentDays >= parsed.lookbackDays) {
    throw new Error('skipRecentDays must be smaller than lookbackDays');
  }
  return parsed;
}

export function halalTrendRiderCoreBookPolicy(params?: HalalTrendRiderCoreParams): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    // STRUCTURAL concurrency cap: the unchanged risk envelope (risk/envelope.ts:106) blocks any new
    // BUY once open positions reach this count, unless the symbol is already held — this is what
    // enforces "no new entry until a slot frees", not strategy-side bookkeeping.
    maxOpenPositions: p.maxOpenSlots,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching the momentum-family siblings' convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface PeakState {
  readonly entryTsMs: number;
  readonly peak: Prisma.Decimal;
}

interface TrendRiderState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly weekEndTimes: ReadonlySet<number>;
  readonly decisionCache: Map<string, TrendRiderEntryDecision>;
  /** Incremental peak-close-since-entry ratchet, keyed by (symbol + FULL param set) — see file header
   * "PEAK TRACKING" for why the full param set is required, not just the symbol. */
  readonly peakBySymbolParams: Map<string, PeakState>;
}

interface TrendRiderEntryDecision {
  readonly reason: 'ranked' | 'not_week_end';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: ReadonlySet<string>;
}

let UNSCOPED_STATE: TrendRiderState | null = null;
const SCOPED_STATES = new WeakMap<object, TrendRiderState>();

function getState(replayScope?: object): TrendRiderState | null {
  return replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
}

/** ISO-8601 week key (year×100 + ISO week number). Reimplemented verbatim from
 * `halalConcentratedMomentumCore`'s private helper (not exported there), matching that setup's
 * week-end detection convention exactly (last real bar seen per ISO week = that week's boundary). */
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
    throw new Error('halal-trend-rider-core requires dailyBarsBySymbol for its resolved C1 sleeve');
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
  const state: TrendRiderState = {
    seriesBySymbol,
    weekEndTimes: new Set(weekEnds.values()),
    decisionCache: new Map(),
    peakBySymbolParams: new Map(),
  };
  if (input.replayScope) SCOPED_STATES.set(input.replayScope, state);
  else UNSCOPED_STATE = state;
}

/** Index of the bar whose ts === target, or -1. Binary search over epoch-ms (reimplemented verbatim
 * from the momentum-family siblings' private helper, matching their convention exactly). */
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

function entryDecision(
  asOf: Date,
  params: HalalTrendRiderCoreParams,
  replayScope?: object,
): TrendRiderEntryDecision {
  const state = getState(replayScope);
  if (!state) return { reason: 'not_week_end', rankable: 0, eligible: 0, selected: new Set() };
  const asOfMs = asOf.getTime();
  if (!state.weekEndTimes.has(asOfMs)) {
    return { reason: 'not_week_end', rankable: 0, eligible: 0, selected: new Set() };
  }
  const cacheKey = [
    asOfMs, params.lookbackDays, params.skipRecentDays, params.absoluteThreshold, params.maxOpenSlots,
  ].join('|');
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  let rankable: { symbol: string; relative: number; absolute: number }[] = [];
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.lookbackDays) continue; // no bar at asOf, or insufficient trailing history
    const closes: number[] = [];
    for (let k = i - params.lookbackDays; k <= i; k++) closes.push(series.close[k]);
    const metrics = dualMomentumMetrics(closes, params.lookbackDays, params.skipRecentDays);
    if (!metrics) continue;
    rankable.push({ symbol, ...metrics });
  }
  // Defensive-only: selectDollarVolumeSleeve already caps the resolved universe at maxNames=60
  // upstream, so this never triggers in a real CLI run. Deterministic alphabetical truncation only.
  if (rankable.length > params.maxNames) {
    rankable = rankable
      .sort((a, b) => a.symbol.localeCompare(b.symbol))
      .slice(0, params.maxNames);
  }

  const eligible = rankable.filter((row) => row.absolute > params.absoluteThreshold);
  // No cash-floor concept in entry/exit mode (unlike the target-weight momentum siblings): concurrency
  // is already hard-capped structurally by `maxOpenPositions`, so floor=0 simply takes the top
  // `maxOpenSlots` by relative rank among whatever eligible set exists this week.
  const selected = new Set(selectTopNByMomentum(eligible, params.maxOpenSlots, 0));
  const result: TrendRiderEntryDecision = {
    reason: 'ranked', rankable: rankable.length, eligible: eligible.length, selected,
  };
  state.decisionCache.set(cacheKey, result);
  return result;
}

/** Full-param-set peak-tracking cache key — see file header "PEAK TRACKING" for why this must include
 * every varying plateau param, not just the symbol (isolates the 9 frozen plateau trials from each
 * other's peak lineage even when they share identical entry timing). */
function peakCacheKey(symbol: string, params: HalalTrendRiderCoreParams): string {
  return [
    symbol, params.lookbackDays, params.skipRecentDays, params.absoluteThreshold,
    params.maxOpenSlots, params.sizeFraction, params.staticStopPct, params.trailingStopPct,
  ].join('|');
}

/** `evaluateStops`'s `params` type is `typeof STOP_PARAMS`, TS-inferred as numeric LITERAL types
 * (0.08/0.1) because `stops.ts` declares it `as const`. This setup's own stop percentages therefore
 * require this explicit, narrowly-scoped cast — verified empirically that an uncast literal fails
 * `tsc --strict`. `evaluateStops` itself is imported and called completely unchanged; only the TS
 * literal-typing of its default-params constant forces this cast at any non-default call site. */
function trendRiderStopParams(p: HalalTrendRiderCoreParams): typeof STOP_PARAMS {
  return {
    version: 'trend-rider-stop.v1',
    staticStopPct: p.staticStopPct,
    trailingStopPct: p.trailingStopPct,
  } as unknown as typeof STOP_PARAMS;
}

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined ? { matched, reasons, evidence: items } : { matched, reasons, evidence: items, sizeFraction };
}

function entryEvidence(
  decision: TrendRiderEntryDecision,
  params: HalalTrendRiderCoreParams,
): Evidence[] {
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max60'),
    evidence('mechanism', 'entry_exit_let_winners_run_weekly_top_n_momentum_entry_trailing_stop_exit'),
    evidence('lookback_days', params.lookbackDays),
    evidence('skip_recent_days', params.skipRecentDays),
    evidence('absolute_threshold', params.absoluteThreshold),
    evidence('max_open_slots', params.maxOpenSlots),
    evidence('size_fraction', params.sizeFraction),
    evidence('rankable_names', decision.rankable),
    evidence('eligible_names', decision.eligible),
    evidence('selected_names', decision.selected.size),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

/** Trailing lookback+1 closes ending at asOf, or null if insufficient history in the PIT-filtered
 * window. Returns plain numbers (dualMomentumMetrics' documented convention). */
function trailingCloses(bars: readonly IntradayBar[], lookbackDays: number): number[] | null {
  if (bars.length < lookbackDays + 1) return null;
  return bars.slice(bars.length - (lookbackDays + 1)).map((bar) => Number(bar.close.toString()));
}

export const halalTrendRiderCoreSetup: StrategySetup<HalalTrendRiderCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-trend-rider-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_TREND_RIDER_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = getState(replayScope);
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const weekEnds = Array.from(state.weekEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalTrendRiderCoreParams);
      for (const t of weekEnds) {
        const decision = entryDecision(new Date(t), p, replayScope);
        decision.selected.forEach((symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalTrendRiderCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [0.15, 0.20, 0.25].flatMap((trailingStopPct) =>
      [8, 10, 12].flatMap((maxOpenSlots) => (
        trailingStopPct === center.trailingStopPct && maxOpenSlots === center.maxOpenSlots
          ? []
          : [{
            label: `trailingStopPct=${trailingStopPct}|maxOpenSlots=${maxOpenSlots}`,
            params: { ...center, trailingStopPct, maxOpenSlots },
          }]
      )),
    );
    return { axes: ['trailingStopPct', 'maxOpenSlots'], center, neighbors };
  },

  // No `targetWeight` hook — this is the entry/exit-mode contract that makes let-winners-run possible
  // (portfolioEngine.ts:1027-1064 only rebalances when a setup DEFINES targetWeight). DELIBERATELY
  // omitted; a direct unit test guards this contract never regresses.

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (ctx.positionQty.gt(0)) return check(false, ['already_held'], []);
    const decision = entryDecision(ctx.asOf, p, ctx.replayScope);
    return check(
      decision.reason === 'ranked',
      decision.reason === 'ranked' ? [] : [decision.reason],
      entryEvidence(decision, p),
    );
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const decision = entryDecision(ctx.asOf, p, ctx.replayScope);
    const matched = decision.selected.has(ctx.symbol);
    return check(
      matched,
      matched ? [] : ['not_ranked_this_week'],
      screened.evidence,
      matched ? p.sizeFraction : undefined,
    );
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    if (!ctx.entryPrice || !ctx.entryTs) return check(false, ['entry_anchor_unavailable'], []);
    const state = getState(ctx.replayScope);
    if (!state) return check(false, ['state_unavailable'], []);
    const lastBar = ctx.bars.at(-1);
    if (!lastBar || lastBar.ts.getTime() !== ctx.asOf.getTime()) {
      return check(false, ['no_bar_at_asof'], []);
    }
    const lastClose = lastBar.close;

    // Ratchet the incremental peak-close-since-entry (see file header "PEAK TRACKING").
    const key = peakCacheKey(ctx.symbol, p);
    const stored = state.peakBySymbolParams.get(key);
    const entryTsMs = ctx.entryTs.getTime();
    const priorPeak = stored && stored.entryTsMs === entryTsMs ? stored.peak : ctx.entryPrice;
    const peak = Prisma.Decimal.max(priorPeak, lastClose);
    state.peakBySymbolParams.set(key, { entryTsMs, peak });

    const stopEval = evaluateStops({ entryPrice: ctx.entryPrice, peakClose: peak }, lastClose, trendRiderStopParams(p));

    const closes = trailingCloses(ctx.bars, p.lookbackDays);
    const metrics = closes ? dualMomentumMetrics(closes, p.lookbackDays, p.skipRecentDays) : null;
    const momentumBreak = metrics !== null && metrics.relative <= 0;

    const matched = stopEval.exit || momentumBreak;
    const reasons: string[] = [];
    if (stopEval.exit && stopEval.reason === 'TRAILING_STOP') reasons.push('trailing_stop');
    if (stopEval.exit && stopEval.reason === 'STATIC_STOP') reasons.push('static_stop');
    if (momentumBreak) reasons.push('momentum_breakdown');
    if (!matched) reasons.push('hold_let_winner_run');

    return check(matched, reasons, [
      evidence('params_version', p.version),
      evidence('entry_price', ctx.entryPrice.toFixed(6)),
      evidence('peak_close_since_entry', peak.toFixed(6)),
      evidence('last_close', lastClose.toFixed(6)),
      evidence('active_stop', stopEval.activeStop.toFixed(6)),
      evidence('trailing_stop_pct', p.trailingStopPct),
      evidence('static_stop_pct', p.staticStopPct),
      evidence('relative_momentum', metrics ? metrics.relative.toFixed(6) : 'n/a'),
    ]);
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const exitCheck = this.exit(ctx, p);
    const entryCheck = exitCheck.matched || ctx.positionQty.gt(0) ? null : this.entry(ctx, p);
    const stance: Stance = exitCheck.matched
      ? 'BEARISH'
      : (ctx.positionQty.gt(0) || (entryCheck?.matched ?? false)) ? 'BULLISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    const active = exitCheck.matched ? exitCheck : (entryCheck ?? exitCheck);
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly top-${p.maxOpenSlots} 126d/skip5 momentum entry (10% NAV sizing), NEVER rebalanced/trimmed while held — exits only on a ${(p.trailingStopPct * 100).toFixed(0)}% trailing stop, a ${(p.staticStopPct * 100).toFixed(0)}% static stop, or relative momentum turning non-positive. Deliberate max-CAGR, higher-tail-risk design over the C1-verified 60-name sleeve; candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ دخول أسبوعي لأعلى ${p.maxOpenSlots} أسهم بزخم 126 يومًا (تخصيص 10% من صافي قيمة الأصول)، دون أي إعادة توازن أو تقليص أثناء الاحتفاظ — يخرج فقط عند وقف متحرك ${(p.trailingStopPct * 100).toFixed(0)}%، أو وقف ثابت ${(p.staticStopPct * 100).toFixed(0)}%، أو تحول الزخم النسبي لغير موجب. تصميم متعمد لأقصى عائد مركب مع مخاطر ذيلية أعلى، ضمن السلة المفحوصة C1، مرشح للبحث فقط.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
