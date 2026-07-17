import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { G6B_LINEAR_FACTOR_WIDE_V2 } from '../strategies/g6bLinearFactorWide';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import {
  compileG6bLinearFactorWidePolicy,
  G6B_LINEAR_FACTOR_WIDE_CURRICULUM,
} from './g6bLinearFactorWideCurriculum';
import {
  loadG6bLinearFactorWideLearningFixture,
  replayG6bLinearFactorWideLearningPolicy,
  type BollingerLearningReplayFixture,
} from './strategyLearningReplay';

const answers = (): StrategyLearningAnswer[] => G6B_LINEAR_FACTOR_WIDE_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('g6b-linear-factor-wide learning module', () => {
  it('has seven bilingual questions, deterministic bounded policy, and knowledge isolation', () => {
    expect(G6B_LINEAR_FACTOR_WIDE_CURRICULUM.questions).toHaveLength(7);
    for (const question of G6B_LINEAR_FACTOR_WIDE_CURRICULUM.questions) {
      expect(question.prompt.en.trim()).not.toBe('');
      expect(question.prompt.ar.trim()).not.toBe('');
    }
    const baseline = answers();
    const compiled = compileG6bLinearFactorWidePolicy(baseline);
    expect(compiled.params).toEqual(G6B_LINEAR_FACTOR_WIDE_V2);
    expect(compileG6bLinearFactorWidePolicy(baseline)).toEqual(compiled);
    const knowledge = G6B_LINEAR_FACTOR_WIDE_CURRICULUM.questions.find(question => question.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(answer => answer.questionId === knowledge.id
      ? { ...answer, optionId: knowledge.options.find(option => option.id !== answer.optionId)!.id }
      : answer);
    expect(compileG6bLinearFactorWidePolicy(changed)).toEqual(compiled);
    expect(() => compileG6bLinearFactorWidePolicy([
      ...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' },
    ])).toThrow();
  });

  it('replays the exact memory-bounded wide book with its sealed roster and four aligned lines', () => {
    const fixture = loadG6bLinearFactorWideLearningFixture();
    const first = replayG6bLinearFactorWideLearningPolicy(answers(), fixture);
    expect(replayG6bLinearFactorWideLearningPolicy(answers(), fixture)).toEqual(first);
    expect(first.provenance.strategyUniverse).toHaveLength(2_473);
    expect(first.provenance.sourceRunId).toBe('26f5f132-6bdf-48be-9ad9-2d370642ef53');
    expect(first.provenance.riskLimits).toEqual(DEFAULT_BT_LIMITS);
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    expect(first.provenance.dataSources).toEqual(['YAHOO']);
    const timestamps = first.series.learner.map(point => point.ts);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(first.series[key][0].value).toBe(100);
      expect(first.series[key].map(point => point.ts)).toEqual(timestamps);
    }
  });

  it('fails closed on a future bar and MOCK provenance', () => {
    const fixture = loadG6bLinearFactorWideLearningFixture();
    const future = {
      ...fixture,
      series: fixture.series.map((item, index) => index === 0
        ? { ...item, bars: [
          item.bars[0],
          ['2099-01-02T00:00:00.000Z', ...item.bars[0].slice(1)] as typeof item.bars[number],
          ...item.bars.slice(1),
        ] }
        : item),
    } as BollingerLearningReplayFixture;
    expect(() => replayG6bLinearFactorWideLearningPolicy(answers(), future)).toThrow();
    const mock = {
      ...fixture,
      series: fixture.series.map((item, index) => index === 0
        ? { ...item, source: 'MOCK' }
        : item),
    } as unknown as BollingerLearningReplayFixture;
    expect(() => replayG6bLinearFactorWideLearningPolicy(answers(), mock)).toThrow();
  });
});
