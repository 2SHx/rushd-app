// g6b-linear-factor-wide — R3-4: the rung-1 linear cross-sectional factor taken to BREADTH.
//
// A-PRIORI v2 SPEC (frozen before any run; changes require a new version, never a retune):
// Hypothesis: v1's weakness was breadth, not the factor — 25 names cannot express a
// cross-sectional rank (diagnostic DSR 0.303, plateau FAIL). Quantformer/Zarattini-scale
// anchors (17–25%/yr, Sharpe 0.9–1.0) all operate on thousands of names.
// - Inputs IDENTICAL to v1: 12−1M endpoint momentum (252/21) + trailing-21-session
//   DOLLAR-VOLUME PROXY (true turnover rate unavailable — honestly labeled), 50/50
//   percentile-rank blend, monthly decisions at month-end, long-only equal weights.
// - Universe: whatever the run resolves (any-equities). At each month-end a symbol is
//   RANKABLE iff it has a bar at asOf, ≥ momentumLookback+1 bars of history, close ≥ $5,
//   and trailing-21 dollar-volume proxy ≥ $21M (≈$1M/day executability floor).
// - Breadth floor: < 100 rankable names ⇒ the book holds cash (a 25-name book must
//   never silently reproduce v1).
// - Selection: top decile of rankable names, capped at 50 (N = min(50, ceil(0.10×rankable))),
//   equal 1/N target weights.
// - Unranked/incomplete symbols get weight 0; between month-ends the book holds.
// AAOIFI: wide-universe names are UNSCREENED ⇒ execution stays blocked (research evidence).
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;

export const G6bLinearFactorWideParamsSchema = z.object({
  version: z.literal('v2'),
  momentumLookback: z.number().int().positive(),
  skipRecentBars: z.number().int().nonnegative(),
  turnoverProxyLookback: z.number().int().positive(),
  momentumWeight: z.number().min(0).max(1),
  topDecileFraction: z.literal(0.1),
  maxPositions: z.literal(50),
  minRankable: z.literal(100),
  minClose: z.literal(5),
  minDollarVolumeProxy: z.literal(21_000_000),
  validationTrials: z.literal(9),
});
export type G6bLinearFactorWideParams = z.infer<typeof G6bLinearFactorWideParamsSchema>;

export const G6B_LINEAR_FACTOR_WIDE_V2: G6bLinearFactorWideParams = Object.freeze({
  version: 'v2',
  momentumLookback: 252,
  skipRecentBars: 21,
  turnoverProxyLookback: 21,
  momentumWeight: 0.5,
  topDecileFraction: 0.1,
  maxPositions: 50,
  minRankable: 100,
  minClose: 5,
  minDollarVolumeProxy: 21_000_000,
  validationTrials: 9,
});

export function g6bLinearFactorWideBookPolicy(): StrategyBookPolicy {
  return {
    maxGrossFraction: 1,
    maxOpenPositions: G6B_LINEAR_FACTOR_WIDE_V2.maxPositions,
    decisionHistoryBars: 274,
  };
}

// Compact per-symbol storage: a 2,762-name × 8-year book must not hold millions of
// per-bar objects (documented OOM history). Timestamps are epoch-ms for binary search.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
  readonly volume: Float64Array;
}

interface WideFactorState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly monthEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND params: the plateau sweep re-simulates neighbor params
  // against the SAME prepared state/replayScope, so a date-only key would leak
  // the center run's decisions into every neighbor (identical fake expectancy).
  readonly decisionCache: Map<string, WideDecision>;
}

interface WideDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'insufficient_breadth';
  readonly rankable: number;
  readonly selected: ReadonlyMap<string, number>; // symbol → rank (1-based)
  readonly targetWeight: number;
}

let UNSCOPED_STATE: WideFactorState | null = null;
const SCOPED_STATES = new WeakMap<object, WideFactorState>();

