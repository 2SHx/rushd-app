// Backtest metrics — pure functions over an equity curve (skill: backtesting-rigor).
// Always report CAGR + Deflated Sharpe + max drawdown + hit-rate + trade count together;
// a raw Sharpe/return number without these is marketing, not evidence.
// Money/statistics note: these are plain numbers (return ratios), not ledger Decimal money.

export interface EquityPoint {
  ts: Date;
  equity: number;
}

export interface BacktestMetrics {
  cagr: number;
  sharpe: number;
  deflatedSharpe: number;
  maxDrawdown: number;
  hitRate: number;
  trades: number;
  turnover: number;
  implausible: boolean;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const EULER_MASCHERONI = 0.5772156649015329;

const mean = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

// Population moments (ddof=0) — avoids div-by-zero when only one return is available.
const moment = (a: number[], m: number, k: number): number =>
  a.length ? mean(a.map((v) => (v - m) ** k)) : 0;

// Abramowitz & Stegun 7.1.26 erf approximation (max error ~1.5e-7).
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

const normalCDF = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

// Peter Acklam's rational approximation of the inverse standard normal CDF (probit).
function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

const ZERO: BacktestMetrics = {
  cagr: 0,
  sharpe: 0,
  deflatedSharpe: 0,
  maxDrawdown: 0,
  hitRate: 0,
  trades: 0,
  turnover: 0,
  implausible: false,
};

/**
 * Deflated Sharpe Ratio (López de Prado, "The Deflated Sharpe Ratio", 2014).
 *
 * PSR(SR*) = Φ( (SR - SR*) * sqrt(n-1) / sqrt(1 - γ3·SR + ((γ4-1)/4)·SR²) )
 *   where SR is the per-period (non-annualized) Sharpe, n the number of return
 *   observations, γ3/γ4 the sample skewness/kurtosis (kurtosis, not excess), and
 *   Φ the standard normal CDF. This is the probability that the true Sharpe > SR*.
 *
 * The Deflated Sharpe Ratio sets the benchmark SR* to the *expected maximum* Sharpe
 * one would observe by chance across `trials` independent strategy attempts, using
 * the standard multiple-testing correction (Euler-Mascheroni γ constant below):
 *
 *   SR0 = sqrt(Var[SR]) · [ (1-γ)·Z⁻¹(1 - 1/N) + γ·Z⁻¹(1 - 1/(N·e)) ]
 *
 * Var[SR] is approximated (as several practical DSR implementations do) with the
 * same sampling variance used in the PSR denominator, since we only observe this
 * one trial's return series and not the full cross-trial Sharpe distribution.
 * With N (trials) <= 1 there is no multiple-testing correction and SR0 = 0, i.e.
 * deflatedSharpe reduces to the plain probabilistic Sharpe ratio vs. a zero benchmark.
 */
function deflatedSharpe(periodReturns: number[], srPeriod: number, trials: number): number {
  const n = periodReturns.length;
  if (n < 2) return 0;
  const m = mean(periodReturns);
  const variance = moment(periodReturns, m, 2);
  const std = Math.sqrt(variance);
  if (std === 0) return 0;
  const skew = moment(periodReturns, m, 3) / std ** 3;
  const kurt = moment(periodReturns, m, 4) / std ** 4; // non-excess (normal ≈ 3)
  const term = Math.max(1 - skew * srPeriod + ((kurt - 1) / 4) * srPeriod ** 2, 1e-12);
  const denom = Math.sqrt(term);

  let sr0 = 0;
  const N = Math.max(1, trials);
  if (N > 1) {
    const varSr = term / (n - 1 || 1);
    const z1 = inverseNormalCDF(1 - 1 / N);
    const z2 = inverseNormalCDF(1 - 1 / (N * Math.E));
    sr0 = Math.sqrt(Math.max(varSr, 0)) * ((1 - EULER_MASCHERONI) * z1 + EULER_MASCHERONI * z2);
  }

  const z = ((srPeriod - sr0) * Math.sqrt(n - 1)) / denom;
  return normalCDF(z);
}

export function computeMetrics(
  curve: EquityPoint[],
  opts: {
    trades: number;
    turnover: number;
    periodsPerYear?: number;
    trials?: number;
    /**
     * How to annualize the per-period Sharpe.
     *  - 'fixed' (default): multiply by √periodsPerYear (default 252). CORRECT ONLY when `curve`
     *    is a genuine per-trading-day mark-to-market series (≈252 points/year) — e.g. the intraday
     *    and daily ENGINE equity curves. Backward-compatible default.
     *  - 'calendar': derive the true observation frequency from the curve's OWN calendar span,
     *    periodsPerYear = observations / elapsedYears, then annualize by its √. Use this for a
     *    POOLED TRADE-SEQUENCED curve (one point per trade exit): such a curve has ~trades/year
     *    points, NOT 252, so a fixed √252 fabricates Sharpe. This defect annualized a sparse
     *    ~28-trades/year sequence as if consecutive daily returns and false-tripped the Sharpe>3
     *    implausible guard on bollinger-mr-long-v2 at 3.06 (measurement artifact, not real edge).
     *
     *    Statistical justification: for a near-zero-mean return series the trade-sequence Sharpe
     *    annualized by √(N/T) equals the √252-annualized Sharpe of the equivalent daily
     *    mark-to-market curve. Sketch: with N trades of returns rᵢ over D trading days (T=D/252
     *    years) and zero on non-trade days, daily SR·√252 = (Σrᵢ)·√252/√(D·Σrᵢ²); trade SR·√(N/T)
     *    = (Σrᵢ)/√(N·Σrᵢ²)·√(N·252/D) = (Σrᵢ)·√252/√(D·Σrᵢ²) — identical. The zero-return days
     *    that dilute the daily mean cancel exactly against the D they add to the daily variance.
     *    Pinned in metrics.test.ts ("calendar annualization of a sparse trade sequence …").
     */
    annualization?: 'fixed' | 'calendar';
  }
): BacktestMetrics {
  if (curve.length < 2) return { ...ZERO, trades: opts.trades ?? 0, turnover: opts.turnover ?? 0 };

  const trials = opts.trials ?? 1;

  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    const cur = curve[i].equity;
    returns.push(prev !== 0 ? (cur - prev) / prev : 0);
  }

