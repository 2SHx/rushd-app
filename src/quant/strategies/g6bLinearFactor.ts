// g6b-linear-factor — rung-1, long-only monthly cross-sectional factor baseline.
// Historical shares outstanding are unavailable in the daily spine, so the second input is
// explicitly a 21-session DOLLAR-VOLUME PROXY, not paper-equivalent turnover rate.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { NASDAQ_HALAL_UNIVERSE } from './bollingerMrLong';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;

export const G6B_LINEAR_FACTOR_UNIVERSE = NASDAQ_HALAL_UNIVERSE;

export const G6bLinearFactorParamsSchema = z.object({
  version: z.literal('v1'),
  momentumLookback: z.number().int().positive(),
  skipRecentBars: z.number().int().nonnegative(),
  turnoverProxyLookback: z.number().int().positive(),
  momentumWeight: z.number().min(0).max(1),
  topFraction: z.literal(0.25),
  validationTrials: z.literal(9),
});
export type G6bLinearFactorParams = z.infer<typeof G6bLinearFactorParamsSchema>;

export const G6B_LINEAR_FACTOR_V1: G6bLinearFactorParams = Object.freeze({
  version: 'v1',
  momentumLookback: 252,
  skipRecentBars: 21,
  turnoverProxyLookback: 21,
  momentumWeight: 0.5,
  topFraction: 0.25,
  validationTrials: 9,
});

export function g6bLinearFactorBookPolicy(): StrategyBookPolicy {
  return {
    maxGrossFraction: 1,
    maxOpenPositions: Math.ceil(G6B_LINEAR_FACTOR_UNIVERSE.length * G6B_LINEAR_FACTOR_V1.topFraction),
    decisionHistoryBars: 274,
  };
}

interface DailyPoint {
  readonly ts: Date;
  readonly close: number;
  readonly volume: number;
}

interface RankedFactor {
  readonly symbol: string;
  readonly momentum: number;
  readonly dollarVolumeProxy: number;
  momentumRank: number;
  turnoverRank: number;
  score: number;
}

interface FactorDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'incomplete_declared_universe';
  readonly selected: ReadonlySet<string>;
  readonly ranked: readonly RankedFactor[];
  readonly targetWeight: number;
}

interface PreparedFactorState {
  readonly dailyBySymbol: ReadonlyMap<string, readonly DailyPoint[]>;
  readonly monthEndTimes: ReadonlySet<number>;
  readonly decisionCache: Map<string, FactorDecision>;
}

let UNSCOPED_STATE: PreparedFactorState | null = null;
const SCOPED_STATES = new WeakMap<object, PreparedFactorState>();

function paramsOrDefault(params?: G6bLinearFactorParams): G6bLinearFactorParams {
  const parsed = G6bLinearFactorParamsSchema.parse(params ?? G6B_LINEAR_FACTOR_V1);
  if (parsed.skipRecentBars >= parsed.momentumLookback) {
    throw new Error('skipRecentBars must be smaller than momentumLookback');
  }
  return parsed;
}

function exactUniverse(symbols: readonly string[]): boolean {
  return symbols.length === G6B_LINEAR_FACTOR_UNIVERSE.length
    && G6B_LINEAR_FACTOR_UNIVERSE.every((symbol) => symbols.includes(symbol));
}

function monthKey(ts: Date): string {
  return `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}`;
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  if (!daily || !exactUniverse(input.symbols) || !exactUniverse(Array.from(daily.keys()))) {
    throw new Error('g6b-linear-factor requires its exact 25-name daily OHLCV universe');
  }
  const copied = new Map<string, readonly DailyPoint[]>();
  const monthEnds = new Map<string, number>();
  for (const symbol of G6B_LINEAR_FACTOR_UNIVERSE) {
    let previous = Number.NEGATIVE_INFINITY;
    const rows = daily.get(symbol)!.map((point) => {
      const time = point.ts.getTime();
      if (!Number.isFinite(time) || time <= previous || !Number.isFinite(point.close)
        || point.close <= 0 || !Number.isFinite(point.volume) || point.volume < 0) {
        throw new Error(`invalid chronological daily history for ${symbol}`);
      }
      previous = time;
      monthEnds.set(monthKey(point.ts), Math.max(monthEnds.get(monthKey(point.ts)) ?? Number.NEGATIVE_INFINITY, time));
      return Object.freeze({ ts: new Date(time), close: point.close, volume: point.volume });
    });
    copied.set(symbol, Object.freeze(rows));
  }
  const state: PreparedFactorState = {
    dailyBySymbol: copied,
    monthEndTimes: new Set(monthEnds.values()),
    decisionCache: new Map(),
  };
  if (input.replayScope) SCOPED_STATES.set(input.replayScope, state);
  else UNSCOPED_STATE = state;
}

/** Exact 12−1M endpoint return: close[t−skip]/close[t−lookback]−1. */
export function momentum12Minus1(
  closes: readonly number[],
  lookback: number,
  skipRecent: number,
): number | null {
  if (closes.length < lookback + 1 || skipRecent >= lookback) return null;
  const base = closes[closes.length - 1 - lookback];
  const end = closes[closes.length - 1 - skipRecent];
  if (![base, end].every((value) => Number.isFinite(value) && value > 0)) return null;
  return end / base - 1;
}

