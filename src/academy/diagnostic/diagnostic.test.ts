import { describe, expect, it } from 'vitest';
import {
  DIAGNOSTIC_VERSION,
  diagnosticAnswersSchema,
  diagnosticQuestions,
  defaultProfile,
  scoreDiagnostic,
  validateDiagnosticContentList,
} from './index';

function allDefaultAnswers(): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of diagnosticQuestions) {
    answers[question.id] = question.options[0].id;
  }
  return answers;
}

function allTopAnswers(): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const question of diagnosticQuestions) {
    answers[question.id] = question.options[question.options.length - 1].id;
  }
  return answers;
}

describe('diagnostic content-lint', () => {
  it('passes the shipped question set', () => {
    const result = validateDiagnosticContentList(diagnosticQuestions);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('has between 6 and 8 questions', () => {
    expect(diagnosticQuestions.length).toBeGreaterThanOrEqual(6);
    expect(diagnosticQuestions.length).toBeLessThanOrEqual(8);
  });

  it('every question and option has non-empty en AND ar text', () => {
    for (const question of diagnosticQuestions) {
      expect(question.question.en.trim().length).toBeGreaterThan(0);
      expect(question.question.ar.trim().length).toBeGreaterThan(0);
      for (const option of question.options) {
        expect(option.label.en.trim().length).toBeGreaterThan(0);
        expect(option.label.ar.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('fails on a missing ar field, naming the exact path (negative fixture)', () => {
    const broken = structuredClone(diagnosticQuestions);
    delete (broken[0].question as any).ar;

    const result = validateDiagnosticContentList(broken);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === `question[${diagnosticQuestions[0].id}].question.ar`)).toBe(
      true,
    );
  });

  it('fails when question count drops below 6', () => {
    const result = validateDiagnosticContentList(diagnosticQuestions.slice(0, 3));
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.message.includes('expected 6-8 questions'))).toBe(true);
  });
});

describe('diagnosticAnswersSchema', () => {
  it('accepts a full valid answer set', () => {
    expect(() => diagnosticAnswersSchema.parse(allDefaultAnswers())).not.toThrow();
  });

  it('rejects an unknown question id', () => {
    const answers = { ...allDefaultAnswers(), not_a_real_question: 'x' };
    expect(() => diagnosticAnswersSchema.parse(answers)).toThrow();
  });

  it('rejects an unknown option id for a known question', () => {
    const answers = { ...allDefaultAnswers(), [diagnosticQuestions[0].id]: 'not-a-real-option' };
    expect(() => diagnosticAnswersSchema.parse(answers)).toThrow();
  });
});

describe('scoreDiagnostic', () => {
  it('is deterministic: same answers + same isChild -> same output', () => {
    const answers = allTopAnswers();
    const first = scoreDiagnostic(answers, { isChild: false });
    const second = scoreDiagnostic(answers, { isChild: false });
    expect(second).toEqual(first);
  });

  it('never yields an ADULT_* or QUANT_CANDIDATE persona for isChild:true', () => {
    const childOnlyPersonas = new Set(['CURIOUS_KID', 'TEEN_SAVER']);
    const scenarios = [allDefaultAnswers(), allTopAnswers()];
    for (const answers of scenarios) {
      const profile = scoreDiagnostic(answers, { isChild: true });
      expect(childOnlyPersonas.has(profile.persona)).toBe(true);
    }
  });

  it('low answers + adult yields ADULT_BEGINNER, top answers yields a more advanced persona', () => {
    const low = scoreDiagnostic(allDefaultAnswers(), { isChild: false });
    expect(low.persona).toBe('ADULT_BEGINNER');
    expect(low.baselineKnowledge).toBe(0);
    expect(low.skillLevel).toBe(0);

    const high = scoreDiagnostic(allTopAnswers(), { isChild: false });
    expect(high.persona).toBe('QUANT_CANDIDATE');
    expect(high.baselineKnowledge).toBe(100);
    expect(high.skillLevel).toBe(100);
  });

  it('produces integer 0-100 levels', () => {
    const mixed: Record<string, string> = {};
    diagnosticQuestions.forEach((question, i) => {
      mixed[question.id] = question.options[i % question.options.length].id;
    });
    const profile = scoreDiagnostic(mixed, { isChild: false });
    expect(Number.isInteger(profile.baselineKnowledge)).toBe(true);
    expect(Number.isInteger(profile.skillLevel)).toBe(true);
    expect(profile.baselineKnowledge).toBeGreaterThanOrEqual(0);
    expect(profile.baselineKnowledge).toBeLessThanOrEqual(100);
    expect(profile.skillLevel).toBeGreaterThanOrEqual(0);
    expect(profile.skillLevel).toBeLessThanOrEqual(100);
  });

  it('carries the current profileVersion', () => {
    const profile = scoreDiagnostic(allDefaultAnswers(), { isChild: false });
    expect(profile.profileVersion).toBe(DIAGNOSTIC_VERSION);
  });
});

describe('defaultProfile (skip path)', () => {
  it('gives a child the CURIOUS_KID default with zero levels', () => {
    const profile = defaultProfile({ isChild: true });
    expect(profile).toEqual({
      persona: 'CURIOUS_KID',
      baselineKnowledge: 0,
      skillLevel: 0,
      profileVersion: DIAGNOSTIC_VERSION,
    });
  });

  it('gives an adult the ADULT_BEGINNER default with zero levels', () => {
    const profile = defaultProfile({ isChild: false });
    expect(profile).toEqual({
      persona: 'ADULT_BEGINNER',
      baselineKnowledge: 0,
      skillLevel: 0,
      profileVersion: DIAGNOSTIC_VERSION,
    });
  });

  it('an empty answer set scores identically to the default profile', () => {
    expect(scoreDiagnostic({}, { isChild: true })).toEqual(defaultProfile({ isChild: true }));
    expect(scoreDiagnostic({}, { isChild: false })).toEqual(defaultProfile({ isChild: false }));
  });

  it('a 6-of-7 (incomplete) answer set falls back to the default profile, even with all top answers', () => {
    const partial = allTopAnswers();
    delete partial[diagnosticQuestions[0].id];

    expect(scoreDiagnostic(partial, { isChild: true })).toEqual(defaultProfile({ isChild: true }));
    expect(scoreDiagnostic(partial, { isChild: false })).toEqual(defaultProfile({ isChild: false }));
  });

  it('a full 7-of-7 answer set still takes the scored path unchanged', () => {
    const full = allTopAnswers();
    expect(Object.keys(full)).toHaveLength(diagnosticQuestions.length);

    const profile = scoreDiagnostic(full, { isChild: false });
    expect(profile).not.toEqual(defaultProfile({ isChild: false }));
    expect(profile.persona).toBe('QUANT_CANDIDATE');
    expect(profile.baselineKnowledge).toBe(100);
    expect(profile.skillLevel).toBe(100);
  });
});
