import { describe, expect, it } from 'vitest';
import { STRATEGY_LEARNING_SETUP_IDS } from '@/quant/learning/strategyLearningModules';
import { type Track, validateAcademyContentList } from './schema';

function buildValidTrack(): Track {
  return {
    id: 'sample-track',
    title: { en: 'Sample Track', ar: 'مسار تجريبي' },
    minimumAgeSegment: 'TEENS',
    units: [
      {
        id: 'unit-1',
        title: { en: 'Unit One', ar: 'الوحدة الأولى' },
        practiceLinks: [{ kind: 'strategySetup', setupId: STRATEGY_LEARNING_SETUP_IDS[0] }],
        lessons: [
          {
            id: 'lesson-1',
            title: { en: 'Lesson One', ar: 'الدرس الأول' },
            summary: { en: 'A short summary', ar: 'ملخص قصير' },
            body: { en: 'Lesson body text', ar: 'نص الدرس' },
            complianceTag: 'EDUCATIONAL_ONLY',
            ageSegment: 'TEENS',
            contentVersion: 1,
            checkpoint: {
              id: 'cp-1',
              question: { en: 'What is a stock?', ar: 'ما هو السهم؟' },
              options: [
                { en: 'Ownership share', ar: 'حصة ملكية' },
                { en: 'A loan', ar: 'قرض' },
              ],
              correctOptionIndex: 0,
              explanation: { en: 'A stock is ownership.', ar: 'السهم يمثل ملكية.' },
              complianceTag: 'EDUCATIONAL_ONLY',
            },
          },
        ],
      },
    ],
  };
}

describe('academy content-lint', () => {
  it('passes a minimal positive sample track', () => {
    const result = validateAcademyContentList([buildValidTrack()]);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('fails on a missing ar field, naming the exact path', () => {
    const track = structuredClone(buildValidTrack());
    delete (track.units[0].lessons[0].title as any).ar;

    const result = validateAcademyContentList([track]);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.path === 'track[sample-track].unit[unit-1].lesson[lesson-1].title.ar'),
    ).toBe(true);
  });

  it('fails on a missing complianceTag, naming the exact path', () => {
    const track = structuredClone(buildValidTrack());
    delete (track.units[0].lessons[0] as any).complianceTag;

    const result = validateAcademyContentList([track]);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.path === 'track[sample-track].unit[unit-1].lesson[lesson-1].complianceTag',
      ),
    ).toBe(true);
  });

  it('fails on a missing ageSegment, naming the exact path', () => {
    const track = structuredClone(buildValidTrack());
    delete (track.units[0].lessons[0] as any).ageSegment;

    const result = validateAcademyContentList([track]);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.path === 'track[sample-track].unit[unit-1].lesson[lesson-1].ageSegment',
      ),
    ).toBe(true);
  });

  it('fails when a unit declares zero practiceLinks, naming the exact path', () => {
    const track = structuredClone(buildValidTrack());
    track.units[0].practiceLinks = [];

    const result = validateAcademyContentList([track]);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.path === 'track[sample-track].unit[unit-1].practiceLinks'),
    ).toBe(true);
  });

  it('fails when a practiceLink targets a nonexistent strategy setup id, naming the exact path', () => {
    const track = structuredClone(buildValidTrack());
    track.units[0].practiceLinks = [{ kind: 'strategySetup', setupId: 'not-a-real-setup' }];

    const result = validateAcademyContentList([track]);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e.path === 'track[sample-track].unit[unit-1].practiceLink[strategySetup]' &&
          e.message.includes('not-a-real-setup'),
      ),
    ).toBe(true);
  });

  it('fails when a lesson sits below its track minimum segment, naming the exact path', () => {
    const track = structuredClone(buildValidTrack());
    track.minimumAgeSegment = 'ADULTS';
    track.units[0].lessons[0].ageSegment = 'KIDS';

    const result = validateAcademyContentList([track]);

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) => e.path === 'track[sample-track].unit[unit-1].lesson[lesson-1].ageSegment',
      ),
    ).toBe(true);
  });
});
