// halal-risk-parity-core v1 — R-RP1 pre-registered candidate. A structurally NEW mechanism class
// versus every prior T2 setup in docs/STRATEGY_LAB.md (~20 setups): all of them are single-signal
// DIRECTIONAL/TIMING bets that concentrate into 1-6 simultaneous positions and repeatedly fail
// QDR-6's MC p95 tail-drawdown gate (37-59% observed vs the 30% breaker), even when the entry/exit
// signal family itself is sound. None used correlation- or volatility-aware weighting across a
// genuinely diversified (20-40 name) sleeve. This setup tests the gap directly: it carries NO
// directional signal at all — it is a pure portfolio-CONSTRUCTION mechanism (cross-sectional inverse-
// volatility / "risk parity" weighting) laid over the existing C1 Sharia-verified universe, on the
// a-priori hypothesis that genuine breadth + volatility-aware sizing (not a better timing signal) is
// what the prior concentrated setups were missing.
//
// A-PRIORI v1 SPEC (frozen before any run; changes require a new version, never a retune):
// - Universe: C1 Sharia-verified sleeve ONLY — buildVerifiedUniverse (Tier-1 SPUS fixture / Tier-2
//   RUSHD AAOIFI-XBRL screen) piped through selectDollarVolumeSleeve (PIT-safe, top-40-by-real-
//   trailing-dollar-volume). universeCompatibility = 'halal-only'; the wide/unscreened universe is
//   never used. maxNames = 40 (docs/PORTFOLIO_BUILD.md's "diversified halal factor core: 20-40 names").
// - Cadence: monthly — one rebalance decision per calendar month-end trading date; the book holds
//   between month-ends.
// - Weighting mechanism (the hypothesis under test): weight_i ∝ 1/σ_i, where σ_i is the trailing
//   lookbackDays=252 (trading days) sample standard deviation of daily close-to-close returns for
//   name i, computed at each rebalance from ONLY bars ≤ asOf. Raw inverse-vol weights are normalized
//   to sum to 1 across rankable names, then a per-name-cap water-filling pass caps any single name at
//   perNameCap=0.20 and proportionally redistributes the excess to uncapped names (iterated to a
//   fixed point). A name with < lookbackDays+1 trailing bars, or a non-finite/zero σ_i, is excluded
//   from ranking (never assigned a weight, never silently defaulted to zero-risk).
// - Breadth floor: fewer than minRankable=15 rankable names at a given month-end ⇒ the WHOLE book
//   holds cash that month (mirrors g6b-linear-factor-wide's minRankable=100-at-2,767-name-scale
//   breadth-floor pattern, scaled down to this sleeve's 40-name ceiling — a 3-8 name book must never
//   silently reproduce the concentration failure mode this setup exists to test).
// - Per-name cap 20% is a HARD ceiling encoded in the weighting function itself, not merely a hope
//   that the shared engine's own risk envelope (25% default maxNameWeight) will catch it — this
//   setup's own cap is always the binding, tighter constraint.
// - Correlation-BLIND by design: unlike a covariance/mean-variance optimizer (the sibling
//   `halal-markowitz-core` dispatch's mechanism, built independently in a separate worktree — no
//   coordination with this setup), this uses ONLY each name's own trailing volatility, never a
//   cross-name covariance/correlation estimate. The bet is that this estimation-error-robust
//   simplicity, combined with genuine 15-40 name breadth, is the missing ingredient — not
//   sophistication. Do not add covariance estimation to this file under any version; that is a
//   distinct mechanism and belongs in a distinct setup.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot). Execution remains
// paper/simulated only per standing RUSHD policy, independent of this card's terminal verdict.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HalalRiskParityCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  minRankable: z.literal(15),
  perNameCap: z.number().positive().max(1),
  maxNames: z.literal(40),
  validationTrials: z.literal(9),
});
export type HalalRiskParityCoreParams = z.infer<typeof HalalRiskParityCoreParamsSchema>;

export const HALAL_RISK_PARITY_CORE_V1: HalalRiskParityCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 252,
  minRankable: 15,
  perNameCap: 0.20,
  maxNames: 40,
  validationTrials: 9,
});

