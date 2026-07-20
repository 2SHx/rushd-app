import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  technicalAnalyst,
  TECHNICAL_PARAMS,
  wma,
  hma,
  macdCrossover,
  bollingerBandwidth,
  isBollingerSqueeze,
} from './technical';
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

  it('conviction never exceeds the calibrated cap', async () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + i);
    const sig = await technicalAnalyst.run(ctxFrom(closes));
    expect(sig.conviction).toBeLessThanOrEqual(TECHNICAL_PARAMS.convictionCap);
    expect(sig.evidence.some((e) => e.ref === 'params_version' && e.value === TECHNICAL_PARAMS.version)).toBe(true);
  });
});

describe('indicator primitives (pure, closed-bar)', () => {
  it('WMA weights the most recent value highest', () => {
    // window [1,2,3], period 3 ⇒ (1·1 + 2·2 + 3·3)/6 = 14/6
    expect(wma([1, 2, 3], 3).at(-1)).toBeCloseTo(14 / 6, 12);
  });

  it('HMA tracks a linear trend with less lag than WMA', () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + i);
    const lagHma = closes.at(-1)! - hma(closes, 21).at(-1)!;
    const lagWma = closes.at(-1)! - wma(closes, 21).at(-1)!;
    expect(lagHma).toBeLessThan(lagWma);
    expect(Math.abs(lagHma)).toBeLessThan(1); // near-zero lag on a pure trend
  });

  it('detects a fresh MACD signal-line crossover on the last closed bar only', () => {
    expect(macdCrossover([1, -1, 1], [0, 0, 0])).toBe(1); // crossed up at the end
    expect(macdCrossover([-1, 1, -1], [0, 0, 0])).toBe(-1); // crossed down at the end
    expect(macdCrossover([1, 2, 3], [0, 0, 0])).toBe(0); // no cross
    expect(macdCrossover([1], [0])).toBe(0); // insufficient history
  });

  it('flags a Bollinger bandwidth squeeze after volatility contraction', () => {
    // 70 noisy bars then 30 flat bars ⇒ latest bandwidth in the bottom quantile.
    const closes = [
      ...Array.from({ length: 70 }, (_, i) => 100 + 10 * Math.sin(i)),
      ...Array.from({ length: 30 }, () => 100),
    ];
    const bw = bollingerBandwidth(closes, 20, 2);
    expect(isBollingerSqueeze(bw, 60, 0.25)).toBe(true);
    // Noisy tail ⇒ no squeeze.
    const noisy = Array.from({ length: 100 }, (_, i) => 100 + 10 * Math.sin(i));
    expect(isBollingerSqueeze(bollingerBandwidth(noisy, 20, 2), 60, 0.25)).toBe(false);
    // Insufficient lookback ⇒ never claims a squeeze.
    expect(isBollingerSqueeze(bw.slice(0, 30), 60, 0.25)).toBe(false);
  });
});

describe('conviction calibration against the frozen captured-real fixture', () => {
  type FixtureBar = [string, number, number, number, number, number];
  interface LearningFixture {
    series: { symbol: string; source: string; bars: FixtureBar[] }[];
  }

  it(
    'convictionCap does not exceed the point-in-time measured directional hit rate',
    { timeout: 60_000 },
    async () => {
      const fixture = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), 'src/quant/learning/fixtures/dual-momentum-rotation.learning-replay-v1.json'),
          'utf8',
        ),
      ) as LearningFixture;

      const horizon = TECHNICAL_PARAMS.horizonDays;
      let signals = 0;
      let hits = 0;
      for (const s of fixture.series) {
        const bars = s.bars.map((b, i) => ({
          id: String(i),
          symbol: s.symbol,
          market: 'NASDAQ',
          interval: 'DAY',
          ts: new Date(b[0]),
          open: b[1], high: b[2], low: b[3], close: b[4],
          volume: b[5],
          source: s.source,
          createdAt: new Date(b[0]),
        }));
        for (let i = 40; i < bars.length - horizon; i++) {
          const visible = bars.slice(Math.max(0, i + 1 - 120), i + 1);
          const ctx = {
            symbol: s.symbol,
            market: 'NASDAQ',
            asOf: bars[i].ts,
            bars: () => visible,
            fundamentals: () => null,
            news: () => [],
          } as unknown as PointInTimeContext;
          const sig = await technicalAnalyst.run(ctx);
          if (sig.stance === 'NEUTRAL') continue;
          const fwd = bars[i + horizon].close / bars[i].close - 1;
          signals++;
          if ((sig.stance === 'BULLISH' && fwd > 0) || (sig.stance === 'BEARISH' && fwd < 0)) hits++;
        }
      }

      expect(signals).toBeGreaterThan(1000); // a decisive sample, not anecdote
      const hitRate = hits / signals;
      // The cap is honest only while it stays at/below what the signal actually delivered.
      expect(TECHNICAL_PARAMS.convictionCap).toBeLessThanOrEqual(hitRate);
    },
  );
});
