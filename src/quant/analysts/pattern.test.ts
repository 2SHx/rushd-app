import { describe, it, expect } from 'vitest';
import {
  patternAnalyst,
  qualifiedAnalogCandidates,
  toReturns,
  PATTERN_WINDOW,
  FORWARD_HORIZON,
  MIN_ANALOGS,
} from './pattern';
import type { PointInTimeContext } from '../data/pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');

/** Build a minimal point-in-time context from a close series (flat volume). */
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

/** Sine-shaped oscillation (period = PATTERN_WINDOW) riding a steady upward drift, so
 * many historical windows share the current window's shape AND (because of the drift)
 * overwhelmingly agree on a positive forward return. */
function repeatingUptrend(count: number): number[] {
  const drift = 0.003;
  const amplitude = 0.005;
  return Array.from({ length: count }, (_, i) => 100 * Math.exp(drift * i) * (1 + amplitude * Math.sin((2 * Math.PI * i) / PATTERN_WINDOW)));
}

describe('patternAnalyst', () => {
  it('abstains when history is too short to even form a shape window', async () => {
    const sig = await patternAnalyst.run(ctxFrom(Array.from({ length: 15 }, (_, i) => 100 + i)));
    expect(sig.failureMode).toBe('abstain');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.evidence).toHaveLength(0);
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
    expect(sig.agent).toBe('PATTERN_ANALOG');
  });

  it('abstains when qualified non-overlapping analogs are fewer than MIN_ANALOGS', async () => {
    // ~500 bars ⇒ well short of the ~1040 needed to reach MIN_ANALOGS=100 packed analogs.
    const sig = await patternAnalyst.run(ctxFrom(repeatingUptrend(500)));
    expect(sig.failureMode).toBe('abstain');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.evidence).toHaveLength(0);
  });

  it('yields a non-abstain BULLISH stance with validity true and analog count >= MIN_ANALOGS on ample repeating history', async () => {
    const sig = await patternAnalyst.run(ctxFrom(repeatingUptrend(1200)));
    expect(sig.failureMode).toBe('ok');
    expect(sig.stance).toBe('BULLISH');
    expect(sig.conviction).toBeGreaterThan(0);
    expect(sig.determinism).toBe('deterministic');
    expect(sig.costCents).toBe(0);
    const validity = sig.evidence.find((e) => e.ref === 'validity');
    expect(validity?.value).toBe('true');
    const count = Number(sig.evidence.find((e) => e.ref === 'analog_count')!.value);
    expect(count).toBeGreaterThanOrEqual(MIN_ANALOGS);
  });

  it('is deterministic — same input yields byte-identical output', async () => {
    const closes = repeatingUptrend(1200);
    const a = await patternAnalyst.run(ctxFrom(closes));
    const b = await patternAnalyst.run(ctxFrom(closes));
    expect(a).toEqual(b);
  });

  it('leakage guard: a candidate dated inside the current lookback is never counted', () => {
    // n = 50 rets, currentStart = 30 (last PATTERN_WINDOW rets are the query window).
    // Only start=0 clears (start + WINDOW + HORIZON = 30 <= currentStart); start=25
    // (shape window [25,45) overlaps the current window [30,50)) must be excluded.
    const closes = Array.from({ length: 51 }, (_, i) => 100 + i * 0.1);
    const rets = toReturns(closes);
    const currentStart = rets.length - PATTERN_WINDOW; // 30
    const pool = qualifiedAnalogCandidates(closes, rets, currentStart);
    expect(pool.find((c) => c.start === 25)).toBeUndefined();
    for (const c of pool) {
      expect(c.start + PATTERN_WINDOW + FORWARD_HORIZON).toBeLessThanOrEqual(currentStart);
    }
  });

  it('non-overlap guard: accepted analogs never share a forward-return window', async () => {
    const closes = repeatingUptrend(1200);
    const rets = toReturns(closes);
    const currentStart = rets.length - PATTERN_WINDOW;
    const pool = qualifiedAnalogCandidates(closes, rets, currentStart);
    expect(pool.length).toBeGreaterThanOrEqual(MIN_ANALOGS);
    const starts = pool.map((c) => c.start).sort((x, y) => x - y);
    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(FORWARD_HORIZON);
    }
  });
});
