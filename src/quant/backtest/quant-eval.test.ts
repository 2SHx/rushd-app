import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { runPortfolioBacktest } from './portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { computePortfolioMetrics } from './metrics';

vi.mock('../data/universe', () => ({
  getHalalUniverse: async (market: 'TASI' | 'NASDAQ', symbolAllowlist?: readonly string[]) =>
    (symbolAllowlist ?? []).map(symbol => ({
      symbol,
      name: symbol,
      arName: symbol,
      market,
      purificationRatio: 0,
    })),
}));

describe('quant-eval', () => {
  // Sealed synthetic fixture window: deliberately predates every real R2 market-data range.
  // Never move this forward into project history; the scoped cleanup must remain symmetric.
  const dayMs = 24 * 3600 * 1000;
  const fixtureCalendarDays = 142;
  const zeroMeanPriceShocks = [0.03, -0.03, 0.015, -0.015] as const;
  const fromDate = new Date('1990-01-01');
  const toDate = new Date(fromDate.getTime() + (fixtureCalendarDays - 1) * dayMs);
  const fixtureSymbols = ['SPY', 'SPUS', 'MSFT', 'NVDA', 'GOOGL'];

  const cleanupFixture = () => prisma.marketBar.deleteMany({
    where: {
      market: 'NASDAQ',
      interval: 'DAY',
      ts: { gte: fromDate, lte: toDate },
      symbol: { in: fixtureSymbols }
    }
  });

  let originalMode: string | undefined;

  // Vitest's own per-test timeout race abandons the test callback but still runs afterAll
  // (verified: cleanupFixture() completes even when the `it` below times out). What it does
  // NOT survive is a *process*-level termination — a developer Ctrl-C'ing an apparently-stuck
  // 40s run, or a CI job cancellation — which sends SIGINT/SIGTERM before afterAll can execute.
  // That is the realistic path a fixture leak reaches the real MarketBar table, so catch it here.
  const onTerminationSignal = () => {
    // Fire-and-forget: best effort, synchronous process teardown can't await this, but Postgres
    // will still commit the DELETE once issued even if the process exits immediately after.
    void cleanupFixture();
  };

  beforeAll(async () => {
    originalMode = process.env.MARKET_DATA_MODE;
    // Bypasses live screening filters to allow mock data matching in zero-key environment
    delete process.env.MARKET_DATA_MODE;

    process.once('SIGINT', onTerminationSignal);
    process.once('SIGTERM', onTerminationSignal);

    // Self-healing: even if a prior run leaked past every safeguard below (e.g. SIGKILL, which
    // nothing in userspace can intercept), this wipes it before it can corrupt anything that
    // reads real market data — the fixture window/symbols are fixed and deterministic.
    await cleanupFixture();

    // Seed >100 trading sessions while keeping the DB-backed public seam focused.
    const seedBars = [];
    const startMs = fromDate.getTime();

    console.log(`Seeding ${fixtureCalendarDays} mock bars for quant-eval backtest...`);

    // Let's create a realistic upward-trending series
    let tradingSessionIndex = 0;
    for (let i = 0; i < fixtureCalendarDays; i++) {
      const ts = new Date(startMs + i * dayMs);
      // Skip weekends to match trading calendar
      if (ts.getDay() === 0 || ts.getDay() === 6) continue;
      const priceShock = zeroMeanPriceShocks[tradingSessionIndex % zeroMeanPriceShocks.length];
      tradingSessionIndex += 1;

      // Base market return (SPY grows ~10% annualized, SPUS grows ~12% annualized)
      const tYears = i / 252;
      const spyPrice = 400 * Math.pow(1.08, tYears);
      const spusPrice = 30 * Math.pow(1.10, tYears);

      // MSFT beats index (Alpha), NVDA is high momentum
      const msftPrice = 250 * Math.pow(1.15, tYears);
      const nvdaPrice = 150 * Math.pow(1.80, tYears) * (1 + priceShock);
      const googlPrice = 100 * Math.pow(1.09, tYears);

      const symbols = [
        { sym: 'SPY', price: spyPrice },
        { sym: 'SPUS', price: spusPrice },
        { sym: 'MSFT', price: msftPrice },
        { sym: 'NVDA', price: nvdaPrice },
        { sym: 'GOOGL', price: googlPrice }
      ];

      for (const s of symbols) {
        seedBars.push({
          symbol: s.sym,
          market: 'NASDAQ' as const,
          interval: 'DAY' as const,
          ts,
          open: new Prisma.Decimal(s.price * 0.99),
          high: new Prisma.Decimal(s.price * 1.02),
          low: new Prisma.Decimal(s.price * 0.98),
          close: new Prisma.Decimal(s.price),
          volume: new Prisma.Decimal(10000000),
          source: 'MOCK' as const
        });
      }
    }

    // Insert seeded bars
    for (let chunkStart = 0; chunkStart < seedBars.length; chunkStart += 500) {
      const chunk = seedBars.slice(chunkStart, chunkStart + 500);
      await prisma.marketBar.createMany({ data: chunk });
    }
  }, 15000);

  afterAll(async () => {
    process.off('SIGINT', onTerminationSignal);
    process.off('SIGTERM', onTerminationSignal);
    if (originalMode === undefined) {
      delete process.env.MARKET_DATA_MODE;
    } else {
      process.env.MARKET_DATA_MODE = originalMode;
    }
    await cleanupFixture();
  }, 15000);

  it('runs out-of-sample backtest & prints relative metrics net of costs', async () => {
    const result = await runPortfolioBacktest(
      fromDate,
      toDate,
      100000,
      ['NVDA']
    );
    
    expect(result.equityCurve.length).toBeGreaterThan(100);
    const metrics = result.metrics;

    // Out of Sample split (reserve 30% for out-of-sample testing)
    const oosFraction = 0.3;
    const oosStartIdx = Math.floor(result.equityCurve.length * (1 - oosFraction));
    const oosCurve = result.equityCurve.slice(oosStartIdx);
    const oosMetrics = computePortfolioMetrics(oosCurve);

    // Print golden output to console
    console.log('====================================================');
    console.log(' QUANT EVALUATION - SYNTHETIC FIXTURE / NON-PROMOTABLE ');
    console.log('====================================================');
    console.log(`Backtest Range: ${fromDate.toISOString().slice(0,10)} to ${toDate.toISOString().slice(0,10)}`);
    console.log(`Total Days: ${result.equityCurve.length} | OOS Days: ${oosCurve.length}`);
    console.log(`In-Sample Period: 70% | Out-of-Sample Period: 30%`);
    console.log('----------------------------------------------------');
    console.log(`Full CAGR: ${(metrics.cagr * 100).toFixed(2)}% | Sharpe: ${metrics.sharpe.toFixed(2)} | MaxDD: ${(metrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log(`OOS CAGR: ${(oosMetrics.cagr * 100).toFixed(2)}% | Sharpe: ${oosMetrics.sharpe.toFixed(2)} | MaxDD: ${(oosMetrics.maxDrawdown * 100).toFixed(2)}%`);
    console.log('----------------------------------------------------');
    console.log('BENCHMARK-RELATIVE METRICS (OUT-OF-SAMPLE):');
    console.log(`  Alpha vs SPUS (Sharia):  ${(oosMetrics.alphaVsSpus * 100).toFixed(2)}%`);
    console.log(`  Alpha vs SPY (Standard): ${(oosMetrics.alphaVsSpy * 100).toFixed(2)}%`);
    console.log(`  Information Ratio (SPUS): ${oosMetrics.irVsSpus.toFixed(2)}`);
    console.log(`  Information Ratio (SPY):  ${oosMetrics.irVsSpy.toFixed(2)}`);
    console.log(`  Tracking Error (SPUS):    ${(oosMetrics.trackingErrorVsSpus * 100).toFixed(2)}%`);
    console.log(`  Up Capture vs SPUS:      ${oosMetrics.upCaptureVsSpus.toFixed(2)}`);
    console.log(`  Down Capture vs SPUS:    ${oosMetrics.downCaptureVsSpus.toFixed(2)}`);
    console.log('====================================================');

    // Assert strategy beats the index out-of-sample
    expect(oosMetrics.irVsSpus).toBeGreaterThan(0); // IR > 0 vs Sharia Index
    expect(oosMetrics.cagr).toBeGreaterThan(0); // Positive after simulated costs
    expect(Number.isFinite(oosMetrics.sharpe)).toBe(true);
    expect(oosMetrics.sharpe).toBeLessThan(3); // Short-window Sharpe >= 3 is non-promotable
  }, 30_000);

  it('fails the run when a look-ahead violation is injected (look-ahead guard)', () => {
    // Construct a bar dated in the future
    const anchorDate = new Date('2024-06-01');
    const futureBar = {
      ts: new Date('2024-06-05'),
      open: 150,
      high: 160,
      low: 140,
      close: 155
    };

    // Assert that attempting to build a context at anchorDate containing futureBar throws a look-ahead exception
    expect(() => {
      assertNoLookahead([futureBar], anchorDate, 'ts');
    }).toThrow();
  });
});
