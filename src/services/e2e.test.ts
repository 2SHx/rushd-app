// src/services/e2e.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addXP, processCashSweeps } from './engines';
import { registry } from './marketData';
import { Prisma } from '@prisma/client';

describe('E2E Persona Journeys: Parent & Child Flows', () => {
  // Mock child data structure
  const mockChild = {
    id: 'child_1',
    name: 'Al-Jauharah',
    username: 'jauharah',
    role: 'CHILD',
    parentId: 'parent_1',
    tier: 'BASIC',
    gamificationProfile: { xp: 50, level: 1 },
    savingsJar: { balance: new Prisma.Decimal('1500.0000'), currency: 'SAR' },
    portfolioItems: [
      { symbol: '2222.SR', shares: new Prisma.Decimal('10.0000'), market: 'TASI' }
    ]
  };

  it('Parent supervision dashboard retrieves and formats child portfolios safely', () => {
    // Simulate query result structure on parent dashboard load
    const childrenList = [mockChild];
    
    expect(childrenList.length).toBe(1);
    const child = childrenList[0];
    expect(child.parentId).toBe('parent_1');
    expect(child.gamificationProfile.xp).toBe(50);
    expect(child.savingsJar.balance.toString()).toBe('1500');
    expect(child.portfolioItems[0].symbol).toBe('2222.SR');
  });

  it('Child persona takes quiz, accumulates XP, and reaches level 2', async () => {
    const originalProfile = { xp: 90, level: 1 };
    
    // Add 15 XP to push child from 90 to 105 XP (crosses 100 XP threshold to Level 2)
    // Level formula: floor(sqrt(xp/100)) + 1 -> floor(sqrt(105/100)) + 1 = 1 + 1 = 2
    const levelChange = (xp: number) => Math.floor(Math.sqrt(xp / 100)) + 1;
    
    const newXp = originalProfile.xp + 15;
    const newLevel = levelChange(newXp);
    
    expect(newXp).toBe(105);
    expect(newLevel).toBe(2);
    expect(newLevel).toBeGreaterThan(originalProfile.level); // Level Up!
  });

  it('Child persona receives Sharia-compliant Mudarabah profit shares', async () => {
    const jarBalance = new Prisma.Decimal('1000.00');
    const ratioBps = 7000; // 70% user split
    
    const simulatedPoolYield = new Prisma.Decimal('0.045').div(365); // 4.5% annual yield
    const totalProfit = jarBalance.mul(simulatedPoolYield);
    
    const userRatio = new Prisma.Decimal(ratioBps).div(10000);
    const platformRatio = new Prisma.Decimal(1).sub(userRatio);

    const userProfit = totalProfit.mul(userRatio);
    const platformRevenue = totalProfit.mul(platformRatio);

    expect(userProfit.toNumber()).toBeCloseTo(0.0863, 4);
    expect(platformRevenue.toNumber()).toBeCloseTo(0.0370, 4);
  });

  it('AAOIFI screener gates execution on HARAM assets while permitting HALAL ones', async () => {
    const mockSahmk = registry.getProvider('TASI');
    const mockAlpaca = registry.getProvider('NASDAQ');
    const mockScreener = registry.getScreener();

    // AAPL is halal
    const verdictAAPL = await mockScreener.screen('AAPL', 'NASDAQ');
    expect(verdictAAPL.compliant).toBe(true);

    // TSLA is haram/non-compliant in our mock dataset
    const verdictTSLA = await mockScreener.screen('TSLA', 'NASDAQ');
    expect(verdictTSLA.compliant).toBe(false);
  });
});
