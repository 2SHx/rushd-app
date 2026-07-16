import { Prisma } from '@prisma/client';
import type { DataSource, IntradayBar, Market } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constructHalalPortfolio } from '../portfolio/construction';
import {
  getNormalizedBenchmarks,
  type NormalizedBenchmarkPoint
} from '../data/benchmarks';
import { assertNoLookahead } from '../data/pointInTime';
import {
  applyEnvelope,
  type EnvelopeResult,
  type MarketState,
  type PortfolioState,
  type RiskLimits,
} from '../risk/envelope';
import type { StrategyPointInTimeContext, StrategySetup } from '../strategies/types';
import type { TradeRecord } from './intradayEngine';
import {
  computePortfolioMetrics,
  type PortfolioEquityPoint,
  type PortfolioBacktestMetrics
} from './metrics';

export {
  computePortfolioMetrics,
  type PortfolioEquityPoint,
  type PortfolioBacktestMetrics
};

const D = Prisma.Decimal;
const COMMISSION_BPS = 0.0010; // 0.10%
const SLIPPAGE_BPS = 0.0005; // 0.05%

export function normalizeSymbolAllowlist(
  symbolAllowlist?: readonly string[]
): string[] | undefined {
  if (!symbolAllowlist) return undefined;
  return Array.from(new Set(
    symbolAllowlist.map(symbol => symbol.trim().toUpperCase()).filter(Boolean)
  ));
}

export function getBenchmarkAtOrBefore(
  benchmarks: readonly NormalizedBenchmarkPoint[],
  date: Date,
  startingCash: number
): Pick<NormalizedBenchmarkPoint, 'spy' | 'spus'> {
  const activeTime = date.getTime();
  for (let i = benchmarks.length - 1; i >= 0; i--) {
    if (benchmarks[i].ts.getTime() <= activeTime) {
      return { spy: benchmarks[i].spy, spus: benchmarks[i].spus };
    }
  }
  return { spy: startingCash, spus: startingCash };
}

/**
 * Runs a cross-sectional halal portfolio backtest over a date range.
 * Simulates monthly rebalances.
 */
