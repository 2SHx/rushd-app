import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  DEFAULT_BT_LIMITS,
  filterRealDailyBars,
  simulateSetupDaily,
  type BacktestBar,
} from '../backtest/engine';
import { deriveShariaState } from '../backtest/shariaSnapshot';
import type { EquityPoint } from '../backtest/metrics';
import type { TradeRecord } from '../backtest/intradayEngine';
import { bollingerMrLongV2Setup, BOLLINGER_MR_LONG_V2, NASDAQ_HALAL_UNIVERSE } from '../strategies/bollingerMrLongV2';
import {
  compileBollingerMrLongV2Policy,
  type StrategyLearningAnswer,
} from './bollingerMrLongV2Curriculum';

const D = Prisma.Decimal;
const DAY_MS = 86_400_000;
const MAX_REPLAY_DAYS = 184;
const STARTING_CASH = new D(100_000);
const FIXTURE_PATH = path.join(
  process.cwd(),
  'src',
  'quant',
  'learning',
  'fixtures',
  'bollinger-mr-long-v2.learning-replay-v1.json',
);

const barSchema = z.tuple([
  z.string().datetime(),
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
  z.number().positive(),
  z.number().nonnegative(),
]);

const fixtureSchema = z.object({
  fixtureVersion: z.literal('bollinger-mr-long-v2.learning-replay.v1'),
  capturedAt: z.string().datetime(),
  market: z.literal('NASDAQ'),
  warmupStart: z.string().datetime(),
  interval: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
    oosStart: z.string().datetime(),
  }).strict(),
  strategyUniverse: z.array(z.string().min(1)),
  benchmarkSymbols: z.tuple([z.literal('SPUS'), z.literal('SPY')]),
  sharia: z.object({
    screened: z.literal(false),
    source: z.literal('none'),
  }).strict(),
  series: z.array(z.object({
    symbol: z.string().min(1),
    source: z.enum(['YAHOO', 'ALPACA']),
    bars: z.array(barSchema).min(2),
  }).strict()),
}).strict();

export type BollingerLearningReplayFixture = z.infer<typeof fixtureSchema>;

export interface LearningComparisonPoint {
  ts: string;
  value: number;
}

export interface LearningReplayMetrics {
  return: number;
  maxDrawdown: number;
  annualizedVolatility: number;
  trades: number;
}

export interface BollingerLearningReplayResult {
  setupId: 'bollinger-mr-long-v2';
  setupVersion: 'v2';
  policyHash: string;
  basis: 'NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS';
  interval: { start: string; end: string; oosStart: string };
  labels: {
    learner: 'Learner policy';
    team: 'Strategy team';
    spus: 'SPUS price-only benchmark';
    spy: 'S&P 500 ETF price-only proxy';
  };
  series: Record<'learner' | 'team' | 'spus' | 'spy', LearningComparisonPoint[]>;
  metrics: Record<'learner' | 'team' | 'spus' | 'spy', LearningReplayMetrics>;
  provenance: {
    fixtureVersion: string;
    capturedAt: string;
    warmupStart: string;
    oosBoundary: string;
    dataSources: Array<'YAHOO' | 'ALPACA'>;
    strategyUniverse: string[];
    riskLimits: typeof DEFAULT_BT_LIMITS;
    fillModel: 'DECIDE_CLOSE_FILL_NEXT_OPEN_10BPS_COMMISSION_5BPS_SLIPPAGE';
    sharia: {
      screened: false;
      source: 'none';
      state: 'UNSCREENED_EXECUTION_BLOCKED';
      executionBlocked: true;
    };
  };
}

function asTimestamp(value: string): number {
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) throw new Error('invalid_learning_fixture_timestamp');
  return ts;
}

function validateFixture(input: unknown): BollingerLearningReplayFixture {
  const fixture = fixtureSchema.parse(input);
  const start = asTimestamp(fixture.interval.start);
  const end = asTimestamp(fixture.interval.end);
  if (fixture.interval.oosStart !== fixture.interval.start) throw new Error('learning_fixture_oos_boundary_mismatch');
  if (end <= start || end - start > MAX_REPLAY_DAYS * DAY_MS) throw new Error('learning_fixture_interval_exceeds_six_months');
  if (asTimestamp(fixture.warmupStart) >= start) throw new Error('learning_fixture_warmup_missing');

  if (fixture.strategyUniverse.length !== NASDAQ_HALAL_UNIVERSE.length
    || NASDAQ_HALAL_UNIVERSE.some(symbol => !fixture.strategyUniverse.includes(symbol))) {
    throw new Error('learning_fixture_team_universe_mismatch');
  }
  const required = [...NASDAQ_HALAL_UNIVERSE, 'SPUS', 'SPY'];
  const symbols = fixture.series.map(item => item.symbol);
  if (new Set(symbols).size !== symbols.length
    || required.length !== symbols.length
    || required.some(symbol => !symbols.includes(symbol))) {
    throw new Error('learning_fixture_series_mismatch');
  }
  return fixture;
}

