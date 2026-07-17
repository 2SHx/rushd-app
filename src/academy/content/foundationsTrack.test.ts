import { describe, expect, it } from 'vitest';
import { STRATEGY_LEARNING_SETUP_IDS } from '@/quant/learning/strategyLearningModules';
import { validateAcademyContentList } from '../schema';
import { foundationsTrack } from './foundationsTrack';

// Mirror of the quiz route's TOPIC_ALLOWLIST (src/app/api/quiz/route.ts).
// Kept as a literal mirror rather than an import because that file does not
// export the allowlist and this test must not touch it (scope fence).
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

describe('foundationsTrack content', () => {
  it('passes the shared academy content-lint validation', () => {
    const result = validateAcademyContentList([foundationsTrack]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('ships at least 4 units, each with at least 3 lessons', () => {
    expect(foundationsTrack.units.length).toBeGreaterThanOrEqual(4);
    for (const unit of foundationsTrack.units) {
      expect(unit.lessons.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every lesson carries exactly one checkpoint', () => {
    for (const unit of foundationsTrack.units) {
      for (const lesson of unit.lessons) {
        expect(lesson.checkpoint).toBeTruthy();
      }
    }
  });

  it('units 1 and 2 (money-basics, saving-spending) carry all three age-segment variants', () => {
    const targetUnitIds = ['money-basics', 'saving-spending'];
    for (const unitId of targetUnitIds) {
      const unit = foundationsTrack.units.find((u) => u.id === unitId);
      expect(unit, `unit "${unitId}" must exist`).toBeTruthy();
      const segments = new Set(unit!.lessons.map((l) => l.ageSegment));
      expect(segments.has('KIDS')).toBe(true);
      expect(segments.has('TEENS')).toBe(true);
      expect(segments.has('ADULTS')).toBe(true);
    }
  });

  it('every riba/interest/bond lesson is tagged HARAM or EDUCATIONAL_ONLY', () => {
    const riskyPattern = /riba|interest|bond/i;
    const allLessons = foundationsTrack.units.flatMap((u) => u.lessons);
    const flagged = allLessons.filter(
      (lesson) =>
        riskyPattern.test(lesson.id) ||
        riskyPattern.test(lesson.title.en) ||
        riskyPattern.test(lesson.body.en),
    );
    expect(flagged.length).toBeGreaterThan(0);
    for (const lesson of flagged) {
      expect(['HARAM', 'EDUCATIONAL_ONLY']).toContain(lesson.complianceTag);
    }
  });

  it('has an Islamic-finance unit covering riba, Mudarabah, AAOIFI screening, and purification/zakat', () => {
    const unit = foundationsTrack.units.find((u) => u.id === 'islamic-finance-foundations');
    expect(unit).toBeTruthy();
    const lessonIds = unit!.lessons.map((l) => l.id);
    expect(lessonIds).toEqual(
      expect.arrayContaining([
        'riba-and-why-prohibited',
        'mudarabah-profit-share',
        'aaoifi-screening-basics',
        'purification-zakat-basics',
      ]),
    );
    const riba = unit!.lessons.find((l) => l.id === 'riba-and-why-prohibited');
    expect(riba?.complianceTag).toBe('HARAM');
  });

  it('has intra-track unique unit ids and unique lesson ids per unit', () => {
    const unitIds = foundationsTrack.units.map((u) => u.id);
    expect(new Set(unitIds).size).toBe(unitIds.length);

    for (const unit of foundationsTrack.units) {
      const lessonIds = unit.lessons.map((l) => l.id);
      expect(new Set(lessonIds).size).toBe(lessonIds.length);
    }
  });

  it('every practiceLink target resolves against real setup ids / quiz allowlist', () => {
    for (const unit of foundationsTrack.units) {
      expect(unit.practiceLinks.length).toBeGreaterThanOrEqual(1);
      for (const link of unit.practiceLinks) {
        if (link.kind === 'strategySetup') {
          expect(STRATEGY_LEARNING_SETUP_IDS as readonly string[]).toContain(link.setupId);
        } else {
          expect(QUIZ_TOPIC_ALLOWLIST).toContain(link.topic);
        }
      }
    }
  });
});