export async function runPortfolioBacktest(
  fromDate: Date,
  toDate: Date,
  startingCash = 100000,
  symbolAllowlist?: readonly string[]
): Promise<{ equityCurve: PortfolioEquityPoint[]; metrics: PortfolioBacktestMetrics }> {
  const normalizedAllowlist = normalizeSymbolAllowlist(symbolAllowlist);
  if (normalizedAllowlist?.length === 0) {
    return { equityCurve: [], metrics: computePortfolioMetrics([]) };
  }

  // Query all daily bars in range for aligning dates
  const datesRow = await prisma.marketBar.findMany({
    where: {
      market: 'NASDAQ',
      interval: 'DAY',
      ts: { gte: fromDate, lte: toDate },
      ...(normalizedAllowlist ? { symbol: { in: normalizedAllowlist } } : {})
    },
    select: { ts: true },
    orderBy: { ts: 'asc' }
  });

  const allDates = Array.from(new Set(datesRow.map(d => d.ts.getTime())))
    .sort()
    .map(t => new Date(t));

  if (allDates.length === 0) {
    return { equityCurve: [], metrics: computePortfolioMetrics([]) };
  }

  // Load normalized benchmarks series starting at same baseline
  const benchmarks = await getNormalizedBenchmarks(fromDate, toDate, startingCash);

  let cash = startingCash;
  let positions: Record<string, number> = {}; // symbol -> shares qty
  const equityCurve: PortfolioEquityPoint[] = [];

  let lastRebalanceTime = 0;
  const rebalanceIntervalMs = 30 * 24 * 3600 * 1000; // 30 days rebalance cadence

  for (const date of allDates) {
    // Assert no look-ahead on all database operations
    const activeTime = date.getTime();
    
    // Find aligned benchmark point
    const benchPoint = getBenchmarkAtOrBefore(benchmarks, date, startingCash);

    // Load active prices for current holdings to calculate NAV at the close
    let portfolioValue = 0;
    for (const [symbol, qty] of Object.entries(positions)) {
      const bar = await prisma.marketBar.findFirst({
        where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { lte: date } },
        orderBy: { ts: 'desc' }
      });
      if (bar) {
        assertNoLookahead([bar], date, 'ts');
        portfolioValue += qty * Number(bar.close.toString());
      }
    }

    const currentNAV = cash + portfolioValue;

    // Check if it's time to rebalance (e.g. monthly)
    if (activeTime - lastRebalanceTime >= rebalanceIntervalMs) {
      lastRebalanceTime = activeTime;

      // Construct target weights based on data strictly up to the close
      const proposal = await constructHalalPortfolio(
        'NASDAQ',
        date,
        undefined,
        normalizedAllowlist
      );
      
      // Execute simulated trades on the close (simplifying fill on same day close)
      // Diff current holdings vs target allocations
      const targetNav = currentNAV;
      
      // Calculate target amounts for each symbol
      const targetPositions: Record<string, number> = {};
      let totalTradeCost = 0;

      for (const target of proposal.weights) {
        // Query close price for target symbol on date
        const bar = await prisma.marketBar.findFirst({
          where: { symbol: target.symbol, market: 'NASDAQ', interval: 'DAY', ts: { lte: date } },
          orderBy: { ts: 'desc' }
        });
        if (bar) {
          assertNoLookahead([bar], date, 'ts');
          const price = Number(bar.close.toString());
          if (price > 0) {
            const targetAllocVal = targetNav * target.weight;
            const targetQty = targetAllocVal / price;
            targetPositions[target.symbol] = targetQty;

            // Diff
            const currentQty = positions[target.symbol] || 0;
            const tradeQty = Math.abs(targetQty - currentQty);
            const tradeNotional = tradeQty * price;
            
            // Add commission + slippage cost (15 bps total)
            totalTradeCost += tradeNotional * (COMMISSION_BPS + SLIPPAGE_BPS);
          }
        }
      }

      // Diff out positions that are no longer in the target portfolio
      for (const [symbol, qty] of Object.entries(positions)) {
        if (!targetPositions[symbol]) {
          const bar = await prisma.marketBar.findFirst({
            where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { lte: date } },
            orderBy: { ts: 'desc' }
          });
          if (bar) {
            assertNoLookahead([bar], date, 'ts');
            const price = Number(bar.close.toString());
            totalTradeCost += qty * price * (COMMISSION_BPS + SLIPPAGE_BPS);
          }
        }
      }

      // Update positions and adjust cash
      positions = targetPositions;
      
      // Recalculate total portfolio value with new positions to ensure cash math matches
      let newPortfolioValue = 0;
      for (const [symbol, qty] of Object.entries(positions)) {
        const bar = await prisma.marketBar.findFirst({
          where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { lte: date } },
          orderBy: { ts: 'desc' }
        });
        if (bar) {
          newPortfolioValue += qty * Number(bar.close.toString());
        }
      }

      // Adjusted Cash
      cash = currentNAV - newPortfolioValue - totalTradeCost;
    }

    // Mark to market at the end of the day
    let endPortfolioValue = 0;
    for (const [symbol, qty] of Object.entries(positions)) {
      const bar = await prisma.marketBar.findFirst({
        where: { symbol, market: 'NASDAQ', interval: 'DAY', ts: { lte: date } },
        orderBy: { ts: 'desc' }
      });
      if (bar) {
        endPortfolioValue += qty * Number(bar.close.toString());
      }
    }

    const finalNAV = cash + endPortfolioValue;

    equityCurve.push({
      ts: date,
      equity: finalNAV,
      cash,
      spy: benchPoint.spy,
      spus: benchPoint.spus
    });
  }

  const metrics = computePortfolioMetrics(equityCurve);
  return { equityCurve, metrics };
}

// ── QDR-6/G3e deterministic shared-cash strategy book ───────────────────────

const BOOK_BPS = new D(10_000);
const BOOK_COMMISSION_BPS = new D(10);
const BOOK_SLIPPAGE_BPS = new D(5);
const REAL_DAILY_SOURCES = new Set<DataSource>(['YAHOO', 'ALPACA']);

export interface StrategyBookBar {
  readonly ts: Date;
  readonly open: Prisma.Decimal;
  readonly high: Prisma.Decimal;
  readonly low: Prisma.Decimal;
  readonly close: Prisma.Decimal;
  readonly volume: Prisma.Decimal;
  readonly source: DataSource;
}

export interface StrategyBookSeries {
  readonly symbol: string;
  readonly market: Market;
  readonly bars: readonly StrategyBookBar[];
}

export interface StrategyBookPosition {
  readonly symbol: string;
  readonly qty: Prisma.Decimal;
  readonly price: Prisma.Decimal;
  readonly entryPrice: Prisma.Decimal;
  readonly entryTs: Date;
  readonly entrySignalTs: Date;
}

export interface StrategyBookDailyPoint {
  readonly ts: Date;
  readonly cash: Prisma.Decimal;
  readonly positionsValue: Prisma.Decimal;
  readonly nav: Prisma.Decimal;
  readonly peakNav: Prisma.Decimal;
  readonly drawdown: Prisma.Decimal;
  readonly realizedVolAnnual: number | null;
  readonly grossExposureScalar: number;
  readonly positions: readonly StrategyBookPosition[];
}

