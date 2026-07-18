import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const committee = readFileSync(new URL('./CommitteeClient.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../Navigation.tsx', import.meta.url), 'utf8');
const quantPage = readFileSync(new URL('../../app/[locale]/quant/page.tsx', import.meta.url), 'utf8');
const legacyTeamsPage = readFileSync(new URL('../../app/[locale]/quant/league/page.tsx', import.meta.url), 'utf8');
const learningLab = readFileSync(new URL('../learning/StrategyLearningLab.tsx', import.meta.url), 'utf8');

describe('Quant Advisor and Strategy Teams integration', () => {
  it('uses the real strategy lab and evidence league inside the advisor workspace', () => {
    expect(committee).toContain("dynamic(() => import('./RunLabPanel'))");
    expect(committee).toContain("dynamic(() => import('./StrategyLeagueClient'))");
    expect(committee).toContain("useState<'advisor' | 'teams' | 'portfolio'>");
    expect(committee).toContain("activeTab === 'teams'");
    expect(committee).not.toContain('MavericksSquadPanel');
    expect(committee).not.toContain('Launch Market Simulation');
  });

  it('keeps one canonical navigation entry and preserves team deep links', () => {
    expect(navigation).not.toContain('/quant/league');
    expect(quantPage).toContain('initialStrategyTeams={league?.teams}');
    expect(quantPage).toContain('initialSection={initialSection}');
    expect(legacyTeamsPage).toContain("new URLSearchParams({ section: 'teams' })");
    expect(legacyTeamsPage).toContain("query.set('setup', searchParams.setup)");
    expect(learningLab).toContain('/quant?section=teams&setup=');
  });
});
