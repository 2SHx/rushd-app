import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/authz', () => ({
  can: ({ tier }: { tier: string }, capability: string) => tier === 'ULTRA' || (tier === 'PREMIUM' ? capability !== 'academy:track:advanced-financial-analysis' : capability === 'academy:track:foundations'),
}));
import { ACADEMY_TRACKS } from '@/academy/registry';
import { filterAcademyTracks, practiceLinkHref } from './academyAccess';

const files = ['./AcademyCheckpoint.tsx', './AcademyState.tsx', './PracticeLinks.tsx', './StrategyPracticeEntry.tsx', './academyAccess.ts', './academyServer.ts', '../../app/[locale]/academy/page.tsx', '../../app/[locale]/academy/[trackId]/page.tsx', '../../app/[locale]/academy/[trackId]/[unitId]/[lessonId]/page.tsx'];
const source = files.map((file) => readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
const academyLandingSource = readFileSync(new URL('../../app/[locale]/academy/page.tsx', import.meta.url), 'utf8');
const strategyEntrySource = readFileSync(new URL('./StrategyPracticeEntry.tsx', import.meta.url), 'utf8');
const quizSource = readFileSync(new URL('../../app/[locale]/quiz/page.tsx', import.meta.url), 'utf8');
const en = JSON.parse(readFileSync(new URL('../../../messages/en.json', import.meta.url), 'utf8'));
const ar = JSON.parse(readFileSync(new URL('../../../messages/ar.json', import.meta.url), 'utf8'));

describe('academy UI server boundary', () => {
  it('filters tracks by tier and child segment before rendering', () => {
    const kids = filterAcademyTracks(ACADEMY_TRACKS, { role: 'CHILD', tier: 'BASIC', ageSegment: 'KIDS' });
    expect(kids.map((track) => track.id)).toEqual(['foundations']);
    expect(kids.flatMap((track) => track.units).flatMap((unit) => unit.lessons).every((lesson) => lesson.ageSegment === 'KIDS')).toBe(true);
    const parent = filterAcademyTracks(ACADEMY_TRACKS, { role: 'PARENT', tier: 'ULTRA', ageSegment: 'KIDS' });
    expect(new Set(parent.flatMap((track) => track.units).flatMap((unit) => unit.lessons).map((lesson) => lesson.ageSegment))).toEqual(new Set(['KIDS', 'TEENS', 'ADULTS']));
  });
  it('maps every theory link to the exact existing practice surface', () => {
    for (const link of ACADEMY_TRACKS.flatMap((track) => track.units).flatMap((unit) => unit.practiceLinks)) {
      const href = practiceLinkHref(link);
      expect(href).toBe(link.kind === 'strategySetup' ? `/academy/apply?setupId=${encodeURIComponent(link.setupId)}` : `/academy/practice?topic=${encodeURIComponent(link.topic).replace(/%20/g, '+')}`);
    }
    expect(quizSource).toContain("QUIZ_TOPICS.find((item) => item.topic === searchParams.topic)");
    expect(quizSource).toContain('useState(requestedTopic !== null)');
  });
  it('matches an explicit risk-comfort choice to one exact strategy before questions', () => {
    expect(academyLandingSource).toContain('<StrategyPracticeEntry locale={params.locale} />');
    expect(strategyEntrySource).toContain("useState<RiskChoice | null>(null)");
    expect(strategyEntrySource).toContain("'ts-momentum-halal-basket-v3'");
    expect(strategyEntrySource).toContain("'bollinger-mr-long-v2'");
    expect(strategyEntrySource).toContain("'stocks-in-play-orb'");
    expect(strategyEntrySource).toContain('aria-pressed={isSelected}');
    expect(strategyEntrySource).toContain('/academy/apply?setupId=${encodeURIComponent(selected.setupId)}');
  });
  it('ships populated, loading, empty, and error states with logical RTL classes', () => {
    expect(source).toContain("state: 'ready'"); expect(source).toContain('kind="empty"');
    expect(readFileSync(new URL('../../app/[locale]/academy/error.tsx', import.meta.url), 'utf8')).toContain('onClick={reset}');
    expect(readFileSync(new URL('../../app/[locale]/academy/loading.tsx', import.meta.url), 'utf8')).toContain('aria-busy');
    expect(source).not.toMatch(/(?:^|[\s"'`])(?:left|right|ml|mr|pl|pr)-/m);
  });
  it('keeps Academy chrome keys identical in English and Arabic', () => {
    expect(Object.keys(en.Academy)).toEqual(Object.keys(ar.Academy)); expect(Object.keys(en.Academy.compliance)).toEqual(Object.keys(ar.Academy.compliance));
    expect(Object.keys(en.Academy.labEntry)).toEqual(Object.keys(ar.Academy.labEntry));
    expect(Object.keys(en.Academy.labEntry.steps)).toEqual(Object.keys(ar.Academy.labEntry.steps));
    expect(Object.keys(en.Academy.labEntry.riskOptions)).toEqual(Object.keys(ar.Academy.labEntry.riskOptions));
    expect(Object.keys(en.Academy.labEntry.strategies)).toEqual(Object.keys(ar.Academy.labEntry.strategies));
  });
});