export interface StrategyBookFill {
  readonly ts: Date;
  readonly signalTs: Date;
  readonly symbol: string;
  readonly action: 'BUY' | 'SELL';
  readonly qty: Prisma.Decimal;
  readonly fillPrice: Prisma.Decimal;
  readonly cashAfter: Prisma.Decimal;
  readonly positionsValueAfter: Prisma.Decimal;
  readonly navAfter: Prisma.Decimal;
  readonly positionsAfter: readonly StrategyBookPosition[];
  readonly envelope: EnvelopeResult;
}

export interface StrategyBookRiskCheck {
  readonly ts: Date;
  readonly symbol: string;
  readonly action: 'BUY' | 'SELL';
  /** Canonical snapshot handed to applyEnvelope, before its decision. */
  readonly positionsSeen: readonly string[];
}

export interface StrategyBookInput<Params> {
  readonly setup: StrategySetup<Params>;
  readonly params?: Params;
  readonly series: readonly StrategyBookSeries[];
  /** Optional complete trading calendar when zero-weight symbols are omitted to bound memory. */
  readonly calendar?: readonly Date[];
  readonly startingCash: Prisma.Decimal;
  readonly limits: RiskLimits;
  readonly policy?: StrategyBookPolicy;
  /** Shared only across simulations over the exact same immutable input series. */
  readonly replayScope?: object;
}

export interface StrategyBookPolicy {
  readonly realizedVolLookback?: number;
  readonly targetAnnualVol?: number;
  readonly maxOpenPositions: number;
  /** Optional continuous gross ceiling; appreciation above it is trimmed at the next open. */
  readonly maxGrossFraction?: number;
  /** Strategy-declared bounded decision window; omitted means the full expanding history. */
  readonly decisionHistoryBars?: number;
}

export interface StrategyBookResult {
  readonly daily: readonly StrategyBookDailyPoint[];
  readonly fills: readonly StrategyBookFill[];
  readonly riskChecks: readonly StrategyBookRiskCheck[];
  readonly tradeReturns: readonly number[];
  readonly tradeRecords: readonly TradeRecord[];
  readonly turnoverNotional: Prisma.Decimal;
  readonly barsProcessed: number;
  readonly decisionWindows: number;
}

/**
 * Collapse max-one partial de-risk sells into independent CLOSED position episodes for inference.
 * A group without a final (`partial=false`) exit is still open and therefore excluded.
 */
export function collapseMaxOnePositionEpisodes(records: readonly TradeRecord[]): TradeRecord[] {
  const groups = new Map<string, TradeRecord[]>();
  const ordered = [...records].sort((a, b) => (
    a.entryTs.getTime() - b.entryTs.getTime() || a.exitTs.getTime() - b.exitTs.getTime()
  ));
  for (const record of ordered) {
    const key = `${record.entryTs.getTime()}|${record.entryPrice}`;
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }

  const episodes: TradeRecord[] = [];
  for (const group of Array.from(groups.values())) {
    const final = group.findLast((record) => !record.partial);
    if (!final) continue;
    const closed = group.filter((record) => record.exitTs <= final.exitTs);
    const qty = closed.reduce((sum, record) => sum + record.qty, 0);
    if (!(qty > 0)) continue;
    const entryPrice = closed[0].entryPrice;
    const exitPrice = closed.reduce((sum, record) => sum + record.qty * record.exitPrice, 0) / qty;
    episodes.push({
      entryTs: closed[0].entryTs,
      exitTs: final.exitTs,
      qty,
      entryPrice,
      exitPrice,
      ret: entryPrice > 0 ? exitPrice / entryPrice - 1 : 0,
      reason: 'position_episode_exit',
      partial: false,
    });
  }
  return episodes.sort((a, b) => a.exitTs.getTime() - b.exitTs.getTime());
}

interface OpenPosition {
  symbol: string;
  qty: Prisma.Decimal;
  markPrice: Prisma.Decimal;
  entryPrice: Prisma.Decimal;
  entryTs: Date;
  entrySignalTs: Date;
}

interface PendingDirectionalOrder {
  action: 'BUY' | 'SELL';
  symbol: string;
  signalTs: Date;
  fillTs: Date;
  proposalQty: Prisma.Decimal;
  atr: Prisma.Decimal;
  adv: Prisma.Decimal;
  grossExposureScalar: number;
  /** Present only for the new continuous fixed-cap path; undefined preserves legacy/v3 fills. */
  targetGrossFraction?: number;
  /** True when this directional order was derived from a target-weight rebalance (see effectiveLimits). */
  fromTarget?: boolean;
}

