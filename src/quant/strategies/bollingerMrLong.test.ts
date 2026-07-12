import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import {
  bollingerMrLongSetup, bollinger, varianceRatio,
  type BollingerMrLongParams,
} from './bollingerMrLong';
import { filterRealDailyBars, simulateSetupDaily, type DailyBarInput } from '../backtest/engine';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2024-01-01T00:00:00.000Z').getTime();

/** Build a daily point-in-time context from a close series (high=low=close unless given). */
function ctxFromCloses(
  closes: number[],
  opts: { positionQty?: number; entryPrice?: number; entryTsDaysAgo?: number } = {},
): StrategyPointInTimeContext {
  const bars = closes.map((c, i) => ({
    id: `X-${i}`, symbol: 'X', market: 'NASDAQ', ts: new Date(BASE + i * DAY),
    open: new D(c), high: new D(c), low: new D(c), close: new D(c), volume: new D(1_000_000),
    session: 'REGULAR', source: 'YAHOO', createdAt: new Date(BASE + i * DAY),
  })) as unknown as IntradayBar[];
  const asOf = bars[bars.length - 1].ts;
  const qty = opts.positionQty ?? 0;
  return {
    symbol: 'X', market: 'NASDAQ', asOf, bars, snapshot: null, positionQty: new D(qty),
    entryPrice: opts.entryPrice != null ? new D(opts.entryPrice) : null,
    entryTs: opts.entryTsDaysAgo != null ? new Date(asOf.getTime() - opts.entryTsDaysAgo * DAY) : null,
  };
}

// Lenient test params to isolate a single rule at a time (regime gate off unless testing it).
const P = (over: Partial<BollingerMrLongParams>): BollingerMrLongParams => ({
  version: 'v1', bandPeriod: 5, entryStdev: 1, regimeLookback: 10, varianceRatioQ: 2,
  varianceRatioMax: 99, maxHoldingDays: 5, atrPeriod: 3, atrStopMult: 2, ...over,
});

describe('bollinger band math', () => {
  it('computes SMA and ±k·σ bands on a fixed window', () => {
    const b = bollinger([100, 100, 100, 100, 90], 5, 1)!;
    // mean = 490/5 = 98; pop σ = sqrt(80/5) = 4
    expect(b.sma).toBeCloseTo(98, 6);
    expect(b.lower).toBeCloseTo(94, 6);
    expect(b.upper).toBeCloseTo(102, 6);
  });
  it('returns null without enough history', () => {
    expect(bollinger([1, 2, 3], 5, 2)).toBeNull();
  });
});

describe('variance-ratio regime filter', () => {
  it('a strongly mean-reverting (alternating) series has VR < 1', () => {
    const alt: number[] = [];
    for (let i = 0; i < 40; i++) alt.push(i % 3 === 0 ? 100 : i % 3 === 1 ? 96 : 98);
    const vr = varianceRatio(alt, 30, 4)!;
    expect(vr).toBeGreaterThanOrEqual(0);
    expect(vr).toBeLessThan(1);
  });
  it('a monotone-trending series has VR > 1', () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i); // steady uptrend
    const vr = varianceRatio(up, 30, 4)!;
    expect(vr).toBeGreaterThan(1);
  });
});

describe('entry rule', () => {
  it('fires when close ≤ lower band and the regime gate passes', () => {
    const closes = [...Array(10).fill(100), 100, 100, 100, 100, 90]; // last-5 window dips to 90
    const res = bollingerMrLongSetup.entry(ctxFromCloses(closes), P({}));
    expect(res.matched).toBe(true);
  });
  it('does NOT fire when close is above the lower band', () => {
    const closes = [...Array(10).fill(100), 98, 100, 102, 100, 101]; // last-5 σ≈1.33, lower≈98.9
    const res = bollingerMrLongSetup.entry(ctxFromCloses(closes), P({}));
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('above_lower_band');
  });
  it('is BLOCKED by the regime gate in a trending series (VR>1)', () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    const screen = bollingerMrLongSetup.screen(ctxFromCloses(up), P({ varianceRatioMax: 1 }));
    expect(screen.matched).toBe(false);
    expect(screen.reasons).toContain('regime_not_mean_reverting');
  });
});

describe('exit rule (stateless, entry-relative via ctx)', () => {
  it('exits at the mid band (close ≥ SMA)', () => {
    const closes = [...Array(10).fill(90), 90, 92, 94, 96, 100]; // SMA(5)=94.4, close 100 ≥ it
    const res = bollingerMrLongSetup.exit(ctxFromCloses(closes, { positionQty: 10, entryPrice: 95, entryTsDaysAgo: 0 }), P({}));
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('mid_band_reversion');
  });
  it('fires the ATR hard stop when close ≤ entry − mult·ATR', () => {
    const closes = [...Array(10).fill(100), 100, 98, 96, 94, 80];
    const res = bollingerMrLongSetup.exit(ctxFromCloses(closes, { positionQty: 10, entryPrice: 100, entryTsDaysAgo: 0 }), P({}));
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('atr_hard_stop');
  });
  it('fires the time stop at maxHoldingDays', () => {
    const closes = [...Array(10).fill(100), 90, 90, 90, 90, 90]; // below SMA → no mid-band exit
    const res = bollingerMrLongSetup.exit(ctxFromCloses(closes, { positionQty: 10, entryPrice: 90, entryTsDaysAgo: 10 }), P({ maxHoldingDays: 5, atrStopMult: 99 }));
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('max_holding_days');
  });
  it('holds (no exit) with no position', () => {
    const res = bollingerMrLongSetup.exit(ctxFromCloses([100, 100, 100, 100, 100]), P({}));
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('no_long_position');
  });
});

describe('MOCK-row exclusion (no-mock directive)', () => {
  const bar = (i: number, source: DailyBarInput['source']): DailyBarInput => ({
    ts: new Date(BASE + i * DAY), open: new D(100), high: new D(101), low: new D(99),
    close: new D(100), volume: new D(1e6), source,
  });

  it('filterRealDailyBars drops every MOCK bar and reports the count', () => {
    const mixed = [bar(0, 'YAHOO'), bar(1, 'MOCK'), bar(2, 'ALPACA'), bar(3, 'MOCK')];
    const { real, excludedMock } = filterRealDailyBars(mixed);
    expect(excludedMock).toBe(2);
    expect(real).toHaveLength(2);
    expect(real.every((b) => b.source !== 'MOCK')).toBe(true);
  });

  it('a MOCK bar in range never reaches the simulator', () => {
    // 30 real bars + one MOCK bar spliced mid-range. After filtering, the sim consumes only reals.
    const reals: DailyBarInput[] = Array.from({ length: 30 }, (_, i) => bar(i, 'YAHOO'));
    const withMock = [...reals.slice(0, 15), bar(15, 'MOCK'), ...reals.slice(15).map((b, i) => bar(16 + i, 'YAHOO'))];
    const { real, excludedMock } = filterRealDailyBars(withMock);
    expect(excludedMock).toBe(1);
    const sim = simulateSetupDaily({
      setup: bollingerMrLongSetup, symbol: 'X', market: 'NASDAQ',
      bars: real.map((b) => ({ ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
      startingCash: new D(100_000),
    });
    expect(sim.barsProcessed).toBe(real.length); // == 30, the MOCK bar excluded
  });
});