  const first = curve[0].equity;
  const last = curve[curve.length - 1].equity;
  const elapsedYears = (curve[curve.length - 1].ts.getTime() - curve[0].ts.getTime()) / MS_PER_YEAR;
  const cagr = first > 0 && elapsedYears > 0 ? Math.pow(last / first, 1 / elapsedYears) - 1 : 0;

  // Time-based annualization when requested; else the fixed frequency (backward-compatible).
  const periodsPerYear =
    opts.annualization === 'calendar'
      ? elapsedYears > 0
        ? returns.length / elapsedYears
        : 0
      : opts.periodsPerYear ?? 252;

  const m = mean(returns);
  const variance = moment(returns, m, 2);
  const stdDev = Math.sqrt(variance);
  const srPeriod = stdDev !== 0 ? m / stdDev : 0;
  const sharpe = srPeriod * Math.sqrt(periodsPerYear);

  let peak = curve[0].equity;
  let maxDrawdown = 0;
  for (const p of curve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - p.equity) / peak);
  }

  const hitRate = returns.length ? returns.filter((r) => r > 0).length / returns.length : 0;

  return {
    cagr,
    sharpe,
    deflatedSharpe: stdDev !== 0 ? deflatedSharpe(returns, srPeriod, trials) : 0,
    maxDrawdown,
    hitRate,
    trades: opts.trades ?? 0,
    turnover: opts.turnover ?? 0,
    implausible: sharpe > 3,
  };
}

export interface PortfolioEquityPoint {
  ts: Date;
  equity: number;
  cash: number;
  spy: number;
  spus: number;
}

export interface PortfolioBacktestMetrics {
  cagr: number;
  sharpe: number;
  deflatedSharpe: number;
  maxDrawdown: number;
  hitRate: number;
  trades: number;
  turnover: number;
  alphaVsSpy: number;
  alphaVsSpus: number;
  irVsSpy: number;
  irVsSpus: number;
  trackingErrorVsSpy: number;
  trackingErrorVsSpus: number;
  upCaptureVsSpy: number;
  upCaptureVsSpus: number;
  downCaptureVsSpy: number;
  downCaptureVsSpus: number;
}