interface PendingTargetOrder {
  action: 'TARGET';
  symbol: string;
  signalTs: Date;
  fillTs: Date;
  targetWeight: number;
  atr: Prisma.Decimal;
  adv: Prisma.Decimal;
  grossExposureScalar: number;
}

type PendingOrder = PendingDirectionalOrder | PendingTargetOrder;

const bookMin = (a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal => a.lte(b) ? a : b;

/** Down-only basket governor. Null/unavailable volatility leaves exposure unchanged. */
export function basketVolExposureScalar(
  realizedAnnualVol: number | null,
  targetAnnualVol: number,
): number {
  if (realizedAnnualVol === null || !Number.isFinite(realizedAnnualVol) || realizedAnnualVol <= 0) return 1;
  return Math.min(1, targetAnnualVol / realizedAnnualVol);
}

/** Compose independent down-only risk governors without allowing either to increase exposure. */
export function strategyBookExposureScalar(
  realizedAnnualVol: number | null,
  targetAnnualVol?: number,
  maxGrossFraction?: number,
): number {
  const volatilityScale = targetAnnualVol === undefined
    ? 1
    : basketVolExposureScalar(realizedAnnualVol, targetAnnualVol);
  return Math.min(volatilityScale, maxGrossFraction ?? 1);
}

export function trailingBasketAnnualVol(
  navs: readonly Prisma.Decimal[],
  lookback: number,
): number | null {
  if (navs.length < lookback + 1) return null;
  const window = navs.slice(-(lookback + 1));
  const returns: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1].lte(0) || window[i].lte(0)) return null;
    returns.push(Math.log(Number(window[i].div(window[i - 1]).toString())));
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length;
  const annual = Math.sqrt(variance) * Math.sqrt(252);
  return annual > 0 ? annual : null;
}

function decimalMax(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((max, value) => value.gt(max) ? value : max, new D(0));
}

function bookAtr(bars: readonly StrategyBookBar[], period = 14): Prisma.Decimal {
  if (bars.length < 2) return new D(0);
  const ranges: Prisma.Decimal[] = [];
  for (let i = 1; i < bars.length; i++) {
    ranges.push(decimalMax([
      bars[i].high.minus(bars[i].low),
      bars[i].high.minus(bars[i - 1].close).abs(),
      bars[i].low.minus(bars[i - 1].close).abs(),
    ]));
  }
  const window = ranges.slice(-period);
  return window.reduce((sum, value) => sum.plus(value), new D(0)).div(window.length);
}

function bookAvgVolume(bars: readonly StrategyBookBar[], period = 20): Prisma.Decimal {
  const window = bars.slice(-period);
  return window.length
    ? window.reduce((sum, bar) => sum.plus(bar.volume), new D(0)).div(window.length)
    : new D(0);
}

function validateSeries(series: readonly StrategyBookSeries[]): StrategyBookSeries[] {
  const ordered = [...series].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const symbols = new Set<string>();
  for (const item of ordered) {
    if (!item.symbol || item.symbol !== item.symbol.trim().toUpperCase()) {
      throw new Error(`Strategy-book symbol must be canonical uppercase: ${item.symbol}`);
    }
    if (symbols.has(item.symbol)) throw new Error(`Duplicate strategy-book symbol: ${item.symbol}`);
    symbols.add(item.symbol);
    let previous = Number.NEGATIVE_INFINITY;
    for (const bar of item.bars) {
      if (!REAL_DAILY_SOURCES.has(bar.source)) {
        throw new Error(`Strategy-book requires YAHOO/ALPACA bars; ${item.symbol} has ${bar.source}`);
      }
      const time = bar.ts.getTime();
      if (!Number.isFinite(time) || time <= previous) {
        throw new Error(`Strategy-book bars must be strictly chronological: ${item.symbol}`);
      }
      if (bar.open.lte(0) || bar.high.lte(0) || bar.low.lte(0) || bar.close.lte(0) || bar.volume.lt(0)) {
        throw new Error(`Strategy-book bar has invalid OHLCV: ${item.symbol} ${bar.ts.toISOString()}`);
      }
      previous = time;
    }
  }
  return ordered;
}

function toContextBar(symbol: string, market: Market, bar: StrategyBookBar): IntradayBar {
  return {
    id: `${symbol}-${bar.ts.getTime()}`,
    symbol,
    market,
    ts: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    session: 'REGULAR',
    source: bar.source,
    createdAt: bar.ts,
  } as IntradayBar;
}

