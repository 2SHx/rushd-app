import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import type { StrategyLearningAnswer } from './bollingerMrLongV2Curriculum';
import {
  loadTsMomentumHalalBasketV2LearningFixture,
  replayTsMomentumHalalBasketV2LearningPolicy,
  type BollingerLearningReplayFixture,
} from './strategyLearningReplay';
import { TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM } from './tsMomentumHalalBasketV2Curriculum';

const teamAnswers: StrategyLearningAnswer[] = TS_MOMENTUM_HALAL_BASKET_V2_CURRICULUM.questions.map(question => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION' ? question.teamOptionId : question.correctOptionId,
}));

describe('ts-momentum-halal-basket-v2 learning replay', () => {
  it('is deterministic and preserves the exact risk, fill, Sharia, and real-data provenance', () => {
    const fixture = loadTsMomentumHalalBasketV2LearningFixture();
    const first = replayTsMomentumHalalBasketV2LearningPolicy(teamAnswers, fixture);
    expect(replayTsMomentumHalalBasketV2LearningPolicy(teamAnswers, fixture)).toEqual(first);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_BT_LIMITS);
    expect(first.provenance.fillModel).toBe('DECIDE_CLOSE_FILL_NEXT_OPEN_10BPS_COMMISSION_5BPS_SLIPPAGE');
    expect(first.provenance.sharia.executionBlocked).toBe(true);
    expect(first.provenance.dataSources).not.toContain('MOCK');
  });

  it('fails closed on future bars and mock provenance', () => {
    const future = structuredClone(loadTsMomentumHalalBasketV2LearningFixture()) as BollingerLearningReplayFixture;
    future.series[0].bars.splice(1, 0, ['2099-01-02T00:00:00.000Z', ...future.series[0].bars[0].slice(1)] as typeof future.series[0]['bars'][number]);
    expect(() => replayTsMomentumHalalBasketV2LearningPolicy(teamAnswers, future)).toThrow(/Look-ahead|future/i);
    const mock = structuredClone(loadTsMomentumHalalBasketV2LearningFixture()) as BollingerLearningReplayFixture;
    (mock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayTsMomentumHalalBasketV2LearningPolicy(teamAnswers, mock)).toThrow();
  });

  it('returns four aligned normalized-100 series on the frozen short interval', () => {
    const result = replayTsMomentumHalalBasketV2LearningPolicy(
      teamAnswers,
      loadTsMomentumHalalBasketV2LearningFixture(),
    );
    const timestamps = result.series.learner.map(point => point.ts);
    expect(new Date(result.interval.end).getTime() - new Date(result.interval.start).getTime())
      .toBeLessThanOrEqual(184 * 86_400_000);
    for (const key of ['learner', 'team', 'spus', 'spy'] as const) {
      expect(result.series[key][0].value).toBe(100);
      expect(result.series[key].map(point => point.ts)).toEqual(timestamps);
      expect(result.metrics[key]).toEqual(expect.objectContaining({
        return: expect.any(Number), maxDrawdown: expect.any(Number),
        annualizedVolatility: expect.any(Number), trades: expect.any(Number),
      }));
    }
  });
});
