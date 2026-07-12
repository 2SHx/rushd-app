import { describe, it, expect } from 'vitest';
import { computeMetrics, type EquityPoint } from './metrics';

const day = (n: number): Date => new Date(2024, 0, 1 + n);

function curveFrom(equities: number[]): EquityPoint[] {
  return equities.map((equity, i) => ({ ts: day(i), equity }));
}

describe('computeMetrics', () => {
  it('steadily rising curve → positive CAGR + Sharpe, high hit-rate', () => {
    const equities = Array.from({ length: 252 }, (_, i) => 100 * Math.pow(1.001, i));
    const m = computeMetrics(curveFrom(equities), { trades: 50, turnover: 1.2 });
    expect(m.cagr).toBeGreaterThan(0);
    expect(m.sharpe).toBeGreaterThan(0);
    expect(m.hitRate).toBeGreaterThan(0.9);
  });

  it('mid-curve drawdown matches the known fraction', () => {
    // 100 -> 150 (peak) -> 75 (trough, -50% from peak) -> 150
    const equities = [100, 150, 75, 150];
    const m = computeMetrics(curveFrom(equities), { trades: 3, turnover: 1 });
    expect(m.maxDrawdown).toBeCloseTo(0.5, 10);
  });

  it('flat curve → sharpe exactly 0', () => {
    const equities = Array.from({ length: 30 }, () => 100);
    const m = computeMetrics(curveFrom(equities), { trades: 0, turnover: 0 });
    expect(m.sharpe).toBe(0);
    expect(m.deflatedSharpe).toBe(0);
    expect(m.implausible).toBe(false);
  });

  it('deflatedSharpe decreases as trials rises (multiple-testing haircut)', () => {
    // Deterministic LCG pseudo-noise (fixed seed) — moderate, non-saturating Sharpe.
    let seed = 42;
    const lcg = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let equity = 100;
    const curve: EquityPoint[] = [{ ts: day(0), equity }];
    for (let i = 1; i < 250; i++) {
      const r = 0.001 + (lcg() - 0.5) * 0.02;
      equity *= 1 + r;
      curve.push({ ts: day(i), equity });
    }
    const m1 = computeMetrics(curve, { trades: 40, turnover: 1, trials: 1 });
    const m10 = computeMetrics(curve, { trades: 40, turnover: 1, trials: 10 });
    const m100 = computeMetrics(curve, { trades: 40, turnover: 1, trials: 100 });
    expect(m10.deflatedSharpe).toBeLessThan(m1.deflatedSharpe);
    expect(m100.deflatedSharpe).toBeLessThan(m10.deflatedSharpe);
  });

  it('sharpe > 3 sets implausible', () => {
    // Extremely consistent tiny positive returns → very high annualized Sharpe.
    const equities = Array.from({ length: 60 }, (_, i) => 100 * Math.pow(1.002, i));
    const m = computeMetrics(curveFrom(equities), { trades: 10, turnover: 1 });
    expect(m.sharpe).toBeGreaterThan(3);
    expect(m.implausible).toBe(true);
  });

  it('empty curve → zeros, no throw', () => {
    const m = computeMetrics([], { trades: 0, turnover: 0 });
    expect(m).toEqual({
      cagr: 0,
      sharpe: 0,
      deflatedSharpe: 0,
      maxDrawdown: 0,
      hitRate: 0,
      trades: 0,
      turnover: 0,
      implausible: false,
    });
  });

  it('one-point curve → zeros, no throw', () => {
    const m = computeMetrics(curveFrom([100]), { trades: 5, turnover: 0.5 });
    expect(m).toEqual({
      cagr: 0,
      sharpe: 0,
      deflatedSharpe: 0,
      maxDrawdown: 0,
      hitRate: 0,
      trades: 5,
      turnover: 0.5,
      implausible: false,
    });
  });

  it('calendar annualization of a sparse trade sequence == daily equity curve (√252 defect fixed)', () => {
    // Regression pin for the measurement fix: a POOLED TRADE-SEQUENCED curve (one point per trade
    // exit) is NOT a per-trading-day series. Annualizing it with a fixed √252 treats sparse trades
    // as consecutive daily returns and fabricates Sharpe — this false-tripped the Sharpe>3
    // implausible guard on bollinger-mr-long-v2 (3.06). The statistically defensible treatment is
    // to annualize by the curve's OWN observation frequency (trades/year); that must reproduce the
    // Sharpe of the equivalent daily mark-to-market curve.
    const totalDays = 1000; // ~2.74 calendar years at 1 point/day
    const tradeEvery = 20; // ⇒ 50 trades over the span (sparse)
    // Deterministic small mixed-sign per-trade returns (zero-ish mean → μ² negligible → tight match).
    const seededReturn = (k: number): number => 0.012 * Math.sin(k * 1.7) + 0.002;

    // Daily mark-to-market curve: equity only moves on trade days, flat otherwise.
    const daily: EquityPoint[] = [{ ts: day(0), equity: 100 }];
    // Trade-sequenced curve: one point per trade exit, SAME start/end timestamps as `daily`.
    const trade: EquityPoint[] = [{ ts: day(0), equity: 100 }];
    let equity = 100;
    let k = 0;
    for (let i = 1; i <= totalDays; i++) {
      if (i % tradeEvery === 0) {
        equity *= 1 + seededReturn(k++);
        trade.push({ ts: day(i), equity });
      }
      daily.push({ ts: day(i), equity });
    }

    const dailyM = computeMetrics(daily, { trades: k, turnover: 1, annualization: 'calendar' });
    const tradeM = computeMetrics(trade, { trades: k, turnover: 1, annualization: 'calendar' });
    // Time-based annualization makes the two representations agree (μ² approximation → ~2 dp).
    expect(tradeM.sharpe).toBeCloseTo(dailyM.sharpe, 1);
    // And the OLD defective treatment (fixed √252 on the sparse trade sequence) inflates it far
    // above the correct value — the exact failure mode we removed.
    const tradeDefective = computeMetrics(trade, { trades: k, turnover: 1 }); // fixed √252
    expect(tradeDefective.sharpe).toBeGreaterThan(tradeM.sharpe * 3);
  });

  it('determinism: same input ⇒ identical output', () => {
    const equities = [100, 105, 102, 110, 108, 115];
    const opts = { trades: 6, turnover: 2, trials: 5 };
    const a = computeMetrics(curveFrom(equities), opts);
    const b = computeMetrics(curveFrom(equities), opts);
    expect(a).toEqual(b);
  });
});
