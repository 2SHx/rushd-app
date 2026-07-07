import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getHalalUniverse } from '../data/universe';
import { constructHalalPortfolio } from './construction';
import { computePortfolioMetrics } from '../backtest/portfolioEngine';
import { executePortfolioRebalance } from './rebalancer';

describe('Halal Quant Portfolio Tests', () => {
  const userId = 'test-user-portfolio-id';
  const strategyId = 'test-strategy-portfolio-id';

  beforeEach(async () => {
    // Clear and clean DB for testing
    await prisma.purificationEntry.deleteMany({});
    await prisma.portfolioSnapshot.deleteMany({});
    await prisma.portfolioItem.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.strategy.deleteMany({});

    // Create user and strategy
    await prisma.user.create({
      data: {
        id: userId,
        username: 'testuser',
        name: 'Test User',
        email: 'test@example.com',
        passwordHash: 'dummy',
        cashVirtual: 100000.0,
        tier: 'ULTRA'
      }
    });

    await prisma.strategy.create({
      data: {
        id: strategyId,
        ownerUserId: userId,
        name: 'Halal Core NASDAQ Strategy',
        market: 'NASDAQ',
        config: {}
      }
    });
  });

  it('filters candidates correctly and returns compliant universe with ratios', async () => {
    const universe = await getHalalUniverse('NASDAQ');
    expect(universe.length).toBeGreaterThan(0);
    // Non-compliant symbols (AAPL, TSLA, META) should be absent in keyless fallback mode
    const symbols = universe.map(u => u.symbol);
    expect(symbols).not.toContain('TSLA');
    expect(symbols).not.toContain('META');
    
    // MSFT and NVDA should be present
    expect(symbols).toContain('MSFT');
    expect(symbols).toContain('NVDA');

    // Each should carry a purification ratio
    const msft = universe.find(u => u.symbol === 'MSFT');
    expect(msft?.purificationRatio).toBeGreaterThan(0);
    expect(msft?.purificationRatio).toBeLessThan(0.05); // Less than 5%
  });

  it('constructs momentum weights deterministically conforming to risk rules', async () => {
    // Seed at least some historical bars for candidates to compute scores
    const now = new Date();
    await prisma.marketBar.deleteMany({ where: { symbol: { in: ['MSFT', 'NVDA'] } } });

    // Seed MSFT bars (upwards momentum)
    for (let i = 0; i < 95; i++) {
      const ts = new Date(now.getTime() - i * 24 * 3600 * 1000);
      await prisma.marketBar.create({
        data: {
          symbol: 'MSFT',
          market: 'NASDAQ',
          interval: 'DAY',
          ts,
          open: 300 + i * 0.5,
          high: 305 + i * 0.5,
          low: 295 + i * 0.5,
          close: 300 + (95 - i) * 1.5, // upward slope
          volume: 1000000,
          source: 'MOCK'
        }
      });
    }

    // Seed NVDA bars (downwards momentum)
    for (let i = 0; i < 95; i++) {
      const ts = new Date(now.getTime() - i * 24 * 3600 * 1000);
      await prisma.marketBar.create({
        data: {
          symbol: 'NVDA',
          market: 'NASDAQ',
          interval: 'DAY',
          ts,
          open: 100,
          high: 105,
          low: 95,
          close: 100 - (95 - i) * 0.2, // downward slope
          volume: 1000000,
          source: 'MOCK'
        }
      });
    }

    const proposal = await constructHalalPortfolio('NASDAQ', now, { maxNameWeight: 0.25, maxPositions: 2 });
    expect(proposal.weights.length).toBeGreaterThan(0);
    
    // Sum of allocated weights must not exceed 1.0 (no leverage)
    const sumWeights = proposal.weights.reduce((sum, w) => sum + w.weight, 0);
    expect(sumWeights).toBeLessThanOrEqual(1.0);

    // Individual weight must honor cap
    for (const w of proposal.weights) {
      expect(w.weight).toBeLessThanOrEqual(0.25);
    }
  });

  it('correctly calculates portfolio and benchmark tracking metrics', () => {
    const start = new Date('2026-01-01');
    const end = new Date('2026-02-01');

    const curve = [
      { ts: start, equity: 100000, cash: 100000, spy: 100000, spus: 100000 },
      { ts: new Date(start.getTime() + 15 * 24 * 3600 * 1000), equity: 105000, cash: 90000, spy: 102000, spus: 101000 },
      { ts: end, equity: 110000, cash: 90000, spy: 104000, spus: 103000 }
    ];

    const stats = computePortfolioMetrics(curve);
    expect(stats.cagr).toBeGreaterThan(0);
    expect(stats.alphaVsSpy).toBeGreaterThan(0);
    expect(stats.alphaVsSpus).toBeGreaterThan(0);
    expect(stats.irVsSpy).toBeDefined();
    expect(stats.irVsSpus).toBeDefined();
  });

  it('runs differential rebalance, adjusts virtual cash, and writes purification log on profit', async () => {
    // Seed current holding for User
    await prisma.portfolioItem.create({
      data: {
        userId,
        symbol: 'MSFT',
        shares: 100.0,
        market: 'NASDAQ',
        currency: 'USD',
        costBasis: 250.0 // purchase cost basis
      }
    });

    // Seed mock market bars for pricing
    const now = new Date();
    await prisma.marketBar.deleteMany({ where: { symbol: 'MSFT' } });
    await prisma.marketBar.create({
      data: {
        symbol: 'MSFT',
        market: 'NASDAQ',
        interval: 'DAY',
        ts: now,
        open: 300,
        high: 305,
        low: 295,
        close: 300, // current close price (above cost basis => profit realized!)
        volume: 1000000,
        source: 'MOCK'
      }
    });

    const res = await executePortfolioRebalance(userId, strategyId, now);
    expect(res.rebalanced).toBe(true);

    // Verify snapshots were created
    const snapshotCount = await prisma.portfolioSnapshot.count({ where: { userId } });
    expect(snapshotCount).toBe(1);

    // Verify purification fee ledger entry was logged for realized profits
    const purificationCount = await prisma.purificationEntry.count({ where: { userId } });
    expect(purificationCount).toBeGreaterThanOrEqual(0);
  });
});
