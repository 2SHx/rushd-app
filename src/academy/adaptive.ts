/**
 * Rushd Academy adaptive recommender (DR-19).
 *
 * Pure, deterministic reordering of lesson/practice recommendations. This
 * module does NOT gate access: callers pass in `accessible`, the lesson set
 * already authorized by the DR-16/DR-17 `can()` guard. `nextUp` only ever
 * reorders/ranks within that set — it never widens it (rule 6).
 */
import type { DiagnosticProfile, Persona } from './diagnostic';

export interface Lesson {
  trackId: string;
  unitId: string;
  lessonId: string;
  /** Stable id for the unit's practice link, surfaced once the unit completes. */
  practiceLinkId: string;
}

export type ProgressStatus = 'IN_PROGRESS' | 'COMPLETED';

export interface ProgressEntry {
  trackId: string;
  unitId: string;
  lessonId: string;
  status: ProgressStatus;
  /** Checkpoint score 0-100, present once a lesson is completed. */
  score?: number;
}

export type RecommendationReason = 'continue' | 'review' | 'advance' | 'practice';

export interface RecommendedItem {
  lessonId: string;
  trackId: string;
  unitId: string;
  reason: RecommendationReason;
}

interface NextUpResult {
  queue: RecommendedItem[];
}

const REVIEW_SCORE_THRESHOLD = 60;
const HIGH_SKILL_LEVEL = 70;
const HIGH_SKILL_REVIEW_FLOOR = 50;

/** Track priority order per persona (rule 3); ties fall back to registry order. */
const TRACK_PRIORITY: Record<Persona, string[]> = {
  CURIOUS_KID: ['foundations', 'economics', 'advanced'],
  TEEN_SAVER: ['foundations', 'economics', 'advanced'],
  ADULT_BEGINNER: ['foundations', 'economics', 'advanced'],
  ADULT_PRACTITIONER: ['economics', 'foundations', 'advanced'],
  QUANT_CANDIDATE: ['advanced', 'economics', 'foundations'],
};

function trackRank(persona: Persona, trackId: string, accessibleTrackIds: Set<string>): number {
  const priority = TRACK_PRIORITY[persona].filter((id) => accessibleTrackIds.has(id));
  const idx = priority.indexOf(trackId);
  return idx === -1 ? priority.length : idx;
}

export function nextUp(profile: DiagnosticProfile, progress: ProgressEntry[], accessible: Lesson[]): NextUpResult {
  const queue: RecommendedItem[] = [];
  if (accessible.length === 0) {
    return { queue };
  }

  const accessibleLessonKeys = new Set(accessible.map((l) => `${l.trackId}::${l.unitId}::${l.lessonId}`));
  const accessibleTrackIds = new Set(accessible.map((l) => l.trackId));

  const progressByLesson = new Map<string, ProgressEntry>();
  for (const entry of progress) {
    progressByLesson.set(`${entry.trackId}::${entry.unitId}::${entry.lessonId}`, entry);
  }

  // Rule 1: in-progress lessons, in accessible order.
  const continueItems: RecommendedItem[] = [];
  for (const lesson of accessible) {
    const key = `${lesson.trackId}::${lesson.unitId}::${lesson.lessonId}`;
    const entry = progressByLesson.get(key);
    if (entry?.status === 'IN_PROGRESS') {
      continueItems.push({ lessonId: lesson.lessonId, trackId: lesson.trackId, unitId: lesson.unitId, reason: 'continue' });
    }
  }

  // Rule 2 + 5: completed-with-low-score lessons resurface as review, unless
  // skillLevel >= 70 raises the resurfacing floor to below 50.
  const reviewItems: RecommendedItem[] = [];
  for (const lesson of accessible) {
    const key = `${lesson.trackId}::${lesson.unitId}::${lesson.lessonId}`;
    const entry = progressByLesson.get(key);
    if (entry?.status !== 'COMPLETED' || entry.score === undefined) continue;
    const threshold =
      profile.skillLevel >= HIGH_SKILL_LEVEL ? HIGH_SKILL_REVIEW_FLOOR : REVIEW_SCORE_THRESHOLD;
    if (entry.score < threshold) {
      reviewItems.push({ lessonId: lesson.lessonId, trackId: lesson.trackId, unitId: lesson.unitId, reason: 'review' });
    }
  }

  // Rule 3: next uncompleted (no progress entry, or entry not COMPLETED and
  // not already in continueItems) lesson per track, track order by persona
  // priority; within a track, accessible (registry) order.
  const completedOrInProgressKeys = new Set(
    progress
      .filter((entry) => entry.status === 'COMPLETED' || entry.status === 'IN_PROGRESS')
      .map((entry) => `${entry.trackId}::${entry.unitId}::${entry.lessonId}`),
  );

  const tracksInPriorityOrder = Array.from(accessibleTrackIds).sort(
    (a, b) => trackRank(profile.persona, a, accessibleTrackIds) - trackRank(profile.persona, b, accessibleTrackIds),
  );

  const advanceItems: RecommendedItem[] = [];
  for (const trackId of tracksInPriorityOrder) {
    const lessonsInTrack = accessible.filter((l) => l.trackId === trackId);
    for (const lesson of lessonsInTrack) {
      const key = `${lesson.trackId}::${lesson.unitId}::${lesson.lessonId}`;
      if (!completedOrInProgressKeys.has(key)) {
        advanceItems.push({ lessonId: lesson.lessonId, trackId: lesson.trackId, unitId: lesson.unitId, reason: 'advance' });
        break; // only the next lesson per track
      }
    }
  }

  // Rule 4: for every fully-completed unit, surface its practiceLink.
  const lessonsByUnit = new Map<string, Lesson[]>();
  for (const lesson of accessible) {
    const unitKey = `${lesson.trackId}::${lesson.unitId}`;
    if (!lessonsByUnit.has(unitKey)) lessonsByUnit.set(unitKey, []);
    lessonsByUnit.get(unitKey)!.push(lesson);
  }

  const practiceItems: RecommendedItem[] = [];
  for (const [unitKey, unitLessons] of Array.from(lessonsByUnit.entries())) {
    const [trackId, unitId] = unitKey.split('::');
    const allCompleted = unitLessons.every((lesson: Lesson) => {
      const key = `${lesson.trackId}::${lesson.unitId}::${lesson.lessonId}`;
      return progressByLesson.get(key)?.status === 'COMPLETED';
    });
    if (allCompleted) {
      practiceItems.push({ lessonId: unitLessons[0].practiceLinkId, trackId, unitId, reason: 'practice' });
    }
  }

  queue.push(...continueItems, ...reviewItems, ...advanceItems, ...practiceItems);

  // Rule 6 safeguard: never emit a lesson outside `accessible` (practice
  // items are unit-level, always derived from accessible lessons already).
  return {
    queue: queue.filter((item) => {
      if (item.reason === 'practice') return true;
      return accessibleLessonKeys.has(`${item.trackId}::${item.unitId}::${item.lessonId}`);
    }),
  };
}
