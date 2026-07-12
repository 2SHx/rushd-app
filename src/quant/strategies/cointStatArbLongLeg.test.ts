import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import {
  cointStatArbLongLegSetup, ols, residuals, adfTStat, lastZScore, fitPair,
  configurePairBook, resetPairBook, bestPairAsOf,
  type CointStatArbLongLegParams,
} from './cointStatArbLongLeg';
import { filterRealDailyBars, type DailyBarInput } from '../backtest/engine';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2023-01-02T00:00:00.000Z').getTime();

/** Build a daily point-in-time ctx for a long-leg symbol from a close series (high=low=close). */
function ctxFromCloses(
  symbol: string,
  closes: number[],
  opts: { positionQty?: number; entryPrice?: number; entryTsDaysAgo?: number } = {},
): StrategyPointInTimeContext {
  const bars = closes.map((c, i) => ({
    id: `${symbol}-${i}`, symbol, market: 'NASDAQ', ts: new Date(BASE + i * DAY),
    open: new D(c), high: new D(c), low: new D(c), close: new D(c), volume: new D(1_000_000),
    session: 'REGULAR', source: 'YAHOO', createdAt: new Date(BASE + i * DAY),
  })) as unknown as IntradayBar[];
  const asOf = bars[bars.length - 1].ts;
  return {
    symbol, market: 'NASDAQ', asOf, bars, snapshot: null, positionQty: new D(opts.positionQty ?? 0),
    entryPrice: opts.entryPrice != null ? new D(opts.entryPrice) : null,
    entryTs: opts.entryTsDaysAgo != null ? new Date(asOf.getTime() - opts.entryTsDaysAgo * DAY) : null,
  };
}

/** Date-indexed closes for the partner book (aligned to the same BASE calendar as ctxFromCloses). */
function bookSeries(closes: number[]): { ts: Date; close: number }[] {
  return closes.map((c, i) => ({ ts: new Date(BASE + i * DAY), close: c }));
}

const P = (over: Partial<CointStatArbLongLegParams> = {}): CointStatArbLongLegParams => ({
  version: 'v1', formationBars: 30, entryZ: 2, exitZ: 0, adfThreshold: -1.5, minBeta: 0,
  maxHoldingDays: 30, atrPeriod: 14, atrStopMult: 3, ...over,
});

beforeEach(() => resetPairBook());

