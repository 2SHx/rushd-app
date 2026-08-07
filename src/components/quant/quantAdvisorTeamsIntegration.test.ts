import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const committee = readFileSync(new URL('./CommitteeClient.tsx', import.meta.url), 'utf8');
const navigation = readFileSync(new URL('../Navigation.tsx', import.meta.url), 'utf8');
const quantPage = readFileSync(new URL('../../app/[locale]/quant/page.tsx', import.meta.url), 'utf8');
const legacyTeamsPage = readFileSync(new URL('../../app/[locale]/quant/league/page.tsx', import.meta.url), 'utf8');
const learningLab = readFileSync(new URL('../learning/StrategyLearningLab.tsx', import.meta.url), 'utf8');

describe('Quant Advisor and Strategy Teams integration', () => {
  it('uses the real strategy lab and evidence league inside the advisor workspace', () => {
    expect(committee).toContain("import RunLabPanel from './RunLabPanel'");
    expect(committee).toContain("import StrategyLeagueClient from './StrategyLeagueClient'");
    expect(committee).toContain('useState<QuantSection>');
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

  it('passes honest persisted portfolio availability into analytics', () => {
    expect(quantPage).toContain('initialNAV={portfolio?.initialNAV ?? null}');
    expect(quantPage).toContain('initialPerformanceStatus={performanceStatus}');
    expect(quantPage).not.toContain('initialNAV={portfolio?.initialNAV ?? 100000}');
  });
});
