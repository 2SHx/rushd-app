import { describe, expect, it } from 'vitest';
import { TS_MOMENTUM_HALAL_BASKET_V2 } from '../strategies/tsMomentumHalalBasketV2';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import {
  TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM,
  compileTsMomentumHalalBasketV2Policy,
} from './tsMomentumHalalBasketV2Curriculum';

const answers = (): StrategyLearningAnswer[] => TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('ts-momentum-halal-basket-v2 learning curriculum', () => {
  it('contains seven bilingual reviewed questions across knowledge and policy roles', () => {
    const curriculum = TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM;
    expect(curriculum.questions).toHaveLength(7);
    expect(curriculum.questions.filter(question => question.role === 'KNOWLEDGE_CHECK')).toHaveLength(2);
    expect(curriculum.questions.filter(question => question.role === 'POLICY_DECISION')).toHaveLength(5);
    for (const question of curriculum.questions) {
      expect(question.prompt.en.trim()).not.toBe('');
      expect(question.prompt.ar.trim()).not.toBe('');
      expect(question.options.length).toBeGreaterThanOrEqual(2);
      for (const item of question.options) {
        expect(item.label.en.trim()).not.toBe('');
        expect(item.label.ar.trim()).not.toBe('');
        expect(item.feedback.en.trim()).not.toBe('');
        expect(item.feedback.ar.trim()).not.toBe('');
      }
    }
  });

  it('compiles the team choices deterministically to the exact frozen team policy', () => {
    const first = compileTsMomentumHalalBasketV2Policy(answers());
    const second = compileTsMomentumHalalBasketV2Policy(answers());
    expect(second).toEqual(first);
    expect(first.params).toEqual(TS_MOMENTUM_HALAL_BASKET_V2);
    expect(first.policyHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('keeps knowledge answers isolated from policy and fails closed on invalid choices', () => {
    const baseline = answers();
    const knowledge = TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM.questions.find(question => question.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(answer => answer.questionId === knowledge.id
      ? { ...answer, optionId: knowledge.options.find(option => option.id !== answer.optionId)!.id }
      : answer);
    expect(compileTsMomentumHalalBasketV2Policy(changed)).toEqual(compileTsMomentumHalalBasketV2Policy(baseline));
    expect(() => compileTsMomentumHalalBasketV2Policy([
      ...baseline.slice(0, -1),
      { ...baseline.at(-1)!, optionId: 'client-supplied-unsafe-value' },
    ])).toThrow();
  });
});
