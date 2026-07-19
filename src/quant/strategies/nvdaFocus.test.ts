import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { drawdownExposureScalar } from '../backtest/portfolioEngine';
import {
  NVDA_FOCUS_UNIVERSE, NVDA_FOCUS_V1, nvdaFocusBookPolicy, nvdaFocusSetup, tsMomentum,
} from './nvdaFocus';

const asOf = new Date('2024-01-05T00:00:00Z');

/** Deterministic ascending closes so both legs are computable and known-signed. */
function bars(closes: number[]) {
  return closes.map((close, i) => ({
    id: `NVDA-${i}`, symbol: 'NVDA', market: 'NASDAQ' as const,
    ts: new Date(Date.UTC(2023, 0, 1) + i * 86_400_000),
    open: new Prisma.Decimal(close), high: new Prisma.Decimal(close),
    low: new Prisma.Decimal(close), close: new Prisma.Decimal(close),
    volume: new Prisma.Decimal(1_000_000),
    session: 'REGULAR' as const, source: 'YAHOO' as const, createdAt: asOf,
  }));
}

describe('nvda-focus-v1 pre-registration (R4-E7 single-name book)', () => {
  it('freezes the a-priori params: {NVDA}, 252/skip-21 × 63, governor 10%→25%, 9 trials', () => {
    expect(NVDA_FOCUS_UNIVERSE).toEqual(['NVDA']);
    expect(NVDA_FOCUS_V1).toEqual({
      version: 'v1', longLookbackBars: 252, longSkipBars: 21, shortLookbackBars: 63,
      absoluteThreshold: 0, drawdownStartFraction: 0.10, drawdownCashFraction: 0.25, validationTrials: 9,
    });
    expect(nvdaFocusSetup.universeCompatibility).toBe('fixed');
    expect(nvdaFocusSetup.cadence).toBe('daily');
  });

  it('carries the single-name max-one book policy plus the frozen 10%→25% governor', () => {
    expect(nvdaFocusBookPolicy()).toEqual({
      maxOpenPositions: 1, decisionHistoryBars: 295,
      drawdownStartFraction: 0.10, drawdownCashFraction: 0.25,
    });
  });

  it('declares the frozen 3×3 {231,252,273}×{42,63,84} plateau (8 off-center neighbors)', () => {
    const n = nvdaFocusSetup.plateauNeighborhood!();
    expect(n.axes).toEqual(['longLookbackBars', 'shortLookbackBars']);
    expect(n.center).toEqual(NVDA_FOCUS_V1);
    expect(n.neighbors).toHaveLength(8);
    expect(n.neighbors.map((v) => v.label)).not.toContain('long252|short63');
    for (const v of n.neighbors) {
      expect([231, 252, 273]).toContain(v.params.longLookbackBars);
      expect([42, 63, 84]).toContain(v.params.shortLookbackBars);
    }
  });

  it('tsMomentum is the exact-endpoint window return; null when history too short', () => {
    // closes[t-skip]/closes[t-lookback]-1 over a strictly rising series ⇒ positive.
    expect(tsMomentum([100, 110, 121], 2, 0)).toBeCloseTo(0.21, 12);
    expect(tsMomentum([100, 110, 121], 2, 1)).toBeCloseTo(0.10, 12);
    expect(tsMomentum([100, 110], 2, 0)).toBeNull(); // needs lookback+1 points
    expect(tsMomentum([-5, 110, 121], 2, 0)).toBeNull(); // nonpositive base endpoint ⇒ fail-closed
  });

  it('holds NVDA only when BOTH legs are strictly positive; exits when either fails', () => {
    const rising = bars(Array.from({ length: 260 }, (_, i) => 100 * 1.002 ** i)); // both legs > 0
    const ctxFlat = {
      symbol: 'NVDA', market: 'NASDAQ' as const, asOf: rising.at(-1)!.ts, bars: rising,
      snapshot: null, positionQty: new Prisma.Decimal(0),
    };
    expect(nvdaFocusSetup.entry(ctxFlat).matched).toBe(true);
    expect(nvdaFocusSetup.exit({ ...ctxFlat, positionQty: new Prisma.Decimal(10) }).matched).toBe(false);

    // Recent collapse ⇒ short leg (63d) negative ⇒ do not hold / exit an open position.
    const collapse = bars([
      ...Array.from({ length: 200 }, (_, i) => 100 * 1.002 ** i),
      ...Array.from({ length: 60 }, (_, i) => 149 * 0.98 ** i),
    ]);
    const ctxDown = {
      symbol: 'NVDA', market: 'NASDAQ' as const, asOf: collapse.at(-1)!.ts, bars: collapse,
      snapshot: null, positionQty: new Prisma.Decimal(10),
    };
    expect(nvdaFocusSetup.entry({ ...ctxDown, positionQty: new Prisma.Decimal(0) }).matched).toBe(false);
    expect(nvdaFocusSetup.exit(ctxDown).matched).toBe(true);
  });

  it('rejects any symbol other than NVDA via the charter screen', () => {
    const ctx = {
      symbol: 'AMD', market: 'NASDAQ' as const, asOf, bars: bars([100, 110, 121]),
      snapshot: null, positionQty: new Prisma.Decimal(0),
    };
    expect(nvdaFocusSetup.screen(ctx).matched).toBe(false);
  });

  it('the engine governor is the linear down-only 1.0@10% → 0.0@25% multiplier', () => {
    const s = 0.10, c = 0.25;
    expect(drawdownExposureScalar(0.08, s, c)).toBe(1);
    expect(drawdownExposureScalar(0.175, s, c)).toBeCloseTo(0.5, 12);
    expect(drawdownExposureScalar(0.25, s, c)).toBe(0);
    expect(drawdownExposureScalar(0.60, s, c)).toBe(0); // NVDA's 2022 tail → all cash
  });
});