/** Load and validate the committed captured-real learning fixture. No DB, clock, or network. */
export function loadBollingerMrLongV2LearningFixture(): BollingerLearningReplayFixture {
  return validateFixture(JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')));
}

function toBars(fixture: BollingerLearningReplayFixture, symbol: string): BacktestBar[] {
  const item = fixture.series.find(candidate => candidate.symbol === symbol);
  if (!item) throw new Error(`learning_fixture_missing_symbol:${symbol}`);
  const sourced = item.bars.map(([ts, open, high, low, close, volume]) => ({
    ts: new Date(ts),
    open: new D(open),
    high: new D(high),
    low: new D(low),
    close: new D(close),
    volume: new D(volume),
    source: item.source,
  }));
  const filtered = filterRealDailyBars(sourced);
  if (filtered.excludedMock !== 0 || filtered.real.length !== sourced.length) {
    throw new Error('learning_fixture_mock_bar_rejected');
  }
  return filtered.real;
}

function pooledTradeCurve(
  fixture: BollingerLearningReplayFixture,
  params: Parameters<typeof bollingerMrLongV2Setup.entry>[1],
): { curve: EquityPoint[]; trades: number } {
  const intervalStart = asTimestamp(fixture.interval.start);
  const intervalEnd = asTimestamp(fixture.interval.end);
  const records: Array<TradeRecord & { symbol: string }> = [];

  for (const symbol of fixture.strategyUniverse) {
    const simulation = simulateSetupDaily({
      setup: bollingerMrLongV2Setup,
      params,
      symbol,
      market: 'NASDAQ',
      bars: toBars(fixture, symbol),
      startingCash: STARTING_CASH,
      limits: DEFAULT_BT_LIMITS,
    });
    records.push(...simulation.tradeRecords
      .filter(record => record.exitTs.getTime() >= intervalStart && record.exitTs.getTime() <= intervalEnd)
      .map(record => ({ ...record, symbol })));
  }

  records.sort((left, right) => left.exitTs.getTime() - right.exitTs.getTime()
    || left.symbol.localeCompare(right.symbol));
  let equity = 100;
  const curve: EquityPoint[] = [{ ts: new Date(intervalStart), equity }];
  for (const record of records) {
    equity *= 1 + record.ret;
    curve.push({ ts: record.exitTs, equity });
  }
  if (curve.at(-1)?.ts.getTime() !== intervalEnd) curve.push({ ts: new Date(intervalEnd), equity });
  return { curve, trades: records.length };
}

function closeCurve(fixture: BollingerLearningReplayFixture, symbol: 'SPUS' | 'SPY'): EquityPoint[] {
  return toBars(fixture, symbol).map(bar => ({ ts: bar.ts, equity: Number(bar.close) }));
}

function latestValue(points: readonly EquityPoint[], ts: number): number {
  let value: number | null = null;
  for (const point of points) {
    if (point.ts.getTime() > ts) break;
    value = point.equity;
  }
  if (value === null) throw new Error('learning_comparison_missing_baseline');
  return value;
}

function weekKey(ts: number): string {
  const date = new Date(ts);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - mondayOffset))
    .toISOString().slice(0, 10);
}

function commonDailyTimestamps(
  fixture: BollingerLearningReplayFixture,
  spy: readonly EquityPoint[],
  spus: readonly EquityPoint[],
): number[] {
  const start = asTimestamp(fixture.interval.start);
  const end = asTimestamp(fixture.interval.end);
  const spusDates = new Set(spus.map(point => point.ts.getTime()));
  const dates = spy.map(point => point.ts.getTime())
    .filter(ts => ts >= start && ts <= end && spusDates.has(ts));
  if (dates.length < 2) throw new Error('learning_comparison_common_interval_missing');
  return dates;
}

