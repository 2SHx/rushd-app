import { describe, it, expect } from 'vitest';
import { summarizeDailyReturns, toDailyReturns, isImplausibleDailyClaim } from './distribution';
import { computeMetrics, type EquityPoint } from './metrics';

describe('summarizeDailyReturns', () => {
  it('reports P(day ≥ +5%) and P(day ≤ −5%) from known inputs', () => {
    const d = summarizeDailyReturns([0.06, -0.06, 0.01, -0.01, 0.10]);
    expect(d.count).toBe(5);
    expect(d.probDayGe5pct).toBeCloseTo(2 / 5, 10); // 0.06 and 0.10
    expect(d.probDayLe5pct).toBeCloseTo(1 / 5, 10); // -0.06
    expect(d.max).toBeCloseTo(0.10, 10);
  });

  it('empty series yields all zeros (no fabricated distribution)', () => {
    const d = summarizeDailyReturns([]);
    expect(d).toEqual({ count: 0, mean: 0, std: 0, min: 0, max: 0, probDayGe5pct: 0, probDayLe5pct: 0 });
  });
});

describe('toDailyReturns', () => {
  it('collapses an intraday curve to per-day close-to-close returns', () => {
    const dateKey = (d: Date) => d.toISOString().slice(0, 10);
    const curve: EquityPoint[] = [
      { ts: new Date('2021-01-27T14:31:00Z'), equity: 100 },
      { ts: new Date('2021-01-27T20:00:00Z'), equity: 110 }, // day1 EOD = 110
      { ts: new Date('2021-01-28T14:31:00Z'), equity: 110 },
      { ts: new Date('2021-01-28T20:00:00Z'), equity: 99 },  // day2 EOD = 99
    ];
    const r = toDailyReturns(curve, dateKey);
    expect(r).toHaveLength(1);
    expect(r[0]).toBeCloseTo((99 - 110) / 110, 10);
  });
});

describe('§6 implausible flag — metrics math only (never synthetic bars)', () => {
  it('computeMetrics flags a synthetic-metrics equity curve with Sharpe > 3', () => {
    // A near-monotonic low-variance ramp yields an absurd Sharpe → implausible=true.
    const curve: EquityPoint[] = Array.from({ length: 40 }, (_, i) => ({
      ts: new Date(Date.UTC(2021, 0, 1) + i * 86_400_000),
      equity: 100 * Math.pow(1.002, i), // steady 0.2%/day, ~zero variance
    }));
    const m = computeMetrics(curve, { trades: 40, turnover: 1 });
    expect(m.sharpe).toBeGreaterThan(3);
    expect(m.implausible).toBe(true);
  });

  it('isImplausibleDailyClaim fires when a claimed daily return exceeds 3σ of history', () => {
    const history = [0.005, -0.004, 0.006, -0.003, 0.004, -0.005, 0.003, -0.002];
    expect(isImplausibleDailyClaim(0.50, history)).toBe(true);   // a claimed +50% day
    expect(isImplausibleDailyClaim(0.004, history)).toBe(false); // within the measured range
    expect(isImplausibleDailyClaim(0.01, [])).toBe(true);        // no validated history ⇒ unbackable
  });
});
