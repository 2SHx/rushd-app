import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  mulberry32, bootstrapTradeOutcomes, signFlipPermutationTest,
  fractionalKellyFraction, kellySizedDecision,
} from './monteCarlo';
import type { MarketState, PortfolioState, RiskLimits } from '../risk/envelope';

const D = Prisma.Decimal;
const TRADES = [0.03, -0.02, 0.05, -0.01, 0.02, -0.03, 0.04, -0.015, 0.025, -0.02];

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
    const bookDays = [0.004, -0.003, 0.002, -0.001, 0.003, -0.002];
    const sharedA = bootstrapTradeOutcomes(bookDays, {
      resamples: 1000, seed: 7, startEquity: 100_000, observationUnit: 'book-day',
    });
    const sharedB = bootstrapTradeOutcomes(bookDays, {
      resamples: 1000, seed: 7, startEquity: 100_000, observationUnit: 'book-day',
    });

    expect(legacy).not.toHaveProperty('observationUnit');
    expect(sharedA.observationUnit).toBe('book-day');
    expect(sharedA).toEqual(sharedB);
    expect(sharedA.maxDrawdown.p95).toBeLessThan(0.1);
  });
});

describe('signFlipPermutationTest — seeded', () => {
  it('is reproducible for a fixed seed and returns a p-value in [0,1]', () => {
    const p1 = signFlipPermutationTest(TRADES, { permutations: 1000, seed: 3 });
    const p2 = signFlipPermutationTest(TRADES, { permutations: 1000, seed: 3 });
    expect(p1.pValue).toEqual(p2.pValue);
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
