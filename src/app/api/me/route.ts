// src/app/api/me/route.ts
// Protected probe: 401 without a session, else the session's authz-relevant
// fields only (never the full DB row).
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, role, tier, parentId } = session.user;
  return NextResponse.json({ userId: id, role, tier, parentId });
}
