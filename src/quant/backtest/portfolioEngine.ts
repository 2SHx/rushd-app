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
  /** Raw next-open reference; execution adapters reproduce the engine's cost/slippage from this. */
  readonly refPrice: Prisma.Decimal;
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
  /** Warm-up bars remain visible to the setup, but no paper positions/orders exist before this date. */
  readonly tradeFrom?: Date;
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
  /** Optional peak-to-trough governor: full exposure through `start`, linearly to cash at `cashAt`. */
  readonly drawdownStartFraction?: number;
  readonly drawdownCashFraction?: number;
  /** Strategy-declared bounded decision window; omitted means the full expanding history. */
  readonly decisionHistoryBars?: number;
  /**
   * Idle-capital ballast (R4-E8): sweep the book's residual/de-risked idle cash into this book
   * symbol at each open (same next-open fill, 15 bps/side cost, and ADV cap as any equity order),
   * instead of holding it flat in cash. The setup NEVER trades it; the engine liquidates it FIRST
   * (before equity entries; equity exits always run first) whenever sleeves need capital, and it is
   * EXCLUDED from the drawdown governor's risk exposure (near-cash ballast, never governor-trimmed).
   * Its bars must be present in the series; before its first bar idle capital fail-closes to cash.
   */
  readonly idleBallastSymbol?: string;
}

