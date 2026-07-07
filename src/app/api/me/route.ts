import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id, role, tier, parentId } = session.user;
  return NextResponse.json({ userId: id, role, tier, parentId });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const json = await req.json();
    const { tier } = json;

    if (tier !== 'BASIC' && tier !== 'PREMIUM' && tier !== 'ULTRA') {
      return NextResponse.json({ error: 'invalid_tier' }, { status: 400 });
    }

    const searchId = session.user.parentId || session.user.id;
    const updated = await prisma.user.update({
      where: { id: searchId },
      data: { tier }
    });

    return NextResponse.json({ success: true, tier: updated.tier });
  } catch (err) {
    console.error('Failed to update tier:', err);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
