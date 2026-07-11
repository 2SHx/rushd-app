import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export class UserExecutionLockedError extends Error {
  constructor() {
    super('Another trade is already executing for this user.');
    this.name = 'UserExecutionLockedError';
  }
}

export function userExecutionLockKey(userId: string): string {
  return `money-user-${userId}`;
}

export async function acquireUserExecutionLock(userId: string): Promise<void> {
  try {
    await prisma.autoRunClaim.create({ data: { key: userExecutionLockKey(userId) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new UserExecutionLockedError();
    }
    throw error;
  }
}

export async function releaseUserExecutionLock(userId: string): Promise<void> {
  await prisma.autoRunClaim.deleteMany({ where: { key: userExecutionLockKey(userId) } });
}