function stdDev(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = mean(returns);
  const variance = returns.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

/**
 * Up/down capture versus a benchmark. Exported for QDR-10 BETA reporting (c1-report), never as a
 * gate — signature and logic are unchanged, and `computePortfolioMetrics` output stays byte-identical.
 */
export function computeCaptureRatios(strategyReturns: number[], benchmarkReturns: number[]): { upCapture: number; downCapture: number } {
  const upStrat: number[] = [];
  const upBench: number[] = [];
  const downStrat: number[] = [];
  const downBench: number[] = [];

  for (let i = 0; i < benchmarkReturns.length; i++) {
    const br = benchmarkReturns[i];
    const sr = strategyReturns[i];
    if (br > 0) {
      upStrat.push(sr);
      upBench.push(br);
    } else if (br < 0) {
      downStrat.push(sr);
      downBench.push(br);
    }
  }

  const meanUpStrat = upStrat.length ? upStrat.reduce((a, b) => a + b, 0) / upStrat.length : 0;
  const meanUpBench = upBench.length ? upBench.reduce((a, b) => a + b, 0) / upBench.length : 0;
  const meanDownStrat = downStrat.length ? downStrat.reduce((a, b) => a + b, 0) / downStrat.length : 0;
  const meanDownBench = downBench.length ? downBench.reduce((a, b) => a + b, 0) / downBench.length : 0;

  return {
    upCapture: meanUpBench !== 0 ? meanUpStrat / meanUpBench : 0,
    downCapture: meanDownBench !== 0 ? meanDownStrat / meanDownBench : 0
  };
}

export function computePortfolioMetrics(
  curve: PortfolioEquityPoint[],
  opts: { trades: number; turnover: number; trials?: number } = { trades: 0, turnover: 0 }
): PortfolioBacktestMetrics {
  if (curve.length < 2) {
    return {
      cagr: 0, sharpe: 0, deflatedSharpe: 0, maxDrawdown: 0, hitRate: 0,
      trades: opts.trades, turnover: opts.turnover,
      alphaVsSpy: 0, alphaVsSpus: 0, irVsSpy: 0, irVsSpus: 0,
      trackingErrorVsSpy: 0, trackingErrorVsSpus: 0,
      upCaptureVsSpy: 0, upCaptureVsSpus: 0,
      downCaptureVsSpy: 0, downCaptureVsSpus: 0
    };
  }

  const first = curve[0];
  const last = curve[curve.length - 1];

  const elapsedYears = (last.ts.getTime() - first.ts.getTime()) / MS_PER_YEAR;
  const cagr = first.equity > 0 && elapsedYears > 0 ? Math.pow(last.equity / first.equity, 1 / elapsedYears) - 1 : 0;
  const spyCagr = first.spy > 0 && elapsedYears > 0 ? Math.pow(last.spy / first.spy, 1 / elapsedYears) - 1 : 0;
  const spusCagr = first.spus > 0 && elapsedYears > 0 ? Math.pow(last.spus / first.spus, 1 / elapsedYears) - 1 : 0;

  const dailyReturns: number[] = [];
  const spyDailyReturns: number[] = [];
  const spusDailyReturns: number[] = [];
  
  const diffSpy: number[] = [];
  const diffSpus: number[] = [];

  for (let i = 1; i < curve.length; i++) {
    const r = curve[i - 1].equity !== 0 ? (curve[i].equity - curve[i - 1].equity) / curve[i - 1].equity : 0;
    const rSpy = curve[i - 1].spy !== 0 ? (curve[i].spy - curve[i - 1].spy) / curve[i - 1].spy : 0;
    const rSpus = curve[i - 1].spus !== 0 ? (curve[i].spus - curve[i - 1].spus) / curve[i - 1].spus : 0;

    dailyReturns.push(r);
    spyDailyReturns.push(rSpy);
    spusDailyReturns.push(rSpus);

    diffSpy.push(r - rSpy);
    diffSpus.push(r - rSpus);
  }

  const avgRet = mean(dailyReturns);
  const dailyVol = stdDev(dailyReturns);
  const sharpe = dailyVol > 0 ? (avgRet / dailyVol) * Math.sqrt(252) : 0;

  let peak = curve[0].equity;
  let maxDrawdown = 0;
  for (const pt of curve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak > 0 ? (peak - pt.equity) / peak : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const hitRate = dailyReturns.length ? dailyReturns.filter(r => r > 0).length / dailyReturns.length : 0;

  const alphaVsSpy = cagr - spyCagr;
  const alphaVsSpus = cagr - spusCagr;

  const spyTe = stdDev(diffSpy) * Math.sqrt(252);
  const spusTe = stdDev(diffSpus) * Math.sqrt(252);

  const irVsSpy = spyTe > 0 ? (mean(diffSpy) * Math.sqrt(252)) / spyTe : 0;
  const irVsSpus = spusTe > 0 ? (mean(diffSpus) * Math.sqrt(252)) / spusTe : 0;

  const spyCapture = computeCaptureRatios(dailyReturns, spyDailyReturns);
  const spusCapture = computeCaptureRatios(dailyReturns, spusDailyReturns);

  const ds = dailyVol > 0 ? deflatedSharpe(dailyReturns, avgRet / dailyVol, opts.trials ?? 1) : 0;

  return {
    cagr,
    sharpe,
    deflatedSharpe: ds,
    maxDrawdown,
    hitRate,
    trades: opts.trades,
    turnover: opts.turnover,
    alphaVsSpy,
    alphaVsSpus,
    irVsSpy,
    irVsSpus,
    trackingErrorVsSpy: spyTe,
    trackingErrorVsSpus: spusTe,
    upCaptureVsSpy: spyCapture.upCapture,
    upCaptureVsSpus: spusCapture.upCapture,
    downCaptureVsSpy: spyCapture.downCapture,
    downCaptureVsSpus: spusCapture.downCapture
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// QDR-19 (2026-08-21) MANDATORY PUBLISHED EVIDENCE — path-shape and benchmark blocks.
//
// Everything below is PURE, ADDITIVE and REPORTED-NEVER-GATED, on the exact precedent of
// `computeCaptureRatios` (QDR-10): `computeMetrics` and `computePortfolioMetrics` outputs are
// byte-identical after this addition, no `PromotionChecklist` field reads any of it, and QDR-19
// adopted NO threshold for any of these statistics. Deriving an Ulcer or CVaR threshold from a
// measured book is forbidden by name in that record.
//
// UNITS. Every drawdown-shaped quantity here is a FRACTION, matching `BacktestMetrics.maxDrawdown`
// (0.1475, not 14.75). The Ulcer Index is conventionally *quoted* in percentage points — 14.75 —
// so renderers multiply by 100. `martinRatio` is unit-free provided both arguments carry the same
// unit, which is why it takes CAGR and Ulcer rather than an equity curve.
//
// YEAR-COUNT CONVENTION. `computeMetrics` derives elapsed years from the curve's CALENDAR span
// (MS_PER_YEAR). The helpers below annualize by OBSERVATION COUNT / periodsPerYear, because a
// benchmark comparison is matched-DATE and a session-count convention is what makes the two series
// commensurable. On the flagship curve the two differ by 0.25 years (8.512 vs 8.537), moving CAGR
// 37.11% → 36.99% and Martin 2.516 → 2.508. The convention is stated, never inferred.
// ─────────────────────────────────────────────────────────────────────────────

/** Running peak-to-current drawdown at every point of an equity curve, as fractions in [0, 1). */
export function drawdownSeries(equity: readonly number[]): number[] {
  const out: number[] = [];
  let peak = Number.NEGATIVE_INFINITY;
  for (const value of equity) {
    if (value > peak) peak = value;
    out.push(peak > 0 ? (peak - value) / peak : 0);
  }
  return out;
}

/**
 * Ulcer Index (Martin & McCann 1989) — √mean(DD²) over the whole path, as a FRACTION.
 *
 * QDR-19 adopts this as mandatory publication because it is the only one of the four risk
 * statistics carrying information volatility does not already contain: on the flagship the
 * engine/benchmark Ulcer ratio is 2.063× against a 1.756× volatility ratio, i.e. 17.5% worse than
 * scale alone predicts. Unlike max drawdown it is an AVERAGE over the path — a consistent estimator
 * of a stationary quantity rather than a divergent extreme — so it does not inflate with window
 * length the way the p95 max-DD figure measurably does.
 */
export function ulcerIndex(equity: readonly number[]): number {
  if (equity.length === 0) return 0;
  const dd = drawdownSeries(equity);
  return Math.sqrt(dd.reduce((sum, d) => sum + d * d, 0) / dd.length);
}

/**
 * Fraction of observations spent below the running high-water mark.
 *
 * `threshold` is a DECLARED drawdown floor and defaults to 0, i.e. the strict textbook test
 * `dd > 0`. It exists because an undeclared epsilon is a free parameter: QDR-19's published pair
 * (engine 88.6%, benchmark 83.2%) is not reproducible at `threshold = 0` — the strict figures on
 * the same two curves are 89.10% and 85.23% — and is recovered only at an implicit floor near
 * 10 bps (88.54% / 83.18%). Whatever a card uses, it prints the threshold beside the number.
 */
export function timeUnderwater(equity: readonly number[], threshold = 0): number {
  if (equity.length === 0) return 0;
  const dd = drawdownSeries(equity);
  return dd.filter((d) => d > threshold).length / dd.length;
}

/**
 * Conditional Value at Risk (expected shortfall) at `alpha` — the mean of the worst `alpha` tail of
 * the per-period return series. Returned in RETURN units and NEGATIVE for a loss tail
 * (flagship: −0.0555, i.e. −5.55%/day at 5%).
 *
 * The tail size is `max(1, floor(alpha·n))`, so it never silently averages an empty slice. CVaR is
 * coherent (subadditive) where max drawdown is not — but note QDR-19's measurement that on this
 * book CVaR is nearly collinear with volatility (1.808× against a 1.756× vol ratio), so it carries
 * almost no gate information it would not duplicate. It is published; it gates nothing.
 */
export function conditionalValueAtRisk(returns: readonly number[], alpha = 0.05): number {
  if (returns.length === 0) return 0;
  if (!(alpha > 0 && alpha <= 1)) throw new Error('CVaR alpha must be in (0, 1]');
  const sorted = [...returns].sort((a, b) => a - b);
  const tail = sorted.slice(0, Math.max(1, Math.floor(alpha * sorted.length)));
  return mean(tail);
}

/**
 * Martin ratio = CAGR / Ulcer Index (rf = 0). Duration-aware Calmar: it divides by the RMS of the
 * whole underwater path instead of its single worst point. Unit-free while both inputs share a
 * unit. QDR-19's honesty note: on the flagship the BENCHMARK wins this ratio, 2.606 to 2.516.
 */
export function martinRatio(cagr: number, ulcer: number): number {
  return ulcer > 0 ? cagr / ulcer : 0;
}

/**
 * Sortino ratio — mean / downside deviation about `target`, annualized by √periodsPerYear. The
 * downside deviation divides by the FULL observation count (not just the below-target ones), which
 * is the standard definition and the one that reproduces the published 1.486.
 *
 * Reported only. QDR-19(C) REFUSED substituting this numerator into the Deflated Sharpe: PSR's
 * variance is a delta-method result for the specific functional μ/σ, and a Sortino numerator would
 * make the shipped denominator understate the estimator's variance on positively skewed series —
 * an anti-conservative deflation, the exact opposite of what the instrument is for.
 */
export function sortinoRatio(
  returns: readonly number[],
  opts: { periodsPerYear?: number; target?: number } = {},
): number {
  if (returns.length === 0) return 0;
  const periodsPerYear = opts.periodsPerYear ?? 252;
  const target = opts.target ?? 0;
  const excess = returns.map((r) => r - target);
  const downside = Math.sqrt(excess.reduce((sum, r) => sum + Math.min(r, 0) ** 2, 0) / excess.length);
  return downside > 0 ? (mean(excess) / downside) * Math.sqrt(periodsPerYear) : 0;
}

/**
 * Probabilistic Sharpe Ratio against a NON-ZERO benchmark Sharpe — `PSR(SR*)` with
 * `SR* = the benchmark's matched-date annualized Sharpe`, de-annualized to per-period.
 *
 * QDR-19 calls this "the one coherent in-framework version" of the benchmark critique: `SR* = 0` in
 * the shipped Deflated Sharpe is a CHOICE, not a derivation, and PSR is defined for any `SR*`, so
 * this stays entirely inside the estimator's assumptions — unlike changing the numerator. Adopted
 * as a REPORTED COMPANION STATISTIC ONLY. Gating it would raise the required annualized Sharpe to
 * `SR_benchmark + (1.6449 + C)/√oosYears` and re-create QDR-9's rejected decade-long unfalsifiable
 * wait; that needs a fresh record carrying its own power analysis.
 */
export function psrVsBenchmark(
  returns: readonly number[],
  opts: { benchmarkAnnualSharpe: number; periodsPerYear?: number },
): number {
  const n = returns.length;
  if (n < 2) return 0;
  const periodsPerYear = opts.periodsPerYear ?? 252;
  const m = mean(returns as number[]);
  const std = Math.sqrt(moment(returns as number[], m, 2));
  if (std === 0) return 0;
  const srPeriod = m / std;
  const srBenchmarkPeriod = opts.benchmarkAnnualSharpe / Math.sqrt(periodsPerYear);
  const skew = moment(returns as number[], m, 3) / std ** 3;
  const kurt = moment(returns as number[], m, 4) / std ** 4; // non-excess (normal ≈ 3)
  const term = Math.max(1 - skew * srPeriod + ((kurt - 1) / 4) * srPeriod ** 2, 1e-12);
  return normalCDF(((srPeriod - srBenchmarkPeriod) * Math.sqrt(n - 1)) / Math.sqrt(term));
}

/** One curve's stand-alone summary, on the observation-count year convention documented above. */
export interface CurveSummary {
  observations: number;
  years: number;
  cagr: number;
  annualVolatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  ulcerIndex: number;
  timeUnderwater: number;
  conditionalValueAtRisk: number;
  martinRatio: number;
}

const periodReturns = (equity: readonly number[]): number[] => {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    out.push(equity[i - 1] !== 0 ? (equity[i] - equity[i - 1]) / equity[i - 1] : 0);
  }
  return out;
};

/** Pure summary of a single equity curve. Never gated; feeds the two QDR-19 published blocks. */
export function summarizeCurve(
  equity: readonly number[],
  opts: { periodsPerYear?: number; cvarAlpha?: number; underwaterThreshold?: number } = {},
): CurveSummary {
  const periodsPerYear = opts.periodsPerYear ?? 252;
  const returns = periodReturns(equity);
  const years = returns.length / periodsPerYear;
  const first = equity[0] ?? 0;
  const last = equity[equity.length - 1] ?? 0;
  const cagr = first > 0 && years > 0 ? Math.pow(last / first, 1 / years) - 1 : 0;
  const sd = stdDev(returns);
  const ui = ulcerIndex(equity);
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const value of equity) {
    if (value > peak) peak = value;
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - value) / peak);
  }
  return {
    observations: equity.length,
    years,
    cagr,
    annualVolatility: sd * Math.sqrt(periodsPerYear),
    sharpe: sd > 0 ? (mean(returns) / sd) * Math.sqrt(periodsPerYear) : 0,
    sortino: sortinoRatio(returns, { periodsPerYear }),
    maxDrawdown,
    ulcerIndex: ui,
    timeUnderwater: timeUnderwater(equity, opts.underwaterThreshold ?? 0),
    conditionalValueAtRisk: conditionalValueAtRisk(returns, opts.cvarAlpha ?? 0.05),
    martinRatio: martinRatio(cagr, ui),
  };
}

