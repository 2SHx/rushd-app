import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { BOLLINGER_MR_LONG_V2_CURRICULUM } from './bollingerMrLongV2Curriculum';
import {
  loadBollingerMrLongV2LearningFixture,
  replayBollingerMrLongV2LearningPolicy,
  type BollingerLearningReplayFixture,
} from './strategyLearningReplay';

const teamAnswers = BOLLINGER_MR_LONG_V2_CURRICULUM.questions.map((question) => ({
  questionId: question.id,
  optionId: question.role === 'POLICY_DECISION'
    ? question.teamOptionId
    : question.correctOptionId,
}));

describe('strategy learning replay', () => {
  it('replays deterministically with exact team risk/Sharia context', () => {
    const fixture = loadBollingerMrLongV2LearningFixture();
    const first = replayBollingerMrLongV2LearningPolicy(teamAnswers, fixture);
    const second = replayBollingerMrLongV2LearningPolicy(teamAnswers, fixture);

    expect(second).toEqual(first);
    expect(first.provenance.riskLimits).toEqual(DEFAULT_BT_LIMITS);
    expect(first.provenance.sharia).toEqual({
      screened: false,
      source: 'none',
      state: 'UNSCREENED_EXECUTION_BLOCKED',
      executionBlocked: true,
    });
    expect(first.provenance.fillModel).toBe('DECIDE_CLOSE_FILL_NEXT_OPEN_10BPS_COMMISSION_5BPS_SLIPPAGE');
    expect(first.provenance.strategyUniverse).toEqual(fixture.strategyUniverse);
  });

  it('fails closed on a future bar and rejects MOCK provenance', () => {
    const fixture = loadBollingerMrLongV2LearningFixture();
    const withFutureBar = structuredClone(fixture) as BollingerLearningReplayFixture;
    const bars = withFutureBar.series[0].bars;
    bars.splice(1, 0, [
      '2099-01-02T00:00:00.000Z',
      ...bars[0].slice(1),
    ] as typeof bars[number]);

    expect(() => replayBollingerMrLongV2LearningPolicy(teamAnswers, withFutureBar))
      .toThrow(/Look-ahead|future/i);

    const withMock = structuredClone(fixture) as BollingerLearningReplayFixture;
    (withMock.series[0] as { source: string }).source = 'MOCK';
    expect(() => replayBollingerMrLongV2LearningPolicy(teamAnswers, withMock)).toThrow();
  });

  it('returns four aligned normalized-100 series and the required process metrics', () => {
    const result = replayBollingerMrLongV2LearningPolicy(
      teamAnswers,
      loadBollingerMrLongV2LearningFixture(),
    );
    const keys = ['learner', 'team', 'spus', 'spy'] as const;
    const timestamps = result.series.learner.map(point => point.ts);

    expect(new Date(result.interval.end).getTime() - new Date(result.interval.start).getTime())
      .toBeLessThanOrEqual(184 * 86_400_000);
    for (const key of keys) {
      expect(result.series[key][0].value).toBe(100);
      expect(result.series[key].map(point => point.ts)).toEqual(timestamps);
      expect(result.metrics[key]).toEqual(expect.objectContaining({
        return: expect.any(Number),
        maxDrawdown: expect.any(Number),
        annualizedVolatility: expect.any(Number),
        trades: expect.any(Number),
      }));
    }
    expect(result.basis).toBe('NORMALIZED_100_WEEKLY_CLOSE_PRICE_NO_DIVIDENDS');
    expect(result.labels.spy).toBe('S&P 500 ETF price-only proxy');
  });

  it('keeps the frozen team line independent from bounded learner choices', () => {
    const learnerAnswers = BOLLINGER_MR_LONG_V2_CURRICULUM.questions.map(question => ({
      questionId: question.id,
      optionId: question.role === 'POLICY_DECISION'
        ? question.options[0].id
        : question.correctOptionId,
    }));
    const result = replayBollingerMrLongV2LearningPolicy(
      learnerAnswers,
      loadBollingerMrLongV2LearningFixture(),
    );

    expect(result.series.learner).not.toEqual(result.series.team);
    expect(result.metrics.learner.trades).not.toBe(result.metrics.team.trades);
  });
});
