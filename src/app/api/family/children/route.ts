// src/app/api/family/children/route.ts
// Parent-only: creates a CHILD account under the caller's family. Ownership
// is derived entirely from the session (`requireParent`), never from the
// request body — the server never trusts client-sent role/parentId.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BCRYPT_COST } from '@/lib/auth-credentials';
import { requireParent, AuthzError } from '@/lib/authz';

const childSchema = z.object({
  name: z.string().min(1),
  username: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-z0-9]+$/, 'lowercase alphanumeric only'),
  pin: z.string().regex(/^\d{4,6}$/, 'pin must be 4-6 digits'),
});

export async function POST(req: Request) {
  let parent;
  try {
    parent = await requireParent();
  } catch (err) {
    if (err instanceof AuthzError) return err.response;
    throw err;
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = childSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { name, username, pin } = parsed.data;

  const passwordHash = await bcrypt.hash(pin, BCRYPT_COST);

  try {
    const child = await prisma.user.create({
      data: { name, username, passwordHash, role: 'CHILD', parentId: parent.id },
    });
    return NextResponse.json({ childId: child.id, username: child.username }, { status: 201 });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002' &&
      Array.isArray(err.meta?.target) &&
      (err.meta!.target as string[]).includes('username')
    ) {
      return NextResponse.json({ error: 'username_taken' }, { status: 409 });
    }
    throw err;
  }
}