/**
 * One point of the max-drawdown path-length sensitivity disclosure. Structurally identical to
 * `monteCarlo.MaxDrawdownPathLengthPoint`, which produces it; declared here so `metrics.ts` stays
 * free of any dependency on the sampler, exactly as it is today.
 */
export interface MaxDrawdownPathLengthPoint {
  readonly pathLength: number;
  readonly p95: number;
  /** True for the length the BINDING `mcMaxDDWithinBreaker` figure was measured at. */
  readonly binding: boolean;
}

/** QDR-19 PATH-SHAPE block. Every field is published; none is read by any gate. */
export interface PathShapeEvidence {
  observations: number;
  ulcerIndex: number;
  timeUnderwater: number;
  /** The DECLARED drawdown floor used for `timeUnderwater`; printed beside it. */
  underwaterThreshold: number;
  cvarAlpha: number;
  conditionalValueAtRisk: number;
  martinRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  cagr: number;
  /** Bootstrap Ulcer percentiles from the SAME resampled paths as the binding max-DD figure. */
  bootstrapUlcer?: { p50: number; p95: number };
  /**
   * QDR-19's mandatory max-DD path-length sensitivity disclosure: the binding p95 alongside the
   * same statistic at other path lengths. Window length alone moves a pass into a fail, so the
   * breaker measures the window as much as it measures the book.
   */
  maxDrawdownPathLengthSensitivity?: readonly MaxDrawdownPathLengthPoint[];
}

