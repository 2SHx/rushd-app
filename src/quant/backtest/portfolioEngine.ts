import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { constructHalalPortfolio } from '../portfolio/construction';
import { getNormalizedBenchmarks } from '../data/benchmarks';
import { assertNoLookahead } from '../data/pointInTime';

const D = Prisma.Decimal;
const COMMISSION_BPS = 0.0010; // 0.10%
const SLIPPAGE_BPS = 0.0005; // 0.05%

export interface PortfolioEquityPoint {
  ts: Date;
  equity: number;
  cash: number;
  spy: number;
  spus: number;
}

export interface PortfolioBacktestMetrics {
  cagr: number;
  sharpe: number;
  maxDrawdown: number;
  alphaVsSpy: number;
  alphaVsSpus: number;
  irVsSpy: number;
  irVsSpus: number;
  trackingErrorVsSpy: number;
  trackingErrorVsSpus: number;
}

/** Helper to calculate standard deviation */
function stdDev(returns: number[]): number {
  if (returns.length < 2) return 0;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

/** Helper to compute backtest statistics */
export function computePortfolioMetrics(
  curve: PortfolioEquityPoint[]
): PortfolioBacktestMetrics {
  if (curve.length < 2) {
    return {
      cagr: 0, sharpe: 0, maxDrawdown: 0,
      alphaVsSpy: 0, alphaVsSpus: 0,
      irVsSpy: 0, irVsSpus: 0,
      trackingErrorVsSpy: 0, trackingErrorVsSpus: 0
    };
  }

  const first = curve[0];
  const last = curve[curve.length - 1];

  // Calculate CAGRs
  const years = (last.ts.getTime() - first.ts.getTime()) / (365 * 24 * 3600 * 1000) || 1;
  const cagr = Math.pow(last.equity / first.equity, 1 / years) - 1;
  const spyCagr = Math.pow(last.spy / first.spy, 1 / years) - 1;
  const spusCagr = Math.pow(last.spus / first.spus, 1 / years) - 1;

  // Daily returns
  const dailyReturns: number[] = [];
  const spyDailyReturns: number[] = [];
  const spusDailyReturns: number[] = [];
  
  const diffSpy: number[] = [];
  const diffSpus: number[] = [];

  for (let i = 1; i < curve.length; i++) {
    const r = (curve[i].equity - curve[i - 1].equity) / curve[i - 1].equity;
    const rSpy = (curve[i].spy - curve[i - 1].spy) / curve[i - 1].spy;
    const rSpus = (curve[i].spus - curve[i - 1].spus) / curve[i - 1].spus;

    dailyReturns.push(r);
    spyDailyReturns.push(rSpy);
    spusDailyReturns.push(rSpus);

    diffSpy.push(r - rSpy);
    diffSpus.push(r - rSpus);
  }

  // Sharpe Ratio (assuming risk free rate = 0)
  const avgRet = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
  const dailyVol = stdDev(dailyReturns);
  const sharpe = dailyVol > 0 ? (avgRet / dailyVol) * Math.sqrt(252) : 0;

  // Maximum Drawdown
  let maxDd = 0;
  let peak = 0;
  for (const pt of curve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak > 0 ? (peak - pt.equity) / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  // Alpha vs Benchmarks (Simple excess return approximation for the dashboard)
  const alphaVsSpy = cagr - spyCagr;
  const alphaVsSpus = cagr - spusCagr;

  // Tracking Error (annualized stdDev of active returns)
  const spyTe = stdDev(diffSpy) * Math.sqrt(252);
  const spusTe = stdDev(diffSpus) * Math.sqrt(252);

  // Information Ratio
  const irVsSpy = spyTe > 0 ? alphaVsSpy / spyTe : 0;
  const irVsSpus = spusTe > 0 ? alphaVsSpus / spusTe : 0;

  return {
    cagr,
    sharpe,
    maxDrawdown: maxDd,
    alphaVsSpy,
    alphaVsSpus,
    irVsSpy,
    irVsSpus,
    trackingErrorVsSpy: spyTe,
    trackingErrorVsSpus: spusTe
  };
}

/**
 * Runs a cross-sectional halal portfolio backtest over a date range.
 * Simulates monthly rebalances.
 */
export async function runPortfolioBacktest(
  fromDate: Date,
  toDate: Date,
  startingCash = 100000
): Promise<{ equityCurve: PortfolioEquityPoint[]; metrics: PortfolioBacktestMetrics }> {
  // Query all daily bars in range for aligning dates
  const datesRow = await prisma.marketBar.findMany({
    where: {
      market: 'NASDAQ',
      interval: 'DAY',
      ts: { gte: fromDate, lte: toDate }
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
    const benchPoint = benchmarks.find(b => b.ts.getTime() === activeTime) || 
                      benchmarks[benchmarks.length - 1] || 
                      { spy: startingCash, spus: startingCash };

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
      const proposal = await constructHalalPortfolio('NASDAQ', date);
      
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
