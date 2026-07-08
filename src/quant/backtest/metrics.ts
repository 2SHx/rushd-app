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
  opts: { trades: number; turnover: number; periodsPerYear?: number; trials?: number }
): BacktestMetrics {
  if (curve.length < 2) return { ...ZERO, trades: opts.trades ?? 0, turnover: opts.turnover ?? 0 };

  const periodsPerYear = opts.periodsPerYear ?? 252;
  const trials = opts.trials ?? 1;

  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const prev = curve[i - 1].equity;
    const cur = curve[i].equity;
    returns.push(prev !== 0 ? (cur - prev) / prev : 0);
  }

  const m = mean(returns);
  const variance = moment(returns, m, 2);
  const stdDev = Math.sqrt(variance);
  const srPeriod = stdDev !== 0 ? m / stdDev : 0;
  const sharpe = srPeriod * Math.sqrt(periodsPerYear);

  const first = curve[0].equity;
  const last = curve[curve.length - 1].equity;
  const elapsedYears = (curve[curve.length - 1].ts.getTime() - curve[0].ts.getTime()) / MS_PER_YEAR;
  const cagr = first > 0 && elapsedYears > 0 ? Math.pow(last / first, 1 / elapsedYears) - 1 : 0;

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

function computeCaptureRatios(strategyReturns: number[], benchmarkReturns: number[]): { upCapture: number; downCapture: number } {
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
