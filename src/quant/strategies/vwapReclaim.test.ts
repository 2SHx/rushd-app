import { Prisma } from '@prisma/client';
import type { IntradayBar, IntradaySession } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  vwapReclaimSetup, VWAP_RECLAIM_V1, cumulativeSessionVwap, isTouchBar, isConfirmBar,
  type VwapReclaimParams,
} from './vwapReclaim';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import { LookaheadError } from '../data/pointInTime';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;
const SYM = 'AAPL'; // in STOCKS_IN_PLAY_UNIVERSE_V1 (liquid research universe; Sharia-unscreened)

// Test calibration: shrink the warm-up windows so a handful of fixed bars exercises every rule.
// The RULE THRESHOLDS (wick 1.5×, volume 1.5×, 2R, VWAP math) are v1-identical — only the history
// lengths are relaxed, exactly like gapper-orb's permissive test params.
const P: VwapReclaimParams = { ...VWAP_RECLAIM_V1, volumeAvgLookback: 3, entryStartMinute: 0, entryEndMinute: 1439, volLookback: 3 };

// Summer date ⇒ ET = UTC−4. 13:31Z = 09:31 ET (regular). One synthetic session around price ~10.
function bar(hhmm: string, o: number, h: number, l: number, c: number, v: number, session: IntradaySession = 'REGULAR'): IntradayBar {
  const ts = new Date(`2024-08-05T${hhmm}:00.000Z`);
  return { id: hhmm, symbol: SYM, market: 'NASDAQ', ts, open: new D(o), high: new D(h), low: new D(l), close: new D(c), volume: new D(v), session, source: 'ALPACA', createdAt: ts } as IntradayBar;
}

// idx0..2 flat priors (VWAP≈10); idx3 = TOUCH (probe to 9.80, close 10.03>VWAP, long wick, 4× vol);
// idx4 = CONFIRM (close 10.20 > VWAP and > touch-high 10.06).
const PRIOR = [
  bar('13:31', 10, 10.05, 9.95, 10.0, 100),
  bar('13:32', 10, 10.05, 9.95, 10.0, 100),
  bar('13:33', 10, 10.05, 9.95, 10.0, 100),
];
const TOUCH = bar('13:34', 10.02, 10.06, 9.80, 10.03, 400);
const CONFIRM = bar('13:35', 10.03, 10.25, 10.02, 10.20, 150);

function ctx(bars: IntradayBar[], qty = 0): StrategyPointInTimeContext {
  return {
    symbol: SYM, market: 'NASDAQ', asOf: bars.at(-1)!.ts, bars, snapshot: null,
    positionQty: new D(qty), entryPrice: qty > 0 ? new D('10.21') : null,
    entryTs: qty > 0 ? bars.find((b) => b.id === CONFIRM.id)?.ts ?? null : null,
    entrySignalTs: qty > 0 ? CONFIRM.ts : null,
  };
}

