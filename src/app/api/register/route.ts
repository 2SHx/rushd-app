// src/app/api/register/route.ts
// Parent self-registration: creates the PARENT User row + a unique familyCode
// children later log in against (DR-1). No session is required to hit this
// route — it's how a session becomes possible in the first place.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BCRYPT_COST } from '@/lib/auth-credentials';
import { generateFamilyCode } from '@/lib/family';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

const MAX_FAMILY_CODE_ATTEMPTS = 5;

function isUniqueViolationOn(err: unknown, field: string): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === 'P2002' &&
    Array.isArray(err.meta?.target) &&
    (err.meta!.target as string[]).includes(field)
  );
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { email, password, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'email_taken' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  for (let attempt = 0; attempt < MAX_FAMILY_CODE_ATTEMPTS; attempt++) {
    const familyCode = generateFamilyCode();
    try {
      const user = await prisma.user.create({
        data: { email, name, role: 'PARENT', passwordHash, familyCode },
      });
      return NextResponse.json({ userId: user.id, familyCode: user.familyCode }, { status: 201 });
    } catch (err) {
      if (isUniqueViolationOn(err, 'email')) {
        return NextResponse.json({ error: 'email_taken' }, { status: 409 });
      }
      if (isUniqueViolationOn(err, 'familyCode')) {
        continue; // collision — retry with a freshly generated code
      }
      throw err;
    }
  }
  return NextResponse.json({ error: 'family_code_exhausted' }, { status: 500 });
}
