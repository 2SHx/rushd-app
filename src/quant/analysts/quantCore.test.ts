import { describe, it, expect } from 'vitest';
import { quantCoreAnalyst } from './quantCore';
import type { PointInTimeContext } from '../data/pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');

/** Build a minimal point-in-time context from a close series (volume flat). */
function ctxFrom(closes: number[], volumes?: number[]): PointInTimeContext {
  const bars = closes.map((c, i) => ({
    id: String(i),
    symbol: 'AAPL',
    market: 'NASDAQ',
    interval: 'DAY',
    ts: new Date(asOf.getTime() - (closes.length - 1 - i) * 86_400_000),
    open: c, high: c, low: c, close: c,
    volume: volumes ? volumes[i] : 1000,
    source: 'MOCK',
    createdAt: asOf,
  })) as any;
  return {
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    bars: () => bars,
    fundamentals: () => null,
    news: () => [],
  };
}

describe('quantCoreAnalyst', () => {
  it('abstains with insufficient history (<60 bars)', async () => {
    const sig = await quantCoreAnalyst.run(ctxFrom(Array.from({ length: 30 }, (_, i) => 100 + i)));
    expect(sig.failureMode).toBe('abstain');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.evidence).toHaveLength(0);
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
  });

  it('is BULLISH on a sustained uptrend', async () => {
    const sig = await quantCoreAnalyst.run(ctxFrom(Array.from({ length: 220 }, (_, i) => 100 + i)));
    expect(sig.failureMode).toBe('ok');
    expect(sig.stance).toBe('BULLISH');
    expect(sig.conviction).toBeGreaterThan(0);
    expect(sig.determinism).toBe('deterministic');
    expect(sig.costCents).toBe(0);
    expect(sig.evidence.length).toBeGreaterThan(0);
    expect(sig.agent).toBe('QUANT_CORE');
  });

  it('is BEARISH on a sustained downtrend', async () => {
    const sig = await quantCoreAnalyst.run(ctxFrom(Array.from({ length: 220 }, (_, i) => 320 - i)));
    expect(sig.stance).toBe('BEARISH');
    expect(sig.conviction).toBeGreaterThan(0);
  });

  it('is deterministic — same input yields byte-identical output', async () => {
    const closes = Array.from({ length: 150 }, (_, i) => 100 + Math.sin(i / 5) * 8 + i * 0.2);
    const a = await quantCoreAnalyst.run(ctxFrom(closes));
    const b = await quantCoreAnalyst.run(ctxFrom(closes));
    expect(a).toEqual(b);
  });
});