export interface StrategyBookResult {
  readonly daily: readonly StrategyBookDailyPoint[];
  readonly fills: readonly StrategyBookFill[];
  /** Engine-managed idle-ballast (idleBallastSymbol) fills — kept OUT of `fills`/tradeRecords so the
   * strategy's trade-attribution and validation samples measure only sleeve trades, never ballast. */
  readonly ballastFills: readonly StrategyBookFill[];
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

/** A-priori, down-only book-drawdown governor. It never increases another risk layer's exposure. */
export function drawdownExposureScalar(
  drawdown: number,
  startFraction: number,
  cashFraction: number,
): number {
  if (!Number.isFinite(drawdown) || drawdown <= startFraction) return 1;
  if (drawdown >= cashFraction) return 0;
  return (cashFraction - drawdown) / (cashFraction - startFraction);
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

/** Marked value of every position EXCEPT the idle ballast — the risk exposure the governor caps. */
function riskPositionValue(
  positions: ReadonlyMap<string, OpenPosition>,
  ballastSymbol: string | undefined,
): Prisma.Decimal {
  return Array.from(positions.values()).reduce(
    (sum, position) => (position.symbol === ballastSymbol ? sum : sum.plus(position.qty.mul(position.markPrice))),
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
  const tradeFromTime = input.tradeFrom?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (input.tradeFrom && !Number.isFinite(tradeFromTime)) {
    throw new Error('Strategy-book tradeFrom must be a valid date');
  }
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
    const hasDrawdownStart = input.policy.drawdownStartFraction !== undefined;
    const hasDrawdownCash = input.policy.drawdownCashFraction !== undefined;
    if (hasDrawdownStart !== hasDrawdownCash || (hasDrawdownStart && (
      !Number.isFinite(input.policy.drawdownStartFraction)
      || !Number.isFinite(input.policy.drawdownCashFraction)
      || input.policy.drawdownStartFraction! < 0
      || input.policy.drawdownCashFraction! <= input.policy.drawdownStartFraction!
      || input.policy.drawdownCashFraction! > 1
    ))) throw new Error('Strategy-book drawdown governor requires 0 <= start < cashAt <= 1');
  }
  const series = validateSeries(input.series);
  const bySymbol = new Map(series.map((item) => [item.symbol, item]));
  const ballastSymbol = input.policy?.idleBallastSymbol;
  if (ballastSymbol !== undefined) {
    if (ballastSymbol !== ballastSymbol.trim().toUpperCase()) {
      throw new Error(`Strategy-book idle ballast symbol must be canonical uppercase: ${ballastSymbol}`);
    }
    if (!bySymbol.has(ballastSymbol)) {
      throw new Error(`Strategy-book idle ballast ${ballastSymbol} must be present in the series`);
    }
  }
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
  const ballastFills: StrategyBookFill[] = [];
  const riskChecks: StrategyBookRiskCheck[] = [];
  const tradeReturns: number[] = [];
  const tradeRecords: TradeRecord[] = [];
  let decisionWindows = 0;

  const recordFill = (
    order: PendingDirectionalOrder,
    qty: Prisma.Decimal,
    refPrice: Prisma.Decimal,
    fillPrice: Prisma.Decimal,
    envelope: EnvelopeResult,
  ) => {
    const positionsValueAfter = positionValue(positions);
    fills.push({
      ts: new Date(order.fillTs), signalTs: order.signalTs, symbol: order.symbol,
      action: order.action, qty, refPrice, fillPrice, cashAfter: cash,
      positionsValueAfter, navAfter: cash.plus(positionsValueAfter),
      positionsAfter: positionSnapshots(positions), envelope,
    });
  };

  // Idle-ballast execution: same 15 bps/side cost and ADV cap as any equity order. These fills are
  // engine capital-parking, NOT strategy trades — they go to `ballastFills`, never `fills`/tradeRecords.
  const ballastFillPrice = (open: Prisma.Decimal, action: 'BUY' | 'SELL'): Prisma.Decimal => (
    action === 'SELL'
      ? open.minus(open.mul(BOOK_SLIPPAGE_BPS).div(BOOK_BPS)).minus(open.mul(BOOK_COMMISSION_BPS).div(BOOK_BPS))
      : open.plus(open.mul(BOOK_SLIPPAGE_BPS).div(BOOK_BPS)).plus(open.mul(BOOK_COMMISSION_BPS).div(BOOK_BPS))
  );
  const recordBallastFill = (
    action: 'BUY' | 'SELL', symbol: string, date: Date, qty: Prisma.Decimal,
    refPrice: Prisma.Decimal, fillPrice: Prisma.Decimal,
  ): void => {
    const positionsValueAfter = positionValue(positions);
    ballastFills.push({
      ts: new Date(date), signalTs: date, symbol, action, qty, refPrice, fillPrice,
      cashAfter: cash, positionsValueAfter, navAfter: cash.plus(positionsValueAfter),
      positionsAfter: positionSnapshots(positions),
      envelope: { action, qty, blocked: false, adjustments: ['idle_ballast_sweep'] } as EnvelopeResult,
    });
  };
  /** Sell ballast to raise ~`notionalTarget` of cash (delta only, ADV- and holding-clamped). */
  const sellBallast = (
    position: OpenPosition, bar: StrategyBookBar, notionalTarget: Prisma.Decimal, date: Date,
  ): void => {
    const fillPrice = ballastFillPrice(bar.open, 'SELL');
    const advCap = bar.volume.mul(new D(input.limits.liquidityAdvFraction));
    let qty = fillPrice.gt(0) ? notionalTarget.div(fillPrice) : new D(0);
    qty = bookMin(bookMin(qty, position.qty), advCap);
    if (qty.lte(0)) return;
    const proceeds = qty.mul(fillPrice);
    cash = cash.plus(proceeds);
    turnoverNotional = turnoverNotional.plus(proceeds);
    position.qty = position.qty.minus(qty);
    if (position.qty.lte(0)) positions.delete(position.symbol);
    recordBallastFill('SELL', position.symbol, date, qty, bar.open, fillPrice);
  };
  /** Sweep all remaining `cash` into ballast (delta buy, ADV-capped, affordability rounded DOWN). */
  const buyBallast = (symbol: string, bar: StrategyBookBar, date: Date): void => {
    const fillPrice = ballastFillPrice(bar.open, 'BUY');
    if (fillPrice.lte(0)) return;
    const advCap = bar.volume.mul(new D(input.limits.liquidityAdvFraction));
    let qty = cash.div(fillPrice).toDecimalPlaces(12, D.ROUND_DOWN);
    qty = bookMin(qty, advCap);
    if (qty.lte(0)) return;
    const notional = qty.mul(fillPrice);
    cash = cash.minus(notional);
    if (cash.lt(0)) throw new Error('Strategy-book invariant violated: negative cash (ballast sweep)');
    turnoverNotional = turnoverNotional.plus(notional);
    const existing = positions.get(symbol);
    if (existing) {
      const totalQty = existing.qty.plus(qty);
      existing.entryPrice = existing.entryPrice.mul(existing.qty).plus(fillPrice.mul(qty)).div(totalQty);
      existing.qty = totalQty;
      existing.markPrice = bar.open;
    } else {
      positions.set(symbol, {
        symbol, qty, markPrice: bar.open, entryPrice: fillPrice, entryTs: date, entrySignalTs: date,
      });
    }
    recordBallastFill('BUY', symbol, date, qty, bar.open, fillPrice);
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

    // Incubation replay uses the full real prehistory for indicators, while the isolated paper
    // book begins empty on its authorized inception date. Existing backtests omit tradeFrom.
    if (time < tradeFromTime) continue;

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
    const executeDirectional = (order: PendingDirectionalOrder): void => {
      {
        const action = order.action;
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
        if (envelope.action !== action || envelope.qty.lte(0)) return;

        const advCap = bar.volume.mul(new D(input.limits.liquidityAdvFraction));
        let qty = bookMin(envelope.qty, advCap);
        if (action === 'SELL') {
          const position = positions.get(order.symbol);
          if (!position) return;
          qty = bookMin(qty, position.qty);
          if (qty.lte(0)) return;
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
          recordFill(order, qty, bar.open, fillPrice, envelope);
        } else {
          const fillPrice = executionPrice;
          // Round affordability DOWN so Decimal division precision can never overspend by a tail unit.
          qty = bookMin(qty, cash.div(fillPrice).toDecimalPlaces(12, D.ROUND_DOWN));
          if (qty.lte(0)) return;
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
          recordFill(order, qty, bar.open, fillPrice, envelope);
        }
      }
    };

    // Equity exits/de-risk first (frees cash). Then, if entries need capital, the idle ballast is
    // SOLD FIRST to fund them. Then equity entries. Finally leftover idle cash sweeps into ballast.
    for (const order of executable.filter((candidate) => candidate.action === 'SELL')) {
      executeDirectional(order);
    }
    const ballastBar = ballastSymbol !== undefined ? todaysBars.get(ballastSymbol) : undefined;
    if (ballastSymbol !== undefined && ballastBar) {
      const ballastPos = positions.get(ballastSymbol);
      const desiredBuyNotional = executable
        .filter((candidate) => candidate.action === 'BUY')
        .reduce((sum, order) => sum.plus(order.proposalQty.mul(todaysBars.get(order.symbol)!.open)), new D(0));
      const shortfall = desiredBuyNotional.minus(cash);
      if (ballastPos && ballastPos.qty.gt(0) && shortfall.gt(0)) {
        sellBallast(ballastPos, ballastBar, shortfall, date);
      }
    }
    for (const order of executable.filter((candidate) => candidate.action === 'BUY')) {
      executeDirectional(order);
    }
    // Pre-inception (no ballast bar today) idle capital fail-closes to cash — the honest early regime.
    if (ballastSymbol !== undefined && ballastBar && cash.gt('0.00000001')) {
      buyBallast(ballastSymbol, ballastBar, date);
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
    const currentDrawdown = peakNav.gt(0)
      ? Number(new D(1).minus(closeNav.div(peakNav)).toString())
      : 0;
    const drawdownScalar = input.policy?.drawdownStartFraction !== undefined
      ? drawdownExposureScalar(
        Math.max(0, currentDrawdown),
        input.policy.drawdownStartFraction,
        input.policy.drawdownCashFraction!,
      )
      : 1;
    const grossExposureScalar = input.policy
      ? Math.min(
        strategyBookExposureScalar(realizedVolAnnual, input.policy.targetAnnualVol, input.policy.maxGrossFraction),
        drawdownScalar,
      )
      : 1;

    // The governor caps RISK exposure only — the idle ballast is near-cash and is never trimmed by
    // it (freed equity re-parks in ballast on the next sweep, which is the whole E8 substitution).
    const riskPositionsValue = riskPositionValue(positions, ballastSymbol);
    // A falling cap actively de-risks the held book at next open; it never waits for new entries.
    if (input.policy && riskPositionsValue.gt(closeNav.mul(grossExposureScalar))) {
      const keepFraction = closeNav.mul(grossExposureScalar).div(riskPositionsValue);
      for (const position of Array.from(positions.values()).sort((a, b) => a.symbol.localeCompare(b.symbol))) {
        if (position.symbol === ballastSymbol) continue;
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
      if (item.symbol === ballastSymbol) continue; // engine-managed ballast is never setup-traded
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
    daily, fills, ballastFills, riskChecks, tradeReturns, tradeRecords, turnoverNotional,
    barsProcessed: series.reduce((sum, item) => sum + item.bars.length, 0), decisionWindows,
  };
}
