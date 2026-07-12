import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildStocksInPlayBook, configureStocksInPlayBook, relativeVolumeRatio, resetStocksInPlayBook,
  STOCKS_IN_PLAY_ORB_V1, STOCKS_IN_PLAY_UNIVERSE_V1, stockInPlayRefAsOf, stocksInPlayOrbSetup,
  stocksInPlayPrehistoryStart,
  type StocksInPlayAggregate,
} from './stocksInPlayOrb';
import { LookaheadError } from '../data/pointInTime';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;
const SYM = 'AAPL';
const dates = Array.from({ length: 17 }, (_, i) => `2026-05-${String(i + 1).padStart(2, '0')}`);

function aggregate(date: string, openingVolume = 100, overrides: Partial<StocksInPlayAggregate> = {}): StocksInPlayAggregate {
  return { date, openingOpen: 10, openingHigh: 11, openingLow: 9.8, openingClose: 10.8, openingVolume,
    dailyHigh: 11, dailyLow: 9, dailyClose: 10, dailyVolume: 2_000_000, ...overrides };
}
function configure(overrides: Partial<StocksInPlayAggregate> = {}, currentVols: Partial<Record<string, number>> = {}, priorOverrides: Partial<StocksInPlayAggregate> = {}) {
  const book = new Map<string, StocksInPlayAggregate[]>();
  for (const symbol of STOCKS_IN_PLAY_UNIVERSE_V1) {
    book.set(symbol, dates.map((date, i) => aggregate(date, i === 16 ? (currentVols[symbol] ?? 200) : 100,
      symbol === SYM ? (i === 16 ? overrides : priorOverrides) : {})));
  }
  configureStocksInPlayBook(book);
}
function bar(hhmm: string, o: number, h: number, l: number, c: number): IntradayBar {
  const ts = new Date(`2026-05-17T${hhmm}:00.000Z`);
  return { id: hhmm, symbol: SYM, market: 'NASDAQ', ts, open: new D(o), high: new D(h), low: new D(l), close: new D(c), volume: new D(100), session: 'REGULAR', source: 'ALPACA', createdAt: ts } as IntradayBar;
}
const OR = [bar('13:31',10,10.4,9.8,10.2),bar('13:32',10.2,10.6,10.1,10.5),bar('13:33',10.5,11,10.4,10.8),bar('13:34',10.8,10.9,10.5,10.7),bar('13:35',10.7,10.9,10.6,10.8)];
function ctx(last: IntradayBar, qty = 0): StrategyPointInTimeContext { return { symbol: SYM, market: 'NASDAQ', asOf: last.ts, bars: [...OR, last], snapshot: null, positionQty: new D(qty) }; }
afterEach(resetStocksInPlayBook);

describe('stocks-in-play reference math', () => {
  it('uses current completed OR volume divided by exactly the prior 14 OR sessions', () => {
    expect(relativeVolumeRatio(280, Array(14).fill(100))).toBe(2.8);
    expect(relativeVolumeRatio(280, Array(13).fill(100))).toBeNull();
    configure();
    expect(stockInPlayRefAsOf(SYM, new Date('2026-05-17T13:35:00Z'))?.rv).toBe(2);
  });
  it('abstains before five minutes complete and ignores injected future-day values', () => {
    configure();
    expect(stockInPlayRefAsOf(SYM, new Date('2026-05-17T13:34:00Z'))).toBeNull();
    const before = stockInPlayRefAsOf(SYM, new Date('2026-05-17T13:35:00Z'))!.rv;
    configureStocksInPlayBook(new Map([[SYM, [...dates.map((d, i) => aggregate(d, i === 16 ? 200 : 100)), aggregate('2026-05-18', 99_999)]]]));
    expect(stockInPlayRefAsOf(SYM, new Date('2026-05-17T13:35:00Z'))!.rv).toBe(before);
  });
  it('ranks the same-day cross-section with deterministic symbol tie-break', () => {
    configure({}, { AAPL: 300, ADBE: 300, AMZN: 250 });
    expect(stockInPlayRefAsOf('AAPL', new Date('2026-05-17T13:35:00Z'))?.rank).toBe(1);
    expect(stockInPlayRefAsOf('ADBE', new Date('2026-05-17T13:35:00Z'))?.rank).toBe(2);
  });
});

