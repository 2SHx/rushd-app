import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { TOM_OVERLAY_V1 } from '../strategies/tomOverlay';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import { loadTomOverlayLearningFixture, replayTomOverlayLearningPolicy, type BollingerLearningReplayFixture } from './strategyLearningReplay';
import { TOM_OVERLAY_CURRICULUM, compileTomOverlayPolicy } from './tomOverlayCurriculum';

const answers = (): StrategyLearningAnswer[] => TOM_OVERLAY_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('tom-overlay learning module', () => {
  it('has seven bilingual questions and compiles only bounded policy decisions', () => {
    expect(TOM_OVERLAY_CURRICULUM.questions).toHaveLength(7);
    for (const question of TOM_OVERLAY_CURRICULUM.questions) {
      expect(question.prompt.en.trim()).not.toBe('');
      expect(question.prompt.ar.trim()).not.toBe('');
    }
    const baseline = answers();
    const compiled = compileTomOverlayPolicy(baseline);
    expect(compiled.params).toEqual(TOM_OVERLAY_V1);
    expect(compileTomOverlayPolicy(baseline)).toEqual(compiled);
    const knowledge = TOM_OVERLAY_CURRICULUM.questions.find(question => question.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(answer => answer.questionId === knowledge.id
      ? { ...answer, optionId: knowledge.options.find(option => option.id !== answer.optionId)!.id }
      : answer);
    expect(compileTomOverlayPolicy(changed)).toEqual(compiled);
    expect(() => compileTomOverlayPolicy([...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' }])).toThrow();
  });

  it('replays the exact fixed SPUS book deterministically with hard gates and four aligned lines', () => {
    const fixture = loadTomOverlayLearningFixture();
    const first = replayTomOverlayLearningPolicy(answers(), fixture);
    expect(replayTomOverlayLearningPolicy(answers(), fixture)).toEqual(first);
    expect(first.provenance.strategyUniverse).toEqual(['SPUS']);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_BT_LIMITS);
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    const timestamps = first.series.learner.map(point => point.ts);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(first.series[key][0].value).toBe(100);
      expect(first.series[key].map(point => point.ts)).toEqual(timestamps);
    }
  });

  it('fails closed on a future bar and mock provenance', () => {
    const future = structuredClone(loadTomOverlayLearningFixture()) as BollingerLearningReplayFixture;
    future.series[0].bars.splice(1, 0, ['2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1)] as typeof future.series[0]['bars'][number]);
    expect(() => replayTomOverlayLearningPolicy(answers(), future)).toThrow();
    const mock = structuredClone(loadTomOverlayLearningFixture()) as BollingerLearningReplayFixture;
    (mock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayTomOverlayLearningPolicy(answers(), mock)).toThrow();
  });
});
