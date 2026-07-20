import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { STOP_PARAMS, staticStopPrice, trailingStopPrice, evaluateStops } from './stops';

const D = Prisma.Decimal;

describe('stops (static + trailing, closed-bar, Decimal)', () => {
  it('computes exact Decimal stop levels', () => {
    expect(staticStopPrice(new D(100), 0.08).toString()).toBe('92');
    expect(trailingStopPrice(new D(150), 0.1).toString()).toBe('135');
  });

  it('holds while the close stays above both stops', () => {
    const res = evaluateStops({ entryPrice: new D(100), peakClose: new D(110) }, new D(105));
    expect(res.exit).toBe(false);
    expect(res.reason).toBeNull();
    expect(res.activeStop.toString()).toBe('99'); // trailing 110·0.9 binds over static 92
  });

  it('exits on the static floor when the trailing stop never armed above it', () => {
    // Peak = entry ⇒ trailing stop 90 < static stop 92 ⇒ static binds.
    const res = evaluateStops({ entryPrice: new D(100), peakClose: new D(100) }, new D(91.5));
    expect(res.exit).toBe(true);
    expect(res.reason).toBe('STATIC_STOP');
    expect(res.activeStop.toString()).toBe('92');
  });

  it('locks in recovery via the trailing stop after a run-up (Ukemi)', () => {
    // Entry 100, peak 150 ⇒ trailing stop 135 protects most of the gain.
    const res = evaluateStops({ entryPrice: new D(100), peakClose: new D(150) }, new D(134));
    expect(res.exit).toBe(true);
    expect(res.reason).toBe('TRAILING_STOP');
    expect(res.trailingStop.toString()).toBe('135');
    expect(res.staticStop.toString()).toBe('92');
  });

  it('the trailing stop only ever tightens as the ratcheted peak rises', () => {
    const atEntry = evaluateStops({ entryPrice: new D(100), peakClose: new D(100) }, new D(100));
    const afterRunUp = evaluateStops({ entryPrice: new D(100), peakClose: new D(140) }, new D(140));
    expect(afterRunUp.activeStop.gt(atEntry.activeStop)).toBe(true);
  });

  it('rejects invalid inputs and exposes versioned params', () => {
    expect(() => staticStopPrice(new D(0), 0.08)).toThrow(/positive/);
    expect(() => staticStopPrice(new D(100), 1.2)).toThrow(/fraction/);
    expect(() => evaluateStops({ entryPrice: new D(100), peakClose: new D(90) }, new D(95))).toThrow(/ratchet/);
    expect(STOP_PARAMS).toMatchObject({ version: 'stops.v1', staticStopPct: 0.08, trailingStopPct: 0.1 });
  });
});
