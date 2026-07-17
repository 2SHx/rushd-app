import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRATEGY_LEARNING_SETUP_ID,
  isStrategyLearningSetupId,
} from './strategyLearningModules';

const leagueSource = readFileSync(
  new URL('../../components/quant/StrategyLeagueClient.tsx', import.meta.url),
  'utf8',
);
const labSource = readFileSync(
  new URL('../../components/learning/StrategyLearningLab.tsx', import.meta.url),
  'utf8',
);
const en = JSON.parse(readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'));
const ar = JSON.parse(readFileSync(new URL('../../../messages/ar.json', import.meta.url), 'utf8'));

describe('Mavericks strategy-learning bridge', () => {
  it('recognizes only strategies with a reviewed deterministic learning module', () => {
    expect(DEFAULT_STRATEGY_LEARNING_SETUP_ID).toBe('bollinger-mr-long-v2');
    expect(isStrategyLearningSetupId('bollinger-mr-long-v2')).toBe(true);
    expect(isStrategyLearningSetupId('ts-momentum-halal-basket-v2')).toBe(true);
    expect(isStrategyLearningSetupId('ts-momentum-halal-basket-v3')).toBe(true);
    expect(isStrategyLearningSetupId('gapper-orb')).toBe(false);
  });

  it('gates detailed evidence using the exact setup completion and returns to that team', () => {
    expect(leagueSource).toContain('summary=1');
    expect(leagueSource).toContain('isStrategyLearningSetupId(selected.setupId)');
    expect(leagueSource).toContain("learningGateStatus === 'unlocked'");
    expect(labSource).toContain('new URLSearchParams({ locale, setupId: requestedSetupId })');
    expect(labSource).toContain("t('viewTeamEvidence')");
  });

  it('keeps the new learning-gate copy bilingual', () => {
    expect(Object.keys(en.QuantResults.learningGate)).toEqual(Object.keys(ar.QuantResults.learningGate));
    expect(en.StrategyLearning.viewTeamEvidence).toBeTruthy();
    expect(ar.StrategyLearning.viewTeamEvidence).toBeTruthy();
  });
});
