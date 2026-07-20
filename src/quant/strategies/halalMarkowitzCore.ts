// halal-markowitz-core v1 — a structurally NEW weighting mechanism never tried by any of the
// ~20 prior strategy setups in docs/STRATEGY_LAB.md. Every prior multi-name T2 setup is a
// single-signal timing bet (momentum rank, Bollinger mean-reversion, dual-momentum rotation,
// allocator blends) holding 1–6 simultaneous positions, and the dominant recurring binding
// failure across ALL of them is DRAWDOWN_RISK_FAILURE (MC p95 book-day drawdown 37–59% vs the
// 30% breaker), traced to that concentration. None used covariance-aware weighting across a
// genuinely diversified (20–40 name) sleeve. This setup tests exactly that gap: does Markowitz
// mean-variance (tangency) weighting over the C1 Sharia-verified sleeve tame the tail, where
// single-signal concentration could not?
//
// A-PRIORI v1 SPEC (frozen before any run; PRE-REGISTRATION IS BINDING — no retune after seeing
// any result, including the 1Y diagnostic; a bad FULL number is reported REJECTED as measured):
// - Universe: the C1 Sharia-VERIFIED sleeve ONLY (buildVerifiedUniverse + selectDollarVolumeSleeve,
//   maxNames=40, top by trailing real dollar volume) — halal-only, never wide/unscreened.
// - At each month-end, a sleeve name is RANKABLE iff it has a bar at asOf AND ≥ lookbackDays (252
//   trading days) of continuous prior daily closes already loaded in the run's window.
// - Breadth floor: < 15 rankable names ⇒ hold cash for the month. An N×N covariance estimate over
//   a 20–40-name sleeve is ill-conditioned/unstable below that floor — never silently force a fit.
// - Weighting: `markowitzFrontier()` (src/quant/portfolio/frontier.ts, already built + tested this
//   session — REUSED VERBATIM, no reimplementation of the Markowitz math) over the trailing
//   `lookbackDays` daily returns (`dailyReturns()`, same module) of the rankable names, seed 42,
//   10,000 long-only Dirichlet-sampled portfolios, risk-free rate 0, 252 trading days/year. The
//   TANGENCY (max-Sharpe) candidate's weights are the raw target weights (equal-weight is always
//   candidate #0 inside the sampler, so tangency Sharpe ≥ equal-weight by construction).
// - Per-name cap: 20% — any raw tangency weight above the cap is clipped to it and NOT
//   redistributed to other names; the residual is simply left as book cash. This is a strictly
//   exposure-SHRINKING clip (never re-ranks, never exceeds the cap, never invents a water-filling
//   reallocation that was not part of the a-priori spec).
// - Cadence: monthly, decided at month-end close, filled next-open through the unchanged shared
//   risk-envelope engine (name/gross/ADV/cash clamps in src/quant/risk/envelope.ts stay fully
//   binding on top of this hint — this setup cannot and does not bypass them).
// - Plateau robustness (QDR-6): 3×3 frozen grid over {lookbackDays: 231/252/273} ×
//   {perNameCap: 0.15/0.20/0.25}, center = {252, 0.20} (9 combinations total, validationTrials=9).
// AAOIFI: the sleeve is C1-verified (Tier-1 SPUS / Tier-2 AAOIFI XBRL) halal-only equities; no
// ballast, no leverage, no short — long-only cash exactly like every other setup in this lab.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns, markowitzFrontier } from '../portfolio/frontier';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;

export const HalalMarkowitzCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  perNameCap: z.number().min(0).max(1),
  minRankable: z.literal(15),
  maxSleeveNames: z.literal(40),
  seed: z.literal(42),
  portfolios: z.literal(10_000),
  riskFreeRate: z.literal(0),
  tradingDaysPerYear: z.literal(252),
  validationTrials: z.literal(9),
});
export type HalalMarkowitzCoreParams = z.infer<typeof HalalMarkowitzCoreParamsSchema>;

export const HALAL_MARKOWITZ_CORE_V1: HalalMarkowitzCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 252,
  perNameCap: 0.20,
  minRankable: 15,
  maxSleeveNames: 40,
  seed: 42,
  portfolios: 10_000,
  riskFreeRate: 0,
  tradingDaysPerYear: 252,
  validationTrials: 9,
});

export function halalMarkowitzCoreBookPolicy(): StrategyBookPolicy {
  return {
    maxGrossFraction: 1,
    maxOpenPositions: HALAL_MARKOWITZ_CORE_V1.maxSleeveNames,
    // Covers the widest plateau-neighbor lookback (273) plus a small buffer.
    decisionHistoryBars: 285,
  };
}

interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface MarkowitzState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly monthEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND the varying plateau params: the sweep re-simulates neighbor params against
  // the SAME prepared state/replayScope, so a date-only key would leak the center run's decisions
  // into every neighbor (identical fake expectancy) — same regression class as g6b-linear-factor-wide.
  readonly decisionCache: Map<string, MarkowitzDecision>;
}

