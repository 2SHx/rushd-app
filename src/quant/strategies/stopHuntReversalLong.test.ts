import { Prisma } from '@prisma/client';
import type { IntradayBar, IntradaySession } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import {
  stopHuntReversalLongSetup, STOP_HUNT_REVERSAL_V1, buildPriorDayLowIndex,
  detectSweepReclaim, configureStopHuntPriorDayLows, resetStopHuntPriorDayLows,
  type StopHuntReversalParams,
} from './stopHuntReversalLong';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import {
  buildStocksInPlayBook, type SourcedDailyRow, type SourcedMinuteRow, type StocksInPlayAggregate,
} from './stocksInPlayOrb';
import { LookaheadError } from '../data/pointInTime';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;
const SYM = 'AAPL'; // in STOCKS_IN_PLAY_UNIVERSE_V1 (liquid research universe; Sharia-unscreened)
const DAY = '2024-08-06'; // summer ⇒ ET = UTC−4
const PDL = 100; // prior-day low used across the reclaim fixtures

// Rule thresholds are v1-identical; only the vol warm-up is relaxed so a few bars exercise sizing.
const P: StopHuntReversalParams = { ...STOP_HUNT_REVERSAL_V1, volLookback: 3 };

function bar(hhmmET: string, o: number, h: number, l: number, c: number, v: number, session: IntradaySession = 'REGULAR'): IntradayBar {
  const [hh, mm] = hhmmET.split(':').map(Number);
  const ts = new Date(`${DAY}T${String(hh + 4).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00.000Z`); // ET→UTC (+4)
  return { id: hhmmET, symbol: SYM, market: 'NASDAQ', ts, open: new D(o), high: new D(h), low: new D(l), close: new D(c), volume: new D(v), session, source: 'ALPACA', createdAt: ts } as IntradayBar;
}

// b0 sits above the prior-day low; b1 BREAKS (low 99.70 ≤ 99.80 threshold, closes 99.90 below PDL);
// b2 RECLAIMS (close 100.20 > PDL) one minute later. sweepLow = 99.70.
const FLAT1 = bar('09:34', 101.0, 101.1, 100.8, 100.9, 100); // history for VWAP + inverse-vol sizing
const FLAT2 = bar('09:35', 100.9, 101.05, 100.7, 101.0, 100);
const ABOVE = bar('09:36', 101.0, 101.1, 100.5, 101.0, 100);
const BREAK = bar('09:37', 100.5, 100.6, 99.70, 99.90, 300);
const RECLAIM = bar('09:38', 99.95, 100.30, 99.90, 100.20, 200);
const SWEEP_BARS = [ABOVE, BREAK, RECLAIM]; // minimal break→reclaim pattern for the pure detector
const ENTRY_BARS = [FLAT1, FLAT2, ABOVE, BREAK, RECLAIM]; // + prefix so realized-vol sizing resolves

function withPdl(): void { configureStopHuntPriorDayLows(new Map([[SYM, new Map([[DAY, PDL]])]])); }

function ctx(bars: IntradayBar[], qty = 0, entryPrice = 100.25): StrategyPointInTimeContext {
  return {
    symbol: SYM, market: 'NASDAQ', asOf: bars.at(-1)!.ts, bars, snapshot: null,
    positionQty: new D(qty), entryPrice: qty > 0 ? new D(entryPrice) : null,
    entryTs: qty > 0 ? RECLAIM.ts : null, entrySignalTs: qty > 0 ? RECLAIM.ts : null,
  };
}

afterEach(() => resetStopHuntPriorDayLows());

