import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { TS_MOMENTUM_HALAL_BASKET_V3 } from '../strategies/tsMomentumHalalBasketV3';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import {
  loadTsMomentumHalalBasketV3LearningFixture,
  replayTsMomentumHalalBasketV3LearningPolicy,
  type BollingerLearningReplayFixture,
} from './strategyLearningReplay';
import {
  TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM,
  compileTsMomentumHalalBasketV3Policy,
} from './tsMomentumHalalBasketV3Curriculum';

const teamAnswers = (): StrategyLearningAnswer[] => TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('ts-momentum-halal-basket-v3 learning module', () => {
  it('ships seven bilingual questions with knowledge-policy isolation and a deterministic hash', () => {
    const curriculum = TS_MOMENTUM_HALAL_BASKET_V3_CURRICULUM;
    expect(curriculum.questions).toHaveLength(7);
    for (const question of curriculum.questions) {
      expect(question.prompt.en.trim()).not.toBe('');
      expect(question.prompt.ar.trim()).not.toBe('');
    }
    const baseline = teamAnswers();
    const first = compileTsMomentumHalalBasketV3Policy(baseline);
    expect(first.params).toEqual(TS_MOMENTUM_HALAL_BASKET_V3);
    expect(compileTsMomentumHalalBasketV3Policy(baseline)).toEqual(first);
    const knowledge = curriculum.questions.find(question => question.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(answer => answer.questionId === knowledge.id
      ? { ...answer, optionId: knowledge.options.find(option => option.id !== answer.optionId)!.id }
      : answer);
    expect(compileTsMomentumHalalBasketV3Policy(changed)).toEqual(first);
    expect(() => compileTsMomentumHalalBasketV3Policy([...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' }])).toThrow();
  });

  it('replays the exact v3 strategy-book governor deterministically with hard gates intact', () => {
    const fixture = loadTsMomentumHalalBasketV3LearningFixture();
    const first = replayTsMomentumHalalBasketV3LearningPolicy(teamAnswers(), fixture);
    expect(replayTsMomentumHalalBasketV3LearningPolicy(teamAnswers(), fixture)).toEqual(first);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_BT_LIMITS);
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    expect(first.provenance.dataSources).not.toContain('MOCK');
  });

  it('fails closed on future bars and returns four aligned normalized series', () => {
    const fixture = loadTsMomentumHalalBasketV3LearningFixture();
    const future = structuredClone(fixture) as BollingerLearningReplayFixture;
    future.series[0].bars.splice(1, 0, ['2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1)] as typeof future.series[0]['bars'][number]);
    expect(() => replayTsMomentumHalalBasketV3LearningPolicy(teamAnswers(), future)).toThrow();
    const result = replayTsMomentumHalalBasketV3LearningPolicy(teamAnswers(), fixture);
    const timestamps = result.series.learner.map(point => point.ts);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(result.series[key][0].value).toBe(100);
      expect(result.series[key].map(point => point.ts)).toEqual(timestamps);
    }
    expect(new Date(result.interval.end).getTime() - new Date(result.interval.start).getTime()).toBeLessThanOrEqual(184 * 86_400_000);
  });
});
