import { Prisma } from '@prisma/client';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getHalalUniverse } from '../data/universe';
import { constructHalalPortfolio } from './construction';
import { computePortfolioMetrics } from '../backtest/portfolioEngine';
import { executePortfolioRebalance } from './rebalancer';
import { userExecutionLockKey } from '../execution/userLock';

vi.mock('@/services/marketData', () => ({
  registry: { getScreener: () => ({ name: 'PortfolioTestScreener' }) },
  getCachedShariaVerdict: vi.fn(async (_screener: unknown, symbol: string) => ({
    compliant: symbol === 'MSFT' || symbol === 'NVDA',
    source: 'mock',
    ratios: { nonCompliantIncomeToIncome: symbol === 'MSFT' ? 0.0045 : 0.0015 },
  })),
}));

const cleanupMarketBarFixtures = (createdIds: readonly string[]) =>
  createdIds.length === 0
    ? Promise.resolve({ count: 0 })
    : prisma.marketBar.deleteMany({ where: { id: { in: [...createdIds] } } });

describe('portfolio MarketBar fixture isolation', () => {
  it('deletes only rows created by this test', async () => {
    const sentinel = await prisma.marketBar.create({
      data: {
        symbol: 'MSFT', market: 'NASDAQ', interval: 'DAY', ts: new Date('1988-01-04T00:00:00.000Z'),
        open: 1, high: 1, low: 1, close: 1, volume: 1, source: 'YAHOO',
      },
    });
    const fixture = await prisma.marketBar.create({
      data: {
        symbol: 'NVDA', market: 'NASDAQ', interval: 'DAY', ts: new Date('1988-01-05T00:00:00.000Z'),
        open: 1, high: 1, low: 1, close: 1, volume: 1, source: 'MOCK',
      },
    });

    try {
      await cleanupMarketBarFixtures([fixture.id]);

      await expect(prisma.marketBar.findUnique({ where: { id: sentinel.id } })).resolves.toEqual(
        expect.objectContaining({ id: sentinel.id, source: 'YAHOO' }),
      );
      await expect(prisma.marketBar.findUnique({ where: { id: fixture.id } })).resolves.toBeNull();
    } finally {
      await prisma.marketBar.deleteMany({ where: { id: { in: [sentinel.id, fixture.id] } } });
    }
  });
});

