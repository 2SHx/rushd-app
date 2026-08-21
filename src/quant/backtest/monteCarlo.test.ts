import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  BOOK_DAY_MOVING_BLOCK_LENGTH_V1, mulberry32, bootstrapMonthlyBlocks, bootstrapTradeOutcomes,
  movingBlockSampleIndices, signFlipPermutationTest, maxDrawdownPathLengthSensitivity,
  fractionalKellyFraction, kellySizedDecision,
} from './monteCarlo';
import type { MarketState, PortfolioState, RiskLimits } from '../risk/envelope';

const D = Prisma.Decimal;
const TRADES = [0.03, -0.02, 0.05, -0.01, 0.02, -0.03, 0.04, -0.015, 0.025, -0.02];

describe('monthly-block bootstrap', () => {
  it('is seeded and resamples compounded contiguous blocks rather than iid days', () => {
    const blocks = [[0.1, -0.05], [0.02], [-0.01, 0.03]];
    const first = bootstrapMonthlyBlocks(blocks, { seed: 77, resamples: 1_000 });
    const second = bootstrapMonthlyBlocks(blocks, { seed: 77, resamples: 1_000 });

    expect(first).toEqual(second);
    expect(first.observationUnit).toBe('monthly-block');
    expect(first.nBlocks).toBe(3);
    expect(first.blocksPerPath).toBe(3);
    expect(first.observedBlockReturns[0]).toBeCloseTo(0.045, 12);
  });
});

