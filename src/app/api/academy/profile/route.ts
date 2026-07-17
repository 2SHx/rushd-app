// src/app/api/academy/profile/route.ts
// Rushd Academy (M12/DR-19) diagnostic/adaptive-learning profile API.
// Self-only by construction: there is no target-userId param, unlike
// /api/academy/progress — a LearnerProfile is never read/written on
// another user's behalf (not even by a parent), because scoring must never
// see or store age/identity data beyond the session's own `isChild`.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { diagnosticAnswersSchema, scoreDiagnostic, defaultProfile } from '@/academy/diagnostic';

function authzResponse(error: unknown): Response | null {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: Response }).response;
  }
  return null;
}

const submitSchema = z.object({
  answers: diagnosticAnswersSchema.optional(),
}).strict();

// DR-19 security-audit fix: minimal in-route re-take throttle — no new
// dependency, no schema change. An authenticated child re-submitting the
// diagnostic within 10s of their own last write is rejected with 429; this
// is a spam guard, not a security boundary (ownership is already enforced
// by the `where: { userId }` upsert scoping above).
const RETAKE_COOLDOWN_MS = 10_000;

/** Own profile only. Returns { profile: null } if none exists yet. */
export async function GET(): Promise<Response> {
  try {
    const sessionUser = await requireSession();
    const profile = await prisma.learnerProfile.findUnique({ where: { userId: sessionUser.id } });
    return NextResponse.json({ profile });
  } catch (error) {
    const authResponse = authzResponse(error);
    if (authResponse) return authResponse;
    console.error('Academy profile fetch failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

/**
 * Submit (or re-take) the diagnostic. Scoring happens server-side from the
 * FROZEN INTERFACE in src/academy/diagnostic — this route never derives
 * persona/skillLevel itself. Absent `answers` takes the skip path
 * (`defaultProfile`). A re-take upserts persona/levels/answers but
 * preserves the existing `signals` aggregate (the feedback loop is owned by
 * the progress-completion API, not this route).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const sessionUser = await requireSession();
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = submitSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const existingProfile = await prisma.learnerProfile.findUnique({ where: { userId: sessionUser.id } });
    if (existingProfile) {
      const elapsedMs = Date.now() - existingProfile.updatedAt.getTime();
      if (elapsedMs < RETAKE_COOLDOWN_MS) {
        const retryAfterSeconds = Math.ceil((RETAKE_COOLDOWN_MS - elapsedMs) / 1000);
        return NextResponse.json(
          { error: 'rate_limited' },
          { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
        );
      }
    }

    const isChild = sessionUser.role === 'CHILD';
    const { persona, baselineKnowledge, skillLevel, profileVersion } = parsed.data.answers
      ? scoreDiagnostic(parsed.data.answers, { isChild })
      : defaultProfile({ isChild });

    const diagnosticAnswers = parsed.data.answers ?? {};

    const profile = await prisma.learnerProfile.upsert({
      where: { userId: sessionUser.id },
      create: {
        userId: sessionUser.id,
        persona,
        baselineKnowledge,
        skillLevel,
        diagnosticAnswers,
        profileVersion,
      },
      update: {
        persona,
        baselineKnowledge,
        skillLevel,
        diagnosticAnswers,
        profileVersion,
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    const authResponse = authzResponse(error);
    if (authResponse) return authResponse;
    console.error('Academy profile submission failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