describe('compact real-data aggregation', () => {
  it('requests bounded pre-from history sufficient to warm the prior-14 screen', () => {
    expect(stocksInPlayPrehistoryStart('2026-07-12').toISOString()).toBe('2026-06-07T00:00:00.000Z');
  });
  it('uses only first-five REGULAR ALPACA minutes and counts excluded provenance', () => {
    const mins = [
      ...OR.map((b) => ({ symbol: SYM, ts: b.ts, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: 100, session: 'REGULAR', source: 'ALPACA' })),
      { symbol: SYM, ts: new Date('2026-05-17T13:36:00Z'), open: 1, high: 99, low: 1, close: 99, volume: 9999, session: 'REGULAR', source: 'ALPACA' },
      { symbol: SYM, ts: new Date('2026-05-17T13:32:00Z'), open: 1, high: 99, low: 1, close: 99, volume: 9999, session: 'REGULAR', source: 'YAHOO' },
    ];
    const daily = [{ symbol: SYM, ts: new Date('2026-05-17T00:00:00Z'), high: 11, low: 9, close: 10, volume: 2e6, source: 'YAHOO' },
      { symbol: SYM, ts: new Date('2026-05-16T00:00:00Z'), high: 99, low: 1, close: 2, volume: 9, source: 'MOCK' },
      { symbol: SYM, ts: new Date('2026-05-15T00:00:00Z'), high: 99, low: 1, close: 2, volume: 9, source: 'SAHMK' }];
    const out = buildStocksInPlayBook(mins, daily);
    expect(out.excludedNonAlpacaMinute).toBe(1); expect(out.excludedUnsupportedDaily).toBe(2);
    expect(out.book.get(SYM)?.[0]).toMatchObject({ openingVolume: 500, openingHigh: 11, openingClose: 10.8 });
  });
});

describe('stocks-in-play ORB v1 gates and mechanics', () => {
  const breakout = bar('13:36', 10.8, 11.3, 10.7, 11.2);
  it('fixes the v1 universe and applies RV/rank/liquidity/ATR/bullish gates', () => {
    expect(STOCKS_IN_PLAY_UNIVERSE_V1).toHaveLength(11); expect(STOCKS_IN_PLAY_ORB_V1).toMatchObject({ rvThreshold: 1, topN: 20 });
    configure(); expect(stocksInPlayOrbSetup.screen(ctx(breakout)).matched).toBe(true);
    configure({ openingClose: 9.9, openingOpen: 10.1, dailyVolume: 100, dailyHigh: 10.1, dailyLow: 10 });
    expect(stocksInPlayOrbSetup.screen(ctx(breakout)).reasons).toEqual(expect.arrayContaining(['opening_range_not_bullish', 'below_prior_close']));
    configure({}, { AAPL: 50 }); expect(stocksInPlayOrbSetup.screen(ctx(breakout)).reasons).toContain('relative_volume_below_threshold');
    configure({}, {}, { dailyVolume: 100, dailyHigh: 10.1, dailyLow: 10, dailyClose: 10 });
    expect(stocksInPlayOrbSetup.screen(ctx(breakout)).reasons).toEqual(expect.arrayContaining(['adv_gate_failed', 'atr_gate_failed']));
  });
  it('rejects non-v1 names, enters only after OR on breakout, and exits at OR-low/15:55', () => {
    configure();
    expect(stocksInPlayOrbSetup.screen({ ...ctx(breakout), symbol: 'GME' }).reasons).toEqual(['symbol_not_in_v1_universe']);
    expect(stocksInPlayOrbSetup.entry(ctx(OR.at(-1)!)).matched).toBe(false);
    expect(stocksInPlayOrbSetup.entry(ctx(breakout)).matched).toBe(true);
    expect(stocksInPlayOrbSetup.exit(ctx(bar('13:40',10,10.1,9.7,9.8), 10)).reasons).toEqual(['opening_range_stop']);
    expect(stocksInPlayOrbSetup.exit(ctx(bar('19:55',10.8,10.9,10.7,10.8), 10)).reasons).toEqual(['session_time_exit']);
  });
  it('rejects a look-ahead-injected bar', () => {
    configure(); const base = ctx(breakout); const future = { ...breakout, ts: new Date('2026-05-17T13:37:00Z') };
    expect(() => stocksInPlayOrbSetup.screen({ ...base, bars: [...base.bars, future] })).toThrow(LookaheadError);
  });
});
