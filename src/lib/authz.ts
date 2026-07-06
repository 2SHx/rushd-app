// src/lib/authz.ts
// The session-scoping guard (SYSTEM_DESIGN.md §8). Every route that needs a
// session should call one of these instead of touching `auth()` directly, so
// the 401/403 shape stays uniform across the API surface.
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import type { SessionUser } from '@/lib/auth-credentials';

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
