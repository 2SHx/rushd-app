import { Prisma } from '@prisma/client';
import type { IntradayBar, IntradaySession } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import {
  TIME_OF_DAY_V1,
  detectTimeOfDayPattern,
  timeOfDaySetup,
  type TimeOfDayParams,
} from './timeOfDay';
import type { StrategyPointInTimeContext } from './types';
import { LookaheadError } from '../data/pointInTime';

const D = Prisma.Decimal;
const DAY = '2025-06-03';
const P: TimeOfDayParams = { ...TIME_OF_DAY_V1, volLookback: 2 };

function bar(time: string, o: number, h: number, l: number, c: number, volume = 1000, session: IntradaySession = 'REGULAR'): IntradayBar {
  const [hour, minute] = time.split(':').map(Number);
  const ts = new Date(`${DAY}T${String(hour + 4).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`);
  return { id: time, symbol: 'AAPL', market: 'NASDAQ', ts, open: new D(o), high: new D(h), low: new D(l), close: new D(c), volume: new D(volume), session, source: 'ALPACA', createdAt: ts } as IntradayBar;
}

const REVERSAL = [
  bar('09:30', 100, 100.1, 99.7, 99.8),
  bar('09:44', 99.8, 99.9, 98.8, 99.0), // touches −1.2%
  bar('09:45', 99.0, 100.0, 98.9, 99.95), // higher low + close > previous high
];
const TREND = [
  bar('09:30', 100, 100.2, 99.8, 100.1),
  bar('10:00', 100.1, 100.8, 100.0, 100.7),
  bar('10:29', 100.7, 101.2, 100.6, 101.1), // first-hour return +1.1%
  bar('10:30', 101.1, 101.5, 101.0, 101.4), // first close > frozen high and VWAP
];

function ctx(bars: IntradayBar[], qty = 0, signalTs = bars.at(-1)!.ts, entryPrice = Number(bars.at(-1)!.close)): StrategyPointInTimeContext {
  return {
    symbol: 'AAPL', market: 'NASDAQ', asOf: bars.at(-1)!.ts, bars, snapshot: null,
    positionQty: new D(qty), entryPrice: qty ? new D(entryPrice) : null,
    entryTs: qty ? signalTs : null, entrySignalTs: qty ? signalTs : null,
  };
}

describe('time-of-day v1 frozen A/B timing constraints', () => {
  it('is catalogued with the exact 09:45 reversal and 10:30 first-hour trend windows', () => {
    expect(STRATEGY_SETUP_CATALOG['time-of-day']).toBe(timeOfDaySetup);
    expect(timeOfDaySetup.defaultParams).toMatchObject({ reversalStartMinute: 585, reversalEndMinute: 600, firstHourEndMinute: 630, trendStartMinute: 630, trendEndMinute: 660, targetRMultiple: 2 });
  });

  it('detects branch A only after a ≥1% opening drop and first higher-low reclaim', () => {
    expect(detectTimeOfDayPattern(REVERSAL, 2, P)).toMatchObject({ branch: 'REVERSAL_0945' });
    const shallow = [REVERSAL[0], bar('09:44', 99.8, 100, 99.2, 99.5), REVERSAL[2]];
    expect(detectTimeOfDayPattern(shallow, 2, P)).toBeNull();
  });

  it('detects branch B only after a +1% frozen first hour and first high/VWAP breakout', () => {
    expect(detectTimeOfDayPattern(TREND, 3, P)).toMatchObject({ branch: 'FIRST_HOUR_TREND_LOCK' });
    const weak = [...TREND.slice(0, 2), bar('10:29', 100.2, 100.8, 100.1, 100.7), bar('10:30', 100.7, 101.0, 100.6, 100.9)];
    expect(detectTimeOfDayPattern(weak, 3, P)).toBeNull();
  });

  it('rejects a second signal in either branch so timing cannot repeatedly re-enter', () => {
    const secondReversal = [...REVERSAL, bar('09:46', 99.9, 100.2, 99.0, 100.1)];
    expect(detectTimeOfDayPattern(secondReversal, 3, P)).toBeNull();
    const secondTrend = [...TREND, bar('10:31', 101.4, 101.7, 101.3, 101.6)];
    expect(detectTimeOfDayPattern(secondTrend, 4, P)).toBeNull();
  });

  it('emits branch evidence, inverse-vol sizing, and only long-entry/long-exit stances', () => {
    const entry = timeOfDaySetup.entry(ctx(REVERSAL), P);
    expect(entry.matched).toBe(true);
    expect(entry.evidence).toContainEqual(expect.objectContaining({ ref: 'ab_branch', value: 'REVERSAL_0945' }));
    expect(entry.sizeFraction).toBeGreaterThan(0);
    expect(timeOfDaySetup.signal(ctx(REVERSAL), P).stance).toBe('BULLISH');
    expect(timeOfDaySetup.exit(ctx(REVERSAL, 0), P).matched).toBe(false);
  });

  it('anchors the branch stop and 2R target, with engine-owned EOD as fallback', () => {
    // Branch A stop 98.8; fill 100 => 1.2R, 2R target 102.4.
    const stopBars = [...REVERSAL, bar('09:46', 99.9, 100.1, 98.7, 98.9)];
    expect(timeOfDaySetup.exit(ctx(stopBars, 10, REVERSAL[2].ts, 100), P)).toMatchObject({ matched: true, reasons: ['structural_stop_signal'] });
    const targetBars = [...REVERSAL, bar('09:46', 100, 102.5, 99.9, 102.4)];
    expect(timeOfDaySetup.exit(ctx(targetBars, 10, REVERSAL[2].ts, 100), P)).toMatchObject({ matched: true, reasons: ['target_2r_signal'] });
  });

  it('fails closed outside both windows and rejects injected future data', () => {
    const noon = [...REVERSAL.slice(0, 2), bar('12:00', 99, 100, 98.9, 99.9)];
    expect(timeOfDaySetup.screen(ctx(noon), P)).toMatchObject({ matched: false, reasons: ['outside_ab_windows'] });
    const future = { ...REVERSAL[2], ts: new Date(REVERSAL[2].ts.getTime() + 60_000) } as IntradayBar;
    expect(() => timeOfDaySetup.screen({ ...ctx(REVERSAL), bars: [...REVERSAL, future] }, P)).toThrow(LookaheadError);
  });
});
