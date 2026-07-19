import { Prisma } from '@prisma/client';
import type { IntradayBar, IntradaySession } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BAGHOLDER_BOUNCE_V1,
  bagholderBounceSetup,
  buildPriorCloseIndex,
  configureBagholderPriorCloses,
  detectBagholderBounce,
  resetBagholderPriorCloses,
  type BagholderBounceParams,
} from './bagholderBounce';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import type { StocksInPlayAggregate } from './stocksInPlayOrb';
import type { StrategyPointInTimeContext } from './types';
import { LookaheadError } from '../data/pointInTime';

const D = Prisma.Decimal;
const DAY = '2025-06-03'; // EDT (UTC−4)
const P: BagholderBounceParams = { ...BAGHOLDER_BOUNCE_V1, volLookback: 3 };

function bar(time: string, o: number, h: number, l: number, c: number, session: IntradaySession = 'REGULAR'): IntradayBar {
  const [hour, minute] = time.split(':').map(Number);
  const ts = new Date(`${DAY}T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
  return { id: time, symbol: 'AAPL', market: 'NASDAQ', ts, open: new D(o), high: new D(h), low: new D(l), close: new D(c), volume: new D(10_000), session, source: 'ALPACA', createdAt: ts } as IntradayBar;
}

const BARS = [
  bar('09:30', 79, 79.2, 77.5, 78),
  bar('09:31', 78, 78.1, 74.5, 75), // ≥5% flush below 79 (threshold 75.05)
  bar('09:44', 75, 75.3, 74.7, 75.1),
  bar('09:45', 75.1, 75.8, 74.9, 75.6), // higher low + close above prior high
];

function ctx(bars: IntradayBar[], qty = 0, entryPrice = 75.7): StrategyPointInTimeContext {
  return {
    symbol: 'AAPL', market: 'NASDAQ', asOf: bars.at(-1)!.ts, bars, snapshot: null,
    positionQty: new D(qty), entryPrice: qty ? new D(entryPrice) : null,
    entryTs: qty ? BARS[3].ts : null, entrySignalTs: qty ? BARS[3].ts : null,
  };
}

function configure(): void {
  configureBagholderPriorCloses(new Map([['AAPL', new Map([[DAY, 100]])]]));
}

afterEach(resetBagholderPriorCloses);

describe('bagholder-bounce v1 pre-registered pattern', () => {
  it('is catalogued with the frozen ≥20% gap, 5% flush, and 09:45–11:00 window', () => {
    expect(STRATEGY_SETUP_CATALOG['bagholder-bounce']).toBe(bagholderBounceSetup);
    expect(bagholderBounceSetup.defaultParams).toMatchObject({ minGapDownPct: 0.20, minFlushPct: 0.05, entryStartMinute: 585, entryEndMinute: 660, targetRMultiple: 2 });
  });

  it('maps each date to the immediately preceding real daily close', () => {
    const aggregate = (date: string, dailyClose: number | null): StocksInPlayAggregate => ({
      date, openingOpen: 1, openingHigh: 1, openingLow: 1, openingClose: 1, openingVolume: 1,
      dailyHigh: 1, dailyLow: 1, dailyClose, dailyVolume: 1,
    });
    const index = buildPriorCloseIndex(new Map([['AAPL', [aggregate('2025-06-02', 100), aggregate(DAY, 80)]]]));
    expect(index.get('AAPL')?.get(DAY)).toBe(100);
  });

  it('accepts the first post-flush higher-low reclaim and anchors the lowest flush print', () => {
    const pattern = detectBagholderBounce(BARS, new D(100), 3, P);
    expect(pattern).not.toBeNull();
    expect(Number(pattern!.flushLow)).toBeCloseTo(74.5);
    expect(pattern!.flushIndex).toBe(1);
  });

  it('rejects a 19% gap, a shallow flush, and a non-confirming bar', () => {
    expect(detectBagholderBounce(BARS, new D(97.5), 3, P)).toBeNull();
    const shallow = [bar('09:30', 79, 79.2, 77, 78), bar('09:44', 78, 78.2, 76, 77), bar('09:45', 77, 78.3, 76.5, 78.25)];
    expect(detectBagholderBounce(shallow, new D(100), 2, P)).toBeNull();
    expect(detectBagholderBounce([...BARS.slice(0, 3), bar('09:45', 75.1, 75.2, 74.6, 75.0)], new D(100), 3, P)).toBeNull();
  });

  it('fires only in-window, sizes through the hint, and emits long-only stances', () => {
    configure();
    const entry = bagholderBounceSetup.entry(ctx(BARS), P);
    expect(entry.matched).toBe(true);
    expect(entry.sizeFraction).toBeGreaterThan(0);
    expect(entry.sizeFraction).toBeLessThanOrEqual(P.maxNameFraction);
    expect(bagholderBounceSetup.signal(ctx(BARS), P).stance).toBe('BULLISH');
    const early = [...BARS.slice(0, 3), bar('09:44', 75.1, 75.8, 74.9, 75.6)];
    expect(bagholderBounceSetup.entry(ctx(early), P)).toMatchObject({ matched: false, reasons: ['outside_entry_window'] });
  });

  it('uses the immutable flush low for stop/2R exits and never shorts', () => {
    configure();
    expect(bagholderBounceSetup.exit(ctx([...BARS, bar('09:46', 75.6, 75.8, 74.4, 74.7)], 10), P)).toMatchObject({ matched: true, reasons: ['flush_stop_signal'] });
    // Fill 75.7; R=1.2; target=78.1.
    expect(bagholderBounceSetup.exit(ctx([...BARS, bar('09:46', 75.6, 78.2, 75.5, 78.1)], 10), P)).toMatchObject({ matched: true, reasons: ['target_2r_signal'] });
    expect(bagholderBounceSetup.exit(ctx(BARS, 0), P).matched).toBe(false);
  });

  it('fails closed without a prior close and rejects injected future data', () => {
    expect(bagholderBounceSetup.screen(ctx(BARS), P)).toMatchObject({ matched: false, reasons: ['prior_close_unavailable'] });
    configure();
    const future = { ...BARS[3], ts: new Date(BARS[3].ts.getTime() + 60_000) } as IntradayBar;
    expect(() => bagholderBounceSetup.screen({ ...ctx(BARS), bars: [...BARS, future] }, P)).toThrow(LookaheadError);
  });
});
