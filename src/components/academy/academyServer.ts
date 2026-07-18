import { auth } from '@/auth';
import { ACADEMY_TRACKS, type AgeSegment, type Track } from '@/academy/registry';
import { prisma } from '@/lib/prisma';
import { filterAcademyTracks } from './academyAccess';

export type AcademyProgressItem = { trackId: string; unitId: string; lessonId: string; status: string; score: number | null };
export type AcademyServerState = { state: 'ready'; tracks: Track[]; progress: AcademyProgressItem[]; isChild: boolean } | { state: 'error' };

export type LearnerProfileData = { persona: string; skillLevel: number } | null;

/** DR-19: the caller's own diagnostic profile only (self-only route mirrors this). */
export async function loadLearnerProfile(): Promise<LearnerProfileData> {
  const session = await auth();
  if (!session?.user) return null;
  const profile = await prisma.learnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { persona: true, skillLevel: true },
  });
  return profile;
}

export async function loadAcademy(): Promise<AcademyServerState> {
  const defaultGuestState = (): AcademyServerState => {
    const tracks = filterAcademyTracks(ACADEMY_TRACKS, { tier: 'BASIC', role: 'PARENT', ageSegment: 'ADULTS' });
    return { state: 'ready', tracks: tracks.length ? tracks : [...ACADEMY_TRACKS], progress: [], isChild: false };
  };

  try {
    const session = await auth();
    if (!session?.user) {
      return defaultGuestState();
    }
    let tier = session.user.tier;
    let ageSegment: AgeSegment = 'ADULTS';
    if (session.user.role === 'CHILD') {
      const child = await prisma.user.findUnique({ where: { id: session.user.id }, select: { ageSegment: true, parent: { select: { tier: true } } } });
      if (!child?.parent) return defaultGuestState();
      tier = child.parent.tier;
      ageSegment = child.ageSegment ?? 'KIDS';
    }
    const tracks = filterAcademyTracks(ACADEMY_TRACKS, { tier: tier ?? 'BASIC', role: session.user.role ?? 'PARENT', ageSegment });
    const progress = await prisma.academyProgress.findMany({ where: { userId: session.user.id }, select: { trackId: true, unitId: true, lessonId: true, status: true, score: true } });
    return { state: 'ready', tracks: tracks.length ? tracks : [...ACADEMY_TRACKS], progress, isChild: session.user.role === 'CHILD' };
  } catch (error) {
    console.error('Academy server load failed, falling back to open guest mode:', error);
    return defaultGuestState();
  }
}
