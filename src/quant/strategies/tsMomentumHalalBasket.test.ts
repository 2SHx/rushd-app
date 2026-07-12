import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import {
  tsMomentumHalalBasketSetup, momentum, ema, annualizedRealizedVol,
  NASDAQ_HALAL_UNIVERSE, type TsMomentumHalalBasketParams,
} from './tsMomentumHalalBasket';
import { filterRealDailyBars, simulateSetupDaily, type DailyBarInput } from '../backtest/engine';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2022-01-01T00:00:00.000Z').getTime();

/** Daily point-in-time context from a close series (high=low=close). */
function ctxFromCloses(
  cl: number[],
  opts: { positionQty?: number } = {},
): StrategyPointInTimeContext {
  const bars = cl.map((c, i) => ({
    id: `X-${i}`, symbol: 'X', market: 'NASDAQ', ts: new Date(BASE + i * DAY),
    open: new D(c), high: new D(c), low: new D(c), close: new D(c), volume: new D(1_000_000),
    session: 'REGULAR', source: 'YAHOO', createdAt: new Date(BASE + i * DAY),
  })) as unknown as IntradayBar[];
  const asOf = bars[bars.length - 1].ts;
  return {
    symbol: 'X', market: 'NASDAQ', asOf, bars, snapshot: null,
    positionQty: new D(opts.positionQty ?? 0), entryPrice: null, entryTs: null,
  };
}

// Small lookbacks isolate one rule at a time (real v1 is 252/63/100).
const P = (over: Partial<TsMomentumHalalBasketParams> = {}): TsMomentumHalalBasketParams => ({
  version: 'v1', longMomLookback: 20, shortMomLookback: 5, emaExitPeriod: 10,
  realizedVolLookback: 10, targetAnnualVol: 0.2, ...over,
});

describe('momentum / ema / realized-vol primitives', () => {
  it('momentum = last/past − 1 over the lookback', () => {
    expect(momentum([100, 110, 120], 2)).toBeCloseTo(0.2, 9); // 120/100 − 1
    expect(momentum([100, 90], 1)).toBeCloseTo(-0.1, 9);
  });
  it('momentum null without enough history', () => {
    expect(momentum([100, 110], 5)).toBeNull();
  });
  it('ema of a constant series equals that constant', () => {
    expect(ema(Array(30).fill(50), 10)).toBeCloseTo(50, 9);
  });
  it('annualized realized vol of a flat series is 0', () => {
    expect(annualizedRealizedVol(Array(30).fill(100), 10)).toBeCloseTo(0, 9);
  });
  it('universe is the reused 25-name NASDAQ-halal constant', () => {
    expect(NASDAQ_HALAL_UNIVERSE).toHaveLength(25);
    expect(NASDAQ_HALAL_UNIVERSE).toContain('AAPL');
  });
});

describe('entry rule — dual positive momentum required', () => {
  it('fires when BOTH 20d and 5d momentum are positive (steady uptrend)', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i); // both horizons up
    const res = tsMomentumHalalBasketSetup.entry(ctxFromCloses(up), P());
    expect(res.matched).toBe(true);
  });
  it('does NOT fire when the fast (5d) horizon has rolled over', () => {
    // long horizon still net-up, but last 5 bars fall → short mom ≤ 0
    const cl = [...Array.from({ length: 22 }, (_, i) => 100 + i * 2), 143, 140, 137, 134, 131];
    const res = tsMomentumHalalBasketSetup.entry(ctxFromCloses(cl), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('short_momentum_not_positive');
  });
  it('does NOT fire when the slow (20d) horizon is negative (downtrend)', () => {
    const down = Array.from({ length: 30 }, (_, i) => 200 - i);
    const res = tsMomentumHalalBasketSetup.entry(ctxFromCloses(down), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('long_momentum_not_positive');
  });
  it('is blocked by insufficient history', () => {
    const res = tsMomentumHalalBasketSetup.entry(ctxFromCloses([100, 101, 102]), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('insufficient_history');
  });
});

describe('exit rule — 63d-momentum-negative OR EMA break (either)', () => {
  it('exits when short momentum turns ≤ 0', () => {
    const cl = [...Array.from({ length: 22 }, (_, i) => 100 + i * 2), 143, 140, 137, 134, 131];
    const res = tsMomentumHalalBasketSetup.exit(ctxFromCloses(cl, { positionQty: 10 }), P());
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('short_momentum_turned_negative');
  });
  it('exits on an EMA trend break (close < EMA) even if short mom still > 0', () => {
    // long ramp then a single sharp down bar: 5d mom stays positive, close dips under EMA10
    const cl = [...Array.from({ length: 25 }, (_, i) => 100 + i * 4), 150];
    const res = tsMomentumHalalBasketSetup.exit(ctxFromCloses(cl, { positionQty: 10 }), P());
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('ema_trend_break');
  });
  it('holds while the uptrend is intact (no exit trigger)', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const res = tsMomentumHalalBasketSetup.exit(ctxFromCloses(up, { positionQty: 10 }), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('hold');
  });
  it('holds (no exit) with no position', () => {
    const res = tsMomentumHalalBasketSetup.exit(ctxFromCloses(Array(30).fill(100)), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('no_long_position');
  });
});

describe('MOCK-row exclusion (no-mock directive)', () => {
  const bar = (i: number, source: DailyBarInput['source'], c = 100): DailyBarInput => ({
    ts: new Date(BASE + i * DAY), open: new D(c), high: new D(c + 1), low: new D(c - 1),
    close: new D(c), volume: new D(1e6), source,
  });

  it('a MOCK bar in range never reaches the momentum simulator', () => {
    const reals: DailyBarInput[] = Array.from({ length: 40 }, (_, i) => bar(i, 'YAHOO', 100 + i));
    const withMock = [...reals.slice(0, 20), bar(20, 'MOCK', 999), ...reals.slice(20).map((b, i) => bar(21 + i, 'YAHOO', 120 + i))];
    const { real, excludedMock } = filterRealDailyBars(withMock);
    expect(excludedMock).toBe(1);
    const sim = simulateSetupDaily({
      setup: tsMomentumHalalBasketSetup, symbol: 'X', market: 'NASDAQ',
      bars: real.map((b) => ({ ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
      startingCash: new D(100_000),
    });
    expect(sim.barsProcessed).toBe(real.length);
  });
});
