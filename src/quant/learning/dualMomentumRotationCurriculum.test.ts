import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { DUAL_MOMENTUM_ROTATION_V1, DUAL_MOMENTUM_UNIVERSE } from '../strategies/dualMomentumRotation';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import { DUAL_MOMENTUM_ROTATION_CURRICULUM, compileDualMomentumRotationPolicy } from './dualMomentumRotationCurriculum';
import { loadDualMomentumRotationLearningFixture, replayDualMomentumRotationLearningPolicy, type BollingerLearningReplayFixture } from './strategyLearningReplay';

const answers = (): StrategyLearningAnswer[] => DUAL_MOMENTUM_ROTATION_CURRICULUM.questions.map(question => ({
  questionId: question.id, optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('dual-momentum-rotation learning module', () => {
  it('has seven bilingual questions, deterministic bounded policy, and knowledge isolation', () => {
    expect(DUAL_MOMENTUM_ROTATION_CURRICULUM.questions).toHaveLength(7);
    for (const q of DUAL_MOMENTUM_ROTATION_CURRICULUM.questions) {
      expect(q.prompt.en.trim()).not.toBe(''); expect(q.prompt.ar.trim()).not.toBe('');
    }
    const baseline = answers(); const compiled = compileDualMomentumRotationPolicy(baseline);
    expect(compiled.params).toEqual(DUAL_MOMENTUM_ROTATION_V1);
    expect(compileDualMomentumRotationPolicy(baseline)).toEqual(compiled);
    const knowledge = DUAL_MOMENTUM_ROTATION_CURRICULUM.questions.find(q => q.role === 'KNOWLEDGE_CHECK')!;
    const changed = baseline.map(a => a.questionId === knowledge.id ? { ...a, optionId: knowledge.options.find(o => o.id !== a.optionId)!.id } : a);
    expect(compileDualMomentumRotationPolicy(changed)).toEqual(compiled);
    expect(() => compileDualMomentumRotationPolicy([...baseline.slice(0, -1), { ...baseline.at(-1)!, optionId: 'unsafe' }])).toThrow();
  });

  it('replays the exact fixed book deterministically with real PIT provenance and aligned lines', () => {
    const fixture = loadDualMomentumRotationLearningFixture();
    const first = replayDualMomentumRotationLearningPolicy(answers(), fixture);
    expect(replayDualMomentumRotationLearningPolicy(answers(), fixture)).toEqual(first);
    expect(first.provenance.strategyUniverse).toEqual(DUAL_MOMENTUM_UNIVERSE);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_BT_LIMITS);
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    const timestamps = first.series.learner.map(p => p.ts);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(first.series[key][0].value).toBe(100);
      expect(first.series[key].map(p => p.ts)).toEqual(timestamps);
    }
  });

  it('fails closed on future bars and MOCK provenance', () => {
    const future = structuredClone(loadDualMomentumRotationLearningFixture()) as BollingerLearningReplayFixture;
    future.series[0].bars.splice(1, 0, ['2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1)] as typeof future.series[0]['bars'][number]);
    expect(() => replayDualMomentumRotationLearningPolicy(answers(), future)).toThrow();
    const mock = structuredClone(loadDualMomentumRotationLearningFixture()) as BollingerLearningReplayFixture;
    (mock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayDualMomentumRotationLearningPolicy(answers(), mock)).toThrow();
  });
});
