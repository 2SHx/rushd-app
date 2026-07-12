import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import type { IntradaySession } from '@prisma/client';
import { simulateIntraday, type DayContext, type IntradayBarInput } from './intradayEngine';
import { assertNoLookahead, LookaheadError } from '../data/pointInTime';
import type { StrategySetup } from '../strategies/types';

const D = Prisma.Decimal;
// 2021-01-27 09:31 US/Eastern == 14:31 UTC (EST). Build a REGULAR-session minute stream.
const OPEN_UTC = Date.UTC(2021, 0, 27, 14, 31, 0);
const min = (i: number) => new Date(OPEN_UTC + i * 60_000);

function bar(i: number, o: number, h: number, l: number, c: number, v: number, session: IntradaySession = 'REGULAR'): IntradayBarInput {
  return { ts: min(i), open: o, high: h, low: l, close: c, volume: v, session };
}

// A trivial always-enter/never-exit setup so we can observe fill mechanics deterministically.
function alwaysEnter(exitAt = 3): StrategySetup<unknown> {
  const chk = (matched: boolean) => ({ matched, reasons: matched ? [] : ['no'], evidence: [] });
  return {
    id: 'always-enter', version: 'test', cadence: 'intraday', defaultParams: {},
    screen: () => chk(true),
    entry: (ctx) => {
      // enter on the first bar only
      assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
      return chk(ctx.bars.length === 1);
    },
    exit: (ctx) => chk(ctx.bars.length >= exitAt),
    signal: () => { throw new Error('unused'); },
  };
}

const dayCtx = new Map<string, DayContext>([
  ['2021-01-27', { priorClose: 100, mcap: 1_000_000_000, mcapSource: 'FUNDAMENTALS' }],
]);

describe('simulateIntraday — look-ahead guard', () => {
  it('a setup that peeks at a bar dated after asOf FAILS the run (LookaheadError)', () => {
    const bars = [bar(0, 100, 101, 99, 100, 1e6), bar(1, 100, 102, 99, 101, 1e6), bar(2, 101, 103, 100, 102, 1e6)];
    const peeking: StrategySetup<unknown> = {
      id: 'peek', version: 'test', cadence: 'intraday', defaultParams: {},
      screen: () => ({ matched: true, reasons: [], evidence: [] }),
      entry: (ctx) => {
        // Inject a future-dated bar into the slice, then assert — must throw.
        const poisoned = [...ctx.bars, { ...ctx.bars[0], ts: new Date(ctx.asOf.getTime() + 60_000) }];
        assertNoLookahead(poisoned, ctx.asOf, 'ts');
        return { matched: false, reasons: [], evidence: [] };
      },
      exit: () => ({ matched: false, reasons: [], evidence: [] }),
      signal: () => { throw new Error('unused'); },
    };
    expect(() =>
      simulateIntraday({ setup: peeking, symbol: 'GME', market: 'NASDAQ', bars, dayContext: dayCtx, startingCash: new D(100_000) }),
    ).toThrow(LookaheadError);
  });
});

describe('simulateIntraday — participation cap partial fill', () => {
  it('an order above the participation cap fills only up to cap × bar volume', () => {
    // Cheap price + huge target vs a tiny fill-bar volume forces a partial fill.
    const bars = [
      bar(0, 1, 1.02, 0.99, 1, 1e9),   // decision bar (enter)
      bar(1, 1, 1.01, 0.99, 1, 1000),  // fill bar: only 1000 shares of volume
      bar(2, 1, 1.01, 0.99, 1, 1e6),
      bar(3, 1, 1.01, 0.99, 1, 1e6),   // exit bar
    ];
    const res = simulateIntraday({
      setup: alwaysEnter(3), symbol: 'GME', market: 'NASDAQ', bars, dayContext: dayCtx,
      startingCash: new D(1_000_000), participationCap: 0.1,
      limits: { ...{ maxNameWeight: 1, maxGrossExposure: 1, maxOpenPositions: 1, maxRiskPct: 1, volTargetPct: 10, liquidityAdvFraction: 1, drawdownHaltPct: 1 } },
    });
    expect(res.tradeRecords).toHaveLength(1);
    const trade = res.tradeRecords[0];
    // cap = 0.1 × 1000 = 100 shares; the envelope would have allowed far more.
    expect(trade.qty).toBeLessThanOrEqual(100);
    expect(trade.qty).toBeGreaterThan(0);
    expect(trade.partial).toBe(true);
  });
});

describe('simulateIntraday — no overnight leakage', () => {
  it('force-liquidates an open position at the last bar of the trading day', () => {
    const bars = [bar(0, 1, 1.02, 0.99, 1, 1e9), bar(1, 1, 1.01, 0.99, 1, 1e9)];
    const res = simulateIntraday({
      setup: alwaysEnter(999), symbol: 'GME', market: 'NASDAQ', bars, dayContext: dayCtx,
      startingCash: new D(1_000_000),
      limits: { maxNameWeight: 1, maxGrossExposure: 1, maxOpenPositions: 1, maxRiskPct: 1, volTargetPct: 10, liquidityAdvFraction: 1, drawdownHaltPct: 1 },
    });
    // entered on bar0→fill bar1, then bar1 is day's last bar → forced flat (reason end_of_day_flat).
    expect(res.tradeRecords.at(-1)?.reason).toBe('end_of_day_flat');
    expect(res.trades).toBeGreaterThanOrEqual(1);
  });
});
