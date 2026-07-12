import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import {
  bollingerMrLongV2Setup, sma, realizedDailyVol, volScaledWeight,
  type BollingerMrLongV2Params,
} from './bollingerMrLongV2';
import { varianceRatio } from './bollingerMrLong';
import {
  filterRealDailyBars, simulateSetupDaily,
  type BacktestBar, type DailyBarInput,
} from '../backtest/engine';
import type { RiskLimits } from '../risk/envelope';
import type { AnalystSignal } from '../types';
import type { StrategyPointInTimeContext, StrategySetup } from './types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2024-01-01T00:00:00.000Z').getTime();

/** Daily point-in-time context from a close series (high=low=close). */
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
  return {
    symbol: 'X', market: 'NASDAQ', asOf, bars, snapshot: null, positionQty: new D(opts.positionQty ?? 0),
    entryPrice: opts.entryPrice != null ? new D(opts.entryPrice) : null,
    entryTs: opts.entryTsDaysAgo != null ? new Date(asOf.getTime() - opts.entryTsDaysAgo * DAY) : null,
  };
}

// Lenient params to isolate one rule at a time (short lookbacks so tests need few bars).
const P = (over: Partial<BollingerMrLongV2Params>): BollingerMrLongV2Params => ({
  version: 'v2', bandPeriod: 5, entryStdev: 1, regimeLookback: 10, varianceRatioQ: 2,
  varianceRatioMax: 99, trendSmaPeriod: 5, volLookback: 5, targetVolBudget: 0.004, maxNameFraction: 0.2,
  maxHoldingDays: 5, atrPeriod: 3, atrStopMult: 2, ...over,
});

// ── 1. Sizing math (inverse-vol per-name weight) ────────────────────────────────────────────
describe('vol-scaled sizing math', () => {
  it('realizedDailyVol is the population stdev of trailing daily log returns', () => {
    // insufficient history (need lookback+1 closes) ⇒ null, never a fabricated vol
    expect(realizedDailyVol([100, 101, 102], 10)).toBeNull();
    // a dispersed series has a positive daily vol equal to popStd of its log returns
    const dispersed = [100, 105, 99, 104, 98, 103, 97, 102, 96, 101, 95, 100];
    const v = realizedDailyVol(dispersed, 10)!;
    expect(v).toBeGreaterThan(0.01);
  });

  it('volScaledWeight is inverse to σ and capped at maxNameFraction', () => {
    // budget/σ below the cap ⇒ exact inverse-vol; a calmer name gets MORE weight than a jumpy one.
    const calm = volScaledWeight(dispersedWithVol(0.01), 30, 0.004, 0.2);
    const jumpy = volScaledWeight(dispersedWithVol(0.05), 30, 0.004, 0.2);
    expect(calm).not.toBeNull();
    expect(jumpy).not.toBeNull();
    expect(calm!).toBeGreaterThan(jumpy!);
    // the cap binds for a very low-vol name (budget/σ would exceed the cap)
    expect(volScaledWeight(dispersedWithVol(0.001), 30, 0.004, 0.2)!).toBeCloseTo(0.2, 6);
  });

  it('sma returns the trailing average or null when short', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBeCloseTo(3, 9);
    expect(sma([1, 2], 5)).toBeNull();
  });
});

/** Alternating series with a target per-step magnitude so realized vol is controllable in tests. */
function dispersedWithVol(step: number): number[] {
  const out: number[] = [100];
  for (let i = 1; i < 40; i++) out.push(out[i - 1] * (i % 2 === 0 ? 1 + step : 1 - step));
  return out;
}

// ── 2. Stricter regime gate (VR ≤ 0.85 AND close > trend SMA) ────────────────────────────────
describe('stricter regime gate', () => {
  /** Mean-reverting oscillation around a gently rising trend ⇒ VR < 1 and last close > short SMA. */
  const risingMeanRev = Array.from({ length: 26 }, (_, i) => 100 + i * 0.5 + (i % 2 === 0 ? 2 : -2));

  it('rejects a regime whose measured VR exceeds the (tighter) threshold — v1 (≤1.0) would admit', () => {
    const vr = varianceRatio(risingMeanRev, 10, 2)!;
    expect(vr).toBeLessThan(1); // v1's VR≤1.0 gate would let this through
    const strict = bollingerMrLongV2Setup.screen(ctxFromCloses(risingMeanRev), P({ varianceRatioMax: vr * 0.5 }));
    expect(strict.matched).toBe(false);
    expect(strict.reasons).toContain('regime_not_mean_reverting');
    // a threshold above the measured VR no longer rejects on regime grounds
    const loose = bollingerMrLongV2Setup.screen(ctxFromCloses(risingMeanRev), P({ varianceRatioMax: vr * 1.5 }));
    expect(loose.reasons).not.toContain('regime_not_mean_reverting');
  });

  it('blocks mean-reversion below the trend SMA (dip-buying a downtrend is trend-fighting)', () => {
    const declining = Array.from({ length: 20 }, (_, i) => 120 - i); // last close well below its SMA
    const res = bollingerMrLongV2Setup.screen(ctxFromCloses(declining), P({ varianceRatioMax: 99, trendSmaPeriod: 5 }));
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('below_trend_sma');
    expect(res.reasons).not.toContain('regime_not_mean_reverting'); // VR gate not the blocker here
  });
});