interface MarkowitzDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'insufficient_breadth';
  readonly rankable: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → capped target weight
}

let UNSCOPED_STATE: MarkowitzState | null = null;
const SCOPED_STATES = new WeakMap<object, MarkowitzState>();

function paramsOrDefault(params?: HalalMarkowitzCoreParams): HalalMarkowitzCoreParams {
  const parsed = HalalMarkowitzCoreParamsSchema.parse(params ?? HALAL_MARKOWITZ_CORE_V1);
  if (parsed.lookbackDays < 2) throw new Error('lookbackDays must be at least 2');
  return parsed;
}

function monthOf(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  if (!daily || daily.size === 0) {
    throw new Error('halal-markowitz-core requires dailyBarsBySymbol for its resolved sleeve');
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const monthEnds = new Map<number, number>();
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
  const state: MarkowitzState = {
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

function markowitzDecision(
  asOf: Date,
  params: HalalMarkowitzCoreParams,
  replayScope?: object,
): MarkowitzDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) {
    return { reason: 'insufficient_breadth', rankable: 0, weights: new Map() };
  }
  const asOfMs = asOf.getTime();
  if (!state.monthEndTimes.has(asOfMs)) {
    return { reason: 'not_month_end', rankable: 0, weights: new Map() };
  }
  const cacheKey = `${asOfMs}|${params.lookbackDays}|${params.perNameCap}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  const rankable: { symbol: string; closes: number[] }[] = [];
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.lookbackDays) continue; // no bar at asOf, or not enough trailing history
    const closes: number[] = [];
    for (let k = i - params.lookbackDays; k <= i; k++) closes.push(series.close[k]);
    rankable.push({ symbol, closes });
  }

  let result: MarkowitzDecision;
  if (rankable.length < params.minRankable) {
    result = { reason: 'insufficient_breadth', rankable: rankable.length, weights: new Map() };
  } else {
    const returnsBySymbol: Record<string, number[]> = {};
    for (const row of rankable) returnsBySymbol[row.symbol] = dailyReturns(row.closes);
    const frontier = markowitzFrontier(returnsBySymbol, {
      seed: params.seed,
      portfolios: params.portfolios,
      riskFreeRate: params.riskFreeRate,
      tradingDaysPerYear: params.tradingDaysPerYear,
    });
    const weights = new Map<string, number>();
    frontier.symbols.forEach((symbol: string, idx: number) => {
      weights.set(symbol, Math.min(frontier.tangency.weights[idx], params.perNameCap));
    });
    result = { reason: 'ranked', rankable: rankable.length, weights };
  }
  state.decisionCache.set(cacheKey, result);
  return result;
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(
  symbol: string,
  decision: MarkowitzDecision,
  params: HalalMarkowitzCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_max40'),
    evidence('mechanism', 'markowitz_tangency_frontier_seeded'),
    evidence('lookback_days', params.lookbackDays),
    evidence('per_name_cap', params.perNameCap),
    evidence('rankable_names', decision.rankable),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_halal_only'),
  ];
}

export const halalMarkowitzCoreSetup: StrategySetup<HalalMarkowitzCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-markowitz-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_MARKOWITZ_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  // Bounds the engine's Decimal-bar load to only the union of names ever assigned a nonzero
  // tangency weight across center + plateau-neighbor params (mirrors g6b-linear-factor-wide's
  // memory-bound pattern; the sleeve is only ≤40 names here, so this is a correctness/consistency
  // choice more than a memory necessity).
  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const monthEnds = Array.from(state.monthEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalMarkowitzCoreParams);
      for (const t of monthEnds) {
        const decision = markowitzDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalMarkowitzCoreParams> {
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
    const decision = markowitzDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return null;
    return decision.weights.get(ctx.symbol) ?? 0;
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    const decision = markowitzDecision(ctx.asOf, p, ctx.replayScope);
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
    const decision = markowitzDecision(ctx.asOf, p, ctx.replayScope);
    const matched = decision.weights.has(ctx.symbol);
    return check(matched, matched ? [] : ['zero_tangency_weight'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = markowitzDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return check(false, ['hold_between_month_ends'], []);
    const matched = !decision.weights.has(ctx.symbol);
    return check(
      matched,
      matched ? [decision.reason === 'ranked' ? 'zero_tangency_weight' : decision.reason] : ['retain_tangency_weight'],
      decisionEvidence(ctx.symbol, decision, p),
    );
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = markowitzDecision(ctx.asOf, p, ctx.replayScope);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 21,
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly Markowitz tangency weighting (seeded, ${p.portfolios} portfolios) over the C1-verified ≤40-name halal sleeve, 20% per-name cap, trailing ${p.lookbackDays}d returns. Candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ ترجيح ماركويتز الظِّلي الشهري (بذرة عشوائية ثابتة، ${p.portfolios} محفظة) عبر السلة الحلال المفحوصة C1 (حتى ٤٠ اسمًا)، سقف ٢٠٪ لكل اسم، عوائد ${p.lookbackDays} يومًا سابقة. مرشح للبحث فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
