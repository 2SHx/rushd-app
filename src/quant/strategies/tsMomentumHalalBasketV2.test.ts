import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import {
  tsMomentumHalalBasketV2Setup,
  buildEqualWeightIndex, regimeVerdict, configureRegimeIndex, resetRegimeIndex,
  NASDAQ_HALAL_UNIVERSE, type TsMomentumHalalBasketV2Params,
} from './tsMomentumHalalBasketV2';
import { volScaledWeight, realizedDailyVol } from './bollingerMrLongV2';
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

// Real v2 is 252/63/100 with a 200d regime SMA; tests use small lookbacks to isolate one rule.
const P = (over: Partial<TsMomentumHalalBasketV2Params> = {}): TsMomentumHalalBasketV2Params => ({
  version: 'v2', longMomLookback: 20, shortMomLookback: 5, emaExitPeriod: 10,
  volLookback: 10, targetVolBudget: 0.004, maxNameFraction: 0.2, regimeSmaPeriod: 5, ...over,
});

/** Series shared by all names in the mini-basket so the regime index tracks it exactly. */
function seriesFor(cl: number[]): { ts: Date; close: number }[] {
  return cl.map((c, i) => ({ ts: new Date(BASE + i * DAY), close: c }));
}

beforeEach(() => resetRegimeIndex());

// ── 1. v2 reuses bollinger-mr-long-v2's inverse-vol sizing helper (import, not re-implementation) ──
describe('sizing layer is the reused v2 helper', () => {
  it('volScaledWeight is inverse to σ and capped — identical helper as bollinger-mr-long-v2', () => {
    const calm: number[] = [100];
    for (let i = 1; i < 40; i++) calm.push(calm[i - 1] * (i % 2 === 0 ? 1.01 : 0.99));
    const jumpy: number[] = [100];
    for (let i = 1; i < 40; i++) jumpy.push(jumpy[i - 1] * (i % 2 === 0 ? 1.05 : 0.95));
    const wCalm = volScaledWeight(calm, 30, 0.004, 0.2)!;
    const wJumpy = volScaledWeight(jumpy, 30, 0.004, 0.2)!;
    expect(wCalm).toBeGreaterThan(wJumpy); // calmer name gets a bigger book slice
    expect(wCalm).toBeLessThanOrEqual(0.2); // cap binds, never levered past it
    expect(realizedDailyVol([100, 101], 10)).toBeNull(); // no fabricated vol on short history
  });

  it('a matched entry emits a clamped vol-scaled sizeFraction ∈ (0, cap]', () => {
    // Steady uptrend so both momenta are positive; regime index (same series) sits above its SMA.
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    configureRegimeIndex(new Map([['X', seriesFor(up)]]));
    const res = tsMomentumHalalBasketV2Setup.entry(ctxFromCloses(up), P());
    expect(res.matched).toBe(true);
    expect(res.sizeFraction).toBeDefined();
    expect(res.sizeFraction!).toBeGreaterThan(0);
    expect(res.sizeFraction!).toBeLessThanOrEqual(0.2);
  });
});