describe('stop-hunt-reversal-long registration + prior-day-low index (PIT, real DAY spine)', () => {
  it('is registered as a versioned deterministic intraday setup', () => {
    expect(STRATEGY_SETUP_CATALOG['stop-hunt-reversal-long']).toBe(stopHuntReversalLongSetup);
    expect(stopHuntReversalLongSetup.defaultParams).toMatchObject({ version: 'v1', sweepDepthPct: 0.002, reclaimWindowMinutes: 15, targetRMultiple: 2, entryStartMinute: 9 * 60 + 35, entryEndMinute: 15 * 60 });
    expect(stopHuntReversalLongSetup.cadence).toBe('intraday');
  });

  it('maps each date to the IMMEDIATELY PRECEDING trading day low and skips null prior lows', () => {
    const agg = (date: string, dailyLow: number | null): StocksInPlayAggregate => ({
      date, openingOpen: 1, openingHigh: 1, openingLow: 1, openingClose: 1, openingVolume: 1,
      dailyHigh: 1, dailyLow, dailyClose: 1, dailyVolume: 1,
    });
    const book = new Map([[SYM, [agg('2024-08-05', null), agg('2024-08-06', 95), agg('2024-08-07', 60)]]]);
    const index = buildPriorDayLowIndex(book);
    expect(index.get(SYM)!.get('2024-08-06')).toBeUndefined(); // prior day's low was null → skipped
    expect(index.get(SYM)!.get('2024-08-07')).toBe(95); // prior trading day (08-06) low
  });

  it('excludes MOCK/non-Alpaca rows before any prior-day low is derived (no-mock directive)', () => {
    const orMinutes = (date: string, low: number): SourcedMinuteRow[] =>
      [571, 572, 573, 574, 575].map((min) => ({
        symbol: SYM, ts: new Date(`${date}T${String(Math.floor((min + 4 * 60) / 60)).padStart(2, '0')}:${String((min + 4 * 60) % 60).padStart(2, '0')}:00.000Z`),
        open: 100, high: 101, low, close: 100.5, volume: 1000, session: 'REGULAR', source: 'ALPACA',
      }));
    const minuteRows: SourcedMinuteRow[] = [
      ...orMinutes('2024-08-05', 95), ...orMinutes('2024-08-06', 97),
      { symbol: SYM, ts: new Date('2024-08-06T13:33:00.000Z'), open: 1, high: 1, low: 1, close: 1, volume: 9e9, session: 'REGULAR', source: 'MOCK' }, // must be excluded
    ];
    const dailyRows: SourcedDailyRow[] = [
      { symbol: SYM, ts: new Date('2024-08-05T00:00:00.000Z'), high: 105, low: 94, close: 100, volume: 1e6, source: 'YAHOO' },
      { symbol: SYM, ts: new Date('2024-08-06T00:00:00.000Z'), high: 106, low: 96, close: 101, volume: 1e6, source: 'YAHOO' },
      { symbol: SYM, ts: new Date('2024-08-06T00:00:00.000Z'), high: 999, low: 0.01, close: 999, volume: 9e9, source: 'MOCK' }, // must be excluded
    ];
    const built = buildStocksInPlayBook(minuteRows, dailyRows);
    expect(built.excludedNonAlpacaMinute).toBeGreaterThanOrEqual(1);
    expect(built.excludedUnsupportedDaily).toBeGreaterThanOrEqual(1);
    const index = buildPriorDayLowIndex(built.book);
    expect(index.get(SYM)!.get('2024-08-06')).toBe(94); // prior day's REAL YAHOO low, not the 0.01 MOCK
  });
});

describe('stop-hunt-reversal-long sweep/reclaim rule (fixed fixtures)', () => {
  it('accepts a multi-bar break-then-hard-reclaim, anchoring the stop at the sweep low', () => {
    const s = detectSweepReclaim(SWEEP_BARS, new D(PDL), 2, P);
    expect(s).not.toBeNull();
    expect(Number(s!.sweepLow)).toBeCloseTo(99.70, 9);
    expect(s!.breakIndex).toBe(1);
  });

  it('accepts a SINGLE-bar wick-below-and-reclaim (classic stop hunt)', () => {
    const single = [ABOVE, bar('09:38', 100.6, 100.7, 99.60, 100.10, 300)];
    const s = detectSweepReclaim(single, new D(PDL), 1, P);
    expect(s).not.toBeNull();
    expect(Number(s!.sweepLow)).toBeCloseTo(99.60, 9);
  });

  it('rejects when the low never breaks ≥0.2% below the prior-day low', () => {
    const shallow = [ABOVE, bar('09:37', 100.2, 100.3, 99.90, 99.95, 300), bar('09:38', 99.96, 100.30, 99.92, 100.20, 200)];
    expect(detectSweepReclaim(shallow, new D(PDL), 2, P)).toBeNull(); // low 99.90 > 99.80 threshold
  });

  it('rejects when the bar breaks but does NOT close back above the prior-day low', () => {
    const noReclaim = [ABOVE, bar('09:38', 100.5, 100.6, 99.60, 99.95, 300)]; // close 99.95 ≤ 100
    expect(detectSweepReclaim(noReclaim, new D(PDL), 1, P)).toBeNull();
  });

  it('rejects when the reclaim lands OUTSIDE the 15-minute window', () => {
    const late = [ABOVE, bar('09:37', 100.5, 100.6, 99.70, 99.90, 300), bar('09:53', 99.95, 100.30, 99.90, 100.20, 200)]; // 16 min
    expect(detectSweepReclaim(late, new D(PDL), 2, P)).toBeNull();
  });
});

