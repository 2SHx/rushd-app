// src/lib/authz.ts
// The session-scoping guard (SYSTEM_DESIGN.md §8). Every route that needs a
// session should call one of these instead of touching `auth()` directly, so
// the 401/403 shape stays uniform across the API surface.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { SessionUser } from '@/lib/auth-credentials';
import { prisma } from '@/lib/prisma';
import type { Tier } from '@prisma/client';

export class AuthzError extends Error {
  constructor(public readonly response: NextResponse) {
    super('authz');
  }
}

/** Throws AuthzError(401) if there is no session; otherwise returns it. */
export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) {
    throw new AuthzError(NextResponse.json({ error: 'unauthorized' }, { status: 401 }));
  }
  return session.user;
}

/** Throws AuthzError(401/403); otherwise returns a session known to be PARENT. */
export async function requireParent(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== 'PARENT') {
    throw new AuthzError(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
  }
  return user;
}

/** Throws AuthzError(403) if the parent or user does not have an ULTRA tier subscription. */
export async function requireUltraTier(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.tier !== 'ULTRA') {
    throw new AuthzError(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
  }
  return user;
}

/** Validates parent tier limits (BASIC=1 child, PREMIUM=3 children, ULTRA=unlimited). */
export async function validateChildCreationLimit(parentId: string, parentTier: string): Promise<void> {
  if (parentTier === 'ULTRA') {
    return;
  }
  const count = await prisma.user.count({
    where: { parentId },
  });
  if (parentTier === 'BASIC' && count >= 1) {
    throw new AuthzError(NextResponse.json({ error: 'tier_limit_exceeded', limit: 1 }, { status: 403 }));
  }
  if (parentTier === 'PREMIUM' && count >= 3) {
    throw new AuthzError(NextResponse.json({ error: 'tier_limit_exceeded', limit: 3 }, { status: 403 }));
  }
}

// --- DR-16 tier capability matrix (SYSTEM_DESIGN.md §1, "Plans & tier
// gating") -------------------------------------------------------------
// Tunable in code, not schema. `can()` is the single place BASIC/PREMIUM/
// ULTRA gating is decided; it does not cover the workspace meter (rolling
// 30-day unlock count) or child-seat counts (see `validateChildCreationLimit`
// above) — both are quantity checks, not capability checks.
export type Capability =
  | 'market:overview:tasi'
  | 'market:overview:nasdaq'
  | 'trading:tasi'
  | 'trading:nasdaq'
  | 'quiz:access'
  | 'academy:track:foundations'
  | 'academy:track:economics'
  | 'academy:track:advanced-financial-analysis'
  | 'academy:track:wealth-building'
  | 'academy:capstones'
  | 'academy:strategy-team:lesson1'
  | 'academy:strategy-team:all'
  | 'workspace:unlock'
  | 'workspace:unmetered'
  | 'ai:signals'
  | 'ai:priority'
  | 'analytics:advanced'
  | 'analytics:quant';

const BASIC_CAPABILITIES: readonly Capability[] = [
  'market:overview:tasi',
  'market:overview:nasdaq',
  'trading:tasi',
  'quiz:access',
  'academy:track:foundations',
  'academy:track:economics',
  'academy:track:wealth-building',
  'academy:track:advanced-financial-analysis',
  'academy:strategy-team:lesson1',
  'workspace:unlock',
];

const PREMIUM_CAPABILITIES: readonly Capability[] = [
  ...BASIC_CAPABILITIES,
  'trading:nasdaq',
  'ai:signals',
  'workspace:unmetered',
  'academy:track:economics',
  'academy:strategy-team:all',
];

const ULTRA_CAPABILITIES: readonly Capability[] = [
  ...PREMIUM_CAPABILITIES,
  'academy:track:advanced-financial-analysis',
  'academy:capstones',
  'analytics:advanced',
  'analytics:quant',
  'ai:priority',
];

/** The DR-16 capability matrix, exported so other lanes (e.g. Academy/M12) can assert against it directly. */
export const TIER_CAPABILITIES: Readonly<Record<Tier, readonly Capability[]>> = {
  BASIC: BASIC_CAPABILITIES,
  PREMIUM: PREMIUM_CAPABILITIES,
  ULTRA: ULTRA_CAPABILITIES,
};

/**
 * Pure DR-16 capability check: session-shape in, boolean out. Fail-closed on
 * an unknown capability or a missing/undefined tier — never throws.
 */
export function can(
  session: Pick<SessionUser, 'tier'> | null | undefined,
  capability: Capability
): boolean {
  const tier = session?.tier;
  if (!tier || !(tier in TIER_CAPABILITIES)) {
    return false;
  }
  return TIER_CAPABILITIES[tier].includes(capability);
}

/** Authorizes access: child accessing self, or parent supervising their own child. */
export async function authorizeAccess(sessionUser: SessionUser, targetUserId: string): Promise<void> {
  if (sessionUser.id === targetUserId) {
    return;
  }
  if (sessionUser.role === 'PARENT') {
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { parentId: true }
    });
    if (targetUser && targetUser.parentId === sessionUser.id) {
      return;
    }
  }
  throw new AuthzError(
    NextResponse.json({ error: 'forbidden' }, { status: 403 })
  );
}
