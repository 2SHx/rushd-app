// halal-residual-fast-momentum-core v1 — frozen residual-momentum extension of the existing
// weekly halal fast-momentum book. SPUS is an explicit reference series only: never tradable.
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { inverseVolatilityWeights } from './halalRiskParityCore';
import { selectTopNByMomentum } from './halalFastMomentumCore';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const RESIDUAL_MOMENTUM_BENCHMARK = 'SPUS' as const;

export const HalalResidualFastMomentumCoreParamsSchema = z.object({
  version: z.literal('v1'),
  momentumDays: z.number().int().positive(),
  skipRecentDays: z.literal(2),
  betaLookbackDays: z.number().int().min(2),
  topN: z.literal(5),
  cashFloor: z.literal(2),
  perNameCap: z.literal(0.25),
  maxNames: z.literal(60),
  validationTrials: z.literal(9),
});
export type HalalResidualFastMomentumCoreParams = z.infer<typeof HalalResidualFastMomentumCoreParamsSchema>;

export const HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1: HalalResidualFastMomentumCoreParams = Object.freeze({
  version: 'v1',
  momentumDays: 63,
  skipRecentDays: 2,
  betaLookbackDays: 126,
  topN: 5,
  cashFloor: 2,
  perNameCap: 0.25,
  maxNames: 60,
  validationTrials: 9,
});

export function halalResidualFastMomentumCoreBookPolicy(
  params?: HalalResidualFastMomentumCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return { maxGrossFraction: 1, maxOpenPositions: p.maxNames, decisionHistoryBars: p.betaLookbackDays + 5 };
}

export interface ResidualMomentumMetrics {
  readonly beta: number;
  readonly rawMomentum: number;
  readonly residualScore: number;
}

/** OLS slope with intercept, clipped to the frozen long-only equity-beta range [0,2]. */
export function clippedOlsBeta(stockReturns: readonly number[], benchmarkReturns: readonly number[]): number | null {
  if (stockReturns.length !== benchmarkReturns.length || stockReturns.length < 2) return null;
  if (![...stockReturns, ...benchmarkReturns].every(Number.isFinite)) return null;
  const stockMean = stockReturns.reduce((sum, value) => sum + value, 0) / stockReturns.length;
  const benchmarkMean = benchmarkReturns.reduce((sum, value) => sum + value, 0) / benchmarkReturns.length;
  let covarianceNumerator = 0;
  let benchmarkVarianceNumerator = 0;
  for (let i = 0; i < stockReturns.length; i++) {
    const benchmarkDelta = benchmarkReturns[i] - benchmarkMean;
    covarianceNumerator += benchmarkDelta * (stockReturns[i] - stockMean);
    benchmarkVarianceNumerator += benchmarkDelta ** 2;
  }
  if (!(benchmarkVarianceNumerator > 0)) return null;
  return Math.min(2, Math.max(0, covarianceNumerator / benchmarkVarianceNumerator));
}

function logReturns(closes: readonly number[]): number[] | null {
  if (closes.length < 2 || !closes.every((close) => Number.isFinite(close) && close > 0)) return null;
  return closes.slice(1).map((close, index) => Math.log(close / closes[index]));
}

/**
 * Frozen score on timestamp-aligned closes through decision close t:
 * beta = OLS(stock, SPUS) over the trailing beta lookback daily log returns; residual score is the
 * sum from close[t-momentum] through close[t-skip], matching `dualMomentumMetrics`' established
 * skipped-horizon endpoints; raw momentum is close[t]/close[t-momentum]-1.
 */
