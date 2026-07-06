// src/services/engines.ts

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

/**
 * Gamification Engine: Add XP and calculate level ups
 */
export async function addXP(userId: string, amount: number) {
  let profile = await prisma.gamificationProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    profile = await prisma.gamificationProfile.create({
      data: { userId, xp: 0, level: 1 }
    });
  }

  const newXp = profile.xp + amount;
  // Level = floor(sqrt(totalXp / 100)) + 1
  const newLevel = Math.floor(Math.sqrt(newXp / 100)) + 1;

  await prisma.gamificationProfile.update({
    where: { userId },
    data: {
      xp: newXp,
      level: newLevel
    }
  });

  return { xp: newXp, level: newLevel, leveledUp: newLevel > profile.level };
}

/**
 * Sweep Logic Engine: Calculate platform margin and user APY for Savings Jars
 */
export async function processCashSweeps() {
  const jars = await prisma.savingsJar.findMany();
  
  // Daily interest rate for 2.0% APY
  const userDailyRate = new Prisma.Decimal("0.02").div(365);
  
  // Platform keeps 2.5% margin (total sweep yield is 4.5%)
  const platformDailyRate = new Prisma.Decimal("0.025").div(365);

  let totalPlatformRevenue = new Prisma.Decimal(0);

  for (const jar of jars) {
    const balance = new Prisma.Decimal(jar.balance.toString());
    if (balance.gt(0)) {
      const userInterest = balance.mul(userDailyRate);
      const platformMargin = balance.mul(platformDailyRate);

      await prisma.savingsJar.update({
        where: { id: jar.id },
        data: {
          balance: balance.add(userInterest)
        }
      });

      // In a real app, write userInterest to Transaction log
      // await prisma.transaction.create({...})

      totalPlatformRevenue = totalPlatformRevenue.add(platformMargin);
    }
  }

  return {
    processedJars: jars.length,
    platformRevenue: totalPlatformRevenue.toNumber()
  };
}
