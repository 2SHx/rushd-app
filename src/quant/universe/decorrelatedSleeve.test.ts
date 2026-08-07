import { describe, expect, it } from 'vitest';
import {
  effectiveBets,
  pearson,
  selectDecorrelatedSleeve,
  type SleeveCandidate,
} from './decorrelatedSleeve';

/** Deterministic pseudo-random returns; `common` controls how much of a shared factor each carries. */
function series(seed: number, n: number, common: number, factor: readonly number[]): number[] {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
  return Array.from({ length: n }, (_, i) => common * factor[i] + (1 - common) * rnd() * 0.04);
}

const N = 120;
let f = 12345;
const FACTOR = Array.from({ length: N }, () => { f = (f * 1103515245 + 12345) & 0x7fffffff; return (f / 0x7fffffff - 0.5) * 0.04; });

function candidate(symbol: string, sector: string | null, common: number, seed: number): SleeveCandidate {
  return { symbol, sector, returns: series(seed, N, common, FACTOR) };
}

describe('pearson / effectiveBets', () => {
  it('recovers +1 and -1 exactly', () => {
    const x = [0.01, -0.02, 0.03, 0.04, -0.01];
    expect(pearson(x, x)).toBeCloseTo(1, 12);
    expect(pearson(x, x.map((v) => -v))).toBeCloseTo(-1, 12);
  });

  it('returns 0 for a constant series rather than NaN', () => {
    expect(pearson([0.01, 0.02, 0.03], [0.05, 0.05, 0.05])).toBe(0);
  });

  it('matches the measured sleeve: rho 0.326 over 98 names is ~3 effective bets', () => {
    expect(effectiveBets(0.326, 98)).toBeCloseTo(3.0, 1);
    // and the least-correlated-20 target from the same measurement
    expect(effectiveBets(0.197, 20)).toBeCloseTo(4.2, 1);
  });
});

describe('selectDecorrelatedSleeve', () => {
  it('prefers low-correlation names over high-correlation ones', () => {
    // six names loaded heavily on the common factor, four barely at all
    const candidates = [
      ...['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].map((s, i) => candidate(s, `sec${i}`, 0.95, 100 + i)),
      ...['L1', 'L2', 'L3', 'L4'].map((s, i) => candidate(s, `sec${i}`, 0.02, 200 + i)),
    ];
    const { sleeve, averageCorrelation } = selectDecorrelatedSleeve(candidates, { maxNames: 4, sectorCap: 1 });

    // the four independent names should dominate the pick
    expect(sleeve.filter((s) => s.startsWith('L')).length).toBeGreaterThanOrEqual(3);
    expect(averageCorrelation).toBeLessThan(0.5);
  });

  it('beats a dollar-volume-style pick on the SAME candidate set — the whole point', () => {
    // "liquidity order" here puts the correlated mega-caps first, as dollar volume does
    const candidates = [
      ...Array.from({ length: 8 }, (_, i) => candidate(`MEGA${i}`, `sec${i % 4}`, 0.95, 300 + i)),
      ...Array.from({ length: 8 }, (_, i) => candidate(`DIVR${i}`, `sec${i % 4}`, 0.05, 400 + i)),
    ];
    const picked = selectDecorrelatedSleeve(candidates, { maxNames: 6, sectorCap: 1 });

    // what top-by-liquidity would have taken: the first 6 in "liquidity" order
    const byLiquidity = candidates.slice(0, 6);
    const liqRho = (() => {
      let s = 0; let k = 0;
      for (let a = 0; a < byLiquidity.length; a++) {
        for (let b = a + 1; b < byLiquidity.length; b++) { s += pearson(byLiquidity[a].returns, byLiquidity[b].returns); k++; }
      }
      return s / k;
    })();

    expect(picked.averageCorrelation).toBeLessThan(liqRho);
    expect(picked.effectiveBets).toBeGreaterThan(effectiveBets(liqRho, 6));
  });

  it('enforces the sector cap — concentration cannot sneak back in', () => {
    // every genuinely uncorrelated name sits in ONE sector; the cap must still bind
    const candidates = [
      ...Array.from({ length: 10 }, (_, i) => candidate(`TECH${i}`, 'Technology', 0.02, 500 + i)),
      ...Array.from({ length: 10 }, (_, i) => candidate(`HLTH${i}`, 'Healthcare', 0.9, 600 + i)),
      ...Array.from({ length: 10 }, (_, i) => candidate(`STPL${i}`, 'Staples', 0.9, 700 + i)),
    ];
    const { sleeve, sectorCounts, excluded } = selectDecorrelatedSleeve(candidates, { maxNames: 8, sectorCap: 0.25 });

    // 3 sectors x floor(8 * 0.25) = 2 each => 6 is the most the cap permits. Returning a SHORT
    // sleeve is correct: the cap is a hard constraint, and filling to the requested count by
    // breaching it would reintroduce exactly the concentration this selector exists to remove.
    expect(sleeve).toHaveLength(6);
    for (const count of Object.values(sectorCounts)) expect(count).toBeLessThanOrEqual(2);
    expect(excluded.some((e) => e.reasonCode === 'sector_cap_reached')).toBe(true);
  });

  it('fails closed on unclassified sector, short history and zero variance', () => {
    const candidates: SleeveCandidate[] = [
      candidate('GOOD', 'Technology', 0.1, 800),
      { symbol: 'NOSEC', sector: null, returns: series(801, N, 0.1, FACTOR) },
      { symbol: 'SHORT', sector: 'Technology', returns: [0.01, 0.02, 0.03] },
      { symbol: 'FLAT', sector: 'Technology', returns: new Array(N).fill(0.001) },
    ];
    const { sleeve, excluded } = selectDecorrelatedSleeve(candidates, { maxNames: 4, sectorCap: 1 });

    expect(sleeve).toEqual(['GOOD']);
    expect(excluded.find((e) => e.symbol === 'NOSEC')?.reasonCode).toBe('unclassified_sector');
    expect(excluded.find((e) => e.symbol === 'SHORT')?.reasonCode).toBe('insufficient_history');
    expect(excluded.find((e) => e.symbol === 'FLAT')?.reasonCode).toBe('zero_variance');
  });

  it('is deterministic across repeated runs and input orderings', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => candidate(`S${i}`, `sec${i % 5}`, 0.1 + (i % 7) * 0.1, 900 + i));
    const a = selectDecorrelatedSleeve(candidates, { maxNames: 6, sectorCap: 0.5 });
    const b = selectDecorrelatedSleeve([...candidates].reverse(), { maxNames: 6, sectorCap: 0.5 });

    expect(a.sleeve).toEqual(b.sleeve);
    expect(a.averageCorrelation).toBeCloseTo(b.averageCorrelation, 12);
  });

  it('returns everything eligible when fewer candidates than maxNames', () => {
    const candidates = [candidate('A', 'Tech', 0.1, 1000), candidate('B', 'Health', 0.1, 1001)];
    expect(selectDecorrelatedSleeve(candidates, { maxNames: 10, sectorCap: 1 }).sleeve).toHaveLength(2);
  });

  it('rejects invalid options rather than silently defaulting', () => {
    const c = [candidate('A', 'Tech', 0.1, 1100)];
    expect(() => selectDecorrelatedSleeve(c, { maxNames: 0 })).toThrow(/maxNames/);
    expect(() => selectDecorrelatedSleeve(c, { maxNames: 5, sectorCap: 0 })).toThrow(/sectorCap/);
    expect(() => selectDecorrelatedSleeve(c, { maxNames: 5, sectorCap: 1.5 })).toThrow(/sectorCap/);
  });
});