export function computePathShapeEvidence(
  equity: readonly number[],
  opts: {
    /** REQUIRED and explicit: Martin's numerator, so no year-count convention is ever inferred. */
    cagr: number;
    periodsPerYear?: number;
    cvarAlpha?: number;
    underwaterThreshold?: number;
    bootstrapUlcer?: { p50: number; p95: number };
    maxDrawdownPathLengthSensitivity?: readonly MaxDrawdownPathLengthPoint[];
  },
): PathShapeEvidence {
  const summary = summarizeCurve(equity, opts);
  const ui = summary.ulcerIndex;
  return {
    observations: summary.observations,
    ulcerIndex: ui,
    timeUnderwater: summary.timeUnderwater,
    underwaterThreshold: opts.underwaterThreshold ?? 0,
    cvarAlpha: opts.cvarAlpha ?? 0.05,
    conditionalValueAtRisk: summary.conditionalValueAtRisk,
    martinRatio: martinRatio(opts.cagr, ui),
    sortinoRatio: summary.sortino,
    maxDrawdown: summary.maxDrawdown,
    cagr: opts.cagr,
    ...(opts.bootstrapUlcer ? { bootstrapUlcer: opts.bootstrapUlcer } : {}),
    ...(opts.maxDrawdownPathLengthSensitivity
      ? { maxDrawdownPathLengthSensitivity: opts.maxDrawdownPathLengthSensitivity }
      : {}),
  };
}

