// Regression: a target-weight book must not be silently killed by the discretionary drawdown
// breaker, and the memory-bound (union-restricted series + full calendar) route must be
// byte-identical to the full-load route including a mid-window delisting.
//
// Root cause pinned here: applyEnvelope blocks BUYs once drawdown >= drawdownHaltPct. For a
// monthly target-weight rebalance the drop legs (weight → 0) still SELL while the add legs are
// blocked, so the book ratchets one-way into cash; once flat, NAV can no longer climb, peakNav
// stays frozen and the drawdown never falls back below the halt → the breaker locks on forever.
// The g6b-linear-factor-wide FULL 2018→2026 wide run died exactly this way (30%+ 2022 drawdown →
// permanent cash from mid-2023, zero entries after). The fix exempts target-driven rebalances
// from the breaker (their weights already cap exposure); every other envelope cap still applies.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  simulateStrategyBook,
  type StrategyBookBar,
  type StrategyBookSeries,
} from './portfolioEngine';
import type { RiskLimits } from '../risk/envelope';
import type { StrategyPointInTimeContext, StrategySetup } from '../strategies/types';
import type { AnalystSignal } from '../types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2020-01-02T00:00:00.000Z').getTime();

const dayIndex = (asOf: Date): number => Math.round((asOf.getTime() - BASE) / DAY);
const dateAt = (d: number): Date => new Date(BASE + d * DAY);

function priceBar(price: number, ts: Date): StrategyBookBar {
  return {
    ts,
    open: new D(price), high: new D(price * 1.01), low: new D(price * 0.99), close: new D(price),
    volume: new D(5_000_000), source: 'YAHOO',
  };
}

function seriesFrom(symbol: string, prices: readonly (number | null)[]): StrategyBookSeries {
  const bars: StrategyBookBar[] = [];
  prices.forEach((price, d) => { if (price !== null) bars.push(priceBar(price, dateAt(d))); });
  return { symbol, market: 'NASDAQ', bars };
}

function targetWeightSetup(
  weightFor: (asOf: Date, symbol: string) => number | null,
): StrategySetup<undefined> {
  const signal = (ctx: StrategyPointInTimeContext): AnalystSignal => ({
    agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
    stance: 'NEUTRAL', conviction: 0, horizonDays: 1, rationaleEn: '', rationaleAr: '',
    evidence: [], determinism: 'deterministic', failureMode: 'ok', costCents: 0,
  });
  return {
    id: 'book-breaker-test', version: 'v1', cadence: 'daily', defaultParams: undefined,
    screen: () => ({ matched: true, reasons: [], evidence: [] }),
    entry: () => ({ matched: false, reasons: [], evidence: [] }),
    exit: () => ({ matched: false, reasons: [], evidence: [] }),
    targetWeight: (ctx) => weightFor(ctx.asOf, ctx.symbol),
    signal,
  };
}

// Envelope with an ACTIVE 30% drawdown breaker; every other cap left generous so the breaker is
// the only thing under test.
const BREAKER_LIMITS: RiskLimits = {
  maxNameWeight: 1, maxGrossExposure: 5, maxOpenPositions: 6,
  maxRiskPct: 100, volTargetPct: 100, liquidityAdvFraction: 1, drawdownHaltPct: 0.3,
};

describe('strategy-book drawdown breaker vs target-weight rebalance', () => {
  // Common market factor: rise to a peak, crash ~50%, then recover. All six names move together;
  // the target set alternates every rebalance so each rebalance both sells and buys.
  const LEN = 130;
  const marketFactor = (d: number): number => {
    if (d <= 43) return 1.0 + 0.3 * (d / 43); // 1.00 → 1.30
    if (d <= 55) return 1.3 - 0.65 * ((d - 43) / 12); // 1.30 → 0.65 (crash)
    return 0.65 + 0.4 * ((d - 55) / (LEN - 1 - 55)); // 0.65 → 1.05 (recover)
  };
  const SYMBOLS = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'];
  const bookSeries: StrategyBookSeries[] = SYMBOLS.map((symbol, i) =>
    seriesFrom(symbol, Array.from({ length: LEN }, (_, d) => (50 + 5 * i) * marketFactor(d))));

  const rebalanceWeight = (asOf: Date, symbol: string): number | null => {
    const d = dayIndex(asOf);
    if (d < 14 || d % 14 !== 0) return null; // hold between month-ends
    const r = d / 14 - 1;
    const targetSet = r % 2 === 0 ? ['S0', 'S1', 'S2'] : ['S3', 'S4', 'S5'];
    return targetSet.includes(symbol) ? 1 / 3 : 0;
  };

  const sim = simulateStrategyBook({
    setup: targetWeightSetup(rebalanceWeight),
    series: bookSeries, startingCash: new D(100_000), limits: BREAKER_LIMITS,
  });

  const troughDate = dateAt(55);

  it('drives a drawdown past the 30% halt (scenario genuinely arms the breaker)', () => {
    const maxDrawdown = Math.max(...sim.daily.map((point) => Number(point.drawdown)));
    expect(maxDrawdown).toBeGreaterThan(0.3);
  });

  it('keeps rebalancing (BUYs) AFTER the drawdown instead of deadlocking into cash', () => {
    const postCrashBuys = sim.fills.filter((fill) => fill.action === 'BUY' && fill.ts > troughDate);
    // Old code: zero — the breaker permanently blocks every post-drawdown entry.
    expect(postCrashBuys.length).toBeGreaterThan(0);
  });

  it('ends invested rather than ratcheted to all-cash', () => {
    const last = sim.daily.at(-1)!;
    expect(Number(last.positionsValue)).toBeGreaterThan(0);
    // A deadlocked book would sit at ~100% cash: positions value indistinguishable from zero.
    expect(Number(last.positionsValue) / Number(last.nav)).toBeGreaterThan(0.5);
  });
});