describe('OLS hedge ratio', () => {
  it('recovers α and β from a noise-free linear relation y = 2 + 3x', () => {
    const x = [1, 2, 3, 4, 5, 6];
    const y = x.map((v) => 2 + 3 * v);
    const fit = ols(x, y)!;
    expect(fit.beta).toBeCloseTo(3, 9);
    expect(fit.alpha).toBeCloseTo(2, 9);
    expect(residuals(x, y, fit.alpha, fit.beta).every((e) => Math.abs(e) < 1e-9)).toBe(true);
  });
  it('returns null on zero-variance X (degenerate regression)', () => {
    expect(ols([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });
});

describe('ADF-lite unit-root t-statistic', () => {
  it('is strongly negative for a stationary AR(1) (mean-reverting) residual series', () => {
    const e: number[] = [1];
    for (let i = 1; i < 60; i++) e.push(0.3 * e[i - 1] + (i % 2 ? 0.1 : -0.1));
    const t = adfTStat(e)!;
    expect(t).toBeLessThan(-3); // γ̂ ≈ φ−1 ≈ −0.7 with nonzero se ⇒ clears typical EG gates
  });
  it('is not negative-enough for a pure trend (unit-root/non-stationary) series', () => {
    const e = Array.from({ length: 60 }, (_, i) => i); // e_t = t → Δe const, e_{t−1} grows
    const t = adfTStat(e)!;
    expect(t).toBeGreaterThan(-3.34); // fails the EG cointegration gate, as it must
  });
  it('returns null when a perfect fit yields zero residual variance (no valid t)', () => {
    const e = Array.from({ length: 20 }, (_, i) => (i % 2 ? 1 : -1)); // Δe = −2·e_{t−1} exactly
    expect(adfTStat(e)).toBeNull();
  });
});

describe('spread z-score', () => {
  it('scores the last element against the series mean/std', () => {
    // series mean 0, pop std 1 for [-1,1,-1,1]; append −2 ⇒ z of last element negative
    const z = lastZScore([-1, 1, -1, 1, -2])!;
    expect(z).toBeLessThan(0);
  });
  it('returns null on a constant (zero-variance) series', () => {
    expect(lastZScore([5, 5, 5, 5])).toBeNull();
  });
});

// A deterministic cointegrated pair: Y = 10 + 1.5·X + stationary eps, eps small-alternating with a
// deep final dislocation so the LAST spread z is well below −entryZ (undervalued long leg).
function cointegratedPair(n: number): { x: number[]; y: number[] } {
  const x = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + 3 * Math.sin(i));
  const eps: number[] = Array.from({ length: n }, (_, i) => (i % 2 ? 0.6 : -0.6));
  eps[n - 1] = -6; // final dislocation ⇒ Y far below fitted value
  const y = x.map((xv, i) => 10 + 1.5 * xv + eps[i]);
  return { x, y };
}

describe('fitPair gates', () => {
  it('accepts a cointegrated pair with β>minBeta and ADF≤threshold', () => {
    const { x, y } = cointegratedPair(40);
    const fit = fitPair(x, y, 'BBB', P())!;
    expect(fit).not.toBeNull();
    expect(fit.beta).toBeGreaterThan(0);
    expect(fit.adf).toBeLessThanOrEqual(P().adfThreshold);
    expect(fit.z).toBeLessThan(-2); // deep final dislocation
  });
  it('rejects a negative hedge ratio (no long-only positive combination)', () => {
    const x = Array.from({ length: 40 }, (_, i) => 100 - i); // X falls
    const y = Array.from({ length: 40 }, (_, i) => 100 + i); // Y rises ⇒ β<0
    expect(fitPair(x, y, 'BBB', P({ minBeta: 0 }))).toBeNull();
  });
});

describe('pair formation is look-ahead-free (PIT book filter)', () => {
  it('bestPairAsOf is identical whether or not the book carries future bars past asOf', () => {
    const n = 50;
    const { x, y } = cointegratedPair(n);
    const asOfIdx = 39; // decide on bar 40 (indices 0..39)
    const ctx = ctxFromCloses('AAPL', y.slice(0, asOfIdx + 1));

    // Variant A: partner book truncated exactly at asOf.
    configurePairBook(new Map([['AMZN', bookSeries(x.slice(0, asOfIdx + 1))]]));
    const fitTruncated = bestPairAsOf(ctx, P())!;

    // Variant B: partner book ALSO contains the future (indices 40..49). PIT filter must ignore them.
    configurePairBook(new Map([['AMZN', bookSeries(x)]]));
    const fitWithFuture = bestPairAsOf(ctx, P())!;

    expect(fitWithFuture).not.toBeNull();
    expect(fitWithFuture.beta).toBeCloseTo(fitTruncated.beta, 12);
    expect(fitWithFuture.adf).toBeCloseTo(fitTruncated.adf, 12);
    expect(fitWithFuture.z).toBeCloseTo(fitTruncated.z, 12);
    expect(fitWithFuture.partner).toBe('AMZN');
  });
});

describe('setup entry / exit wiring', () => {
  it('degrades safely when the pair book is unconfigured', () => {
    const { y } = cointegratedPair(40);
    const res = cointStatArbLongLegSetup.screen(ctxFromCloses('AAPL', y), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('pair_book_unconfigured');
  });

  it('enters LONG the undervalued leg when spread z ≤ −entryZ', () => {
    const { x, y } = cointegratedPair(40);
    configurePairBook(new Map([['AMZN', bookSeries(x)]]));
    const res = cointStatArbLongLegSetup.entry(ctxFromCloses('AAPL', y), P());
    expect(res.matched).toBe(true);
    expect(res.evidence.some((e) => e.ref === 'partner' && e.value === 'AMZN')).toBe(true);
  });

  it('exits when the spread reverts to the mean (z ≥ exitZ)', () => {
    const n = 40;
    const x = Array.from({ length: n }, (_, i) => 100 + i * 0.5 + 3 * Math.sin(i));
    const eps: number[] = Array.from({ length: n }, (_, i) => (i % 2 ? 0.6 : -0.6));
    eps[n - 1] = 3; // final spread ABOVE the mean ⇒ z ≥ 0
    const y = x.map((xv, i) => 10 + 1.5 * xv + eps[i]);
    configurePairBook(new Map([['AMZN', bookSeries(x)]]));
    const res = cointStatArbLongLegSetup.exit(
      ctxFromCloses('AAPL', y, { positionQty: 10, entryPrice: 100, entryTsDaysAgo: 1 }),
      P(),
    );
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('spread_reverted');
  });

  it('exits when the pair stops cointegrating (thesis void)', () => {
    // Partner uncorrelated/degenerate ⇒ no cointegrated fit ⇒ cointegration_broken exit.
    configurePairBook(new Map([['AMZN', bookSeries(Array.from({ length: 40 }, () => 100))]]));
    const res = cointStatArbLongLegSetup.exit(
      ctxFromCloses('AAPL', Array.from({ length: 40 }, (_, i) => 100 + i), { positionQty: 10, entryPrice: 100, entryTsDaysAgo: 1 }),
      P({ atrStopMult: 999 }),
    );
    expect(res.matched).toBe(true);
    expect(res.reasons).toContain('cointegration_broken');
  });

  it('holds (no exit) when flat', () => {
    const { y } = cointegratedPair(40);
    const res = cointStatArbLongLegSetup.exit(ctxFromCloses('AAPL', y), P());
    expect(res.matched).toBe(false);
    expect(res.reasons).toContain('no_long_position');
  });
});

describe('MOCK-row exclusion (no-mock directive)', () => {
  it('filterRealDailyBars drops every MOCK bar and reports the count', () => {
    const bar = (i: number, source: DailyBarInput['source']): DailyBarInput => ({
      ts: new Date(BASE + i * DAY), open: new D(100), high: new D(101), low: new D(99),
      close: new D(100), volume: new D(1e6), source,
    });
    const mixed = [bar(0, 'YAHOO'), bar(1, 'MOCK'), bar(2, 'ALPACA'), bar(3, 'MOCK'), bar(4, 'YAHOO')];
    const { real, excludedMock } = filterRealDailyBars(mixed);
    expect(excludedMock).toBe(2);
    expect(real.every((b) => b.source !== 'MOCK')).toBe(true);
  });
});
