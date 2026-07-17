import { describe, expect, it } from 'vitest';
import { DEFAULT_INTRADAY_LIMITS } from '../backtest/intradayEngine';
import { STOCKS_IN_PLAY_UNIVERSE_V1 } from '../strategies/stocksInPlayOrb';
import { VWAP_RECLAIM_V1 } from '../strategies/vwapReclaim';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import {
  loadVwapReclaimLearningFixture,
  replayVwapReclaimLearningPolicy,
  type IntradayLearningReplayFixture,
} from './strategyLearningReplay';
import { compileVwapReclaimPolicy, VWAP_RECLAIM_CURRICULUM } from './vwapReclaimCurriculum';

const answers = (): StrategyLearningAnswer[] => VWAP_RECLAIM_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('vwap-reclaim learning module', () => {
  it('has seven bilingual questions, deterministic bounded policy, and knowledge isolation', () => {
    expect(VWAP_RECLAIM_CURRICULUM.questions).toHaveLength(7);
    for (const question of VWAP_RECLAIM_CURRICULUM.questions) {
      expect(question.prompt.en.trim()).not.toBe('');
      expect(question.prompt.ar.trim()).not.toBe('');
    }
    const baseline = answers();
    const compiled = compileVwapReclaimPolicy(baseline);
    expect(compiled.params).toEqual(VWAP_RECLAIM_V1);
    expect(compileVwapReclaimPolicy(baseline)).toEqual(compiled);
    const knowledge = VWAP_RECLAIM_CURRICULUM.questions.find(question => question.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(answer => answer.questionId === knowledge.id
      ? { ...answer, optionId: knowledge.options.find(option => option.id !== answer.optionId)!.id }
      : answer);
    expect(compileVwapReclaimPolicy(changed)).toEqual(compiled);
    expect(() => compileVwapReclaimPolicy([
      ...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' },
    ])).toThrow();
  });

  it('replays the exact intraday engine deterministically with real provenance and aligned lines', () => {
    const fixture = loadVwapReclaimLearningFixture();
    const first = replayVwapReclaimLearningPolicy(answers(), fixture);
    expect(replayVwapReclaimLearningPolicy(answers(), fixture)).toEqual(first);
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
    const future = structuredClone(loadVwapReclaimLearningFixture()) as IntradayLearningReplayFixture;
    future.series[0].bars.splice(1, 0, [
      '2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1),
    ] as typeof future.series[0]['bars'][number]);
    expect(() => replayVwapReclaimLearningPolicy(answers(), future)).toThrow();
    const mock = structuredClone(loadVwapReclaimLearningFixture()) as IntradayLearningReplayFixture;
    (mock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayVwapReclaimLearningPolicy(answers(), mock)).toThrow();
  });
});