describe('vwap-reclaim registration + VWAP math', () => {
  it('is registered as a versioned deterministic intraday setup', () => {
    expect(STRATEGY_SETUP_CATALOG['vwap-reclaim']).toBe(vwapReclaimSetup);
    expect(vwapReclaimSetup.defaultParams).toMatchObject({ version: 'v1', includePremarket: false, wickBodyRatioMin: 1.5, volumeRatioMin: 1.5, targetRMultiple: 2 });
    expect(vwapReclaimSetup.cadence).toBe('intraday');
  });

  it('computes cumulative session VWAP as Σ(typical·vol)/Σ(vol)', () => {
    // Two bars: typical1=(12+8+10)/3=10 vol100 ; typical2=(22+18+20)/3=20 vol100 → cum VWAP=15.
    const b1 = bar('13:31', 10, 12, 8, 10, 100);
    const b2 = bar('13:32', 20, 22, 18, 20, 100);
    const vw = cumulativeSessionVwap([b1, b2]);
    expect(Number(vw[0])).toBeCloseTo(10, 9);
    expect(Number(vw[1])).toBeCloseTo(15, 9);
  });

  it('v1 VWAP is REGULAR-session only — a premarket bar does not move it (premarket excluded a-priori)', () => {
    const pre = bar('12:00', 1, 1, 1, 1, 100000, 'PRE'); // 08:00 ET, huge volume far from price
    const withPre = ctx([pre, ...PRIOR, TOUCH, CONFIRM]);
    // screen VWAP must equal the regular-only VWAP (premarket bar filtered out in v1).
    const vwOnlyRegular = cumulativeSessionVwap([...PRIOR, TOUCH, CONFIRM]).at(-1)!;
    const ev = vwapReclaimSetup.screen(withPre, P).evidence.find((e) => e.ref === 'session_vwap');
    expect(Number(ev!.value)).toBeCloseTo(Number(vwOnlyRegular), 6);
  });

  it('memoization recomputes when an interior bar changes inside a shared-object prefix', () => {
    const first = PRIOR[0];
    const last = PRIOR[2];
    const original = [first, PRIOR[1], last];
    const replacement = bar('13:32', 20, 20, 20, 20, 100);
    vwapReclaimSetup.screen(ctx(original), P);
    const changed = [first, replacement, last];
    const expected = cumulativeSessionVwap(changed).at(-1)!;
    const actual = vwapReclaimSetup.screen(ctx(changed), P).evidence.find((e) => e.ref === 'session_vwap');
    expect(Number(actual!.value)).toBeCloseTo(Number(expected), 6);
  });
});

describe('vwap-reclaim wick / volume / reclaim rules (fixed fixtures)', () => {
  const bars = [...PRIOR, TOUCH, CONFIRM];
  const vwap = cumulativeSessionVwap(bars);

  it('accepts the constructed touch bar (probe≤VWAP, close>VWAP, wick≥1.5×body, vol≥1.5×avg)', () => {
    expect(isTouchBar(bars, vwap, 3, P)).toBe(true);
  });

  it('rejects the touch bar when the lower wick is too short vs the body', () => {
    const shortWick = bar('13:34', 10.02, 10.06, 9.99, 10.03, 400); // wick 0.03 < 1.5×body 0.015? body .01→thr .015; wick .03≥.015 → still ok, so shrink further
    const b2 = [...PRIOR, bar('13:34', 9.85, 10.20, 9.80, 10.19, 400), CONFIRM]; // body .34, wick .05 < .51
    expect(isTouchBar(b2, cumulativeSessionVwap(b2), 3, P)).toBe(false);
    void shortWick;
  });

  it('rejects the touch bar when volume is below 1.5× the trailing average', () => {
    const lowVol = [...PRIOR, bar('13:34', 10.02, 10.06, 9.80, 10.03, 120), CONFIRM]; // 120 < 1.5×100
    expect(isTouchBar(lowVol, cumulativeSessionVwap(lowVol), 3, P)).toBe(false);
  });

  it('rejects the touch bar when the close does not reclaim VWAP (downside follow-through)', () => {
    const noReclaim = [...PRIOR, bar('13:34', 9.99, 10.0, 9.70, 9.72, 400), CONFIRM]; // close below VWAP
    expect(isTouchBar(noReclaim, cumulativeSessionVwap(noReclaim), 3, P)).toBe(false);
  });

  it('confirm requires close > VWAP AND close > touch-bar high', () => {
    expect(isConfirmBar(bars, vwap, 4, P)).toBe(true);
    const weakConfirm = [...PRIOR, TOUCH, bar('13:35', 10.03, 10.05, 10.02, 10.04, 150)]; // 10.04 < touch high 10.06
    expect(isConfirmBar(weakConfirm, cumulativeSessionVwap(weakConfirm), 4, P)).toBe(false);
  });

  it('entry fires ONLY on the confirm bar, carries a clamped inverse-vol sizeFraction, and stances BULLISH', () => {
    expect(vwapReclaimSetup.entry(ctx([...PRIOR, TOUCH]), P).matched).toBe(false); // touch alone: no confirm
    const res = vwapReclaimSetup.entry(ctx(bars), P);
    expect(res.matched).toBe(true);
    expect(res.sizeFraction).toBeGreaterThan(0);
    expect(res.sizeFraction!).toBeLessThanOrEqual(P.maxNameFraction);
    expect(vwapReclaimSetup.signal(ctx(bars), P)).toMatchObject({ stance: 'BULLISH', determinism: 'deterministic', costCents: 0 });
  });

  it('respects the 10:00–15:00 ET entry window', () => {
    // Rebuild the same pattern at 09:35 ET (13:35Z) but with the strict v1 window → outside window.
    const strictWindow: VwapReclaimParams = { ...P, entryStartMinute: VWAP_RECLAIM_V1.entryStartMinute, entryEndMinute: VWAP_RECLAIM_V1.entryEndMinute };
    expect(vwapReclaimSetup.entry(ctx(bars), strictWindow)).toMatchObject({ matched: false, reasons: ['outside_entry_window'] });
  });
});

