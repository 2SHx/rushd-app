import { describe, it, expect } from 'vitest';
import {
  computeBenchmarkEvidence,
  computeMetrics,
  computePathShapeEvidence,
  computePortfolioMetrics,
  conditionalValueAtRisk,
  martinRatio,
  psrVsBenchmark,
  summarizeCurve,
  timeUnderwater,
  ulcerIndex,
  type EquityPoint,
  type PortfolioEquityPoint,
} from './metrics';

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

// ─────────────────────────────────────────────────────────────────────────────
// QDR-19 mandatory published evidence. Every assertion here is on a REPORTED statistic; none of
// these values is read by any gate, and QDR-19 adopted no threshold for any of them.
// ─────────────────────────────────────────────────────────────────────────────
describe('QDR-19 path-shape helpers', () => {
  it('ulcerIndex is the RMS drawdown of a hand-computable path', () => {
    // 100 → 100 → 50 → 100: drawdowns 0, 0, 0.5, 0 ⇒ √((0.25)/4) = 0.25.
    expect(ulcerIndex([100, 100, 50, 100])).toBeCloseTo(0.25, 12);
    // A monotone-up curve is never underwater ⇒ Ulcer is exactly zero.
    expect(ulcerIndex([1, 2, 3, 4])).toBe(0);
    expect(ulcerIndex([])).toBe(0);
  });

  it('ulcerIndex is a path AVERAGE, so a longer flat recovery lowers it while maxDD is unchanged', () => {
    const short = [100, 50, 100];
    const long = [100, 50, 50, 50, 50, 50, 100];
    // Same 50% max drawdown; Ulcer separates them because it prices duration.
    expect(ulcerIndex(long)).toBeGreaterThan(ulcerIndex(short));
  });

  it('timeUnderwater counts observations strictly below the running high, with a declared floor', () => {
    // dds: 0, 0.1, 0.05, 0 ⇒ 2 of 4 underwater at the strict (default) threshold.
    const curve = [100, 90, 95, 120];
    expect(timeUnderwater(curve)).toBeCloseTo(0.5, 12);
    // A declared 6% floor excludes the shallow 5% day; the threshold is a knob, never a default.
    expect(timeUnderwater(curve, 0.06)).toBeCloseTo(0.25, 12);
    expect(timeUnderwater([1, 2, 3])).toBe(0);
  });

  it('conditionalValueAtRisk averages the worst alpha tail and is negative for a loss tail', () => {
    // 20 returns, worst five are -0.05..-0.01; at alpha=0.25 the tail is floor(0.25*20)=5 of them.
    const worst = [-0.05, -0.04, -0.03, -0.02, -0.01];
    const rest = Array.from({ length: 15 }, (_, i) => 0.01 + i * 0.001);
    const returns = [...rest, ...worst];
    expect(conditionalValueAtRisk(returns, 0.25)).toBeCloseTo(-0.03, 12);
    // Tail size floors to at least one observation, so a small sample never averages an empty slice.
    expect(conditionalValueAtRisk(returns, 0.01)).toBeCloseTo(-0.05, 12);
    expect(conditionalValueAtRisk([], 0.05)).toBe(0);
    expect(() => conditionalValueAtRisk(returns, 0)).toThrow(/alpha/);
  });

  it('martinRatio is exactly CAGR / Ulcer and is unit-free', () => {
    expect(martinRatio(0.3711, 0.1475)).toBeCloseTo(0.3711 / 0.1475, 12);
    // Identical answer in percentage points — the ratio cancels the unit, which is why it takes
    // scalars rather than a curve.
    expect(martinRatio(37.11, 14.75)).toBeCloseTo(martinRatio(0.3711, 0.1475), 10);
    expect(martinRatio(0.5, 0)).toBe(0);
  });

  it('summarizeCurve wires Martin to its own CAGR and Ulcer', () => {
    const curve = [100, 110, 90, 130, 120, 160];
    const s = summarizeCurve(curve, { periodsPerYear: 5 });
    expect(s.martinRatio).toBeCloseTo(s.cagr / s.ulcerIndex, 12);
    expect(s.maxDrawdown).toBeCloseTo((110 - 90) / 110, 12);
    expect(s.observations).toBe(6);
    expect(s.years).toBeCloseTo(1, 12);
  });

  it('computePathShapeEvidence takes CAGR explicitly so no year-count convention is ever inferred', () => {
    const curve = [100, 90, 95, 120];
    const ev = computePathShapeEvidence(curve, { cagr: 0.2, periodsPerYear: 3 });
    expect(ev.cagr).toBe(0.2);
    expect(ev.martinRatio).toBeCloseTo(0.2 / ulcerIndex(curve), 12);
    expect(ev.underwaterThreshold).toBe(0);
    expect(ev.cvarAlpha).toBe(0.05);
    expect(ev.bootstrapUlcer).toBeUndefined();
  });
});