export function residualMomentumMetrics(
  stockCloses: readonly number[],
  benchmarkCloses: readonly number[],
  momentumDays: number,
  skipRecentDays: number,
  betaLookbackDays: number,
): ResidualMomentumMetrics | null {
  if (stockCloses.length !== benchmarkCloses.length || !Number.isInteger(momentumDays)
    || !Number.isInteger(skipRecentDays) || !Number.isInteger(betaLookbackDays)
    || momentumDays <= 0 || skipRecentDays < 0 || skipRecentDays >= momentumDays
    || betaLookbackDays < 2) return null;
  const requiredReturns = Math.max(betaLookbackDays, momentumDays);
  if (stockCloses.length < requiredReturns + 1) return null;
  const stockLog = logReturns(stockCloses.slice(-(betaLookbackDays + 1)));
  const benchmarkLog = logReturns(benchmarkCloses.slice(-(betaLookbackDays + 1)));
  if (!stockLog || !benchmarkLog) return null;
  const beta = clippedOlsBeta(stockLog, benchmarkLog);
  if (beta === null) return null;

  const allStockLog = logReturns(stockCloses);
  const allBenchmarkLog = logReturns(benchmarkCloses);
  if (!allStockLog || !allBenchmarkLog) return null;
  const residualEnd = allStockLog.length - skipRecentDays;
  const residualStart = allStockLog.length - momentumDays;
  if (residualStart < 0) return null;
  let residualScore = 0;
  for (let i = residualStart; i < residualEnd; i++) {
    residualScore += allStockLog[i] - beta * allBenchmarkLog[i];
  }
  const rawBase = stockCloses[stockCloses.length - 1 - momentumDays];
  const rawMomentum = stockCloses.at(-1)! / rawBase - 1;
  return { beta, rawMomentum, residualScore };
}

interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
  readonly volume: Float64Array;
}
interface ResidualState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly benchmark: CompactSeries;
  readonly weekEndTimes: ReadonlySet<number>;
  readonly decisionCache: Map<string, ResidualDecision>;
}
interface ResidualDecision {
  readonly reason: 'ranked' | 'not_week_end' | 'below_cash_floor';
  readonly rankable: number;
  readonly eligible: number;
  readonly selected: number;
  readonly weights: ReadonlyMap<string, number>;
  readonly scores: ReadonlyMap<string, ResidualMomentumMetrics>;
}

let UNSCOPED_STATE: ResidualState | null = null;
const SCOPED_STATES = new WeakMap<object, ResidualState>();

function paramsOrDefault(params?: HalalResidualFastMomentumCoreParams): HalalResidualFastMomentumCoreParams {
  return HalalResidualFastMomentumCoreParamsSchema.parse(params ?? HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1);
}

