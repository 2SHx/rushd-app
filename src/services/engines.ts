// src/services/engines.ts

import { prisma } from '@/lib/prisma';

/**
 * Gamification Engine: Add XP and calculate level ups
 */
export async function addXP(userId: string, amount: number) {
  const profile = await prisma.gamificationProfile.findUnique({
    where: { userId }
  });

  if (!profile) return;

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
  const userDailyRate = 0.02 / 365;
  
  // Platform keeps 2.5% margin (total sweep yield is 4.5%)
  const platformDailyRate = 0.025 / 365;

  let totalPlatformRevenue = 0;

  for (const jar of jars) {
    if (jar.balance > 0) {
      const userInterest = jar.balance * userDailyRate;
      const platformMargin = jar.balance * platformDailyRate;

      await prisma.savingsJar.update({
        where: { id: jar.id },
        data: {
          balance: jar.balance + userInterest
        }
      });

      // In a real app, write userInterest to Transaction log
      // await prisma.transaction.create({...})

      totalPlatformRevenue += platformMargin;
    }
  }

  return {
    processedJars: jars.length,
    platformRevenue: totalPlatformRevenue
  };
}
