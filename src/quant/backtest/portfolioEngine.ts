import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constructHalalPortfolio } from '../portfolio/construction';
import {
  getNormalizedBenchmarks,
  type NormalizedBenchmarkPoint
} from '../data/benchmarks';
import { assertNoLookahead } from '../data/pointInTime';
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