function isoWeekKey(tsMs: number): number {
  const source = new Date(tsMs);
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const isoDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return date.getUTCFullYear() * 100
    + Math.ceil((((date.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
}

function compact(symbol: string, rows: readonly { ts: Date; close: number; volume: number }[]): CompactSeries {
  if (!rows.length) throw new Error(`missing daily history for ${symbol}`);
  const ts = new Float64Array(rows.length);
  const close = new Float64Array(rows.length);
  const volume = new Float64Array(rows.length);
  let previous = Number.NEGATIVE_INFINITY;
  rows.forEach((row, index) => {
    const time = row.ts.getTime();
    if (!Number.isFinite(time) || time <= previous || !Number.isFinite(row.close) || row.close <= 0
      || !Number.isFinite(row.volume) || row.volume < 0) {
      throw new Error(`invalid chronological daily history for ${symbol}`);
    }
    previous = time;
    ts[index] = time;
    close[index] = row.close;
    volume[index] = row.volume;
  });
  return { ts, close, volume };
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  const benchmarks = input.benchmarkDailyBarsBySymbol;
  if (!daily?.size) throw new Error(`${halalResidualFastMomentumCoreSetup.id} requires its resolved C1 sleeve`);
  if (input.symbols.includes(RESIDUAL_MOMENTUM_BENCHMARK) || daily.has(RESIDUAL_MOMENTUM_BENCHMARK)) {
    throw new Error(`${RESIDUAL_MOMENTUM_BENCHMARK} must remain benchmark-only and non-tradable`);
  }
  const benchmarkRows = benchmarks?.get(RESIDUAL_MOMENTUM_BENCHMARK);
  if (!benchmarkRows?.length) throw new Error(`${halalResidualFastMomentumCoreSetup.id} requires explicit real SPUS benchmark history`);

  const seriesBySymbol = new Map<string, CompactSeries>();
  const weekEnds = new Map<number, number>();
  for (const [symbol, rows] of Array.from(daily.entries())) {
    if (!rows.length) continue;
    const series = compact(symbol, rows);
    seriesBySymbol.set(symbol, series);
    for (let index = 0; index < series.ts.length; index++) {
      const time = series.ts[index];
      const week = isoWeekKey(time);
      weekEnds.set(week, Math.max(weekEnds.get(week) ?? Number.NEGATIVE_INFINITY, time));
    }
  }
  const state: ResidualState = {
    seriesBySymbol,
    benchmark: compact(RESIDUAL_MOMENTUM_BENCHMARK, benchmarkRows),
    weekEndTimes: new Set(weekEnds.values()),
    decisionCache: new Map(),
  };
  if (input.replayScope) SCOPED_STATES.set(input.replayScope, state);
  else UNSCOPED_STATE = state;
}

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

/** Timestamp intersection ending exactly at asOf; never reads a prepared row after asOf. */
function alignedCloses(
  stock: CompactSeries,
  benchmark: CompactSeries,
  asOfMs: number,
  requiredCloses: number,
): { stock: number[]; benchmark: number[] } | null {
  let i = indexOf(stock, asOfMs);
  let j = indexOf(benchmark, asOfMs);
  if (i < 0 || j < 0) return null;
  const stockCloses: number[] = [];
  const benchmarkCloses: number[] = [];
  while (i >= 0 && j >= 0 && stockCloses.length < requiredCloses) {
    const stockTime = stock.ts[i];
    const benchmarkTime = benchmark.ts[j];
    if (stockTime === benchmarkTime) {
      stockCloses.push(stock.close[i--]);
      benchmarkCloses.push(benchmark.close[j--]);
    } else if (stockTime > benchmarkTime) i--;
    else j--;
  }
  if (stockCloses.length < requiredCloses) return null;
  return { stock: stockCloses.reverse(), benchmark: benchmarkCloses.reverse() };
}

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

const LIQUIDITY_LOOKBACK_SESSIONS = 21;

/** Average close×volume over exactly the trailing observed sessions through the decision close. */
function trailingAverageDollarVolume(series: CompactSeries, asOfMs: number): number | null {
  const end = indexOf(series, asOfMs);
  const start = end - LIQUIDITY_LOOKBACK_SESSIONS + 1;
  if (end < 0 || start < 0) return null;
  let total = 0;
  for (let index = start; index <= end; index++) {
    total += series.close[index] * series.volume[index];
  }
  const average = total / LIQUIDITY_LOOKBACK_SESSIONS;
  return Number.isFinite(average) && average > 0 ? average : null;
}

function wideDecision(asOf: Date, params: HalalResidualFastMomentumCoreParams, replayScope?: object): ResidualDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  const empty = (reason: ResidualDecision['reason']): ResidualDecision => ({
    reason, rankable: 0, eligible: 0, selected: 0, weights: new Map(), scores: new Map(),
  });
  if (!state) return empty('below_cash_floor');
  const asOfMs = asOf.getTime();
  if (!state.weekEndTimes.has(asOfMs)) return empty('not_week_end');
  const cacheKey = `${asOfMs}|${params.momentumDays}|${params.skipRecentDays}|${params.betaLookbackDays}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  const requiredCloses = Math.max(params.betaLookbackDays, params.momentumDays) + 1;
  const liquidPool = Array.from(state.seriesBySymbol.entries())
    .map(([symbol, series]) => ({ symbol, series, dollarVolume: trailingAverageDollarVolume(series, asOfMs) }))
    .filter((row): row is { symbol: string; series: CompactSeries; dollarVolume: number } => row.dollarVolume !== null)
    .sort((a, b) => b.dollarVolume - a.dollarVolume || a.symbol.localeCompare(b.symbol))
    .slice(0, params.maxNames);
  const rankable: { symbol: string; score: ResidualMomentumMetrics; stockCloses: number[] }[] = [];
  for (const { symbol, series } of liquidPool) {
    const aligned = alignedCloses(series, state.benchmark, asOfMs, requiredCloses);
    if (!aligned) continue;
    const score = residualMomentumMetrics(
      aligned.stock, aligned.benchmark, params.momentumDays, params.skipRecentDays, params.betaLookbackDays,
    );
    if (score) rankable.push({ symbol, score, stockCloses: aligned.stock });
  }
  const eligible = rankable.filter(({ score }) => score.rawMomentum > 0 && score.residualScore > 0);
  const selected = new Set(selectTopNByMomentum(
    eligible.map(({ symbol, score }) => ({ symbol, relative: score.residualScore })),
    params.topN,
    params.cashFloor,
  ));
  if (!selected.size) {
    const result: ResidualDecision = {
      reason: 'below_cash_floor', rankable: rankable.length, eligible: eligible.length,
      selected: 0, weights: new Map(), scores: new Map(rankable.map(({ symbol, score }) => [symbol, score])),
    };
    state.decisionCache.set(cacheKey, result);
    return result;
  }
  const volBySymbol = new Map<string, number>();
  for (const row of rankable) {
    if (!selected.has(row.symbol)) continue;
    try {
      const sigma = stdev(dailyReturns(row.stockCloses.slice(-(params.momentumDays + 1))));
      if (sigma > 0 && Number.isFinite(sigma)) volBySymbol.set(row.symbol, sigma);
    } catch { /* malformed series is fail-closed excluded */ }
  }
  const result: ResidualDecision = {
    reason: 'ranked', rankable: rankable.length, eligible: eligible.length, selected: selected.size,
    weights: inverseVolatilityWeights(volBySymbol, params.perNameCap),
    scores: new Map(rankable.map(({ symbol, score }) => [symbol, score])),
  };
  state.decisionCache.set(cacheKey, result);
  return result;
}

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}
function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}
function decisionEvidence(symbol: string, decision: ResidualDecision, params: HalalResidualFastMomentumCoreParams): Evidence[] {
  const score = decision.scores.get(symbol);
  return [
    evidence('params_version', params.version), evidence('benchmark', RESIDUAL_MOMENTUM_BENCHMARK),
    evidence('momentum_days', params.momentumDays), evidence('skip_recent_days', params.skipRecentDays),
    evidence('beta_lookback_days', params.betaLookbackDays), evidence('beta_clipped_0_2', score?.beta ?? 'na'),
    evidence('raw_momentum', score?.rawMomentum ?? 'na'), evidence('residual_score', score?.residualScore ?? 'na'),
    evidence('selected_names', decision.selected), evidence('target_weight', decision.weights.get(symbol) ?? 0),
    evidence('sharia_source_status', 'current_c1_source_sleeve_only_unverified_historical'),
  ];
}

export const halalResidualFastMomentumCoreSetup: StrategySetup<HalalResidualFastMomentumCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-residual-fast-momentum-core', version: 'v1', cadence: 'daily',
  universeCompatibility: 'halal-only', defaultParams: HALAL_RESIDUAL_FAST_MOMENTUM_CORE_V1,
  benchmarkSymbols: [RESIDUAL_MOMENTUM_BENCHMARK],
  prepareUniverse: configureUniverse,
  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    for (const raw of paramSets) {
      const params = paramsOrDefault(raw as HalalResidualFastMomentumCoreParams);
      for (const time of Array.from(state.weekEndTimes).sort((a, b) => a - b)) {
        wideDecision(new Date(time), params, replayScope).weights.forEach((_weight, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },
  plateauNeighborhood(params): PlateauNeighborhood<HalalResidualFastMomentumCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [42, 63, 84].flatMap((momentumDays) => [84, 126, 168].flatMap((betaLookbackDays) => (
      momentumDays === center.momentumDays && betaLookbackDays === center.betaLookbackDays
        ? []
        : [{ label: `momentumDays=${momentumDays}|betaLookbackDays=${betaLookbackDays}`, params: { ...center, momentumDays, betaLookbackDays } }]
    )));
    return { axes: ['momentumDays', 'betaLookbackDays'], center, neighbors };
  },
  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    return decision.reason === 'not_week_end' ? null : decision.weights.get(ctx.symbol) ?? 0;
  },
  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    return check(decision.reason === 'ranked', decision.reason === 'ranked' ? [] : [decision.reason], decisionEvidence(ctx.symbol, decision, p));
  },
  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const matched = wideDecision(ctx.asOf, p, ctx.replayScope).weights.has(ctx.symbol);
    return check(matched, matched ? [] : ['not_selected_this_week'], screened.evidence);
  },
  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_week_end') return check(false, ['hold_between_week_ends'], []);
    const matched = !decision.weights.has(ctx.symbol);
    return check(matched, matched ? ['not_selected_this_week'] : ['retain_selected_weighted_name'], decisionEvidence(ctx.symbol, decision, p));
  },
  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const stance: Stance = target !== null && target > 0 ? 'BULLISH' : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf, stance,
      conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; weekly top-${p.topN} positive raw and SPUS-residual momentum, inverse-volatility weighted, ${(p.perNameCap * 100).toFixed(0)}% name cap; deterministic research candidate only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ أعلى ${p.topN} أسهم أسبوعيًا بزخم خام وزخم متبقٍ موجبين مقابل SPUS، بترجيح عكسي للتقلب وحد ${(p.perNameCap * 100).toFixed(0)}% للاسم؛ مرشح بحثي حتمي فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p), determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