/**
 * WHY a block is not declarable. The two conditions are independent and can co-occur:
 *  - `NOT_INVESTABLE`: a reconstructed basket rather than an instrument — survivor-conditioned,
 *    disqualified at ANY coverage (QDR-20).
 *  - `PARTIAL_COVERAGE`: a real investable instrument whose matched history is shorter than the
 *    strategy window (SPUS has none before its 2019-12-18 inception).
 * When both hold the answer is `NOT_INVESTABLE`: it is the stronger disqualification and survives
 * any coverage fix. Naming the reason is what stops a card from claiming a real fund is a basket.
 */
export type BenchmarkNonDeclarableReason = 'NOT_INVESTABLE' | 'PARTIAL_COVERAGE';

/** QDR-19 BENCHMARK block. Every field is published; none is read by any gate — IR is NOT a gate. */
interface BenchmarkEvidenceFields {
  /** MUST name an investable instrument at seal (SPUS is the default). A reconstructed */
  /** equal-weight universe basket may be published as CONTEXT but never DECLARED — it is */
  /** survivor-conditioned by the same bias QDR-15 haircuts at −0.16 Sharpe. */
  benchmarkId: string;
  benchmarkSource: string;
  matchedObservations: number;
  years: number;
  strategy: CurveSummary;
  benchmark: CurveSummary;
  /** Annualized ARITHMETIC mean of the per-period active return (not the CAGR difference). */
  activeReturn: number;
  /** The CAGR difference, published alongside because the two answer different questions. */
  activeCagr: number;
  trackingError: number;
  informationRatio: number;
  /** IR·√years, and its ONE-SIDED normal p-value. */
  informationRatioTStat: number;
  informationRatioPValue: number;
  /** PSR with SR* = the benchmark's matched-date annualized Sharpe. Companion statistic only. */
  psrVsBenchmark: number;
}