function weeklyTimestamps(daily: readonly number[]): number[] {
  const lastByWeek = new Map<string, number>();
  for (const ts of daily) lastByWeek.set(weekKey(ts), ts);
  const sampled = [daily[0], ...Array.from(lastByWeek.values()), daily.at(-1)!];
  return Array.from(new Set(sampled)).sort((left, right) => left - right);
}

function normalizedSeries(points: readonly EquityPoint[], timestamps: readonly number[]): LearningComparisonPoint[] {
  const baseline = latestValue(points, timestamps[0]);
  if (!(baseline > 0)) throw new Error('learning_comparison_invalid_baseline');
  return timestamps.map(ts => ({ ts: new Date(ts).toISOString(), value: 100 * latestValue(points, ts) / baseline }));
}

function metrics(points: readonly EquityPoint[], timestamps: readonly number[], trades: number): LearningReplayMetrics {
  const values = timestamps.map(ts => latestValue(points, ts));
  const returns = values.slice(1).map((value, index) => value / values[index] - 1);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
    : 0;
  let peak = values[0];
  let maxDrawdown = 0;
  for (const value of values) {
    peak = Math.max(peak, value);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? (peak - value) / peak : 0);
  }
  return {
    return: values.at(-1)! / values[0] - 1,
    maxDrawdown,
    annualizedVolatility: Math.sqrt(variance) * Math.sqrt(252),
    trades,
  };
}

/**
 * Compile a learner's bounded answers and replay them beside the frozen team and price-only ETFs.
 * This is intentionally pure after fixture loading: no persistence, broker, clock, DB, or verdict.
 */
export function replayBollingerMrLongV2LearningPolicy(
  answers: readonly StrategyLearningAnswer[],
  inputFixture: BollingerLearningReplayFixture,
): BollingerLearningReplayResult {
  const fixture = validateFixture(inputFixture);
  const policy = compileBollingerMrLongV2Policy(answers);
  const learner = pooledTradeCurve(fixture, policy.params);
  const team = pooledTradeCurve(fixture, BOLLINGER_MR_LONG_V2);
  const spus = closeCurve(fixture, 'SPUS');
  const spy = closeCurve(fixture, 'SPY');
  const dailyTimestamps = commonDailyTimestamps(fixture, spy, spus);
  const sampledTimestamps = weeklyTimestamps(dailyTimestamps);
  const shariaState = deriveShariaState(fixture.sharia.screened, []);
  if (shariaState !== 'UNSCREENED_EXECUTION_BLOCKED') throw new Error('learning_fixture_sharia_state_mismatch');

  return {
    setupId: policy.setupId,
    setupVersion: policy.setupVersion,
    policyHash: policy.policyHash,
    basis: 'NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS',
    interval: {
      start: new Date(dailyTimestamps[0]).toISOString(),
      end: new Date(dailyTimestamps.at(-1)!).toISOString(),
      oosStart: fixture.interval.oosStart,
    },
    labels: {
      learner: 'Learner policy',
      team: 'Strategy team',
      spus: 'SPUS price-only benchmark',
      spy: 'S&P 500 ETF price-only proxy',
    },
    series: {
      learner: normalizedSeries(learner.curve, sampledTimestamps),
      team: normalizedSeries(team.curve, sampledTimestamps),
      spus: normalizedSeries(spus, sampledTimestamps),
      spy: normalizedSeries(spy, sampledTimestamps),
    },
    metrics: {
      learner: metrics(learner.curve, dailyTimestamps, learner.trades),
      team: metrics(team.curve, dailyTimestamps, team.trades),
      spus: metrics(spus, dailyTimestamps, 0),
      spy: metrics(spy, dailyTimestamps, 0),
    },
    provenance: {
      fixtureVersion: fixture.fixtureVersion,
      capturedAt: fixture.capturedAt,
      warmupStart: fixture.warmupStart,
      oosBoundary: fixture.interval.oosStart,
      dataSources: Array.from(new Set(fixture.series.map(item => item.source))).sort(),
      strategyUniverse: [...fixture.strategyUniverse],
      riskLimits: { ...DEFAULT_BT_LIMITS },
      fillModel: 'DECIDE_CLOSE_FILL_NEXT_OPEN_10BPS_COMMISSION_5BPS_SLIPPAGE',
      sharia: {
        screened: false,
        source: 'none',
        state: shariaState,
        executionBlocked: true,
      },
    },
  };
}
