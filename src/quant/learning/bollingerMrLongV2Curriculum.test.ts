import { describe, expect, it } from 'vitest';
import { BOLLINGER_MR_LONG_V2, BollingerMrLongV2ParamsSchema } from '../strategies/bollingerMrLongV2';
import {
  BOLLINGER_MR_LONG_V2_CURRICULUM,
  compileBollingerMrLongV2Policy,
  type StrategyLearningAnswer,
} from './bollingerMrLongV2Curriculum';

const teamAnswers = (): StrategyLearningAnswer[] => BOLLINGER_MR_LONG_V2_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'KNOWLEDGE_CHECK'
    ? question.correctOptionId
    : question.teamOptionId,
}));

describe('bollinger-mr-long-v2 learning curriculum', () => {
  it('is a versioned bilingual seven-question lesson spanning the five required decision areas', () => {
    const curriculum = BOLLINGER_MR_LONG_V2_CURRICULUM;
    expect(curriculum.setupId).toBe('bollinger-mr-long-v2');
    expect(curriculum.setupVersion).toBe('v2');
    expect(curriculum.complianceTag).toBe('EDUCATIONAL_ONLY');
    expect(curriculum.questions).toHaveLength(7);
    expect(new Set(curriculum.questions.map(question => question.id)).size).toBe(7);
    expect(new Set(curriculum.questions.map(question => question.area))).toEqual(
      new Set(['ENTRY', 'EXIT', 'SIZING', 'HOLDING', 'RISK']),
    );
    expect(curriculum.questions.filter(question => question.role === 'KNOWLEDGE_CHECK')).toHaveLength(2);
    expect(curriculum.questions.filter(question => question.role === 'POLICY_DECISION')).toHaveLength(5);

    for (const question of curriculum.questions) {
      expect(question.prompt.en.length).toBeGreaterThan(0);
      expect(question.prompt.ar.length).toBeGreaterThan(0);
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      if (question.role === 'KNOWLEDGE_CHECK') {
        expect(question.explanation.en.length).toBeGreaterThan(0);
        expect(question.explanation.ar.length).toBeGreaterThan(0);
      }
      for (const option of question.options) {
        expect(option.label.en.length).toBeGreaterThan(0);
        expect(option.label.ar.length).toBeGreaterThan(0);
        expect(option.feedback.en.length).toBeGreaterThan(0);
        expect(option.feedback.ar.length).toBeGreaterThan(0);
      }
    }
  });

  it('compiles identical policy choices to the same setup params and SHA-256 hash regardless of answer order', () => {
    const answers = teamAnswers();
    const first = compileBollingerMrLongV2Policy(answers);
    const second = compileBollingerMrLongV2Policy([...answers].reverse());

    expect(first.params).toEqual(BOLLINGER_MR_LONG_V2);
    expect(first).toEqual(second);
    expect(first.policyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('keeps knowledge answers completely outside the policy and its hash', () => {
    const correct = teamAnswers();
    const changed = correct.map(answer => answer.questionId === 'know-lower-band'
      ? { ...answer, optionId: 'price-above-upper-band' }
      : answer);

    expect(compileBollingerMrLongV2Policy(changed)).toEqual(
      compileBollingerMrLongV2Policy(correct),
    );
  });

  it('maps only reviewed enum choices into valid bounded strategy parameters', () => {
    const baseline = teamAnswers();
    const baselineHash = compileBollingerMrLongV2Policy(baseline).policyHash;
    const expected: Array<[string, string, keyof typeof BOLLINGER_MR_LONG_V2, number]> = [
      ['policy-entry-band', 'patient-2_25', 'entryStdev', 2.25],
      ['policy-atr-stop', 'tight-2_5', 'atrStopMult', 2.5],
      ['policy-size-budget', 'conservative-0_003', 'targetVolBudget', 0.003],
      ['policy-holding', 'short-10', 'maxHoldingDays', 10],
      ['policy-regime', 'strict-0_80', 'varianceRatioMax', 0.8],
    ];

    for (const [questionId, optionId, field, value] of expected) {
      const answers = baseline.map(answer => answer.questionId === questionId ? { ...answer, optionId } : answer);
      const compiled = compileBollingerMrLongV2Policy(answers);
      expect(compiled.params[field]).toBe(value);
      expect(BollingerMrLongV2ParamsSchema.parse(compiled.params)).toEqual(compiled.params);
      expect(compiled.params.maxNameFraction).toBe(BOLLINGER_MR_LONG_V2.maxNameFraction);
      expect(compiled.policyHash).not.toBe(baselineHash);
    }
  });

  it('fails closed on missing, duplicate, unknown-question, or unknown-option answers', () => {
    const answers = teamAnswers();
    expect(() => compileBollingerMrLongV2Policy(answers.slice(1))).toThrow();
    expect(() => compileBollingerMrLongV2Policy([...answers, answers[0]])).toThrow();
    expect(() => compileBollingerMrLongV2Policy([...answers.slice(1), { questionId: 'unknown', optionId: 'x' }])).toThrow();
    expect(() => compileBollingerMrLongV2Policy(answers.map(answer => answer.questionId === 'policy-entry-band'
      ? { ...answer, optionId: 'arbitrary-9_99' }
      : answer))).toThrow();
  });
});
