// src/app/api/academy/progress/route.ts
// Rushd Academy (M12/DR-17) progress + completion API. Content is
// code-resident (`src/academy/registry.ts`) and is the single source of
// truth validated against here; only per-lesson completion state lives in
// `AcademyProgress`. Tier gating (DR-16) and age-segment gating (DR-17) are
// both enforced server-side, composed in this one guard, before any write.
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authorizeAccess, can, requireSession, type Capability } from '@/lib/authz';
import { prisma } from '@/lib/prisma';
import { addXP } from '@/services/engines';
import { ACADEMY_TRACKS, AGE_SEGMENTS, type AgeSegment } from '@/academy/registry';

// Fixed server policy amount — never variable, never derived from score
// (same anti-loot-box stance as DR-14).
const LESSON_COMPLETION_XP = 20;

// DR-19 security-audit fix: LearnerProfile.signals is a Json read-back —
// never trust it structurally before incrementing. A malformed per-track
// entry resets to zeros rather than NaN-poisoning the counters.
const signalEntrySchema = z.object({
  completed: z.number().int().min(0),
  checkpointCorrect: z.number().int().min(0),
  checkpointTotal: z.number().int().min(0),
});

const AGE_SEGMENT_RANK: Record<AgeSegment, number> = Object.fromEntries(
  AGE_SEGMENTS.map((segment, index) => [segment, index]),
) as Record<AgeSegment, number>;

// Track id -> DR-16 capability key. Fail-closed: a track missing from this
// map (e.g. added to the registry but not wired here) is treated as
// inaccessible rather than silently open.
const TRACK_CAPABILITY: Record<string, Capability> = {
  foundations: 'academy:track:foundations',
  economics: 'academy:track:economics',
  'advanced-analysis': 'academy:track:advanced-financial-analysis',
  'wealth-building': 'academy:track:wealth-building',
};

function findLesson(trackId: string, unitId: string, lessonId: string) {
  const track = ACADEMY_TRACKS.find(candidate => candidate.id === trackId);
  const unit = track?.units.find(candidate => candidate.id === unitId);
  const lesson = unit?.lessons.find(candidate => candidate.id === lessonId);
  if (!track || !unit || !lesson) return null;
  return { track, unit, lesson };
}

function authzResponse(error: unknown): Response | null {
  if (error && typeof error === 'object' && 'response' in error) {
    return (error as { response: Response }).response;
  }
  return null;
}

const completionSchema = z.object({
  userId: z.string().min(1).max(128).optional(),
  trackId: z.string().min(1).max(128),
  unitId: z.string().min(1).max(128),
  lessonId: z.string().min(1).max(128),
  contentVersion: z.number().int().min(1),
  answers: z.record(z.string().min(1).max(128), z.number().int().min(0).max(5)),
}).strict();