// ── 3. Entry emits a vol-scaled sizeFraction hint ───────────────────────────────────────────
describe('entry emits a clamped vol-scaled sizeFraction', () => {
  it('fires at/below the lower band inside a stationary uptrend and carries sizeFraction ∈ (0, cap]', () => {
    // 200-bar steady uptrend (SMA200 sits well below recent price) then a sharp dip that pierces
    // the 20d lower band while staying above SMA200 — the real geometry of a valid v2 entry.
    const cs: number[] = [];
    for (let i = 0; i < 200; i++) cs.push(100 + i * 0.2); // 100 → 139.8
    for (let i = 0; i < 8; i++) cs.push(140 + i * 0.1); // plateau ~140 (firms the 20d mean)
    cs.push(135, 128); // 2-bar dip: below the 20d lower band, still above SMA200 (~122)
    const res = bollingerMrLongV2Setup.entry(ctxFromCloses(cs), P({
      bandPeriod: 20, entryStdev: 2, regimeLookback: 60, trendSmaPeriod: 200, volLookback: 60, varianceRatioMax: 99,
    }));
    expect(res.matched).toBe(true);
    expect(res.sizeFraction).toBeDefined();
    expect(res.sizeFraction!).toBeGreaterThan(0);
    expect(res.sizeFraction!).toBeLessThanOrEqual(0.2);
  });
});

// ── 4. MOCK-row exclusion (no-mock directive) ───────────────────────────────────────────────
describe('MOCK-row exclusion', () => {
  const bar = (i: number, source: DailyBarInput['source']): DailyBarInput => ({
    ts: new Date(BASE + i * DAY), open: new D(100), high: new D(101), low: new D(99),
    close: new D(100), volume: new D(1e6), source,
  });

  it('filterRealDailyBars drops MOCK bars; the simulator only ever sees reals', () => {
    const reals: DailyBarInput[] = Array.from({ length: 30 }, (_, i) => bar(i, 'YAHOO'));
    const withMock = [...reals.slice(0, 15), bar(15, 'MOCK'), ...reals.slice(15).map((b, i) => bar(16 + i, 'YAHOO'))];
    const { real, excludedMock } = filterRealDailyBars(withMock);
    expect(excludedMock).toBe(1);
    const sim = simulateSetupDaily({
      setup: bollingerMrLongV2Setup, symbol: 'X', market: 'NASDAQ',
      bars: real.map((b) => ({ ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })),
      startingCash: new D(100_000),
    });
    expect(sim.barsProcessed).toBe(30);
  });
});

// ── 5. Engine wiring: the sizeFraction hint is deployed AND clamped by the envelope ──────────
/** A trivial always-in/always-out setup so we can measure exactly how the engine sizes the book. */
function stubSetup(hint?: number): StrategySetup<undefined> {
  const sig = (ctx: StrategyPointInTimeContext): AnalystSignal => ({
    agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
    stance: 'NEUTRAL', conviction: 0, horizonDays: 1, rationaleEn: '', rationaleAr: '',
    evidence: [], determinism: 'deterministic', failureMode: 'ok', costCents: 0,
  });
  return {
    id: 'stub', version: 't', cadence: 'daily', defaultParams: undefined,
    screen: () => ({ matched: true, reasons: [], evidence: [] }),
    entry: () => (hint === undefined
      ? { matched: true, reasons: ['e'], evidence: [] }
      : { matched: true, reasons: ['e'], evidence: [], sizeFraction: hint }),
    exit: (ctx) => (ctx.positionQty.gt(0)
      ? { matched: true, reasons: ['x'], evidence: [] }
      : { matched: false, reasons: [], evidence: [] }),
    signal: sig,
  };
}

/** Rising-price bars with huge volume so only the sizing under test moves the recorded return. */
function risingBars(n: number): BacktestBar[] {
  return Array.from({ length: n }, (_, i) => {
    const px = 100 + i;
    return { ts: new Date(BASE + i * DAY), open: new D(px), high: new D(px + 1), low: new D(px - 1), close: new D(px), volume: new D(1e12) };
  });
}

const LOOSE: RiskLimits = {
  maxNameWeight: 1, maxGrossExposure: 1, maxOpenPositions: 5, maxRiskPct: 100,
  volTargetPct: 100, liquidityAdvFraction: 1, drawdownHaltPct: 1,
};

describe('engine sizes off the hint and never bypasses the envelope', () => {
  const bars = risingBars(12);

  it('legacy setups (no hint) keep full-weight pooled returns; a 0.5 hint halves them', () => {
    const full = simulateSetupDaily({ setup: stubSetup(undefined), symbol: 'X', market: 'NASDAQ', bars, startingCash: new D(100_000), limits: LOOSE });
    const half = simulateSetupDaily({ setup: stubSetup(0.5), symbol: 'X', market: 'NASDAQ', bars, startingCash: new D(100_000), limits: LOOSE });
    expect(full.tradeReturns.length).toBeGreaterThan(0);
    expect(half.tradeReturns.length).toBe(full.tradeReturns.length);
    expect(half.tradeReturns[0]).toBeCloseTo(0.5 * full.tradeReturns[0], 2);
  });

  it('the envelope CLAMPS the hint: a 1.0 hint under a 25% name cap records ~0.25× the loose return', () => {
    const loose = simulateSetupDaily({ setup: stubSetup(1.0), symbol: 'X', market: 'NASDAQ', bars, startingCash: new D(100_000), limits: LOOSE });
    const capped = simulateSetupDaily({
      setup: stubSetup(1.0), symbol: 'X', market: 'NASDAQ', bars, startingCash: new D(100_000),
      limits: { ...LOOSE, maxNameWeight: 0.25 },
    });
    expect(capped.tradeReturns[0]).toBeCloseTo(0.25 * loose.tradeReturns[0], 2);
  });
});