describe('memory-bound (union-restricted) ≡ full-load, with a mid-window delisting', () => {
  const LEN = 100;
  // C is selected & bought early, then its bars END at day 45 (delists mid-hold). D is NEVER
  // selected. Full-load carries A,B,C,D; the memory-bound route drops never-selected D and passes
  // the full calendar. Identical fills/NAV proves the union restriction is decision-preserving.
  const priceUp = (base: number) => Array.from({ length: LEN }, (_, d) => base * (1 + d * 0.004));
  const a = seriesFrom('A', priceUp(40));
  const b = seriesFrom('B', priceUp(60));
  const cPrices = priceUp(30).map((p, d) => (d <= 45 ? p : null)); // delists after day 45
  const c = seriesFrom('C', cPrices);
  const d = seriesFrom('D', priceUp(80));

  const weightFor = (asOf: Date, symbol: string): number | null => {
    const di = dayIndex(asOf);
    if (di < 10 || di % 20 !== 0) return null; // rebalance at 20,40,60,80
    const targetSet = di <= 40 ? ['A', 'C'] : ['A', 'B']; // C dropped from day 60 (but gone by 45)
    return targetSet.includes(symbol) ? 0.5 : 0;
  };

  const fullLoad = simulateStrategyBook({
    setup: targetWeightSetup(weightFor),
    series: [a, b, c, d], startingCash: new D(100_000), limits: BREAKER_LIMITS,
  });

  // Memory-bound: engine series = ever-selected union {A,B,C}; D omitted; full calendar retained.
  const calendar = Array.from(
    new Set([a, b, c, d].flatMap((s) => s.bars.map((bar) => bar.ts.getTime()))),
  ).sort((x, y) => x - y).map((t) => new Date(t));
  const memoryBound = simulateStrategyBook({
    setup: targetWeightSetup(weightFor),
    series: [a, b, c], startingCash: new D(100_000), limits: BREAKER_LIMITS, calendar,
  });

  const navString = (points: typeof fullLoad.daily) =>
    points.map((p) => `${p.ts.toISOString()}:${p.nav.toString()}`).join('|');
  const fillString = (fills: typeof fullLoad.fills) =>
    fills.map((f) => `${f.ts.toISOString()}:${f.symbol}:${f.action}:${f.qty.toString()}:${f.fillPrice.toString()}`).join('|');

  it('produces identical daily NAV on both routes', () => {
    expect(navString(memoryBound.daily)).toBe(navString(fullLoad.daily));
  });

  it('produces identical fills on both routes (never-selected D changes nothing)', () => {
    expect(fillString(memoryBound.fills)).toBe(fillString(fullLoad.fills));
  });

  it('keeps making decisions after the delisting month, and C stays a held zombie in both', () => {
    const cutoff = dateAt(45);
    expect(fullLoad.fills.some((f) => f.ts > cutoff)).toBe(true); // A/B keep trading past C's end
    const heldC = (r: typeof fullLoad) => r.daily.at(-1)!.positions.some((p) => p.symbol === 'C' && p.qty.gt(0));
    expect(heldC(fullLoad)).toBe(true);
    expect(heldC(memoryBound)).toBe(true);
  });
});

describe('incubation tradeFrom replay seam', () => {
  const sim = simulateStrategyBook({
    setup: targetWeightSetup(() => 0.5),
    series: [seriesFrom('A', Array.from({ length: 30 }, (_, day) => 100 + day))],
    startingCash: new D(100_000),
    limits: BREAKER_LIMITS,
    tradeFrom: dateAt(20),
  });

  it('keeps warm-up history but creates no paper state before the authorized inception', () => {
    expect(sim.daily[0].ts).toEqual(dateAt(20));
    expect(sim.fills[0].signalTs).toEqual(dateAt(20));
    expect(sim.fills[0].ts).toEqual(dateAt(21));
  });
});
