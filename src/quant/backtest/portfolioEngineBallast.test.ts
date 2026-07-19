import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  simulateStrategyBook,
  type StrategyBookBar, type StrategyBookPolicy, type StrategyBookSeries,
} from './portfolioEngine';
import type { RiskLimits } from '../risk/envelope';
import type { StrategyPointInTimeContext, StrategySetup } from '../strategies/types';
import type { AnalystSignal } from '../types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2024-01-02T00:00:00.000Z').getTime();

// Wide limits: isolate the ballast mechanic from every other envelope cap.
const LIMITS: RiskLimits = {
  maxNameWeight: 1, maxGrossExposure: 10, maxOpenPositions: 6,
  maxRiskPct: 100, volTargetPct: 100, liquidityAdvFraction: 1, drawdownHaltPct: 1,
};

/** `count` flat bars at $100 starting on `startDay` (index into the shared BASE calendar). */
function series(symbol: string, count: number, startDay = 0): StrategyBookSeries {
  return {
    symbol, market: 'NASDAQ',
    bars: Array.from({ length: count }, (_, i): StrategyBookBar => ({
      ts: new Date(BASE + (startDay + i) * DAY),
      open: new D(100), high: new D(101), low: new D(99), close: new D(100),
      volume: new D(10_000_000), source: 'YAHOO',
    })),
  };
}

function signal(ctx: StrategyPointInTimeContext): AnalystSignal {
  return {
    agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
    stance: 'NEUTRAL', conviction: 0, horizonDays: 1, rationaleEn: '', rationaleAr: '',
    evidence: [], determinism: 'deterministic', failureMode: 'ok', costCents: 0,
  };
}

function setup(entry: StrategySetup<undefined>['entry']): StrategySetup<undefined> {
  return {
    id: 'ballast-test', version: 'v1', cadence: 'daily', defaultParams: undefined,
    screen: () => ({ matched: true, reasons: [], evidence: [] }),
    entry,
    exit: () => ({ matched: false, reasons: [], evidence: [] }),
    signal,
  };
}

const NEVER_ENTER = setup(() => ({ matched: false, reasons: [], evidence: [] }));
const BALLAST_POLICY: StrategyBookPolicy = { maxOpenPositions: 6, idleBallastSymbol: 'SPSK' };

function run(bookSeries: StrategyBookSeries[], testSetup: StrategySetup<undefined>, policy?: StrategyBookPolicy) {
  return simulateStrategyBook({
    setup: testSetup, series: bookSeries, startingCash: new D(100_000), limits: LIMITS, policy,
  });
}

describe('idle-capital ballast sweep (R4-E8 engine mechanic)', () => {
  it('sweeps ALL idle cash into the ballast instead of holding it flat in cash', () => {
    const result = run([series('EQTY', 4), series('SPSK', 4)], NEVER_ENTER, BALLAST_POLICY);
    const last = result.daily.at(-1)!;
    // No equity ever bought; every dollar parked in SPSK (minus 15 bps entry cost, rounding tail).
    expect(last.positions.some((p) => p.symbol === 'EQTY')).toBe(false);
    expect(last.positions.some((p) => p.symbol === 'SPSK')).toBe(true);
    expect(Number(last.cash.toString())).toBeLessThan(200);
    expect(result.ballastFills.some((f) => f.action === 'BUY')).toBe(true);
    // Ballast fills are engine capital-parking, NEVER strategy trades.
    expect(result.fills).toHaveLength(0);
    expect(result.tradeRecords).toHaveLength(0);
  });

  it('leaves idle capital in CASH before the ballast has any bar (fail-closed pre-inception)', () => {
    // SPSK starts on day 2; days 0–1 have no ballast bar, so idle cash must stay flat.
    const result = run([series('EQTY', 4), series('SPSK', 2, 2)], NEVER_ENTER, BALLAST_POLICY);
    expect(Number(result.daily[0].cash.toString())).toBe(100_000);
    expect(Number(result.daily[1].cash.toString())).toBe(100_000);
    expect(result.daily[0].positions).toHaveLength(0);
    // Once SPSK's first bar arrives (day 2) the sweep begins.
    expect(Number(result.daily[2].cash.toString())).toBeLessThan(100_000);
    expect(result.daily[2].positions.some((p) => p.symbol === 'SPSK')).toBe(true);
  });

  it('SELLS the ballast first to fund an equity entry, then re-sweeps the residual', () => {
    // Enter once the setup has ≥3 bars of history (decision on day 2 → fill day 3), half the book.
    const enterOnceDeep = setup((ctx) => ({
      matched: ctx.bars.length >= 3, reasons: [], evidence: [], sizeFraction: 0.5,
    }));
    const result = run([series('EQTY', 5), series('SPSK', 5)], enterOnceDeep, BALLAST_POLICY);
    // Cash was fully parked in SPSK, so the day-3 equity entry can only be funded by liquidating it.
    expect(result.ballastFills.some((f) => f.action === 'SELL')).toBe(true);
    const last = result.daily.at(-1)!;
    expect(last.positions.some((p) => p.symbol === 'EQTY')).toBe(true);
    expect(last.positions.some((p) => p.symbol === 'SPSK')).toBe(true); // residual re-parked
    expect(result.fills.some((f) => f.symbol === 'EQTY' && f.action === 'BUY')).toBe(true);
  });

  it('is byte-identical to the flat-cash book when no ballast symbol is declared', () => {
    const withoutBallast = run([series('EQTY', 4)], NEVER_ENTER, { maxOpenPositions: 6 });
    expect(withoutBallast.ballastFills).toHaveLength(0);
    expect(Number(withoutBallast.daily.at(-1)!.cash.toString())).toBe(100_000);
  });
});