function positionSnapshots(positions: ReadonlyMap<string, OpenPosition>): StrategyBookPosition[] {
  return Array.from(positions.values())
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map((position) => ({
      symbol: position.symbol,
      qty: position.qty,
      price: position.markPrice,
      entryPrice: position.entryPrice,
      entryTs: position.entryTs,
      entrySignalTs: position.entrySignalTs,
    }));
}

function positionValue(positions: ReadonlyMap<string, OpenPosition>): Prisma.Decimal {
  return Array.from(positions.values()).reduce(
    (sum, position) => sum.plus(position.qty.mul(position.markPrice)),
    new D(0),
  );
}

function portfolioState(
  cash: Prisma.Decimal,
  positions: ReadonlyMap<string, OpenPosition>,
  peakNav: Prisma.Decimal,
): PortfolioState {
  const snapshots = positionSnapshots(positions);
  return {
    cash,
    equity: cash.plus(snapshots.reduce((sum, position) => sum.plus(position.qty.mul(position.price)), new D(0))),
    positions: snapshots.map(({ symbol, qty, price }) => ({ symbol, qty, price })),
    peakEquity: peakNav,
  };
}

function bookContext(
  series: StrategyBookSeries,
  bars: readonly IntradayBar[],
  asOf: Date,
  position: OpenPosition | undefined,
  replayScope?: object,
): StrategyPointInTimeContext {
  assertNoLookahead(bars, asOf, 'ts');
  return {
    symbol: series.symbol,
    market: series.market,
    asOf,
    bars,
    snapshot: null,
    positionQty: position?.qty ?? new D(0),
    replayScope,
    entryPrice: position?.entryPrice ?? null,
    entryTs: position?.entryTs ?? null,
    entrySignalTs: position?.entrySignalTs ?? null,
  };
}

/**
 * Pure daily strategy-book simulation. Decisions use bars through close t; fills occur at each
 * symbol's next open. At a shared open, exits run before entries and symbols are always ascending.
 */
