import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRATEGY_LEARNING_SETUP_ID,
  STRATEGY_LEARNING_SETUP_IDS,
  isStrategyLearningSetupId,
} from './strategyLearningModules';

const VISIBLE_LEAGUE_SETUP_IDS_AT_M10_L8 = [
  'g6b-linear-factor-wide',
  'bollinger-mr-long-v2',
  'tom-overlay',
  'dual-momentum-rotation',
  'ts-momentum-halal-basket-v3',
  'ts-momentum-halal-basket-v2',
  'stop-hunt-reversal-long',
  'stocks-in-play-orb',
  'vwap-reclaim',
] as const;

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
  it('registers a reviewed deterministic learning module for every visible team', () => {
    expect(DEFAULT_STRATEGY_LEARNING_SETUP_ID).toBe('bollinger-mr-long-v2');
    expect([...STRATEGY_LEARNING_SETUP_IDS].sort()).toEqual(
      [...VISIBLE_LEAGUE_SETUP_IDS_AT_M10_L8].sort(),
    );
    expect(VISIBLE_LEAGUE_SETUP_IDS_AT_M10_L8.every(isStrategyLearningSetupId)).toBe(true);
    expect(isStrategyLearningSetupId('gapper-orb')).toBe(false);
  });

  it('routes direct selections to the exact lesson and gates all detailed evidence', () => {
    expect(leagueSource).toContain("searchParams.get('setup')");
    expect(leagueSource).toContain('team.setupId === requestedSetupId');
    expect(leagueSource).toContain('setupId=${encodeURIComponent(team.setupId)}');
    expect(leagueSource).toContain('summary=1');
    expect(leagueSource).toContain('isStrategyLearningSetupId(selected.setupId)');
    expect(leagueSource).toContain("{learningGateStatus === 'unlocked' ? (");
    expect(leagueSource).not.toContain('!selectedHasLearningModule');
    expect(labSource).toContain('new URLSearchParams({ locale, setupId: requestedSetupId })');
    expect(labSource).toContain("t('viewTeamEvidence')");
  });

  it('keeps the new learning-gate copy bilingual', () => {
    expect(Object.keys(en.QuantResults.learningGate)).toEqual(Object.keys(ar.QuantResults.learningGate));
    expect(en.StrategyLearning.viewTeamEvidence).toBeTruthy();
    expect(ar.StrategyLearning.viewTeamEvidence).toBeTruthy();
  });
});