describe('mulberry32 determinism', () => {
  it('same seed ⇒ identical stream, different seed ⇒ different stream', () => {
    const a = mulberry32(42); const b = mulberry32(42); const c = mulberry32(43);
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    const seqC = Array.from({ length: 8 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });
});

describe('bootstrapTradeOutcomes — seeded reproducibility', () => {
  it('same seed ⇒ byte-identical distribution, different seed ⇒ different', () => {
    const r1 = bootstrapTradeOutcomes(TRADES, { resamples: 1000, seed: 7, startEquity: 100_000 });
    const r2 = bootstrapTradeOutcomes(TRADES, { resamples: 1000, seed: 7, startEquity: 100_000 });
    const r3 = bootstrapTradeOutcomes(TRADES, { resamples: 1000, seed: 99, startEquity: 100_000 });
    expect(JSON.stringify(r1)).toEqual(JSON.stringify(r2));
    expect(JSON.stringify(r1)).not.toEqual(JSON.stringify(r3));
    expect(r1.resamples).toBeGreaterThanOrEqual(1000);
    expect(r1.maxDrawdown.p95).toBeGreaterThanOrEqual(r1.maxDrawdown.p50);
    expect(r1.riskOfRuin).toBeGreaterThanOrEqual(0);
    expect(r1.riskOfRuin).toBeLessThanOrEqual(1);
  });

  it('bootstrap floors resamples at 1000 even if fewer requested', () => {
    const r = bootstrapTradeOutcomes(TRADES, { resamples: 10, seed: 1 });
    expect(r.resamples).toBe(1000);
  });

  it('labels shared-book daily observations without changing legacy trade output', () => {
    const legacy = bootstrapTradeOutcomes(TRADES, { resamples: 1000, seed: 7, startEquity: 100_000 });
    const bookDays = Array.from({ length: 30 }, (_, index) => index % 2 === 0 ? 0.002 : -0.001);
    const sharedA = bootstrapTradeOutcomes(bookDays, {
      resamples: 1000, seed: 7, startEquity: 100_000, observationUnit: 'book-day',
    });
    const sharedB = bootstrapTradeOutcomes(bookDays, {
      resamples: 1000, seed: 7, startEquity: 100_000, observationUnit: 'book-day',
    });

    expect(legacy).not.toHaveProperty('observationUnit');
    expect(legacy.method).toBe('iid');
    expect(sharedA.observationUnit).toBe('book-day');
    expect(sharedA.method).toBe('moving-block');
    expect(sharedA.blockLength).toBe(BOOK_DAY_MOVING_BLOCK_LENGTH_V1);
    expect(sharedA).toEqual(sharedB);
    expect(sharedA.maxDrawdown.p95).toBeLessThan(0.1);
  });

  it('replays seeded moving blocks and preserves contiguous runs within each block', () => {
    const opts = { seed: 81, sampleLength: 12, blockLength: 3 };
    const first = movingBlockSampleIndices(10, opts);
    const second = movingBlockSampleIndices(10, opts);

    expect(first).toEqual(second);
    expect(first).toHaveLength(12);
    for (let offset = 0; offset < first.length; offset += opts.blockLength) {
      const block = first.slice(offset, offset + opts.blockLength);
      expect(block.every((index, i) => i === 0 || index === block[i - 1] + 1)).toBe(true);
    }
  });
});

describe('signFlipPermutationTest — seeded', () => {
  it('is reproducible for a fixed seed and returns a p-value in [0,1]', () => {
    const p1 = signFlipPermutationTest(TRADES, { permutations: 1000, seed: 3 });
    const p2 = signFlipPermutationTest(TRADES, { permutations: 1000, seed: 3 });
    expect(p1.pValue).toEqual(p2.pValue);
    expect(p1.method).toBe('independent-sign-flip');
    expect(p1.pValue).toBeGreaterThanOrEqual(0);
    expect(p1.pValue).toBeLessThanOrEqual(1);
  });
});

describe('fractional-Kelly clamped by the envelope', () => {
  const limits: RiskLimits = {
    maxNameWeight: 0.1, maxGrossExposure: 1.0, maxOpenPositions: 5,
    maxRiskPct: 0.02, volTargetPct: 0.02, liquidityAdvFraction: 0.05, drawdownHaltPct: 0.3,
  };
  const equity = new D(100_000);
  const pf: PortfolioState = { equity, cash: equity, positions: [], peakEquity: equity };
  const mkt: MarketState = { symbol: 'X', price: new D(10), atr: new D(1), adv: new D(50_000), stopPrice: new D(9) };

  it('a hot Kelly fraction is clamped below the raw Kelly qty by the envelope', () => {
    // Strongly-positive edge → large raw Kelly fraction.
    const hot = [0.2, 0.2, 0.2, -0.05, 0.2, 0.2, -0.05, 0.2];
    const sized = kellySizedDecision(hot, pf, mkt, limits, 0.5);
    expect(sized.kellyFraction).toBeGreaterThan(0);
    // Envelope must clamp: name-weight cap = 0.1×100k / 10 = 1000 shares is one binding cap;
    // vol-target (0.02×100k/1 = 2000) and liquidity (0.05×50k = 2500) also bind.
    expect(sized.envelope.qty.lt(sized.proposedQty)).toBe(true);
    expect(Number(sized.envelope.qty.toString())).toBeLessThanOrEqual(1000);
    expect(sized.envelope.adjustments.length).toBeGreaterThan(0);
  });

  it('fractionalKellyFraction floors at zero for a negative edge', () => {
    expect(fractionalKellyFraction(0.3, 1, 0.25)).toBe(0);
  });

  it('kelly never proposes past the envelope even at full fraction', () => {
    const sized = kellySizedDecision(TRADES, pf, mkt, limits, 1.0);
    // whatever Kelly wants, the traded qty obeys the name-weight cap
    expect(Number(sized.envelope.qty.toString())).toBeLessThanOrEqual(1000 + 1e-9);
  });
});

describe('QDR-19 max-drawdown path-length sensitivity (published, never gated)', () => {
  // A mildly negative-drift series with real dispersion, so drawdowns actually accumulate.
  const returns = Array.from({ length: 500 }, (_, i) => 0.0015 + 0.02 * Math.sin(i * 1.31) - 0.0004 * (i % 7));

  it('marks exactly one binding length and re-runs the SAME bootstrap at the others', () => {
    const points = maxDrawdownPathLengthSensitivity(returns, {
      seed: 2026, resamples: 1000, observationUnit: 'book-day', blockLength: 20,
      tradesPerPath: 500, referencePathLengths: [250, 1000],
    });
    expect(points.map((p) => p.pathLength)).toEqual([250, 500, 1000]);
    expect(points.filter((p) => p.binding)).toHaveLength(1);
    expect(points.find((p) => p.binding)!.pathLength).toBe(500);
    // The binding point must equal the binding bootstrap byte-for-byte — it is the SAME run, not a
    // re-estimate, or the disclosure and the gate would be reading different numbers.
    const binding = bootstrapTradeOutcomes(returns, {
      seed: 2026, resamples: 1000, observationUnit: 'book-day', blockLength: 20, tradesPerPath: 500,
    });
    expect(points.find((p) => p.binding)!.p95).toBe(binding.maxDrawdown.p95);
  });

  it('shows the p95 RISING with path length — the defect the disclosure exists to expose', () => {
    // Max drawdown is a divergent extreme-value statistic: a longer path has more chances to print
    // a worse worst point, so its p95 grows with length by construction. QDR-19 measured ~6.3pp per
    // natural-log unit; the direction is what matters and is asserted here.
    const points = maxDrawdownPathLengthSensitivity(returns, {
      seed: 7, resamples: 1000, observationUnit: 'book-day', blockLength: 20,
      referencePathLengths: [200, 400, 800, 1600],
    });
    for (let i = 1; i < points.length; i++) {
      expect(points[i].p95).toBeGreaterThanOrEqual(points[i - 1].p95);
    }
    expect(points[points.length - 1].p95).toBeGreaterThan(points[0].p95);
  });

  it('is deterministic and never re-seeds the binding run', () => {
    const opts = {
      seed: 99, resamples: 1000, observationUnit: 'book-day' as const, blockLength: 20,
      referencePathLengths: [300, 700],
    };
    expect(JSON.stringify(maxDrawdownPathLengthSensitivity(returns, opts)))
      .toBe(JSON.stringify(maxDrawdownPathLengthSensitivity(returns, opts)));
  });
});
