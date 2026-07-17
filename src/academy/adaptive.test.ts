import { describe, expect, it } from 'vitest';
import { nextUp, type Lesson, type ProgressEntry } from './adaptive';
import type { DiagnosticProfile } from './diagnostic';

function profile(overrides: Partial<DiagnosticProfile> = {}): DiagnosticProfile {
  return {
    persona: 'ADULT_BEGINNER',
    baselineKnowledge: 0,
    skillLevel: 0,
    profileVersion: 1,
    ...overrides,
  };
}

function lesson(trackId: string, unitId: string, lessonId: string, practiceLinkId?: string): Lesson {
  return { trackId, unitId, lessonId, practiceLinkId: practiceLinkId ?? `${unitId}-practice` };
}

// A small fixture registry spanning two tracks, two units each.
const FOUNDATIONS: Lesson[] = [
  lesson('foundations', 'u1', 'f-u1-l1'),
  lesson('foundations', 'u1', 'f-u1-l2'),
  lesson('foundations', 'u2', 'f-u2-l1'),
];
const ECONOMICS: Lesson[] = [
  lesson('economics', 'e-u1', 'e-u1-l1'),
  lesson('economics', 'e-u1', 'e-u1-l2'),
];
const ADVANCED: Lesson[] = [lesson('advanced', 'a-u1', 'a-u1-l1')];

const ALL: Lesson[] = [...FOUNDATIONS, ...ECONOMICS, ...ADVANCED];

describe('nextUp', () => {
  it('is deterministic: identical inputs produce a deep-equal queue', () => {
    const p = profile();
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l1', status: 'IN_PROGRESS' },
    ];
    const first = nextUp(p, progress, ALL);
    const second = nextUp(p, progress, ALL);
    expect(second).toEqual(first);
  });

  it('empty accessible set yields an empty queue regardless of progress', () => {
    const p = profile();
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l1', status: 'IN_PROGRESS' },
    ];
    const result = nextUp(p, progress, []);
    expect(result.queue).toEqual([]);
  });

  it('cold start (empty progress) yields an advance-only queue led by the persona priority track', () => {
    const p = profile({ persona: 'ADULT_PRACTITIONER' });
    const result = nextUp(p, [], ALL);
    expect(result.queue.every((item) => item.reason === 'advance')).toBe(true);
    expect(result.queue[0].trackId).toBe('economics');
  });

  it('rule 1: in-progress lessons surface first as continue', () => {
    const p = profile();
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u2', lessonId: 'f-u2-l1', status: 'IN_PROGRESS' },
    ];
    const result = nextUp(p, progress, ALL);
    expect(result.queue[0]).toMatchObject({ lessonId: 'f-u2-l1', reason: 'continue' });
  });

  it('rule 2: completed lessons with checkpoint score < 60 resurface as review before new material', () => {
    const p = profile();
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l1', status: 'COMPLETED', score: 40 },
    ];
    const result = nextUp(p, progress, ALL);
    const reviewIndex = result.queue.findIndex((i) => i.lessonId === 'f-u1-l1' && i.reason === 'review');
    const advanceIndex = result.queue.findIndex((i) => i.reason === 'advance');
    expect(reviewIndex).toBeGreaterThanOrEqual(0);
    expect(reviewIndex).toBeLessThan(advanceIndex);
  });

  it('rule 3: next uncompleted lesson advances in track order, prioritized per persona', () => {
    const curious = nextUp(profile({ persona: 'CURIOUS_KID' }), [], ALL);
    expect(curious.queue[0]).toMatchObject({ trackId: 'foundations', reason: 'advance' });

    const beginner = nextUp(profile({ persona: 'ADULT_BEGINNER' }), [], ALL);
    expect(beginner.queue[0]).toMatchObject({ trackId: 'foundations', reason: 'advance' });

    const practitioner = nextUp(profile({ persona: 'ADULT_PRACTITIONER' }), [], ALL);
    expect(practitioner.queue[0]).toMatchObject({ trackId: 'economics', reason: 'advance' });

    const quant = nextUp(profile({ persona: 'QUANT_CANDIDATE' }), [], ALL);
    expect(quant.queue[0]).toMatchObject({ trackId: 'advanced', reason: 'advance' });
  });

  it('rule 3 (fallback): quant persona falls back to next priority track when advanced is inaccessible', () => {
    const restricted = ALL.filter((l) => l.trackId !== 'advanced');
    const quant = nextUp(profile({ persona: 'QUANT_CANDIDATE' }), [], restricted);
    expect(quant.queue[0]).toMatchObject({ trackId: 'economics', reason: 'advance' });
  });

  it('rule 4: a completed unit surfaces its practiceLink as practice', () => {
    const p = profile();
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l1', status: 'COMPLETED', score: 90 },
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l2', status: 'COMPLETED', score: 90 },
    ];
    const result = nextUp(p, progress, ALL);
    expect(
      result.queue.some((i) => i.reason === 'practice' && i.unitId === 'u1' && i.trackId === 'foundations'),
    ).toBe(true);
  });

  it('rule 5: skillLevel >= 70 skips review resurfacing for scores >= 50 (threshold branch-shift)', () => {
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l1', status: 'COMPLETED', score: 55 },
    ];
    const lowSkill = nextUp(profile({ skillLevel: 40 }), progress, ALL);
    expect(lowSkill.queue.some((i) => i.lessonId === 'f-u1-l1' && i.reason === 'review')).toBe(true);

    const highSkill = nextUp(profile({ skillLevel: 70 }), progress, ALL);
    expect(highSkill.queue.some((i) => i.lessonId === 'f-u1-l1' && i.reason === 'review')).toBe(false);

    // still below 50 -> resurfaces even at high skill
    const progressLower: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l1', status: 'COMPLETED', score: 30 },
    ];
    const highSkillLowScore = nextUp(profile({ skillLevel: 70 }), progressLower, ALL);
    expect(highSkillLowScore.queue.some((i) => i.lessonId === 'f-u1-l1' && i.reason === 'review')).toBe(true);
  });

  it('rule 6: never emits a lesson outside the accessible set', () => {
    const truncated = ALL.filter((l) => l.lessonId !== 'f-u1-l2');
    const progress: ProgressEntry[] = [
      { trackId: 'foundations', unitId: 'u1', lessonId: 'f-u1-l2', status: 'IN_PROGRESS' },
    ];
    const result = nextUp(profile(), progress, truncated);
    expect(result.queue.some((i) => i.lessonId === 'f-u1-l2')).toBe(false);
  });
});
