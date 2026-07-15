// Unit tests for pure OHLCV resampling math (hand-built arithmetic fixtures —
// this tests bucketing/merging logic only; no market data is synthesized for
// any strategy or display path).
import { describe, it, expect } from 'vitest';
import { aggregateIntraday, aggregateDaily, type RawBar } from './barAggregation';

/** Minute bar CLOSING at the given UTC time. July ⇒ EDT (UTC−4): 13:30 UTC = 09:30 ET. */
function m(utc: string, o: number, h: number, l: number, c: number, v = 100): RawBar {
  return { ts: new Date(utc), open: o, high: h, low: l, close: c, volume: v };
}

describe('aggregateIntraday', () => {
  it('anchors 1H buckets to the 09:30 ET session open (TradingView convention)', () => {
    const bars = [
      m('2026-07-06T13:31:00Z', 10, 12, 9, 11), //  09:30 ET start → bucket 0
      m('2026-07-06T14:30:00Z', 11, 15, 11, 14), // 10:29 start → still bucket 0
      m('2026-07-06T14:31:00Z', 14, 16, 13, 15), // 10:30 start → bucket 1
    ];
    const out = aggregateIntraday(bars, '1H');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ open: 10, high: 15, low: 9, close: 14, volume: 200 });
    expect(out[1]).toMatchObject({ open: 14, high: 16, low: 13, close: 15, volume: 100 });
    // Bucket starts: 13:30 and 14:30 UTC, as unix seconds.
    expect(out[0].time).toBe(Date.parse('2026-07-06T13:30:00Z') / 1000);
    expect(out[1].time).toBe(Date.parse('2026-07-06T14:30:00Z') / 1000);
  });

  it('handles EST (winter) offsets: 14:30 UTC = 09:30 ET in January', () => {
    const bars = [
      m('2026-01-05T14:31:00Z', 5, 6, 4, 5.5),
      m('2026-01-05T15:00:00Z', 5.5, 7, 5, 6.5),
    ];
    const out = aggregateIntraday(bars, '30m');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ open: 5, high: 7, low: 4, close: 6.5 });
    expect(out[0].time).toBe(Date.parse('2026-01-05T14:30:00Z') / 1000);
  });

  it('never merges buckets across trading days', () => {
    const bars = [
      m('2026-07-06T19:59:00Z', 1, 2, 1, 2), // Mon 15:58 ET
      m('2026-07-07T13:31:00Z', 3, 4, 3, 4), // Tue 09:30 ET
    ];
    const out = aggregateIntraday(bars, '4H');
    expect(out).toHaveLength(2);
    expect(out[0].close).toBe(2);
    expect(out[1].open).toBe(3);
  });

  it('drops bars from before the session open instead of mis-bucketing them', () => {
    const bars = [
      m('2026-07-06T12:00:00Z', 99, 99, 99, 99), // 08:00 ET premarket (defensive)
      m('2026-07-06T13:31:00Z', 10, 11, 9, 10.5),
    ];
    const out = aggregateIntraday(bars, '5m');
    expect(out).toHaveLength(1);
    expect(out[0].open).toBe(10);
    expect(out[0].high).toBe(11);
  });

  it('returns [] for empty input', () => {
    expect(aggregateIntraday([], '1H')).toEqual([]);
  });
});

describe('aggregateDaily', () => {
  const days = [
    { day: '2026-06-29', open: 10, high: 12, low: 9, close: 11, volume: 1 }, // Mon
    { day: '2026-06-30', open: 11, high: 14, low: 10, close: 13, volume: 2 }, // Tue
    { day: '2026-07-02', open: 13, high: 13, low: 8, close: 9, volume: 3 }, //  Thu (gap: no Wed)
    { day: '2026-07-06', open: 9, high: 10, low: 7, close: 8, volume: 4 }, //   next Mon
  ];

  it('weekly buckets anchor to Monday and merge OHLCV across the week', () => {
    const out = aggregateDaily(days, 'week');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ time: '2026-06-29', open: 10, high: 14, low: 8, close: 9, volume: 6 });
    expect(out[1]).toMatchObject({ time: '2026-07-06', open: 9, high: 10, low: 7, close: 8, volume: 4 });
  });

  it('a Sunday belongs to the preceding Monday-anchored week', () => {
    const out = aggregateDaily(
      [
        { day: '2026-07-03', open: 1, high: 2, low: 1, close: 2, volume: 1 }, // Fri
        { day: '2026-07-05', open: 2, high: 3, low: 2, close: 3, volume: 1 }, // Sun (e.g. TASI trades Sun)
      ],
      'week'
    );
    expect(out).toHaveLength(1);
    expect(out[0].close).toBe(3);
  });

  it('monthly buckets split on calendar month', () => {
    const out = aggregateDaily(days, 'month');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ time: '2026-06-29', open: 10, close: 13, volume: 3 });
    expect(out[1]).toMatchObject({ time: '2026-07-02', open: 13, close: 8, high: 13, low: 7, volume: 7 });
  });

  it('accepts Date inputs for the trading day', () => {
    const out = aggregateDaily(
      [{ day: new Date('2026-07-06T00:00:00Z'), open: 1, high: 1, low: 1, close: 1, volume: 1 }],
      'month'
    );
    expect(out[0].time).toBe('2026-07-06');
  });
});
