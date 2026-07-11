import { describe, expect, it } from 'vitest';
import { listFixtureFiles, loadAllFixtures, loadFixture } from './fixtureLoader';

describe('captured intraday fixtures', () => {
  it('ships 6-10 schema-validated real symbol-days with deterministic filenames', () => {
    const files = listFixtureFiles();
    const fixtures = loadAllFixtures();

    expect(fixtures.length).toBeGreaterThanOrEqual(6);
    expect(fixtures.length).toBeLessThanOrEqual(10);
    expect(new Set(fixtures.map((fixture) => fixture.verification.classification))).toEqual(new Set(['gapper', 'control']));
    expect(files).toEqual([...files].sort());
    for (const fixture of fixtures) {
      expect(['ALPACA', 'YAHOO']).toContain(fixture.source);
      expect(loadFixture(fixture.symbol, fixture.date)).toEqual(fixture);
      expect(files).toContain(`${fixture.symbol}_${fixture.date}.json`);
    }
  });

  it('recomputes every verification field from the captured bars', () => {
    for (const fixture of loadAllFixtures()) {
      const cumulativeVolume = fixture.bars.reduce((sum, bar) => sum + bar.volume, 0);
      const preBars = fixture.bars.filter((bar) => bar.session === 'PRE');
      const priorClose = fixture.verification.priorClose;
      const move = preBars.length && priorClose
        ? ((preBars.at(-1)!.close - priorClose) / priorClose) * 100
        : null;
      const classification = move != null && Math.abs(move) >= 5 && cumulativeVolume >= 10_000_000
        ? 'gapper'
        : 'control';

      expect(fixture.verification.cumVolume).toBe(cumulativeVolume);
      expect(fixture.verification.premarketMovePct).toBe(move);
      expect(fixture.verification.classification).toBe(classification);
      expect(fixture.fundamentals).not.toBeNull();
      expect(fixture.fundamentals!.marketCap).toBeCloseTo(
        fixture.fundamentals!.sharesOutstanding * fixture.verification.priorClose!,
        2,
      );
      expect(new Date(fixture.fundamentals!.releasedAt).getTime()).toBeLessThanOrEqual(
        new Date(`${fixture.date}T23:59:59.999Z`).getTime(),
      );
    }
  });
});
