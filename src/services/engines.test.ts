// src/services/engines.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const findUnique = vi.fn();
const profileUpdate = vi.fn();
const profileCreate = vi.fn();
const findMany = vi.fn();
const jarUpdate = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gamificationProfile: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => profileUpdate(...args),
      create: (...args: unknown[]) => profileCreate(...args),
    },
    savingsJar: {
      findMany: (...args: unknown[]) => findMany(...args),
      update: (...args: unknown[]) => jarUpdate(...args),
    },
  },
}));

import { addXP, processCashSweeps } from './engines';

beforeEach(() => {
  findUnique.mockReset();
  profileUpdate.mockReset();
  profileCreate.mockReset();
  findMany.mockReset();
  jarUpdate.mockReset();
});

describe('addXP — level curve: floor(sqrt(xp/100))+1', () => {
  it('lazily creates the profile and awards XP when the profile is not found', async () => {
    findUnique.mockResolvedValue(null);
    profileCreate.mockResolvedValue({ userId: 'missing-user', xp: 0, level: 1 });
    const result = await addXP('missing-user', 100);
    
    expect(profileCreate).toHaveBeenCalledWith({
      data: { userId: 'missing-user', xp: 0, level: 1 }
    });
    expect(profileUpdate).toHaveBeenCalledWith({
      where: { userId: 'missing-user' },
      data: { xp: 100, level: 2 }
    });
    expect(result).toEqual({ xp: 100, level: 2, leveledUp: true });
  });

  it('reaches level 2 at exactly 100 xp and reports leveledUp', async () => {
    findUnique.mockResolvedValue({ xp: 0, level: 1 });
    const result = await addXP('u1', 100);
    expect(result).toEqual({ xp: 100, level: 2, leveledUp: true });
  });

  it('stays at level 2 at 399 xp (just under the level-3 boundary)', async () => {
    findUnique.mockResolvedValue({ xp: 0, level: 1 });
    const result = await addXP('u1', 399);
    expect(result?.level).toBe(2);
  });

  it('reaches level 3 at exactly 400 xp', async () => {
    findUnique.mockResolvedValue({ xp: 0, level: 1 });
    const result = await addXP('u1', 400);
    expect(result).toEqual({ xp: 400, level: 3, leveledUp: true });
  });

  it('reports leveledUp: false when xp gain does not cross a level boundary', async () => {
    // profile already at 150 xp / level 2; +10 xp keeps it at level 2
    findUnique.mockResolvedValue({ xp: 150, level: 2 });
    const result = await addXP('u1', 10);
    expect(result).toEqual({ xp: 160, level: 2, leveledUp: false });
  });
});

describe('processCashSweeps — 2.0%/365 user rate, 2.5%/365 platform rate', () => {
  it('applies user interest, accrues platform revenue, and skips balance<=0 jars', async () => {
    findMany.mockResolvedValue([
      { id: 'jar-positive', balance: 1000 },
      { id: 'jar-zero', balance: 0 },
    ]);

    const result = await processCashSweeps();

    const userDailyRate = 0.02 / 365;
    const platformDailyRate = 0.025 / 365;

    expect(result.processedJars).toBe(2);
    expect(result.platformRevenue).toBeCloseTo(1000 * platformDailyRate);

    // only the positive-balance jar is credited interest
    expect(jarUpdate).toHaveBeenCalledTimes(1);
    
    const call = jarUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'jar-positive' });
    expect(call.data.balance).toBeInstanceOf(Prisma.Decimal);
    expect(call.data.balance.toNumber()).toBeCloseTo(1000 + 1000 * userDailyRate);
  });

  it('returns zero revenue and no updates when every jar is empty', async () => {
    findMany.mockResolvedValue([{ id: 'jar-a', balance: 0 }]);
    const result = await processCashSweeps();
    expect(result).toEqual({ processedJars: 1, platformRevenue: 0 });
    expect(jarUpdate).not.toHaveBeenCalled();
  });
});