describe('QDR-19 benchmark evidence', () => {
  // A benchmark that compounds at exactly +1%/period and a strategy that beats it by exactly
  // +0.5%/period with ZERO tracking noise: IR is unbounded, so we use a series with a known,
  // hand-checkable active mean and dispersion instead.
  const periodsPerYear = 4;
  const benchmarkReturns = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
  const activeSequence = [0.02, -0.01, 0.02, -0.01, 0.02, -0.01, 0.02, -0.01];
  const compound = (rs: number[]): number[] => {
    const out = [100];
    for (const r of rs) out.push(out[out.length - 1] * (1 + r));
    return out;
  };
  const benchmarkEquity = compound(benchmarkReturns);
  const strategyEquity = compound(benchmarkReturns.map((r, i) => r + activeSequence[i]));

  it('computes IR from the active series and its t-statistic as IR·√years', () => {
    const ev = computeBenchmarkEvidence({
      benchmarkId: 'SPUS',
      benchmarkSource: 'test fixture',
      declarable: true,
      strategyEquity,
      benchmarkEquity,
      periodsPerYear,
    });
    // Active per-period mean is exactly 0.005 by construction; sample stdev of {0.02,-0.01} halves
    // is 0.015·√(8/7). Annualized: activeReturn = 0.005·4 = 0.02, TE = 0.015·√(8/7)·√4.
    const expectedTe = 0.015 * Math.sqrt(8 / 7) * Math.sqrt(periodsPerYear);
    expect(ev.activeReturn).toBeCloseTo(0.02, 12);
    expect(ev.trackingError).toBeCloseTo(expectedTe, 12);
    expect(ev.informationRatio).toBeCloseTo(0.02 / expectedTe, 12);
    expect(ev.years).toBeCloseTo(8 / periodsPerYear, 12);
    expect(ev.informationRatioTStat).toBeCloseTo(ev.informationRatio * Math.sqrt(ev.years), 12);
    // One-sided p is 1 − Φ(t) and must fall as the t-statistic rises.
    expect(ev.informationRatioPValue).toBeGreaterThan(0);
    expect(ev.informationRatioPValue).toBeLessThan(0.5);
  });

  /**
   * PINNED DEFECT — `computePortfolioMetrics.irVsSpy`/`irVsSpus` are NOT annualized Information
   * Ratios; they are PER-PERIOD ones, low by exactly √252.
   *
   *   shipped:  (mean(diff)·√252) / (stdev(diff)·√252)  ==  mean(diff)/stdev(diff)
   *   correct:  (mean(diff)·252)  / (stdev(diff)·√252)  ==  (mean/stdev)·√252
   *
   * QDR-19 states the IR estimator is "reuse, not new work" — and the tracking error genuinely is
   * reused verbatim — but the shipped IR itself is wrong by that factor, which is why the QDR-19
   * benchmark block computes `activeReturn / trackingError` directly rather than calling it. That
   * choice reproduces the record's own published flagship IR of 0.643; the shipped estimator would
   * print 0.0405 on the same two curves. The defect is NOT fixed here: QDR-19 is strictly additive
   * and `computePortfolioMetrics` must stay byte-identical, so it is pinned, disclosed, and left to
   * a record that can own the change. Neither number gates anything.
   */
  it('is low by exactly √252 in the shipped computePortfolioMetrics estimator (pinned defect)', () => {
    const curve: PortfolioEquityPoint[] = strategyEquity.map((equity, i) => ({
      ts: new Date(2024, 0, 1 + i),
      equity,
      cash: 0,
      spy: benchmarkEquity[i],
      spus: benchmarkEquity[i],
    }));
    const portfolio = computePortfolioMetrics(curve, { trades: 10, turnover: 1 });
    const ev = computeBenchmarkEvidence({
      benchmarkId: 'SPUS',
      benchmarkSource: 'test fixture',
      declarable: true,
      strategyEquity,
      benchmarkEquity,
      periodsPerYear: 252,
    });
    // The tracking error IS shared arithmetic and agrees exactly — that half is genuine reuse.
    expect(ev.trackingError).toBeCloseTo(portfolio.trackingErrorVsSpus, 12);
    expect(portfolio.irVsSpus * Math.sqrt(252)).toBeCloseTo(ev.informationRatio, 10);
  });

  it('publishes both arms, refuses mismatched dates, and marks a non-declarable benchmark', () => {
    const ev = computeBenchmarkEvidence({
      benchmarkId: 'equal-weight-universe-reconstruction',
      benchmarkSource: 'MarketBar reconstruction',
      declarable: false,
      nonDeclarableReason: 'NOT_INVESTABLE',
      strategyObservations: strategyEquity.length,
      strategyEquity,
      benchmarkEquity,
      periodsPerYear,
    });
    expect(ev.declarable).toBe(false);
    if (ev.declarable) throw new Error('expected non-declarable benchmark evidence');
    expect(ev.nonDeclarableReason).toBe('NOT_INVESTABLE');
    expect(ev.strategyObservations).toBe(strategyEquity.length);
    expect(ev.matchedObservations).toBe(strategyEquity.length);
    expect(ev.benchmark.cagr).toBeCloseTo(Math.pow(1.01, periodsPerYear) - 1, 12);
    expect(ev.benchmark.ulcerIndex).toBe(0); // a monotone benchmark is never underwater
    expect(ev.activeCagr).toBeCloseTo(ev.strategy.cagr - ev.benchmark.cagr, 12);
    expect(() => computeBenchmarkEvidence({
      benchmarkId: 'SPUS',
      benchmarkSource: 'test fixture',
      declarable: true,
      strategyEquity,
      benchmarkEquity: benchmarkEquity.slice(1),
      periodsPerYear,
    })).toThrow(/matched-date/);
    expect(() => computeBenchmarkEvidence({
      benchmarkId: 'SPUS',
      benchmarkSource: 'test fixture',
      declarable: false,
      strategyEquity,
      benchmarkEquity,
      periodsPerYear,
    })).toThrow(/must name its reason/);
    expect(() => computeBenchmarkEvidence({
      benchmarkId: 'SPUS',
      benchmarkSource: 'test fixture',
      declarable: false,
      nonDeclarableReason: 'PARTIAL_COVERAGE',
      strategyEquity,
      benchmarkEquity,
      periodsPerYear,
    })).toThrow(/strategyObservations greater than matched observations/);
  });

  it('psrVsBenchmark falls as the benchmark Sharpe rises and reduces to PSR(0) at SR* = 0', () => {
    const returns = Array.from({ length: 300 }, (_, i) => 0.001 + 0.004 * Math.sin(i));
    const atZero = psrVsBenchmark(returns, { benchmarkAnnualSharpe: 0 });
    const atOne = psrVsBenchmark(returns, { benchmarkAnnualSharpe: 1 });
    const atThree = psrVsBenchmark(returns, { benchmarkAnnualSharpe: 3 });
    expect(atZero).toBeGreaterThan(atOne);
    expect(atOne).toBeGreaterThan(atThree);
    // SR* = 0 is exactly the shipped deflatedSharpe at trials = 1, i.e. the plain PSR vs zero.
    const curve = computeMetrics(
      returns.reduce<EquityPoint[]>((acc, r, i) => {
        const prev = acc[acc.length - 1].equity;
        return [...acc, { ts: day(i + 1), equity: prev * (1 + r) }];
      }, [{ ts: day(0), equity: 100 }]),
      { trades: 10, turnover: 1, trials: 1 },
    );
    expect(atZero).toBeCloseTo(curve.deflatedSharpe, 9);
  });
});