export function halalRiskParityCoreBookPolicy(params?: HalalRiskParityCoreParams): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching g6b-linear-factor-wide's memory-bound
// convention — this sleeve is only ≤40 names so the saving is small, but the pattern (and the
// params-keyed decisionCache below) is followed unchanged for consistency and correctness.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface RiskParityState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly monthEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND params: a date-only key would leak the center run's decisions into every
  // plateau neighbor (see g6b-linear-factor-wide.ts:82-84 for the documented failure mode this
  // avoids).
  readonly decisionCache: Map<string, RiskParityDecision>;
}

interface RiskParityDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'insufficient_breadth';
  readonly rankable: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (capped, ≤ sum 1) target weight
}

let UNSCOPED_STATE: RiskParityState | null = null;
const SCOPED_STATES = new WeakMap<object, RiskParityState>();

function paramsOrDefault(params?: HalalRiskParityCoreParams): HalalRiskParityCoreParams {
  return HalalRiskParityCoreParamsSchema.parse(params ?? HALAL_RISK_PARITY_CORE_V1);
}

function monthOf(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function configureUniverse(input: UniversePrepareInput): void {
  // The shared engine's memory-bound cross-sectional path (any setup that declares BOTH
  // prepareUniverse and tradableBookSymbols, per g6b-linear-factor-wide's precedent) feeds compact
  // OHLCV rows via `dailyBarsBySymbol`, not `closesBySymbol` (which stays an empty Map on that path —
  // see runLab.ts's shared-book branch). Only `ts`/`close` are used here; volume is not part of this
  // setup's hypothesis.
  const daily = input.dailyBarsBySymbol;
  if (!daily || daily.size === 0) {
    throw new Error('halal-risk-parity-core requires dailyBarsBySymbol for its resolved C1 sleeve');
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
  const state: RiskParityState = {
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

/** Sample (n−1) standard deviation. Returns 0 for < 2 observations (excluded upstream as degenerate). */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Cap-and-redistribute ("water-filling"): any weight above `cap` is clipped to `cap`, and the
 * excess is redistributed proportionally to the still-uncapped names; repeats to a fixed point
 * (a newly-inflated name can itself need capping). Preserves the total sum unless capacity is
 * exhausted (cap × uncapped-count < remaining excess), in which case the residual excess is left
 * undistributed — the book then holds partial cash rather than ever exceeding any name's cap.
 * Pure, deterministic, no randomness.
 */
export function capAndRedistribute(weights: ReadonlyMap<string, number>, cap: number): Map<string, number> {
  if (!(cap > 0) || cap > 1) throw new Error('cap must be in (0, 1]');
  let remaining = new Map(weights);
  const capped = new Map<string, number>();
  let excess = 0;
  const maxIterations = remaining.size + 2; // at least one name is capped per pass that changes anything
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let changed = false;
    for (const [symbol, w] of Array.from(remaining.entries())) {
      if (w > cap + 1e-12) {
        excess += w - cap;
        capped.set(symbol, cap);
        remaining.delete(symbol);
        changed = true;
      }
    }
    if (!changed) break;
    if (remaining.size === 0) break; // capacity exhausted; residual excess dropped, book under-invests
    const remainingSum = Array.from(remaining.values()).reduce((a, b) => a + b, 0);
    if (!(remainingSum > 0)) break;
    for (const [symbol, w] of Array.from(remaining.entries())) remaining.set(symbol, w + (w / remainingSum) * excess);
    excess = 0;
  }
  for (const [symbol, w] of Array.from(remaining.entries())) capped.set(symbol, w);
  // Defensive floating-point safety margin: the shared engine rejects a target-weight sum that
  // exceeds 1 + 1e-12 (see portfolioEngine.ts simulateStrategyBook). A uniform down-scale can only
  // ever SHRINK weights, so it can never push a capped name back above `cap`.
  const total = Array.from(capped.values()).reduce((a, b) => a + b, 0);
  if (total > 1) {
    const scale = 1 / total;
    for (const [symbol, w] of Array.from(capped.entries())) capped.set(symbol, w * scale);
  }
  return capped;
}

/**
 * The core hypothesis as one small pure function: weight_i ∝ 1/σ_i, normalized to sum to 1 across
 * the supplied (already-rankable, σ>0) names, then capped at `perNameCap` via `capAndRedistribute`.
 * Names with non-finite or non-positive volatility are excluded (never divide by zero, never
 * silently assigned a weight from bad data).
 */
export function inverseVolatilityWeights(
  volBySymbol: ReadonlyMap<string, number>,
  perNameCap: number,
): Map<string, number> {
  const raw = new Map<string, number>();
  let total = 0;
  for (const [symbol, vol] of Array.from(volBySymbol.entries())) {
    if (!Number.isFinite(vol) || vol <= 0) continue;
    const w = 1 / vol;
    raw.set(symbol, w);
    total += w;
  }
  if (!(total > 0)) return new Map();
  const normalized = new Map<string, number>();
  for (const [symbol, w] of Array.from(raw.entries())) normalized.set(symbol, w / total);
  return capAndRedistribute(normalized, perNameCap);
}

function wideDecision(asOf: Date, params: HalalRiskParityCoreParams, replayScope?: object): RiskParityDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return { reason: 'insufficient_breadth', rankable: 0, weights: new Map() };
  const asOfMs = asOf.getTime();
  if (!state.monthEndTimes.has(asOfMs)) return { reason: 'not_month_end', rankable: 0, weights: new Map() };
  const cacheKey = `${asOfMs}|${params.lookbackDays}|${params.perNameCap}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  const volBySymbol = new Map<string, number>();
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.lookbackDays) continue; // no bar at asOf, or insufficient trailing history
    const closes: number[] = [];
    for (let k = i - params.lookbackDays; k <= i; k++) closes.push(series.close[k]);
    let returns: number[];
    try {
      returns = dailyReturns(closes);
    } catch {
      continue; // defensive: malformed close series excluded, never crashes the book
    }
    const sigma = stdev(returns);
    if (!(sigma > 0) || !Number.isFinite(sigma)) continue; // degenerate/zero-variance names excluded
    volBySymbol.set(symbol, sigma);
  }

  let result: RiskParityDecision;
  if (volBySymbol.size < params.minRankable) {
    result = { reason: 'insufficient_breadth', rankable: volBySymbol.size, weights: new Map() };
  } else {
    // Defensive-only: selectDollarVolumeSleeve already caps the resolved universe at maxNames=40
    // upstream, so this never triggers in a real CLI run. If ever fed a wider set directly (e.g. a
    // unit test), keep the book within the pre-registered breadth deterministically (alphabetical
    // truncation — never a performance-motivated selection).
    const eligible = volBySymbol.size > params.maxNames
      ? new Map(Array.from(volBySymbol.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(0, params.maxNames))
      : volBySymbol;
    const weights = inverseVolatilityWeights(eligible, params.perNameCap);
    result = { reason: 'ranked', rankable: volBySymbol.size, weights };
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

function decisionEvidence(symbol: string, decision: RiskParityDecision, params: HalalRiskParityCoreParams): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve'),
    evidence('weighting_mechanism', 'inverse_volatility_risk_parity'),
    evidence('lookback_days', params.lookbackDays),
    evidence('per_name_cap', params.perNameCap),
    evidence('rankable_names', decision.rankable),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalRiskParityCoreSetup: StrategySetup<HalalRiskParityCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-risk-parity-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_RISK_PARITY_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const monthEnds = Array.from(state.monthEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalRiskParityCoreParams);
      for (const t of monthEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalRiskParityCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [231, 252, 273].flatMap((lookbackDays) =>
      [0.15, 0.20, 0.25].flatMap((perNameCap) => (
        lookbackDays === center.lookbackDays && perNameCap === center.perNameCap
          ? []
          : [{
            label: `lookbackDays=${lookbackDays}|perNameCap=${perNameCap}`,
            params: { ...center, lookbackDays, perNameCap },
          }]
      )),
    );
    return { axes: ['lookbackDays', 'perNameCap'], center, neighbors };
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
    return check(matched, matched ? [] : ['zero_weight_this_month'], screened.evidence);
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
      matched ? [decision.reason === 'ranked' ? 'zero_weight_this_month' : decision.reason] : ['retain_weighted_name'],
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly inverse-volatility (risk-parity) weight over the C1-verified 40-name dollar-volume sleeve, capped at ${(p.perNameCap * 100).toFixed(0)}% per name. No directional signal — pure diversification/sizing mechanism, candidate research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ وزن شهري عكسي للتقلب (تكافؤ المخاطر) عبر سلة الأربعين اسمًا المفحوصة C1، بحد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم. لا إشارة اتجاهية — آلية تنويع/تحجيم بحتة، مرشح بحثي فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
