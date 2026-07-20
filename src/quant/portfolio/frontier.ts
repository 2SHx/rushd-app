// Rushd Quant — Markowitz efficient-frontier sampler + Monte Carlo 1-day VaR
// (Investing for Programmers ch. 7; skills: risk-management, backtesting-rigor).
//
// Pure and SEEDED: same inputs + seed ⇒ byte-identical output. No DB, no wall-clock,
// no LLM. Statistics run in plain return-ratio space like the existing bootstrap
// (documented boundary in backtest/monteCarlo.ts); money leaves this module only
// through `varLossAmount`, which converts a return fraction to a Prisma.Decimal loss.
//
// These are DESCRIPTIVE risk tools over a supplied historical window — they do not
// admit, promote, or tune any strategy (that path stays governed by QUANT_DESIGN.md
// pre-registration gates).
import { Prisma } from '@prisma/client';
import { mulberry32 } from '../backtest/monteCarlo';

const D = Prisma.Decimal;

/** Versioned study parameters — never hardcoded at call sites. */
export const FRONTIER_PARAMS = {
  version: 'frontier.v1',
  tradingDaysPerYear: 252,
  // Excess-return baseline for the Sharpe numerator. Default 0 keeps the repo's
  // existing Sharpe convention (backtest/metrics.ts) and avoids embedding an
  // interest-rate assumption; callers may pass a study-specific value.
  riskFreeRate: 0,
  portfolios: 10_000,
  varSims: 10_000,
  varConfidence: 0.95,
} as const;

export interface PortfolioPoint {
  weights: number[]; // aligned with FrontierResult.symbols, sums to 1
  expReturn: number; // annualized
  volatility: number; // annualized
  sharpe: number; // (expReturn − riskFreeRate) / volatility
}

export interface FrontierResult {
  symbols: string[];
  /** Max-Sharpe (tangency) portfolio across all evaluated candidates. */
  tangency: PortfolioPoint;
  /** Min-volatility candidate — the frontier's left anchor. */
  minVolatility: PortfolioPoint;
  /** 1/N baseline, always evaluated as candidate #0 (honest comparison anchor). */
  equalWeight: PortfolioPoint;
  portfoliosEvaluated: number;
  riskFreeRate: number;
  seed: number;
}

/** Simple close-to-close daily returns. */
export function dailyReturns(closes: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (!Number.isFinite(closes[i]) || !Number.isFinite(closes[i - 1]) || closes[i - 1] <= 0) {
      throw new Error('dailyReturns requires finite positive closes');
    }
    out.push(closes[i] / closes[i - 1] - 1);
  }
  return out;
}

function meanOf(a: readonly number[]): number {
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
}

/** Sample covariance (n−1 denominator) between two equal-length return series. */
function covariance(a: readonly number[], b: readonly number[], meanA: number, meanB: number): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - meanA) * (b[i] - meanB);
  return a.length > 1 ? sum / (a.length - 1) : 0;
}

/** Rp = wᵀμ·252, σp = √(wᵀΣw·252), SR = (Rp − Rf)/σp over annualized inputs. */
export function evaluatePortfolio(
  weights: readonly number[],
  meanDaily: readonly number[],
  covDaily: readonly (readonly number[])[],
  riskFreeRate: number,
  tradingDays: number,
): PortfolioPoint {
  const expReturn = weights.reduce((s, w, i) => s + w * meanDaily[i], 0) * tradingDays;
  let variance = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      variance += weights[i] * weights[j] * covDaily[i][j];
    }
  }
  const volatility = Math.sqrt(Math.max(0, variance * tradingDays));
  const sharpe = volatility > 0 ? (expReturn - riskFreeRate) / volatility : 0;
  return { weights: [...weights], expReturn, volatility, sharpe };
}

/**
 * Long-only random-weight frontier sampler (Dirichlet(1) via normalized exponentials),
 * seeded and deterministic. The equal-weight portfolio is always candidate #0, so the
 * reported tangency Sharpe is guaranteed ≥ the 1/N baseline by construction.
 */