function paramsOrDefault(params?: G6bLinearFactorWideParams): G6bLinearFactorWideParams {
  const parsed = G6bLinearFactorWideParamsSchema.parse(params ?? G6B_LINEAR_FACTOR_WIDE_V2);
  if (parsed.skipRecentBars >= parsed.momentumLookback) {
    throw new Error('skipRecentBars must be smaller than momentumLookback');
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
    throw new Error('g6b-linear-factor-wide requires dailyBarsBySymbol for its resolved universe');
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const monthEnds = new Map<number, number>(); // month index → max ts
  for (const [symbol, rows] of Array.from(daily.entries())) {
    const ts = new Float64Array(rows.length);
    const close = new Float64Array(rows.length);
    const volume = new Float64Array(rows.length);
    let previous = Number.NEGATIVE_INFINITY;
    rows.forEach((row: { ts: Date; close: number; volume: number }, i: number) => {
      const time = row.ts.getTime();
      if (!Number.isFinite(time) || time <= previous || !Number.isFinite(row.close)
        || row.close <= 0 || !Number.isFinite(row.volume) || row.volume < 0) {
        throw new Error(`invalid chronological daily history for ${symbol}`);
      }
      previous = time;
      ts[i] = time;
      close[i] = row.close;
      volume[i] = row.volume;
      const m = monthOf(time);
      monthEnds.set(m, Math.max(monthEnds.get(m) ?? Number.NEGATIVE_INFINITY, time));
    });
    seriesBySymbol.set(symbol, { ts, close, volume });
  }
  const state: WideFactorState = {
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

interface WideRow {
  symbol: string;
  momentum: number;
  dollarVolumeProxy: number;
  momentumRank: number;
  turnoverRank: number;
  score: number;
}

function rankDescending(rows: WideRow[], key: 'momentum' | 'dollarVolumeProxy', target: 'momentumRank' | 'turnoverRank'): void {
  const ordered = [...rows].sort((a, b) => b[key] - a[key] || a.symbol.localeCompare(b.symbol));
  const denominator = Math.max(1, ordered.length - 1);
  ordered.forEach((row, index) => { row[target] = 1 - index / denominator; });
}

function wideDecision(asOf: Date, params: G6bLinearFactorWideParams, replayScope?: object): WideDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) {
    return { reason: 'insufficient_breadth', rankable: 0, selected: new Map(), targetWeight: 0 };
  }
  const asOfMs = asOf.getTime();
  if (!state.monthEndTimes.has(asOfMs)) {
    return { reason: 'not_month_end', rankable: 0, selected: new Map(), targetWeight: 0 };
  }
  const cacheKey = `${asOfMs}|${params.momentumLookback}|${params.skipRecentBars}|${params.turnoverProxyLookback}|${params.momentumWeight}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  const rows: WideRow[] = [];
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.momentumLookback) continue; // no bar at asOf, or not enough history
    const lastClose = series.close[i];
    if (lastClose < params.minClose) continue;
    const base = series.close[i - params.momentumLookback];
    const end = series.close[i - params.skipRecentBars];
    if (!(base > 0) || !(end > 0)) continue;
    let dollarVolumeProxy = 0;
    for (let k = i - params.turnoverProxyLookback + 1; k <= i; k++) {
      dollarVolumeProxy += series.close[k] * series.volume[k];
    }
    if (!(dollarVolumeProxy >= params.minDollarVolumeProxy)) continue;
    rows.push({
      symbol, momentum: end / base - 1, dollarVolumeProxy,
      momentumRank: 0, turnoverRank: 0, score: 0,
    });
  }

  let result: WideDecision;
  if (rows.length < params.minRankable) {
    result = { reason: 'insufficient_breadth', rankable: rows.length, selected: new Map(), targetWeight: 0 };
  } else {
    rankDescending(rows, 'momentum', 'momentumRank');
    rankDescending(rows, 'dollarVolumeProxy', 'turnoverRank');
    for (const row of rows) {
      row.score = params.momentumWeight * row.momentumRank + (1 - params.momentumWeight) * row.turnoverRank;
    }
    rows.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
    const count = Math.min(params.maxPositions, Math.ceil(rows.length * params.topDecileFraction));
    const selected = new Map(rows.slice(0, count).map((row, index) => [row.symbol, index + 1]));
    result = { reason: 'ranked', rankable: rows.length, selected, targetWeight: 1 / count };
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

function decisionEvidence(symbol: string, decision: WideDecision, params: G6bLinearFactorWideParams): Evidence[] {
  const rank = decision.selected.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'resolved_at_run_time_any_equities'),
    evidence('factor_definition', `${params.momentumWeight}_rank_12_1m_plus_${1 - params.momentumWeight}_rank_21d_dollar_volume_proxy`),
    evidence('turnover_field', 'dollar_volume_proxy_not_true_turnover_rate'),
    evidence('rankable_names', decision.rankable),
    evidence('rank', rank ?? 'na'),
    evidence('target_weight', rank ? decision.targetWeight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'unscreened_execution_blocked'),
  ];
}

export const g6bLinearFactorWideSetup: StrategySetup<G6bLinearFactorWideParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'g6b-linear-factor-wide',
  version: 'v2',
  cadence: 'daily',
  universeCompatibility: 'any-equities',
  defaultParams: G6B_LINEAR_FACTOR_WIDE_V2,

  prepareUniverse(input) { configureUniverse(input); },

  plateauNeighborhood(params): PlateauNeighborhood<G6bLinearFactorWideParams> {
    const center = paramsOrDefault(params);
    const neighbors = [231, 252, 273].flatMap((momentumLookback) =>
      [0.4, 0.5, 0.6].flatMap((momentumWeight) => (
        momentumLookback === center.momentumLookback && momentumWeight === center.momentumWeight
          ? []
          : [{
            label: `momentumLookback=${momentumLookback}|momentumWeight=${momentumWeight}`,
            params: { ...center, momentumLookback, momentumWeight },
          }]
      )),
    );
    return { axes: ['momentumLookback', 'momentumWeight'], center, neighbors };
  },

  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return null;
    return decision.selected.has(ctx.symbol) ? decision.targetWeight : 0;
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
    const matched = decision.selected.has(ctx.symbol);
    return check(matched, matched ? [] : ['outside_top_bucket'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return check(false, ['hold_between_month_ends'], []);
    const matched = !decision.selected.has(ctx.symbol);
    return check(
      matched,
      matched ? [decision.reason === 'ranked' ? 'outside_top_bucket' : decision.reason] : ['retain_top_bucket'],
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly top-decile (≤50 names) linear rank across the resolved wide universe using 12−1M momentum and an explicitly proxied dollar-volume input. Candidate, research-only, AAOIFI-unscreened; execution blocked.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ ترتيب خطي شهري لأعلى عُشر (حتى ٥٠ اسمًا) عبر النطاق الواسع باستخدام زخم 12 ناقص شهر ومؤشر بديل معلن لحجم التداول بالقيمة. مرشح للبحث فقط، غير مفحوص وفق أيوفي؛ لذا يُحظر التنفيذ.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