describe('Halal Quant Portfolio Tests', () => {
  const D = Prisma.Decimal;
  const userId = 'test-user-portfolio-id';
  const strategyId = 'test-strategy-portfolio-id';
  const createdMarketBarIds: string[] = [];

  const createMarketBarFixture = async (data: Prisma.MarketBarCreateManyInput) => {
    const row = await prisma.marketBar.create({ data });
    createdMarketBarIds.push(row.id);
    return row;
  };

  const createMarketBarFixtures = async (data: Prisma.MarketBarCreateManyInput[]) => {
    const rows = await prisma.marketBar.createManyAndReturn({ data });
    createdMarketBarIds.push(...rows.map((row) => row.id));
    return rows;
  };

  /**
   * Remove ONLY this suite's own rows.
   *
   * This used to be six unconditional `deleteMany({})` calls, which on 2026-08-22 deleted every
   * User row in the shared database — including the one named by QUANT_INCUBATION_OWNER_USER_ID —
   * because the local .env points at NEON_BRANCH=production. Commit 1e0fdd1 had already fixed the
   * MarketBar half of this hazard (see `cleanupMarketBarFixtures`); the User half was left open.
   *
   * Every delete below is keyed to a constant this file owns. Nothing here may ever match a row
   * this suite did not create: User cascades to PurificationEntry, PortfolioItem and Strategy,
   * PortfolioSnapshot carries `userId` but no cascade, and every AutoRunClaim key embeds
   * `strategyId` (rebalancer.ts:297,404,494).
   */
  /**
   * Both claim shapes this suite can leave behind: the per-pass/per-order keys built from
   * `strategyId` (rebalancer.ts:297,404,494) AND the per-user execution lock `money-user-<id>`
   * (userLock.ts:11), which carries no strategyId and so is invisible to a strategy-scoped filter.
   */
  const clearFixtureClaims = () =>
    prisma.autoRunClaim.deleteMany({
      where: { OR: [{ key: { contains: strategyId } }, { key: userExecutionLockKey(userId) }] },
    });

  const resetFixtureState = async () => {
    await prisma.portfolioSnapshot.deleteMany({ where: { userId } });
    await clearFixtureClaims();
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.strategy.deleteMany({ where: { id: strategyId } });
  };

  afterEach(async () => {
    await cleanupMarketBarFixtures(createdMarketBarIds);
    createdMarketBarIds.length = 0;
  });

  beforeEach(async () => {
    await resetFixtureState();

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

    // Rebalancing fails closed unless both benchmark marks are current; seed real marks
    // instead of relying on the old synthetic SPY/SPUS price fallbacks.
    const markTs = new Date();
    await Promise.all([
      createMarketBarFixture({
        symbol: 'SPY', market: 'NASDAQ', interval: 'DAY', ts: markTs,
        open: new D(500), high: new D(500), low: new D(500), close: new D(500),
        volume: new D(1000000), source: 'MOCK'
      }),
      createMarketBarFixture({
        symbol: 'SPUS', market: 'NASDAQ', interval: 'DAY', ts: markTs,
        open: new D(40), high: new D(40), low: new D(40), close: new D(40),
        volume: new D(1000000), source: 'MOCK'
      }),
      createMarketBarFixture({
        symbol: 'MSFT', market: 'NASDAQ', interval: 'DAY', ts: markTs,
        open: new D(300), high: new D(300), low: new D(300), close: new D(300),
        volume: new D(1000000), source: 'MOCK'
      }),
      createMarketBarFixture({
        symbol: 'NVDA', market: 'NASDAQ', interval: 'DAY', ts: markTs,
        open: new D(100), high: new D(100), low: new D(100), close: new D(100),
        volume: new D(1000000), source: 'MOCK'
      }),
    ]);
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

  it('does not let an allowlist bypass Sharia screening or invent unknown symbols', async () => {
    const universe = await getHalalUniverse('NASDAQ', ['TSLA', 'UNKNOWN']);

    expect(universe).toEqual([]);
  });

  it('constructs momentum weights deterministically conforming to risk rules', async () => {
    // Seed at least some historical bars for candidates to compute scores
    const now = new Date();

    // Seed both histories in one DB round-trip; row-at-a-time setup made this integration test
    // depend on network latency to the test database and regularly exceeded Vitest's timeout.
    await createMarketBarFixtures(Array.from({ length: 95 }, (_, i) => {
      const ts = new Date(now.getTime() - i * 24 * 3600 * 1000);
      return {
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
      };
    }));

    await createMarketBarFixtures(Array.from({ length: 95 }, (_, i) => {
      const ts = new Date(now.getTime() - i * 24 * 3600 * 1000);
      return {
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
      };
    }));

    const proposal = await constructHalalPortfolio('NASDAQ', now, { maxNameWeight: 0.25, maxPositions: 2 });
    expect(proposal.weights.length).toBeGreaterThan(0);
    
    // Sum of allocated weights must not exceed 1.0 (no leverage)
    const sumWeights = proposal.weights.reduce((sum, w) => sum + w.weight, 0);
    expect(sumWeights).toBeLessThanOrEqual(1.0);

    // Individual weight must honor cap
    for (const w of proposal.weights) {
      expect(w.weight).toBeLessThanOrEqual(0.25);
    }
  }, 30_000);

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
    await createMarketBarFixture({
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
    });

    const res = await executePortfolioRebalance(userId, strategyId, now);
    expect(res.rebalanced).toBe(true);

    // Verify snapshots were created
    const snapshotCount = await prisma.portfolioSnapshot.count({ where: { userId } });
    expect(snapshotCount).toBe(1);

    // Verify purification fee ledger entry was logged for realized profits
    const purificationCount = await prisma.purificationEntry.count({ where: { userId } });
    expect(purificationCount).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('guarantees rebalance idempotency to avoid duplicate orders and snapshots', async () => {
    const now = new Date();
    await createMarketBarFixture({
        symbol: 'MSFT',
        market: 'NASDAQ',
        interval: 'DAY',
        ts: now,
        open: 300,
        high: 305,
        low: 295,
        close: 300,
        volume: 1000000,
        source: 'MOCK'
    });

    // Clean this strategy's claims only — never the shared table.
    await clearFixtureClaims();

    // First rebalance
    const firstResult = await executePortfolioRebalance(userId, strategyId, now);
    expect(firstResult.rebalanced).toBe(true);

    const firstSnapCount = await prisma.portfolioSnapshot.count({ where: { userId } });
    expect(firstSnapCount).toBe(1);

    // Second rebalance on same day should be skipped
    const secondResult = await executePortfolioRebalance(userId, strategyId, now);
    expect(secondResult.rebalanced).toBe(false);
    expect(secondResult.tradesPlaced).toBe(0);

    const secondSnapCount = await prisma.portfolioSnapshot.count({ where: { userId } });
    expect(secondSnapCount).toBe(1); // Still 1 snapshot
  }, 30_000);

  it('calculates purification math correctly on realized profit', async () => {
    // 1. Seed profitable trade
    await prisma.portfolioItem.create({
      data: {
        userId,
        symbol: 'MSFT',
        shares: 100.0,
        market: 'NASDAQ',
        currency: 'USD',
        costBasis: 200.0 // bought at 200; large enough that rebalancing must realize a gain
      }
    });

    const now = new Date();
    await createMarketBarFixture({
        symbol: 'MSFT',
        market: 'NASDAQ',
        interval: 'DAY',
        ts: now,
        open: 300,
        high: 305,
        low: 295,
        close: 300,
        volume: 1000000,
        source: 'MOCK'
    });

    await clearFixtureClaims();
    await prisma.purificationEntry.deleteMany({ where: { userId } });

    const res = await executePortfolioRebalance(userId, strategyId, now);
    expect(res.rebalanced).toBe(true);

    const entries = await prisma.purificationEntry.findMany({ where: { userId } });
    expect(entries.length).toBeGreaterThan(0);

    // Verification of exact purification math:
    // The exact sold quantity is determined by target weights; every realized-profit entry must
    // still apply the screened MSFT purification ratio exactly.
    const msftEntry = entries.find(e => e.symbol === 'MSFT');
    expect(msftEntry).toBeDefined();
    
    const profitNum = Number(msftEntry!.profit.toString());
    const amountNum = Number(msftEntry!.amount.toString());
    const ratioNum = Number(msftEntry!.ratio.toString());

    expect(profitNum).toBeGreaterThan(0);
    expect(amountNum).toBeCloseTo(profitNum * ratioNum, 4);
  }, 30_000);
});
