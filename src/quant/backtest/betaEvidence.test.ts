import { describe, expect, it } from 'vitest';
import {
  alignFiveSessionBlocks,
  annualizedFromBlocks,
  betaGateDeclaration,
  betaVsBenchmark,
  realizedAnnualCostDragBps,
  realizedAnnualTurnover,
  sessionKey,
  type BookPoint,
} from './betaEvidence';
import { nonOverlappingFiveSessionBookReturns } from '../strategies/halalSpusVolManagedBeta';

const DAY = 86_400_000;

/** n book points at 1-day spacing from 2026-01-01, equity following `equityAt`. */
function points(n: number, equityAt: (i: number) => number): BookPoint[] {
  const t0 = Date.UTC(2026, 0, 1);
  return Array.from({ length: n }, (_, i) => ({ ts: new Date(t0 + i * DAY), equity: equityAt(i) }));
}

function benchMap(pts: readonly BookPoint[], closeAt: (i: number) => number, skip: Set<number> = new Set()) {
  const m = new Map<string, number>();
  pts.forEach((p, i) => { if (!skip.has(i)) m.set(sessionKey(p.ts), closeAt(i)); });
  return m;
}

describe('alignFiveSessionBlocks', () => {
  it('uses the SAME block convention as nonOverlappingFiveSessionBookReturns', () => {
    // 16 points => blocks [0,5], [5,10], [10,15] => 3 returns from both implementations.
    const pts = points(16, (i) => 100 * 1.01 ** i);
    const aligned = alignFiveSessionBlocks(pts, benchMap(pts, (i) => 50 * 1.005 ** i));
    const canonical = nonOverlappingFiveSessionBookReturns(pts);

    expect(aligned.bookReturns).toHaveLength(canonical.length);
    aligned.bookReturns.forEach((r, i) => expect(r).toBeCloseTo(canonical[i], 12));
    expect(aligned.benchmarkReturns).toHaveLength(aligned.bookReturns.length);
    expect(aligned.droppedBlocks).toBe(0);
  });

  it('computes the benchmark return from the SAME boundary sessions as the book block', () => {
    const pts = points(6, (i) => 100 + i);
    // benchmark doubles exactly across the block boundary sessions 0 -> 5
    const bench = new Map([[sessionKey(pts[0].ts), 10], [sessionKey(pts[5].ts), 20]]);
    const aligned = alignFiveSessionBlocks(pts, bench);
    expect(aligned.benchmarkReturns).toEqual([1]);
    expect(aligned.bookReturns[0]).toBeCloseTo(105 / 100 - 1, 12);
  });

  it('DROPS a block from BOTH series when the benchmark is missing at either boundary', () => {
    const pts = points(16, (i) => 100 * 1.01 ** i);
    // remove the close boundary of the middle block (index 10)
    const bench = benchMap(pts, (i) => 50 * 1.005 ** i, new Set([10]));
    const aligned = alignFiveSessionBlocks(pts, bench);

    // blocks [0,5] ok; [5,10] loses its close; [10,15] loses its open => 1 kept, 2 dropped
    expect(aligned.bookReturns).toHaveLength(1);
    expect(aligned.benchmarkReturns).toHaveLength(1);
    expect(aligned.droppedBlocks).toBe(2);
    // the surviving pair is the FIRST block, not a re-indexed survivor
    expect(aligned.bookReturns[0]).toBeCloseTo(1.01 ** 5 - 1, 12);
  });

  it('never forward-fills a stale close across a missing session', () => {
    const pts = points(11, (i) => 100 + i);
    const bench = benchMap(pts, () => 42, new Set([5]));
    const aligned = alignFiveSessionBlocks(pts, bench);
    // both blocks touch session 5, so both must be dropped rather than reusing a neighbour's close
    expect(aligned.bookReturns).toHaveLength(0);
    expect(aligned.droppedBlocks).toBe(2);
  });

  it('rejects non-positive equity or benchmark closes instead of emitting a bogus return', () => {
    const pts = points(6, (i) => (i === 5 ? 0 : 100));
    expect(alignFiveSessionBlocks(pts, benchMap(pts, () => 10)).droppedBlocks).toBe(1);

    const ok = points(6, () => 100);
    expect(alignFiveSessionBlocks(ok, benchMap(ok, (i) => (i === 0 ? -1 : 10))).droppedBlocks).toBe(1);
  });

  it('keeps the two series index-comparable, which is what beta and captures depend on', () => {
    const pts = points(21, (i) => 100 * 1.02 ** i);
    const bench = benchMap(pts, (i) => 80 * 1.01 ** i, new Set([10]));
    const { bookReturns, benchmarkReturns } = alignFiveSessionBlocks(pts, bench);
    expect(bookReturns).toHaveLength(benchmarkReturns.length);
  });
});