/**
 * A non-declarable block MUST carry its reason, so the union makes the reason unconstructible-by-
 * omission: there is no way to build `declarable: false` without saying which condition failed.
 * `declarable` itself is unchanged — this names the reason, it does not change who qualifies.
 */
export type BenchmarkEvidence =
  | (BenchmarkEvidenceFields & { declarable: true })
  | (BenchmarkEvidenceFields & {
    declarable: false;
    nonDeclarableReason: BenchmarkNonDeclarableReason;
    /** Strategy observations in the window, in the SAME unit as `matchedObservations`, so the
     * published shortfall is a like-for-like count rather than a vague "partial". */
    strategyObservations: number;
  });

/**
 * Assemble the benchmark block from two MATCHED-DATE equity curves.
 *
 * The IR estimator is deliberately the SAME arithmetic `computePortfolioMetrics` already uses for
 * `irVsSpus`/`irVsSpy` — `mean(diff)·P / (stdev(diff)·√P)` — so this is reuse, not a second
 * estimator that could silently disagree with the one already shipping.
 */
export function computeBenchmarkEvidence(args: {
  benchmarkId: string;
  benchmarkSource: string;
  declarable: boolean;
  /** REQUIRED whenever `declarable` is false; omitting it throws rather than guessing a reason. */
  nonDeclarableReason?: BenchmarkNonDeclarableReason;
  /** Strategy observations in the same unit as the matched curves; defaults to the matched count. */
  strategyObservations?: number;
  strategyEquity: readonly number[];
  benchmarkEquity: readonly number[];
  periodsPerYear?: number;
  cvarAlpha?: number;
  underwaterThreshold?: number;
}): BenchmarkEvidence {
  if (args.strategyEquity.length !== args.benchmarkEquity.length) {
    throw new Error('Benchmark evidence requires matched-date curves of equal length');
  }
  const periodsPerYear = args.periodsPerYear ?? 252;
  const summaryOpts = {
    periodsPerYear,
    cvarAlpha: args.cvarAlpha,
    underwaterThreshold: args.underwaterThreshold,
  };
  const strategy = summarizeCurve(args.strategyEquity, summaryOpts);
  const benchmark = summarizeCurve(args.benchmarkEquity, summaryOpts);
  const strategyReturns = periodReturns(args.strategyEquity);
  const benchmarkReturns = periodReturns(args.benchmarkEquity);
  const active = strategyReturns.map((r, i) => r - benchmarkReturns[i]);
  const trackingError = stdDev(active) * Math.sqrt(periodsPerYear);
  const activeReturn = mean(active) * periodsPerYear;
  const informationRatio = trackingError > 0 ? activeReturn / trackingError : 0;
  const years = strategyReturns.length / periodsPerYear;
  const tStat = informationRatio * Math.sqrt(Math.max(years, 0));
  // Fail closed: a block that cannot say WHY it is context is not published at all. Guessing the
  // reason is how a partial-coverage SPUS window ends up described as a reconstructed basket.
  if (!args.declarable && !args.nonDeclarableReason) {
    throw new Error(
      'A non-declarable benchmark block must name its reason (NOT_INVESTABLE | PARTIAL_COVERAGE)',
    );
  }
  if (!args.declarable && args.nonDeclarableReason === 'PARTIAL_COVERAGE'
    && (!Number.isInteger(args.strategyObservations)
      || (args.strategyObservations ?? 0) <= args.strategyEquity.length)) {
    throw new Error(
      'PARTIAL_COVERAGE requires strategyObservations greater than matched observations',
    );
  }
  const base = {
    benchmarkId: args.benchmarkId,
    benchmarkSource: args.benchmarkSource,
    declarable: args.declarable,
    matchedObservations: args.strategyEquity.length,
    years,
    strategy,
    benchmark,
    activeReturn,
    activeCagr: strategy.cagr - benchmark.cagr,
    trackingError,
    informationRatio,
    informationRatioTStat: tStat,
    informationRatioPValue: 1 - normalCDF(tStat),
    psrVsBenchmark: psrVsBenchmark(strategyReturns, {
      benchmarkAnnualSharpe: benchmark.sharpe,
      periodsPerYear,
    }),
  };
  // Re-stating `declarable` keeps its original key position; the reason fields append LAST, so a
  // declarable block serializes byte-identically to what it did before this record.
  return args.declarable
    ? { ...base, declarable: true }
    : {
      ...base,
      declarable: false,
      nonDeclarableReason: args.nonDeclarableReason as BenchmarkNonDeclarableReason,
      strategyObservations: args.strategyObservations ?? base.matchedObservations,
    };
}
