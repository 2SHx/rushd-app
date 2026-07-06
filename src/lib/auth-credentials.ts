// src/lib/auth-credentials.ts
// Input-shape validation + lockout-aware lookups for the two Credentials
// branches (DR-1). Kept out of src/auth.ts so the provider wiring stays thin.
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { User } from '@prisma/client';

const BCRYPT_COST = 12;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_MINUTES = 15;

// Precomputed at the real cost so the "account not found" path spends the
// same bcrypt time as a real compare — closes the timing side-channel that
// would otherwise reveal valid emails/usernames (DR-1: uniform failure).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync('rushd-dummy-value-for-constant-time-compare', BCRYPT_COST);

export const parentCredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const childCredentialsSchema = z.object({
  familyCode: z.string().min(1),
  username: z.string().min(1),
  pin: z.string().min(1),
});

export type SessionUser = {
  id: string;
  role: User['role'];
  tier: User['tier'];
  parentId: string | null;
};

function isLocked(user: Pick<User, 'lockedUntil'>): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() > Date.now();
}

/** True once a previously-set lock window has elapsed — the fail counter is stale and needs a fresh-window reset. */
function lockHasExpired(user: Pick<User, 'lockedUntil'>): boolean {
  return !!user.lockedUntil && user.lockedUntil.getTime() <= Date.now();
}

/** Registers a failed attempt and locks the row after LOCKOUT_THRESHOLD fails. */
async function registerFailure(userId: string, failedLoginCount: number): Promise<void> {
  const nextCount = failedLoginCount + 1;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLoginCount: nextCount,
      lockedUntil: nextCount >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
    },
  });
}

async function registerSuccess(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}

function toSessionUser(user: User): SessionUser {
  return { id: user.id, role: user.role, tier: user.tier, parentId: user.parentId };
}

/** Parent branch: `User.email` unique + `passwordHash`. */
export async function authorizeParent(input: unknown): Promise<SessionUser | null> {
  const parsed = parentCredentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return null;
  }
  if (isLocked(user)) return null;
  const failedLoginCount = lockHasExpired(user) ? 0 : user.failedLoginCount;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    await registerFailure(user.id, failedLoginCount);
    return null;
  }
  await registerSuccess(user.id);
  return toSessionUser(user);
}

/**
 * Child branch: `familyCode` -> parent, then `@@unique([parentId, username])`
 * -> child, then verify PIN. A child cannot log in without a valid family code.
 */
export async function authorizeChild(input: unknown): Promise<SessionUser | null> {
  const parsed = childCredentialsSchema.safeParse(input);
  if (!parsed.success) return null;
  const { familyCode, username, pin } = parsed.data;

  const parent = await prisma.user.findUnique({ where: { familyCode } });
  if (!parent || parent.role !== 'PARENT') {
    await bcrypt.compare(pin, DUMMY_PASSWORD_HASH);
    return null;
  }

  const child = await prisma.user.findUnique({
    where: { parentId_username: { parentId: parent.id, username } },
  });
  if (!child || child.role !== 'CHILD' || !child.passwordHash) {
    await bcrypt.compare(pin, DUMMY_PASSWORD_HASH);
    return null;
  }
  if (isLocked(child)) return null;
  const failedLoginCount = lockHasExpired(child) ? 0 : child.failedLoginCount;

  const valid = await bcrypt.compare(pin, child.passwordHash);
  if (!valid) {
    await registerFailure(child.id, failedLoginCount);
    return null;
  }
  await registerSuccess(child.id);
  return toSessionUser(child);
}

export { BCRYPT_COST };
