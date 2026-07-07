// src/lib/authz.ts
// The session-scoping guard (SYSTEM_DESIGN.md §8). Every route that needs a
// session should call one of these instead of touching `auth()` directly, so
// the 401/403 shape stays uniform across the API surface.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { SessionUser } from '@/lib/auth-credentials';
import { prisma } from '@/lib/prisma';

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
  const searchId = user.parentId || user.id;
  const owner = await prisma.user.findUnique({
    where: { id: searchId },
    select: { tier: true }
  });

  if (!owner || owner.tier !== 'ULTRA') {
    throw new AuthzError(
      NextResponse.json({ error: 'tier_limit_exceeded', message: 'Quant committee features require an ULTRA tier subscription.' }, { status: 403 })
    );
  }
  return user;
}

/** Validates parent tier limits (BASIC=1 child, PREMIUM=3 children, ULTRA=unlimited). */
export async function validateChildCreationLimit(parentId: string, parentTier: string): Promise<void> {
  const count = await prisma.user.count({ where: { parentId } });
  if (parentTier === 'BASIC' && count >= 1) {
    throw new AuthzError(
      NextResponse.json({ error: 'tier_limit_exceeded', message: 'BASIC tier accounts are limited to 1 child.' }, { status: 403 })
    );
  }
  if (parentTier === 'PREMIUM' && count >= 3) {
    throw new AuthzError(
      NextResponse.json({ error: 'tier_limit_exceeded', message: 'PREMIUM tier accounts are limited to 3 children.' }, { status: 403 })
    );
  }
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