/** Sum(close×volume) over the trailing window; deliberately labeled a proxy. */
export function trailingDollarVolumeProxy(points: readonly DailyPoint[], lookback: number): number | null {
  if (points.length < lookback) return null;
  const value = points.slice(-lookback).reduce((sum, point) => sum + point.close * point.volume, 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function assignDescendingRanks(
  rows: RankedFactor[],
  key: 'momentum' | 'dollarVolumeProxy',
  target: 'momentumRank' | 'turnoverRank',
): void {
  const ordered = [...rows].sort((a, b) => b[key] - a[key] || a.symbol.localeCompare(b.symbol));
  const denominator = Math.max(1, ordered.length - 1);
  ordered.forEach((row, index) => { row[target] = 1 - index / denominator; });
}

function factorDecision(
  asOf: Date,
  params: G6bLinearFactorParams,
  replayScope?: object,
): FactorDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) {
    return { reason: 'incomplete_declared_universe', selected: new Set(), ranked: [], targetWeight: 0 };
  }
  if (!state.monthEndTimes.has(asOf.getTime())) {
    return { reason: 'not_month_end', selected: new Set(), ranked: [], targetWeight: 0 };
  }
  const cacheKey = `${asOf.getTime()}|${params.momentumLookback}|${params.skipRecentBars}|${params.turnoverProxyLookback}|${params.momentumWeight}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;
  const cash = (): FactorDecision => ({
    reason: 'incomplete_declared_universe', selected: new Set(), ranked: [], targetWeight: 0,
  });
  const rows: RankedFactor[] = [];
  for (const symbol of G6B_LINEAR_FACTOR_UNIVERSE) {
    const available = (state.dailyBySymbol.get(symbol) ?? []).filter((point) => point.ts <= asOf);
    if (available.at(-1)?.ts.getTime() !== asOf.getTime()) {
      const result = cash(); state.decisionCache.set(cacheKey, result); return result;
    }
    const momentum = momentum12Minus1(available.map((point) => point.close), params.momentumLookback, params.skipRecentBars);
    const dollarVolumeProxy = trailingDollarVolumeProxy(available, params.turnoverProxyLookback);
    if (momentum === null || dollarVolumeProxy === null) {
      const result = cash(); state.decisionCache.set(cacheKey, result); return result;
    }
    rows.push({ symbol, momentum, dollarVolumeProxy, momentumRank: 0, turnoverRank: 0, score: 0 });
  }

  assignDescendingRanks(rows, 'momentum', 'momentumRank');
  assignDescendingRanks(rows, 'dollarVolumeProxy', 'turnoverRank');
  for (const row of rows) {
    row.score = params.momentumWeight * row.momentumRank + (1 - params.momentumWeight) * row.turnoverRank;
  }
  rows.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const count = Math.max(1, Math.ceil(rows.length * params.topFraction));
  const selected = new Set(rows.slice(0, count).map((row) => row.symbol));
  const result: FactorDecision = { reason: 'ranked', selected, ranked: rows, targetWeight: 1 / count };
  state.decisionCache.set(cacheKey, result);
  return result;
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(symbol: string, decision: FactorDecision, params: G6bLinearFactorParams): Evidence[] {
  const row = decision.ranked.find((item) => item.symbol === symbol);
  return [
    evidence('params_version', params.version),
    evidence('declared_universe', G6B_LINEAR_FACTOR_UNIVERSE.join(',')),
    evidence('factor_definition', `${params.momentumWeight}_rank_12_1m_plus_${1 - params.momentumWeight}_rank_21d_dollar_volume_proxy`),
    evidence('turnover_field', 'dollar_volume_proxy_not_true_turnover_rate'),
    evidence('rank', row ? decision.ranked.indexOf(row) + 1 : 'na'),
    evidence('score', row ? row.score.toFixed(6) : 'na'),
    evidence('target_weight', decision.selected.has(symbol) ? decision.targetWeight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'unscreened_execution_blocked'),
  ];
}

export const g6bLinearFactorSetup: StrategySetup<G6bLinearFactorParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'g6b-linear-factor',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'fixed',
  defaultParams: G6B_LINEAR_FACTOR_V1,

  prepareUniverse(input) { configureUniverse(input); },

  plateauNeighborhood(params): PlateauNeighborhood<G6bLinearFactorParams> {
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
    if (ctx.market !== 'NASDAQ' || !G6B_LINEAR_FACTOR_UNIVERSE.includes(ctx.symbol)) return 0;
    const decision = factorDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return null;
    return decision.selected.has(ctx.symbol) ? decision.targetWeight : 0;
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (!G6B_LINEAR_FACTOR_UNIVERSE.includes(ctx.symbol)) return check(false, ['outside_declared_universe'], []);
    const decision = factorDecision(ctx.asOf, p, ctx.replayScope);
    return check(decision.reason === 'ranked', decision.reason === 'ranked' ? [] : [decision.reason], decisionEvidence(ctx.symbol, decision, p));
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const decision = factorDecision(ctx.asOf, p, ctx.replayScope);
    const matched = decision.selected.has(ctx.symbol);
    return check(matched, matched ? [] : ['outside_top_quartile'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = factorDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return check(false, ['hold_between_month_ends'], []);
    const matched = !decision.selected.has(ctx.symbol);
    return check(matched, matched ? [decision.reason === 'ranked' ? 'outside_top_quartile' : decision.reason] : ['retain_top_quartile'], decisionEvidence(ctx.symbol, decision, p));
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = factorDecision(ctx.asOf, p, ctx.replayScope);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 21,
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly top-quartile linear rank using 12−1M momentum and an explicitly proxied dollar-volume input. Candidate, research-only, AAOIFI-unscreened; execution blocked.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ ترتيب خطي شهري للربع الأعلى باستخدام زخم 12 ناقص شهر ومؤشر بديل معلن لحجم التداول بالقيمة. مرشح للبحث فقط، غير مفحوص وفق أيوفي؛ لذا يُحظر التنفيذ.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
