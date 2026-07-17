import { describe, expect, it } from 'vitest';
import { DEFAULT_INTRADAY_LIMITS } from '../backtest/intradayEngine';
import { STOP_HUNT_REVERSAL_V1 } from '../strategies/stopHuntReversalLong';
import { STOCKS_IN_PLAY_UNIVERSE_V1 } from '../strategies/stocksInPlayOrb';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import {
  loadStopHuntReversalLearningFixture,
  replayStopHuntReversalLearningPolicy,
  type IntradayLearningReplayFixture,
} from './strategyLearningReplay';
import {
  compileStopHuntReversalPolicy,
  STOP_HUNT_REVERSAL_CURRICULUM,
} from './stopHuntReversalCurriculum';

const answers = (): StrategyLearningAnswer[] => STOP_HUNT_REVERSAL_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('stop-hunt-reversal-long learning module', () => {
  it('has seven bilingual questions, deterministic bounded policy, and knowledge isolation', () => {
    expect(STOP_HUNT_REVERSAL_CURRICULUM.questions).toHaveLength(7);
    for (const question of STOP_HUNT_REVERSAL_CURRICULUM.questions) {
      expect(question.prompt.en.trim()).not.toBe('');
      expect(question.prompt.ar.trim()).not.toBe('');
    }
    const baseline = answers();
    const compiled = compileStopHuntReversalPolicy(baseline);
    expect(compiled.params).toEqual(STOP_HUNT_REVERSAL_V1);
    expect(compileStopHuntReversalPolicy(baseline)).toEqual(compiled);
    const knowledge = STOP_HUNT_REVERSAL_CURRICULUM.questions.find(question => question.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(answer => answer.questionId === knowledge.id
      ? { ...answer, optionId: knowledge.options.find(option => option.id !== answer.optionId)!.id }
      : answer);
    expect(compileStopHuntReversalPolicy(changed)).toEqual(compiled);
    expect(() => compileStopHuntReversalPolicy([
      ...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' },
    ])).toThrow();
  });

  it('replays the exact intraday engine deterministically with real provenance and aligned lines', () => {
    const fixture = loadStopHuntReversalLearningFixture();
    const first = replayStopHuntReversalLearningPolicy(answers(), fixture);
    expect(replayStopHuntReversalLearningPolicy(answers(), fixture)).toEqual(first);
    expect(first.provenance.strategyUniverse).toEqual(STOCKS_IN_PLAY_UNIVERSE_V1);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_INTRADAY_LIMITS);
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    expect(first.provenance.dataSources).not.toContain('MOCK');
    const timestamps = first.series.learner.map(point => point.ts);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(first.series[key][0].value).toBe(100);
      expect(first.series[key].map(point => point.ts)).toEqual(timestamps);
    }
  });

  it('fails closed on a future minute bar and MOCK provenance', () => {
    const future = structuredClone(loadStopHuntReversalLearningFixture()) as IntradayLearningReplayFixture;
    future.series[0].bars.splice(1, 0, [
      '2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1),
    ] as typeof future.series[0]['bars'][number]);
    expect(() => replayStopHuntReversalLearningPolicy(answers(), future)).toThrow();
    const mock = structuredClone(loadStopHuntReversalLearningFixture()) as IntradayLearningReplayFixture;
    (mock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayStopHuntReversalLearningPolicy(answers(), mock)).toThrow();
  });
});