describe('stop-hunt-reversal-long entry / exit / guards', () => {
  it('entry fires ONLY on the reclaim bar, carries a clamped inverse-vol sizeFraction, stances BULLISH', () => {
    withPdl();
    expect(stopHuntReversalLongSetup.entry(ctx([ABOVE, BREAK]), P).matched).toBe(false); // break alone, no reclaim
    const res = stopHuntReversalLongSetup.entry(ctx(ENTRY_BARS), P);
    expect(res.matched).toBe(true);
    expect(res.sizeFraction!).toBeGreaterThan(0);
    expect(res.sizeFraction!).toBeLessThanOrEqual(P.maxNameFraction);
    const signal = stopHuntReversalLongSetup.signal(ctx(ENTRY_BARS), P);
    expect(signal).toMatchObject({ stance: 'BULLISH', determinism: 'deterministic', costCents: 0 });
    expect(signal.rationaleEn).toContain('research validation completed: REJECTED, not eligible for AUTO_PAPER');
    expect(signal.rationaleAr).toContain('اكتمل التحقق البحثي: مرفوض وغير مؤهل لـ AUTO_PAPER');
  });

  it('respects the 09:35–15:00 ET entry window', () => {
    withPdl();
    const early = [bar('09:32', 101.0, 101.1, 100.5, 101.0, 100), bar('09:33', 100.5, 100.6, 99.70, 99.90, 300), bar('09:34', 99.95, 100.30, 99.90, 100.20, 200)];
    expect(stopHuntReversalLongSetup.entry(ctx(early), P)).toMatchObject({ matched: false, reasons: ['outside_entry_window'] });
  });

  it('screen fails when the prior-day low is unavailable (no fabricated level)', () => {
    resetStopHuntPriorDayLows(); // no index configured
    expect(stopHuntReversalLongSetup.screen(ctx(SWEEP_BARS), P)).toMatchObject({ matched: false, reasons: ['prior_day_low_unavailable'] });
  });

  it('exits at the sweep-low stop and at the 2R-or-VWAP target, never shorts', () => {
    withPdl();
    // Stop = sweep low 99.70. Current bar dips to 99.65 → stop signal.
    const stopBars = [...SWEEP_BARS, bar('09:39', 100.10, 100.15, 99.65, 99.80, 120)];
    expect(stopHuntReversalLongSetup.exit(ctx(stopBars, 10), P)).toMatchObject({ matched: true, reasons: ['stop_hunt_stop_signal'] });
    // Fill 100.25 − stop 99.70 = 0.55R → 2R target 101.35 (VWAP≈100 is lower ⇒ 2R is "further"). High 101.40 → target.
    const targetBars = [...SWEEP_BARS, bar('09:39', 100.30, 101.40, 100.25, 101.30, 120)];
    expect(stopHuntReversalLongSetup.exit(ctx(targetBars, 10), P)).toMatchObject({ matched: true, reasons: ['target_2r_or_vwap_signal'] });
    // Flat position ⇒ no exit signal (long-only, never a short).
    expect(stopHuntReversalLongSetup.exit(ctx(targetBars, 0), P).matched).toBe(false);
    expect(stopHuntReversalLongSetup.signal(ctx(stopBars, 10), P).stance).toBe('BEARISH');
  });

  it('keeps the stop anchored to the entry sweep low and never re-anchors to a later dip', () => {
    withPdl();
    const held = ctx([...SWEEP_BARS, bar('09:39', 100.10, 100.15, 99.75, 99.95, 120)], 10);
    const exit = stopHuntReversalLongSetup.exit(held, P);
    expect(exit.matched).toBe(false); // 99.75 is above the original 99.70 sweep-low stop
    expect(exit.evidence.find((e) => e.ref === 'stop_level')?.value).toBe('99.700000');
  });

  it('excludes non-universe (e.g. micro-cap / MOCK) symbols — liquid names are the thesis', () => {
    withPdl();
    expect(stopHuntReversalLongSetup.screen({ ...ctx(SWEEP_BARS), symbol: 'SNDL' }, P))
      .toMatchObject({ matched: false, reasons: ['symbol_not_in_liquid_universe'] });
  });

  it('LOOK-AHEAD INJECTION → rejects a future bar even in a constructed context', () => {
    withPdl();
    const base = ctx(SWEEP_BARS);
    const future = { ...RECLAIM, ts: new Date(base.asOf.getTime() + 60_000) } as IntradayBar;
    expect(() => stopHuntReversalLongSetup.screen({ ...base, bars: [...base.bars, future] }, P)).toThrow(LookaheadError);
  });
});