export function simulateStrategyBook<Params>(input: StrategyBookInput<Params>): StrategyBookResult {
  if (input.setup.cadence !== 'daily') throw new Error('Strategy-book engine accepts daily setups only');
  if (input.startingCash.lte(0)) throw new Error('Strategy-book starting cash must be positive');
  if (input.policy) {
    const hasVolLookback = input.policy.realizedVolLookback !== undefined;
    const hasVolTarget = input.policy.targetAnnualVol !== undefined;
    if (hasVolLookback !== hasVolTarget) {
      throw new Error('Strategy-book volatility policy requires both realizedVolLookback and targetAnnualVol');
    }
    if ((hasVolLookback && (
      !Number.isInteger(input.policy.realizedVolLookback) || input.policy.realizedVolLookback! <= 0
      || !Number.isFinite(input.policy.targetAnnualVol) || input.policy.targetAnnualVol! <= 0
    )) || !Number.isInteger(input.policy.maxOpenPositions) || input.policy.maxOpenPositions <= 0
      || (input.policy.decisionHistoryBars !== undefined
        && (!Number.isInteger(input.policy.decisionHistoryBars) || input.policy.decisionHistoryBars <= 0))) {
      throw new Error('Strategy-book policy parameters must be positive');
    }
    if (input.policy.maxGrossFraction !== undefined && (
      !Number.isFinite(input.policy.maxGrossFraction)
      || input.policy.maxGrossFraction <= 0
      || input.policy.maxGrossFraction > 1
    )) throw new Error('Strategy-book maxGrossFraction must be in (0, 1]');
  }
  const series = validateSeries(input.series);
  const bySymbol = new Map(series.map((item) => [item.symbol, item]));
  const contextBarsBySymbol = new Map(series.map((item) => [
    item.symbol,
    item.bars.map((bar) => toContextBar(item.symbol, item.market, bar)),
  ]));
  // A wide FULL run carries >1M bars. Never materialize them again as a flat array or as
  // `${symbol}:${timestamp}` strings: the frozen plateau replays this engine nine times and the
  // transient maps exceed V8's default heap. The union calendar is small (~2k trading dates), and
  // one monotonic cursor per symbol provides the same exact lookup with O(symbols) retained state.
  const dateSet = new Set<number>();
  for (const item of series) {
    for (const bar of item.bars) dateSet.add(bar.ts.getTime());
  }
  for (const date of input.calendar ?? []) {
    const time = date.getTime();
    if (!Number.isFinite(time)) throw new Error('Strategy-book calendar contains an invalid date');
    dateSet.add(time);
  }
  const dates = Array.from(dateSet).sort((a, b) => a - b);
  const cursorBySymbol = new Map(series.map((item) => [item.symbol, -1]));

  let cash = input.startingCash;
  let peakNav = input.startingCash;
  let turnoverNotional = new D(0);
  const positions = new Map<string, OpenPosition>();
  const pending = new Map<string, PendingOrder>();
  const daily: StrategyBookDailyPoint[] = [];
  const fills: StrategyBookFill[] = [];
  const riskChecks: StrategyBookRiskCheck[] = [];
  const tradeReturns: number[] = [];
  const tradeRecords: TradeRecord[] = [];
  let decisionWindows = 0;

  const recordFill = (
    order: PendingDirectionalOrder,
    qty: Prisma.Decimal,
    fillPrice: Prisma.Decimal,
    envelope: EnvelopeResult,
  ) => {
    const positionsValueAfter = positionValue(positions);
    fills.push({
      ts: new Date(order.fillTs), signalTs: order.signalTs, symbol: order.symbol,
      action: order.action, qty, fillPrice, cashAfter: cash,
      positionsValueAfter, navAfter: cash.plus(positionsValueAfter),
      positionsAfter: positionSnapshots(positions), envelope,
    });
  };

  for (const time of dates) {
    const date = new Date(time);
    const todaysBars = new Map<string, StrategyBookBar>();
    const todayIndexes = new Map<string, number>();
    for (const item of series) {
      let index = cursorBySymbol.get(item.symbol)!;
      while (index + 1 < item.bars.length && item.bars[index + 1].ts.getTime() <= time) index++;
      cursorBySymbol.set(item.symbol, index);
      if (index >= 0 && item.bars[index].ts.getTime() === time) {
        todaysBars.set(item.symbol, item.bars[index]);
        todayIndexes.set(item.symbol, index);
      }
    }

    // Open marks are the only prices known at the instant pending orders fill.
    for (const [symbol, bar] of Array.from(todaysBars.entries())) {
      const position = positions.get(symbol);
      if (position) position.markPrice = bar.open;
    }

    const due = Array.from(pending.values())
      .filter((order) => order.fillTs.getTime() === time)
      .sort((a, b) => a.symbol.localeCompare(b.symbol));

    for (const order of due) pending.delete(order.symbol);
    const targetOrders = due.filter((order): order is PendingTargetOrder => order.action === 'TARGET');
    const targetWeightSum = targetOrders.reduce((sum, order) => sum + order.targetWeight, 0);
    if (targetWeightSum > 1 + 1e-12) {
      throw new Error(`Strategy-book target weights exceed 100%: ${targetWeightSum}`);
    }
    const targetNav = cash.plus(positionValue(positions));
    const executable: PendingDirectionalOrder[] = due.flatMap((order) => {
      if (order.action !== 'TARGET') return [order];
      const bar = todaysBars.get(order.symbol)!;
      const currentValue = positions.get(order.symbol)?.qty.mul(bar.open) ?? new D(0);
      const desiredValue = targetNav.mul(order.targetWeight);
      const delta = desiredValue.minus(currentValue);
      if (delta.abs().lte('0.00000001')) return [];
      return [{
        action: delta.gt(0) ? 'BUY' as const : 'SELL' as const,
        symbol: order.symbol,
        signalTs: order.signalTs,
        fillTs: order.fillTs,
        proposalQty: delta.abs().div(bar.open),
        atr: order.atr,
        adv: order.adv,
        grossExposureScalar: order.grossExposureScalar,
        fromTarget: true,
      }];
    });

    // Shared-open ordering is binding: cash from all exits is available to canonical entries.
    for (const action of ['SELL', 'BUY'] as const) {
      for (const order of executable.filter((candidate) => candidate.action === action)) {
        const bar = todaysBars.get(order.symbol)!;
        const pf = portfolioState(cash, positions, peakNav);
        riskChecks.push({
          ts: date, symbol: order.symbol, action,
          positionsSeen: pf.positions.map((position) => position.symbol),
        });
        const market: MarketState = {
          symbol: order.symbol,
          price: bar.open,
          atr: order.atr,
          adv: order.adv,
          stopPrice: bar.open.minus(order.atr.mul(2)),
        };
        const baseLimits = input.policy ? {
          ...input.limits,
          maxOpenPositions: input.policy.maxOpenPositions,
          maxGrossExposure: Math.min(input.limits.maxGrossExposure, order.grossExposureScalar),
        } : input.limits;
        // A deterministic target-weight rebalance sizes exposure through its own weights (summed
        // ≤ 100%, per-name capped); the discretionary drawdown breaker — a control for opportunistic
        // single-name entries — must NOT gate it. If it did, blocked buys alongside still-firing
        // target-driven sells ratchet the book one-way into cash, and once flat the drawdown never
        // falls back below the halt (peakNav frozen) so the breaker locks on forever (a deadlock:
        // FULL 2018+ wide book, 30%+ 2022 drawdown → permanent cash). Every other cap still applies.
        const effectiveLimits = order.fromTarget
          ? { ...baseLimits, drawdownHaltPct: Number.POSITIVE_INFINITY }
          : baseLimits;
        const executionPrice = action === 'SELL'
          ? bar.open.minus(bar.open.mul(BOOK_SLIPPAGE_BPS).div(BOOK_BPS)).minus(bar.open.mul(BOOK_COMMISSION_BPS).div(BOOK_BPS))
          : bar.open.plus(bar.open.mul(BOOK_SLIPPAGE_BPS).div(BOOK_BPS)).plus(bar.open.mul(BOOK_COMMISSION_BPS).div(BOOK_BPS));
        let proposalQty = order.proposalQty;
        if (order.targetGrossFraction !== undefined) {
          const target = new D(order.targetGrossFraction);
          const gross = positionValue(positions);
          if (action === 'BUY') {
            const room = pf.equity.mul(target).minus(gross);
            const executionCostPerShare = executionPrice.minus(bar.open);
            const denominator = bar.open.plus(target.mul(executionCostPerShare));
            const fillAwareCap = room.gt(0) && denominator.gt(0) ? room.div(denominator) : new D(0);
            proposalQty = bookMin(proposalQty, fillAwareCap);
          } else {
            const excess = gross.minus(pf.equity.mul(target));
            if (excess.gt(0)) {
              const executionLossFraction = new D(1).minus(executionPrice.div(bar.open));
              const denominator = new D(1).minus(target.mul(executionLossFraction));
              const requiredQty = denominator.gt(0) ? excess.div(denominator).div(bar.open) : new D(0);
              if (requiredQty.gt(proposalQty)) proposalQty = requiredQty;
            }
          }
        }
        const envelope = applyEnvelope({ action, qty: proposalQty }, pf, market, effectiveLimits, false);
        if (envelope.action !== action || envelope.qty.lte(0)) continue;

        const advCap = bar.volume.mul(new D(input.limits.liquidityAdvFraction));
        let qty = bookMin(envelope.qty, advCap);
        if (action === 'SELL') {
          const position = positions.get(order.symbol);
          if (!position) continue;
          qty = bookMin(qty, position.qty);
          if (qty.lte(0)) continue;
          const fillPrice = executionPrice;
          const proceeds = qty.mul(fillPrice);
          cash = cash.plus(proceeds);
          turnoverNotional = turnoverNotional.plus(proceeds);
          const ret = fillPrice.minus(position.entryPrice).div(position.entryPrice);
          tradeReturns.push(Number(ret.toString()));
          tradeRecords.push({
            entryTs: position.entryTs, exitTs: date, qty: Number(qty.toString()),
            entryPrice: Number(position.entryPrice.toString()), exitPrice: Number(fillPrice.toString()),
            ret: Number(ret.toString()), reason: 'strategy_exit', partial: qty.lt(position.qty),
          });
          position.qty = position.qty.minus(qty);
          if (position.qty.lte(0)) positions.delete(order.symbol);
          recordFill(order, qty, fillPrice, envelope);
        } else {
          const fillPrice = executionPrice;
          // Round affordability DOWN so Decimal division precision can never overspend by a tail unit.
          qty = bookMin(qty, cash.div(fillPrice).toDecimalPlaces(12, D.ROUND_DOWN));
          if (qty.lte(0)) continue;
          const notional = qty.mul(fillPrice);
          cash = cash.minus(notional);
          if (cash.lt(0)) throw new Error('Strategy-book invariant violated: negative cash');
          turnoverNotional = turnoverNotional.plus(notional);
          const existing = positions.get(order.symbol);
          if (existing) {
            const totalQty = existing.qty.plus(qty);
            existing.entryPrice = existing.entryPrice.mul(existing.qty).plus(fillPrice.mul(qty)).div(totalQty);
            existing.qty = totalQty;
            existing.markPrice = bar.open;
          } else {
            positions.set(order.symbol, {
              symbol: order.symbol, qty, markPrice: bar.open, entryPrice: fillPrice,
              entryTs: date, entrySignalTs: order.signalTs,
            });
          }
          recordFill(order, qty, fillPrice, envelope);
        }
      }
    }

    // Close marks precede decisions; no future bar is ever present in a setup context.
    for (const [symbol, bar] of Array.from(todaysBars.entries())) {
      const position = positions.get(symbol);
      if (position) position.markPrice = bar.close;
    }

    const closePositionsValue = positionValue(positions);
    const closeNav = cash.plus(closePositionsValue);
    const navHistory = input.policy?.realizedVolLookback
      ? [...daily.slice(-input.policy.realizedVolLookback).map((point) => point.nav), closeNav]
      : [];
    const realizedVolAnnual = input.policy?.realizedVolLookback
      ? trailingBasketAnnualVol(navHistory, input.policy.realizedVolLookback)
      : null;
    const grossExposureScalar = input.policy
      ? strategyBookExposureScalar(realizedVolAnnual, input.policy.targetAnnualVol, input.policy.maxGrossFraction)
      : 1;

    // A falling cap actively de-risks the held book at next open; it never waits for new entries.
    if (input.policy && closePositionsValue.gt(closeNav.mul(grossExposureScalar))) {
      const keepFraction = closeNav.mul(grossExposureScalar).div(closePositionsValue);
      for (const position of Array.from(positions.values()).sort((a, b) => a.symbol.localeCompare(b.symbol))) {
        const item = bySymbol.get(position.symbol)!;
        const index = todayIndexes.get(item.symbol);
        if (index === undefined || index >= item.bars.length - 1) continue;
        const slice = item.bars.slice(0, index + 1);
        pending.set(item.symbol, {
          action: 'SELL', symbol: item.symbol, signalTs: date, fillTs: item.bars[index + 1].ts,
          proposalQty: position.qty.mul(new D(1).minus(keepFraction)),
          atr: bookAtr(slice), adv: bookAvgVolume(slice), grossExposureScalar,
          ...(input.policy.maxGrossFraction !== undefined ? { targetGrossFraction: grossExposureScalar } : {}),
        });
      }
    }

    for (const item of series) {
      const index = todayIndexes.get(item.symbol);
      if (index === undefined || index >= item.bars.length - 1) continue;
      const sliceStart = input.policy?.decisionHistoryBars
        ? Math.max(0, index + 1 - input.policy.decisionHistoryBars)
        : 0;
      const slice = item.bars.slice(sliceStart, index + 1);
      const position = positions.get(item.symbol);
      const ctx = bookContext(
        item,
        contextBarsBySymbol.get(item.symbol)!.slice(sliceStart, index + 1),
        date,
        position,
        input.replayScope,
      );
      decisionWindows++;
      const next = item.bars[index + 1];
      if (input.setup.targetWeight) {
        const targetWeight = input.setup.targetWeight(ctx, input.params);
        if (targetWeight !== null) {
          if (!Number.isFinite(targetWeight) || targetWeight < 0 || targetWeight > 1) {
            throw new Error(`${input.setup.id} emitted invalid target weight for ${item.symbol}`);
          }
          pending.set(item.symbol, {
            action: 'TARGET', symbol: item.symbol, signalTs: date, fillTs: next.ts,
            targetWeight, atr: bookAtr(slice), adv: bookAvgVolume(slice), grossExposureScalar,
          });
        }
        continue;
      }
      if (position) {
        const check = input.setup.exit(ctx, input.params);
        if (check.matched) {
          pending.set(item.symbol, {
            action: 'SELL', symbol: item.symbol, signalTs: date, fillTs: next.ts,
            proposalQty: position.qty, atr: bookAtr(slice), adv: bookAvgVolume(slice), grossExposureScalar,
          });
        }
      } else {
        const check = input.setup.entry(ctx, input.params);
        if (check.matched) {
          const nav = cash.plus(positionValue(positions));
          const fraction = typeof check.sizeFraction === 'number' && Number.isFinite(check.sizeFraction)
            ? Math.max(0, Math.min(1, check.sizeFraction))
            : 1;
          const proposalQty = item.bars[index].close.gt(0)
            ? nav.mul(new D(fraction)).div(item.bars[index].close)
            : new D(0);
          pending.set(item.symbol, {
            action: 'BUY', symbol: item.symbol, signalTs: date, fillTs: next.ts,
            proposalQty, atr: bookAtr(slice), adv: bookAvgVolume(slice), grossExposureScalar,
            ...(input.policy?.maxGrossFraction !== undefined ? { targetGrossFraction: grossExposureScalar } : {}),
          });
        }
      }
    }

    const positionsValue = positionValue(positions);
    const nav = cash.plus(positionsValue);
    if (nav.gt(peakNav)) peakNav = nav;
    const drawdown = peakNav.gt(0) ? new D(1).minus(nav.div(peakNav)) : new D(0);
    daily.push({
      ts: date, cash, positionsValue, nav, peakNav, drawdown,
      realizedVolAnnual, grossExposureScalar,
      positions: positionSnapshots(positions),
    });
  }

  return {
    daily, fills, riskChecks, tradeReturns, tradeRecords, turnoverNotional,
    barsProcessed: series.reduce((sum, item) => sum + item.bars.length, 0), decisionWindows,
  };
}