// ── 2. Market-regime index gate (basket index vs its own 200d/period SMA) ────────────────────
describe('market-regime index gate', () => {
  it('buildEqualWeightIndex chains equal-weight daily returns from 100 (PIT: level(d) uses closes ≤ d)', () => {
    // Two names each +10% then flat: the equal-weight index rises 10% on day 2, then holds.
    const idx = buildEqualWeightIndex(new Map([
      ['A', seriesFor([100, 110, 110])],
      ['B', seriesFor([50, 55, 55])],
    ]));
    expect(idx[0].level).toBeCloseTo(100, 9);
    expect(idx[1].level).toBeCloseTo(110, 6); // mean(+10%, +10%)
    expect(idx[2].level).toBeCloseTo(110, 6);
  });

  it('regimeVerdict is bull above the SMA, bear below, and reads only points ≤ asOf', () => {
    const rising = Array.from({ length: 12 }, (_, i) => 100 + i);
    configureRegimeIndex(new Map([['X', seriesFor(rising)]]));
    const bull = regimeVerdict(new Date(BASE + 11 * DAY), 5);
    expect(bull.state).toBe('bull');
    // A basket that has rolled over: last close below its trailing SMA ⇒ bear.
    const rollOver = [100, 102, 104, 106, 108, 110, 108, 104, 100, 96, 92, 88];
    configureRegimeIndex(new Map([['X', seriesFor(rollOver)]]));
    const bear = regimeVerdict(new Date(BASE + 11 * DAY), 5);
    expect(bear.state).toBe('bear');
  });

  it('screen fails closed when the index is unconfigured, and reports insufficient history early', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    resetRegimeIndex();
    const unconfigured = tsMomentumHalalBasketV2Setup.screen(ctxFromCloses(up), P());
    expect(unconfigured.matched).toBe(false);
    expect(unconfigured.reasons).toContain('regime_index_unavailable');
    // configured but the index has < regimeSmaPeriod points at this asOf ⇒ insufficient (not a false bull)
    configureRegimeIndex(new Map([['X', seriesFor([100, 101, 102])]]));
    const early = tsMomentumHalalBasketV2Setup.screen(ctxFromCloses(up), P({ regimeSmaPeriod: 200 }));
    expect(early.matched).toBe(false);
    expect(early.reasons.some((r) => r === 'regime_index_insufficient' || r === 'market_regime_bearish')).toBe(true);
  });

  it('blocks a NEW entry when the basket regime is bearish even if the name itself is trending up', () => {
    // The name X trends up (dual momentum would fire) but the BASKET index is falling ⇒ no entry.
    const nameUp = Array.from({ length: 30 }, (_, i) => 100 + i);
    const basketDown = Array.from({ length: 30 }, (_, i) => 200 - i * 3);
    configureRegimeIndex(new Map([['BASKET', seriesFor(basketDown)]]));
    const res = tsMomentumHalalBasketV2Setup.entry(ctxFromCloses(nameUp), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('market_regime_bearish');
  });

  it('exits are regime-INDEPENDENT: an open position still exits by v1 rules in any regime', () => {
    // Fast horizon rolled over ⇒ v1 exit fires regardless of the (unconfigured) regime index.
    const cl = [...Array.from({ length: 22 }, (_, i) => 100 + i * 2), 143, 140, 137, 134, 131];
    resetRegimeIndex();
    const res = tsMomentumHalalBasketV2Setup.exit(ctxFromCloses(cl, { positionQty: 10 }), P());
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('short_momentum_turned_negative');
  });
});

// ── 3. Dual-momentum entry family is v1's, unchanged (gated by the regime index) ─────────────
describe('dual-momentum entry family (unchanged from v1)', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  it('does NOT fire when the slow horizon is negative even in a bull regime', () => {
    const down = Array.from({ length: 30 }, (_, i) => 200 - i);
    configureRegimeIndex(new Map([['X', seriesFor(up)]])); // bull regime
    const res = tsMomentumHalalBasketV2Setup.entry(ctxFromCloses(down), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('long_momentum_not_positive');
  });
  it('universe is the reused 25-name NASDAQ-halal constant', () => {
    expect(NASDAQ_HALAL_UNIVERSE).toHaveLength(25);
    expect(NASDAQ_HALAL_UNIVERSE).toContain('AAPL');
  });
});

// ── 4. MOCK-row exclusion (no-mock directive) ───────────────────────────────────────────────
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
      setup: tsMomentumHalalBasketV2Setup, symbol: 'X', market: 'NASDAQ',
      bars: real.map((b) => ({ ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
      startingCash: new D(100_000),
    });
    expect(sim.barsProcessed).toBe(real.length);
  });
});
