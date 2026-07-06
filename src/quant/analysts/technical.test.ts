import { describe, it, expect } from 'vitest';
import { technicalAnalyst } from './technical';
import type { PointInTimeContext } from '../data/pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');

/** Build a minimal point-in-time context from a close series (flat volume, no wicks). */
function ctxFrom(closes: number[]): PointInTimeContext {
  const bars = closes.map((c, i) => ({
    id: String(i),
    symbol: 'AAPL',
    market: 'NASDAQ',
    interval: 'DAY',
    ts: new Date(asOf.getTime() - (closes.length - 1 - i) * 86_400_000),
    open: c, high: c, low: c, close: c,
    volume: 1000,
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

describe('technicalAnalyst', () => {
  it('abstains with insufficient history (<30 bars)', async () => {
    const sig = await technicalAnalyst.run(ctxFrom(Array.from({ length: 20 }, (_, i) => 100 + i)));
    expect(sig.failureMode).toBe('abstain');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.evidence).toHaveLength(0);
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
    expect(sig.agent).toBe('TECHNICAL');
  });

  it('is BULLISH on a clean uptrend', async () => {
    const sig = await technicalAnalyst.run(ctxFrom(Array.from({ length: 60 }, (_, i) => 100 + i)));
    expect(sig.failureMode).toBe('ok');
    expect(sig.stance).toBe('BULLISH');
    expect(sig.conviction).toBeGreaterThan(0);
    expect(sig.determinism).toBe('deterministic');
    expect(sig.costCents).toBe(0);
    expect(sig.evidence.length).toBeGreaterThan(0);
  });

  it('is BEARISH on a clean downtrend', async () => {
    const sig = await technicalAnalyst.run(ctxFrom(Array.from({ length: 60 }, (_, i) => 200 - i)));
    expect(sig.failureMode).toBe('ok');
    expect(sig.stance).toBe('BEARISH');
    expect(sig.conviction).toBeGreaterThan(0);
  });

  it('is deterministic — same input yields identical output', async () => {
    const closes = Array.from({ length: 90 }, (_, i) => 100 + Math.sin(i / 5) * 8 + i * 0.2);
    const a = await technicalAnalyst.run(ctxFrom(closes));
    const b = await technicalAnalyst.run(ctxFrom(closes));
    expect(a).toEqual(b);
  });

  it('RSI evidence stays within [0, 100] across trends', async () => {
    const upSig = await technicalAnalyst.run(ctxFrom(Array.from({ length: 60 }, (_, i) => 100 + i)));
    const downSig = await technicalAnalyst.run(ctxFrom(Array.from({ length: 60 }, (_, i) => 200 - i)));
    const rsiOf = (sig: typeof upSig) => Number(sig.evidence.find((e) => e.ref === 'RSI(14)')!.value);
    expect(rsiOf(upSig)).toBeGreaterThanOrEqual(0);
    expect(rsiOf(upSig)).toBeLessThanOrEqual(100);
    expect(rsiOf(downSig)).toBeGreaterThanOrEqual(0);
    expect(rsiOf(downSig)).toBeLessThanOrEqual(100);
  });
});