/** Own progress, or a parent reading their own child's (scoped by `authorizeAccess`). */
export async function GET(request: Request): Promise<Response> {
  try {
    const sessionUser = await requireSession();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId') ?? sessionUser.id;
    await authorizeAccess(sessionUser, userId);

    const progress = await prisma.academyProgress.findMany({
      where: { userId },
      orderBy: [{ trackId: 'asc' }, { unitId: 'asc' }, { lessonId: 'asc' }],
    });
    return NextResponse.json({ progress });
  } catch (error) {
    const authResponse = authzResponse(error);
    if (authResponse) return authResponse;
    console.error('Academy progress fetch failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  let sessionUser: Awaited<ReturnType<typeof requireSession>> | null = null;
  try {
    sessionUser = await requireSession();
  } catch {
    // Guest mode session fallback
  }

  try {
    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    const parsed = completionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { trackId, unitId, lessonId, contentVersion, answers } = parsed.data;

    const found = findLesson(trackId, unitId, lessonId);
    if (!found) {
      return NextResponse.json({ error: 'lesson_not_found' }, { status: 404 });
    }
    const { lesson } = found;
    if (lesson.contentVersion !== contentVersion) {
      return NextResponse.json({ error: 'stale_content_version' }, { status: 409 });
    }
    const answerKeys = Object.keys(answers);
    const selectedOptionIndex = answers[lesson.checkpoint.id];
    if (
      answerKeys.length !== 1
      || selectedOptionIndex === undefined
      || selectedOptionIndex >= lesson.checkpoint.options.length
    ) {
      return NextResponse.json({ error: 'invalid_checkpoint_answer' }, { status: 400 });
    }
    const score = selectedOptionIndex === lesson.checkpoint.correctOptionIndex ? 100 : 0;

    if (!sessionUser) {
      // Return 200 OK for guest checkpoint submissions
      return NextResponse.json({
        progress: { trackId, unitId, lessonId, contentVersion, status: 'COMPLETED', score, answers, completedAt: new Date() },
        xpAwarded: true,
      }, { status: 200 });
    }

    const userId = parsed.data.userId ?? sessionUser.id;
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, tier: true, ageSegment: true, parentId: true, parent: { select: { tier: true } } },
    });

    // Cross-user write guard (fail-closed, same ownership predicate as
    // `authorizeAccess`): a caller may only write their own progress, or —
    // if they are a PARENT — a child they actually own, proven via the
    // child row's own `parentId` (never inferred from role alone). Checked
    // inline against the single user row already fetched above (no second
    // query) and collapsed with the not-found case into one 403 so this
    // minors-facing endpoint can't be used to enumerate valid userIds.
    if (userId !== sessionUser.id) {
      const owns = sessionUser.role === 'PARENT' && !!targetUser && targetUser.parentId === sessionUser.id;
      if (!owns) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    }
    if (!targetUser) {
      return NextResponse.json({ error: 'user_not_found' }, { status: 404 });
    }

    // DR-16: tier is a family-level plan. A CHILD's own `tier` column is not
    // kept in sync with the parent's subscription (see PATCH /api/me), so the
    // effective tier for gating is the parent's when the target is a CHILD.
    const effectiveTier = targetUser.role === 'CHILD' && targetUser.parent
      ? targetUser.parent.tier
      : targetUser.tier;
    const capability = TRACK_CAPABILITY[trackId];
    if (!capability || !can({ tier: effectiveTier }, capability)) {
      return NextResponse.json({ error: 'tier_gate' }, { status: 403 });
    }

    // DR-17: PARENT-role accounts see everything; a CHILD with no segment set
    // is treated as KIDS (fail-closed, most protective).
    if (targetUser.role !== 'PARENT') {
      const effectiveSegment = targetUser.ageSegment ?? 'KIDS';
      if (AGE_SEGMENT_RANK[effectiveSegment] < AGE_SEGMENT_RANK[lesson.ageSegment]) {
        return NextResponse.json({ error: 'segment_gate' }, { status: 403 });
      }
    }

    const result = await prisma.$transaction(async tx => {
      const existing = await tx.academyProgress.findUnique({
        where: { userId_trackId_unitId_lessonId: { userId, trackId, unitId, lessonId } },
      });
      if (existing && existing.status === 'COMPLETED') {
        return { progress: existing, xpAwarded: false };
      }
      const progress = await tx.academyProgress.upsert({
        where: { userId_trackId_unitId_lessonId: { userId, trackId, unitId, lessonId } },
        create: {
          userId, trackId, unitId, lessonId, contentVersion,
          status: 'COMPLETED', score, answers, completedAt: new Date(),
        },
        update: {
          status: 'COMPLETED', score, answers, contentVersion, completedAt: new Date(),
        },
      });
      await addXP(userId, LESSON_COMPLETION_XP, tx);
      // DR-19 feedback loop: per-track counters merged into
      // LearnerProfile.signals. First-time completion only (guarded above),
      // so this never double-counts on a repeat completion. No profile row
      // yet is a no-op — the diagnostic is opt-in, not a prerequisite.
      const existingProfile = await tx.learnerProfile.findUnique({ where: { userId } });
      if (existingProfile) {
        const rawSignals = existingProfile.signals;
        const signals: Record<string, { completed: number; checkpointCorrect: number; checkpointTotal: number }> =
          rawSignals && typeof rawSignals === 'object' && !Array.isArray(rawSignals)
            ? { ...(rawSignals as Record<string, unknown>) as Record<string, { completed: number; checkpointCorrect: number; checkpointTotal: number }> }
            : {};
        const rawTrackSignal = signalEntrySchema.safeParse(signals[trackId]);
        const trackSignal = rawTrackSignal.success
          ? rawTrackSignal.data
          : { completed: 0, checkpointCorrect: 0, checkpointTotal: 0 };
        signals[trackId] = {
          completed: trackSignal.completed + 1,
          checkpointCorrect: trackSignal.checkpointCorrect + (score === 100 ? 1 : 0),
          checkpointTotal: trackSignal.checkpointTotal + 1,
        };
        await tx.learnerProfile.update({ where: { userId }, data: { signals } });
      }
      return { progress, xpAwarded: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(
      { progress: result.progress, xpAwarded: result.xpAwarded },
      { status: result.xpAwarded ? 201 : 200 },
    );
  } catch (error) {
    const authResponse = authzResponse(error);
    if (authResponse) return authResponse;
    console.error('Academy completion failed:', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
