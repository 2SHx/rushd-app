import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AutonomyTier } from '@prisma/client';
import { requireUltraTier } from '@/lib/authz';
import { prisma } from '@/lib/prisma';

const BodySchema = z.object({
  autonomyTier: z.nativeEnum(AutonomyTier),
});

export async function POST(req: Request) {
  try {
    const user = await requireUltraTier();
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
    }
    const { autonomyTier } = parsed.data;

    const strategy = await prisma.strategy.findFirst({
      where: { ownerUserId: user.id }
    });

    if (strategy) {
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: { autonomyTier }
      });
    } else {
      await prisma.strategy.create({
        data: {
          ownerUserId: user.id,
          name: 'Core AI Strategy',
          market: 'NASDAQ',
          config: {},
          autonomyTier,
          enabled: true
        }
      });
    }

    return NextResponse.json({ success: true, autonomyTier });
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      return (error as { response: Response }).response;
    }
    console.error('Failed to update autonomy tier:', error);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