describe('vwap-reclaim exit (stop = touch low, target = 2R) and universe/PIT guards', () => {
  it('exits at the touch-bar low stop and at the 2R target, never shorts', () => {
    // Stop = touch low 9.80. Next bar dips to 9.79 → stop.
    const stopBars = [...PRIOR, TOUCH, CONFIRM, bar('13:36', 10.10, 10.15, 9.79, 9.85, 120)];
    expect(vwapReclaimSetup.exit(ctx(stopBars, 10), P)).toMatchObject({ matched: true, reasons: ['vwap_reclaim_stop_signal'] });
    // Actual fill 10.21 − stop 9.80 = 0.41R → target 11.03. Trigger exits next bar open.
    const targetBars = [...PRIOR, TOUCH, CONFIRM, bar('13:36', 10.30, 11.04, 10.25, 10.95, 120)];
    expect(vwapReclaimSetup.exit(ctx(targetBars, 10), P)).toMatchObject({ matched: true, reasons: ['target_2r_signal'] });
    // Flat position ⇒ no exit signal at all (long-only, never a short).
    expect(vwapReclaimSetup.exit(ctx(targetBars, 0), P).matched).toBe(false);
    expect(vwapReclaimSetup.signal(ctx(stopBars, 10), P).stance).toBe('BEARISH');
  });

  it('keeps stop/target anchored to the entry signal when a later reclaim appears', () => {
    const laterTouch = bar('13:36', 10.30, 10.35, 9.90, 10.31, 600);
    const laterConfirm = bar('13:37', 10.31, 10.55, 10.30, 10.50, 200);
    const current = bar('13:38', 10.40, 10.45, 9.85, 9.95, 150);
    const held = ctx([...PRIOR, TOUCH, CONFIRM, laterTouch, laterConfirm, current], 10);
    const exit = vwapReclaimSetup.exit(held, P);
    expect(exit.matched).toBe(false); // 9.85 is above original 9.80 stop; later 9.90 touch must not replace it.
    expect(exit.evidence.find((e) => e.ref === 'stop_level')?.value).toBe('9.800000');
  });

  it('excludes non-universe (e.g. micro-cap / MOCK) symbols — liquid absorption is the thesis', () => {
    expect(vwapReclaimSetup.screen({ ...ctx([...PRIOR, TOUCH, CONFIRM]), symbol: 'SNDL' }, P))
      .toMatchObject({ matched: false, reasons: ['symbol_not_in_liquid_universe'] });
  });

  it('LOOK-AHEAD INJECTION → rejects a future bar even in a constructed context', () => {
    const base = ctx([...PRIOR, TOUCH, CONFIRM]);
    const future = { ...CONFIRM, ts: new Date(base.asOf.getTime() + 60_000) };
    expect(() => vwapReclaimSetup.screen({ ...base, bars: [...base.bars, future] }, P)).toThrow(LookaheadError);
  });
});
