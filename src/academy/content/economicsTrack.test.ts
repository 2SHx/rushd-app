import { describe, expect, it } from 'vitest';
import { validateAcademyContentList } from '../schema';
import { ECONOMICS_TRACK } from './economicsTrack';

// Mirrors src/app/api/quiz/route.ts's TOPIC_ALLOWLIST (read-only, not exported —
// duplicated here for test verification only, never as product logic).
const QUIZ_TOPIC_ALLOWLIST = [
  'Stock Market Basics',
  'Savings & Jars',
  'Compound Interest',
  'Sharia Compliance',
  'Risk Management',
  'Value Investing',
  'Halal Mutual Funds',
  'TASI Markets',
  'NASDAQ Markets',
];

describe('economics track content', () => {
  it('passes validateAcademyContentList with zero errors', () => {
    const result = validateAcademyContentList([ECONOMICS_TRACK]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has at least 4 units, each with at least 3 lessons', () => {
    expect(ECONOMICS_TRACK.units.length).toBeGreaterThanOrEqual(4);
    for (const unit of ECONOMICS_TRACK.units) {
      expect(unit.lessons.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has a checkpoint on every lesson', () => {
    for (const unit of ECONOMICS_TRACK.units) {
      for (const lesson of unit.lessons) {
        expect(lesson.checkpoint).toBeDefined();
        expect(lesson.checkpoint.options.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('has minimumAgeSegment TEENS and no lesson below it', () => {
    expect(ECONOMICS_TRACK.minimumAgeSegment).toBe('TEENS');
    for (const unit of ECONOMICS_TRACK.units) {
      for (const lesson of unit.lessons) {
        expect(['TEENS', 'ADULTS']).toContain(lesson.ageSegment);
      }
    }
  });

  it('tags every interest-rate lesson HARAM or EDUCATIONAL_ONLY, never HALAL/MASHBOOH', () => {
    const interestLesson = ECONOMICS_TRACK.units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === 'econ-u4-interest-rates');
    expect(interestLesson).toBeDefined();
    expect(['HARAM', 'EDUCATIONAL_ONLY']).toContain(interestLesson!.complianceTag);
  });

  it('pairs the interest-rate lesson with an Islamic-finance alternative tagged HALAL', () => {
    const alt = ECONOMICS_TRACK.units
      .flatMap((u) => u.lessons)
      .find((l) => l.id === 'econ-u4-islamic-alternative');
    expect(alt).toBeDefined();
    expect(alt!.complianceTag).toBe('HALAL');
  });

  it('has unique lesson ids across the whole track', () => {
    const ids = ECONOMICS_TRACK.units.flatMap((u) => u.lessons.map((l) => l.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique unit ids within the track', () => {
    const ids = ECONOMICS_TRACK.units.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every unit has at least one practiceLink, and every quizTopic target is in the real allowlist', () => {
    for (const unit of ECONOMICS_TRACK.units) {
      expect(unit.practiceLinks.length).toBeGreaterThanOrEqual(1);
      for (const link of unit.practiceLinks) {
        if (link.kind === 'quizTopic') {
          expect(QUIZ_TOPIC_ALLOWLIST).toContain(link.topic);
        }
      }
    }
  });

  it('every lesson has bilingual title/summary/body/checkpoint text', () => {
    for (const unit of ECONOMICS_TRACK.units) {
      for (const lesson of unit.lessons) {
        for (const field of [lesson.title, lesson.summary, lesson.body]) {
          expect(field.en.length).toBeGreaterThan(0);
          expect(field.ar.length).toBeGreaterThan(0);
        }
        expect(lesson.checkpoint.question.ar.length).toBeGreaterThan(0);
        expect(lesson.checkpoint.explanation.ar.length).toBeGreaterThan(0);
      }
    }
  });
});