describe('betaVsBenchmark', () => {
  it('recovers a known slope', () => {
    const bench = [0.02, -0.01, 0.03, -0.02, 0.015];
    const book = bench.map((m) => 0.6 * m); // exactly beta 0.6, no residual
    expect(betaVsBenchmark(book, bench)).toBeCloseTo(0.6, 12);
  });

  it('returns 0 rather than NaN when the benchmark never moves', () => {
    expect(betaVsBenchmark([0.01, 0.02, 0.03], [0.01, 0.01, 0.01])).toBe(0);
  });

  it('returns 0 below two paired observations', () => {
    expect(betaVsBenchmark([0.01], [0.02])).toBe(0);
  });
});

describe('annualizedFromBlocks', () => {
  it('annualizes a compounded block series', () => {
    // 50.4 five-session blocks per year; +1% per block for exactly one year
    const r = Array.from({ length: 50 }, () => 0.01);
    const cagr = annualizedFromBlocks(r, 50.4);
    expect(cagr).toBeCloseTo(Math.pow(1.01 ** 50, 50.4 / 50) - 1, 10);
  });

  it('treats a total loss as terminal, not NaN', () => {
    expect(annualizedFromBlocks([0.01, -1], 50.4)).toBe(-1);
  });

  it('returns 0 on an empty series', () => {
    expect(annualizedFromBlocks([], 50.4)).toBe(0);
  });
});

describe('betaGateDeclaration — fails closed, never defaults', () => {
  const complete = {
    validation: {
      productClass: 'BETA',
      observationsPerYear: 50.4,
      volCeiling: 0.13,
      volFloor: 0.06,
      maxAnnualTurnover: 2.6,
      maxAnnualCostDragBps: 60,
      sealedCostModel: { commissionBpsPerSide: 10, slippageBpsPerSide: 5, advParticipationCap: 0.05 },
    },
  };

  it('reads a complete declaration', () => {
    const gate = betaGateDeclaration(complete);
    expect(gate).not.toBeNull();
    expect(gate!.volCeiling).toBe(0.13);
    expect(gate!.sealedCostModel.commissionBpsPerSide).toBe(10);
  });

  it('returns null when ANY threshold is missing — a preregistration cannot be half-declared', () => {
    for (const key of ['observationsPerYear', 'volCeiling', 'volFloor', 'maxAnnualTurnover', 'maxAnnualCostDragBps']) {
      const partial = { validation: { ...complete.validation, [key]: undefined } };
      expect(betaGateDeclaration(partial), `missing ${key} must fail closed`).toBeNull();
    }
  });

  it('returns null when any sealed cost-model field is missing', () => {
    for (const key of ['commissionBpsPerSide', 'slippageBpsPerSide', 'advParticipationCap']) {
      const partial = {
        validation: { ...complete.validation, sealedCostModel: { ...complete.validation.sealedCostModel, [key]: undefined } },
      };
      expect(betaGateDeclaration(partial), `missing ${key} must fail closed`).toBeNull();
    }
    expect(betaGateDeclaration({ validation: { ...complete.validation, sealedCostModel: undefined } })).toBeNull();
  });

  it('rejects non-positive and non-numeric thresholds rather than coercing them', () => {
    expect(betaGateDeclaration({ validation: { ...complete.validation, volCeiling: 0 } })).toBeNull();
    expect(betaGateDeclaration({ validation: { ...complete.validation, volCeiling: -0.13 } })).toBeNull();
    expect(betaGateDeclaration({ validation: { ...complete.validation, volCeiling: '0.13' } })).toBeNull();
    expect(betaGateDeclaration({ validation: { ...complete.validation, volCeiling: Number.NaN } })).toBeNull();
  });

  it('returns null for an ALPHA setup that declares no validation block at all', () => {
    expect(betaGateDeclaration({ lookbackDays: 252 })).toBeNull();
    expect(betaGateDeclaration(null)).toBeNull();
    expect(betaGateDeclaration(undefined)).toBeNull();
  });
});

describe('turnover and cost drag', () => {
  it('expresses turnover as a multiple of average NAV per year', () => {
    // $2.6M of executed notional on a $1M book over 1 year => 2.6x
    expect(realizedAnnualTurnover(2_600_000, 1_000_000, 1)).toBeCloseTo(2.6, 12);
  });

  it('derives cost drag at the engine per-side cost', () => {
    // 2.6x turnover at 10 + 5 bps per side => 39 bps/yr
    expect(realizedAnnualCostDragBps(2.6, 10, 5)).toBeCloseTo(39, 12);
  });

  it('degrades to 0 on degenerate inputs rather than propagating NaN', () => {
    expect(realizedAnnualTurnover(1, 0, 1)).toBe(0);
    expect(realizedAnnualTurnover(1, 100, 0)).toBe(0);
    expect(realizedAnnualCostDragBps(0, 10, 5)).toBe(0);
  });
});
