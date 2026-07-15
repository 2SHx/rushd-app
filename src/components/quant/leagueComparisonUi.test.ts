import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chartSource = readFileSync(new URL('./HistoricalComparisonChart.tsx', import.meta.url), 'utf8');
const leagueSource = readFileSync(new URL('./StrategyLeagueClient.tsx', import.meta.url), 'utf8');

describe('strategy league comparison UX', () => {
  it('ranks deterministically before handing comparisons to the chart', () => {
    expect(leagueSource).toContain('b.oos.deflatedSharpe - a.oos.deflatedSharpe');
    expect(leagueSource).toContain('drawdownDifference');
    expect(leagueSource).toContain('a.setupId.localeCompare(b.setupId)');
    expect(leagueSource).toContain('comparisons={rankedTeams.flatMap');
    expect(leagueSource).toContain('rank: index + 1');
  });

  it('shows three ranked curves by default and keeps the rest optional', () => {
    expect(chartSource).toContain('rankedEntries.filter(entry => entry.rank <= 3)');
    expect(chartSource).toContain('aria-expanded={showAll}');
    expect(chartSource).toContain('aria-controls="historical-strategy-series"');
  });

  it('compares only curves with identical displayed test periods', () => {
    expect(chartSource).toContain('entry.comparison.start === comparison.start');
    expect(chartSource).toContain('entry.comparison.end === comparison.end');
    expect(chartSource).not.toContain('entry.comparison.oosStart === comparison.oosStart');
  });
});
