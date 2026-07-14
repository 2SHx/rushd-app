import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { assertWalkForward, MIN_WALK_FORWARD_WINDOWS } from './walkForward';
import { simulateSetupDaily, type BacktestBar } from './engine';
import type { StrategyCheck, StrategySetup } from '../strategies/types';
import type { AnalystSignal } from '../types';

const D = Prisma.Decimal;

describe('assertWalkForward (pure window-count assertion)', () => {
  it('PASSES only when the decision-window count clears the documented minimum', () => {
    const pass = assertWalkForward(MIN_WALK_FORWARD_WINDOWS);
    expect(pass.passed).toBe(true);
    expect(pass.minRequired).toBe(MIN_WALK_FORWARD_WINDOWS);

    const fail = assertWalkForward(MIN_WALK_FORWARD_WINDOWS - 1);
    expect(fail.passed).toBe(false);
    expect(fail.decisionWindows).toBe(MIN_WALK_FORWARD_WINDOWS - 1);
  });

  it('is not aliased to trade count — zero/negative/NaN windows never earn the flag', () => {
    expect(assertWalkForward(0).passed).toBe(false);
    expect(assertWalkForward(Number.NaN).passed).toBe(false);
    expect(assertWalkForward(50, 10).passed).toBe(true); // count 50 clears an explicit min of 10
  });
});

// A trivial daily setup that NEVER trades — isolates the PIT decision-window count from trading.
const noopSetup: StrategySetup<unknown> = {
  id: 'noop-daily',
  version: 'test',
  cadence: 'daily',
  defaultParams: {},
  screen: (): StrategyCheck => ({ matched: false, reasons: ['noop'], evidence: [] }),
  entry: (): StrategyCheck => ({ matched: false, reasons: ['noop'], evidence: [] }),
  exit: (): StrategyCheck => ({ matched: false, reasons: ['noop'], evidence: [] }),
  signal: (ctx): AnalystSignal => ({
    agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
    stance: 'NEUTRAL', conviction: 0, horizonDays: 1, rationaleEn: 'x', rationaleAr: 'ص',
    evidence: [], determinism: 'deterministic', failureMode: 'ok', costCents: 0,
  }),
};

function bars(n: number): BacktestBar[] {
  const base = new Date('2020-01-01T00:00:00.000Z').getTime();
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(base + i * 86_400_000),
    open: new D(100), high: new D(101), low: new D(99), close: new D(100), volume: new D(1_000_000),
  }));
}

describe('simulateSetupDaily reports earned walk-forward windows', () => {
  it('counts exactly one PIT-guarded decision window per bar decided (bars − 1)', () => {
    const sim = simulateSetupDaily({
      setup: noopSetup, symbol: 'TEST', market: 'NASDAQ', bars: bars(300),
      startingCash: new D(100_000),
    });
    expect(sim.decisionWindows).toBe(299); // decide on bar t, fill t+1 ⇒ N-1 windows
    expect(sim.trades).toBe(0); // window count is independent of trading
    expect(assertWalkForward(sim.decisionWindows).passed).toBe(true);
  });

  it('a short run does NOT earn the flag even though it is structurally walk-forward', () => {
    const sim = simulateSetupDaily({
      setup: noopSetup, symbol: 'TEST', market: 'NASDAQ', bars: bars(10),
      startingCash: new D(100_000),
    });
    expect(sim.decisionWindows).toBe(9);
    expect(assertWalkForward(sim.decisionWindows).passed).toBe(false);
  });
});
