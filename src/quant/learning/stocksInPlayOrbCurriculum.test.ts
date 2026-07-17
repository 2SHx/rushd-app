import { describe, expect, it } from 'vitest';
import { DEFAULT_INTRADAY_LIMITS } from '../backtest/intradayEngine';
import { STOCKS_IN_PLAY_ORB_V1, STOCKS_IN_PLAY_UNIVERSE_V1 } from '../strategies/stocksInPlayOrb';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import { STOCKS_IN_PLAY_ORB_CURRICULUM, compileStocksInPlayOrbPolicy } from './stocksInPlayOrbCurriculum';
import { loadStocksInPlayOrbLearningFixture, replayStocksInPlayOrbLearningPolicy, type IntradayLearningReplayFixture } from './strategyLearningReplay';

const answers = (): StrategyLearningAnswer[] => STOCKS_IN_PLAY_ORB_CURRICULUM.questions.map(question => ({
  questionId: question.id, optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('stocks-in-play-orb learning module', () => {
  it('has seven bilingual questions, deterministic bounded policy, and knowledge isolation', () => {
    expect(STOCKS_IN_PLAY_ORB_CURRICULUM.questions).toHaveLength(7);
    for (const q of STOCKS_IN_PLAY_ORB_CURRICULUM.questions) { expect(q.prompt.en.trim()).not.toBe(''); expect(q.prompt.ar.trim()).not.toBe(''); }
    const baseline = answers(); const compiled = compileStocksInPlayOrbPolicy(baseline);
    expect(compiled.params).toEqual(STOCKS_IN_PLAY_ORB_V1);
    expect(compileStocksInPlayOrbPolicy(baseline)).toEqual(compiled);
    const knowledge = STOCKS_IN_PLAY_ORB_CURRICULUM.questions.find(q => q.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(a => a.questionId === knowledge.id ? { ...a, optionId: knowledge.options.find(o => o.id !== a.optionId)!.id } : a);
    expect(compileStocksInPlayOrbPolicy(changed)).toEqual(compiled);
    expect(() => compileStocksInPlayOrbPolicy([...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' }])).toThrow();
  });

  it('replays the exact intraday engine deterministically with real provenance and aligned lines', () => {
    const fixture = loadStocksInPlayOrbLearningFixture();
    const first = replayStocksInPlayOrbLearningPolicy(answers(), fixture);
    expect(replayStocksInPlayOrbLearningPolicy(answers(), fixture)).toEqual(first);
    expect(first.provenance.strategyUniverse).toEqual(STOCKS_IN_PLAY_UNIVERSE_V1);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_INTRADAY_LIMITS);
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    expect(first.provenance.dataSources).not.toContain('MOCK');
    const timestamps = first.series.learner.map(p => p.ts);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(first.series[key][0].value).toBe(100);
      expect(first.series[key].map(p => p.ts)).toEqual(timestamps);
    }
  });

  it('fails closed on a future minute bar and MOCK provenance', () => {
    const future = structuredClone(loadStocksInPlayOrbLearningFixture()) as IntradayLearningReplayFixture;
    future.series[0].bars.splice(1, 0, ['2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1)] as typeof future.series[0]['bars'][number]);
    expect(() => replayStocksInPlayOrbLearningPolicy(answers(), future)).toThrow();
    const mock = structuredClone(loadStocksInPlayOrbLearningFixture()) as IntradayLearningReplayFixture;
    (mock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayStocksInPlayOrbLearningPolicy(answers(), mock)).toThrow();
  });
});