export function markowitzFrontier(
  returnsBySymbol: Readonly<Record<string, readonly number[]>>,
  opts: {
    seed: number;
    portfolios?: number;
    riskFreeRate?: number;
    tradingDaysPerYear?: number;
  },
): FrontierResult {
  const symbols = Object.keys(returnsBySymbol);
  if (symbols.length < 2) throw new Error('markowitzFrontier requires at least two assets');
  const series = symbols.map((s) => returnsBySymbol[s]);
  const n = series[0].length;
  if (n < 2) throw new Error('markowitzFrontier requires at least two return observations');
  if (series.some((r) => r.length !== n)) throw new Error('return series must be aligned to equal length');
  if (series.some((r) => r.some((v) => !Number.isFinite(v) || v < -1))) {
    throw new Error('returns must be finite and no smaller than -1');
  }

  const tradingDays = opts.tradingDaysPerYear ?? FRONTIER_PARAMS.tradingDaysPerYear;
  const riskFreeRate = opts.riskFreeRate ?? FRONTIER_PARAMS.riskFreeRate;
  const portfolios = Math.max(1000, opts.portfolios ?? FRONTIER_PARAMS.portfolios);

  const meanDaily = series.map(meanOf);
  const covDaily = series.map((a, i) => series.map((b, j) => covariance(a, b, meanDaily[i], meanDaily[j])));

  const equalWeight = evaluatePortfolio(
    symbols.map(() => 1 / symbols.length),
    meanDaily,
    covDaily,
    riskFreeRate,
    tradingDays,
  );

  const rng = mulberry32(opts.seed);
  let tangency = equalWeight;
  let minVolatility = equalWeight;
  for (let p = 1; p < portfolios; p++) {
    const draws = symbols.map(() => -Math.log(1 - rng()));
    const total = draws.reduce((s, v) => s + v, 0);
    const weights = draws.map((v) => v / total);
    const point = evaluatePortfolio(weights, meanDaily, covDaily, riskFreeRate, tradingDays);
    if (point.sharpe > tangency.sharpe) tangency = point;
    if (point.volatility < minVolatility.volatility) minVolatility = point;
  }

  return {
    symbols,
    tangency,
    minVolatility,
    equalWeight,
    portfoliosEvaluated: portfolios,
    riskFreeRate,
    seed: opts.seed,
  };
}

/** Weighted daily return series of a fixed-weight portfolio (for portfolio-level VaR). */
export function portfolioReturnSeries(
  returnsBySymbol: Readonly<Record<string, readonly number[]>>,
  weights: Readonly<Record<string, number>>,
): number[] {
  const symbols = Object.keys(returnsBySymbol);
  const n = symbols.length ? returnsBySymbol[symbols[0]].length : 0;
  if (symbols.some((s) => returnsBySymbol[s].length !== n)) {
    throw new Error('return series must be aligned to equal length');
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(symbols.reduce((s, sym) => s + (weights[sym] ?? 0) * returnsBySymbol[sym][i], 0));
  }
  return out;
}

export interface MonteCarloVarResult {
  /** Positive loss fraction: with `confidence` probability, the 1-day loss ≤ this. */
  varFraction: number;
  muDaily: number;
  sigmaDaily: number;
  sims: number;
  confidence: number;
  seed: number;
}

/**
 * Monte Carlo 1-day VaR (ch. 7): simulate `sims` next-day returns ~ N(μ,σ) fitted on
 * the supplied historical daily returns; VaR = −(percentile at 1−confidence).
 * Seeded Box–Muller over mulberry32 ⇒ deterministic.
 */
export function monteCarloVar1Day(
  returns: readonly number[],
  opts: { seed: number; sims?: number; confidence?: number },
): MonteCarloVarResult {
  if (returns.length < 2) throw new Error('monteCarloVar1Day requires at least two return observations');
  if (returns.some((v) => !Number.isFinite(v) || v < -1)) {
    throw new Error('returns must be finite and no smaller than -1');
  }
  const sims = Math.max(10_000, opts.sims ?? FRONTIER_PARAMS.varSims);
  const confidence = opts.confidence ?? FRONTIER_PARAMS.varConfidence;
  if (confidence <= 0 || confidence >= 1) throw new Error('confidence must be in (0, 1)');

  const muDaily = meanOf(returns);
  const sigmaDaily = Math.sqrt(covariance(returns, returns, muDaily, muDaily));

  const rng = mulberry32(opts.seed);
  const simulated: number[] = [];
  for (let i = 0; i < sims; i++) {
    const u1 = rng();
    const u2 = rng();
    const z = Math.sqrt(-2 * Math.log(1 - u1)) * Math.cos(2 * Math.PI * u2);
    simulated.push(muDaily + sigmaDaily * z);
  }
  simulated.sort((a, b) => a - b);
  const idx = Math.min(simulated.length - 1, Math.max(0, Math.round((1 - confidence) * (simulated.length - 1))));
  return { varFraction: Math.max(0, -simulated[idx]), muDaily, sigmaDaily, sims, confidence, seed: opts.seed };
}

/** Money boundary: VaR loss on a position value, in Prisma.Decimal (never float math). */
export function varLossAmount(positionValue: Prisma.Decimal, varFraction: number): Prisma.Decimal {
  if (!Number.isFinite(varFraction) || varFraction < 0) {
    throw new Error('varFraction must be a finite non-negative fraction');
  }
  return positionValue.mul(new D(varFraction.toFixed(8)));
}
