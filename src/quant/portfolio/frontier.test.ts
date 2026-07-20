import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import {
  FRONTIER_PARAMS,
  dailyReturns,
  evaluatePortfolio,
  markowitzFrontier,
  portfolioReturnSeries,
  monteCarloVar1Day,
  varLossAmount,
} from './frontier';

type FixtureBar = [string, number, number, number, number, number];
interface LearningFixture {
  strategyUniverse: string[];
  series: { symbol: string; bars: FixtureBar[] }[];
}

/** Aligned daily returns for the fixture's halal strategy universe (date-intersected). */
function fixtureReturns(): Record<string, number[]> {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'src/quant/learning/fixtures/dual-momentum-rotation.learning-replay-v1.json'),
      'utf8',
    ),
  ) as LearningFixture;

  const closesBysymbol = new Map<string, Map<string, number>>();
  for (const s of fixture.series) {
    if (!fixture.strategyUniverse.includes(s.symbol)) continue;
    closesBysymbol.set(s.symbol, new Map(s.bars.map((b) => [b[0], b[4]])));
  }
  const symbols = Array.from(closesBysymbol.keys());
  const shared = Array.from(closesBysymbol.get(symbols[0])!.keys())
    .filter((ts) => symbols.every((sym) => closesBysymbol.get(sym)!.has(ts)))
    .sort();
  const out: Record<string, number[]> = {};
  for (const sym of symbols) {
    out[sym] = dailyReturns(shared.map((ts) => closesBysymbol.get(sym)!.get(ts)!));
  }
  return out;
}

describe('markowitzFrontier', () => {
  const returns = fixtureReturns();

  it('tangency Sharpe is ≥ the equal-weight (1/N buy-and-hold) baseline by construction', () => {
    const frontier = markowitzFrontier(returns, { seed: 42 });
    expect(frontier.portfoliosEvaluated).toBe(FRONTIER_PARAMS.portfolios);
    expect(frontier.tangency.sharpe).toBeGreaterThanOrEqual(frontier.equalWeight.sharpe);
    expect(frontier.minVolatility.volatility).toBeLessThanOrEqual(frontier.equalWeight.volatility);
    // Long-only weights on the simplex.
    for (const point of [frontier.tangency, frontier.minVolatility, frontier.equalWeight]) {
      expect(point.weights.reduce((s, w) => s + w, 0)).toBeCloseTo(1, 8);
      expect(point.weights.every((w) => w >= 0)).toBe(true);
    }
  });

  it('is deterministic — same seed yields byte-identical results, different seed may differ', () => {
    const a = markowitzFrontier(returns, { seed: 42 });
    const b = markowitzFrontier(returns, { seed: 42 });
    expect(a).toEqual(b);
  });

  it('honors the risk-free rate in the Sharpe numerator', () => {
    const symbols = Object.keys(returns);
    const equal = symbols.map(() => 1 / symbols.length);
    const zero = markowitzFrontier(returns, { seed: 7, portfolios: 1000, riskFreeRate: 0 });
    const positive = markowitzFrontier(returns, { seed: 7, portfolios: 1000, riskFreeRate: 0.04 });
    expect(positive.equalWeight.sharpe).toBeLessThan(zero.equalWeight.sharpe);
    // evaluatePortfolio agrees with the frontier's own equal-weight point.
    expect(zero.equalWeight.weights).toEqual(equal);
  });

  it('rejects misaligned or degenerate inputs', () => {
    expect(() => markowitzFrontier({ A: [0.01, 0.02] }, { seed: 1 })).toThrow(/at least two assets/);
    expect(() => markowitzFrontier({ A: [0.01, 0.02], B: [0.01] }, { seed: 1 })).toThrow(/aligned/);
    expect(() => markowitzFrontier({ A: [0.01, NaN], B: [0.01, 0.02] }, { seed: 1 })).toThrow(/finite/);
    expect(() => dailyReturns([100, 0, 50])).toThrow(/positive/);
  });

  it('evaluatePortfolio matches the hand formula on a 2-asset case', () => {
    // Two assets, zero covariance: Rp = w·μ·252, σp = √(w²σ²·252).
    const meanDaily = [0.001, 0.002];
    const covDaily = [
      [0.0001, 0],
      [0, 0.0004],
    ];
    const p = evaluatePortfolio([0.5, 0.5], meanDaily, covDaily, 0, 252);
    expect(p.expReturn).toBeCloseTo(0.0015 * 252, 12);
    expect(p.volatility).toBeCloseTo(Math.sqrt((0.25 * 0.0001 + 0.25 * 0.0004) * 252), 12);
    expect(p.sharpe).toBeCloseTo(p.expReturn / p.volatility, 12);
  });
});

describe('monteCarloVar1Day', () => {
  const returns = fixtureReturns();

  it('computes a sane, deterministic 95% 1-day portfolio VaR with ≥10,000 sims', () => {
    const frontier = markowitzFrontier(returns, { seed: 42 });
    const weights = Object.fromEntries(frontier.symbols.map((s, i) => [s, frontier.tangency.weights[i]]));
    const series = portfolioReturnSeries(returns, weights);
    const a = monteCarloVar1Day(series, { seed: 42 });
    const b = monteCarloVar1Day(series, { seed: 42 });
    expect(a).toEqual(b);
    expect(a.sims).toBeGreaterThanOrEqual(10_000);
    expect(a.confidence).toBe(0.95);
    expect(a.varFraction).toBeGreaterThan(0);
    expect(a.varFraction).toBeLessThan(0.2); // a daily equity-book VaR far above 20% would be nonsense
    // VaR at 95% ≈ σ·1.645 − μ for normal simulation; allow generous tolerance.
    const parametric = 1.645 * a.sigmaDaily - a.muDaily;
    expect(a.varFraction).toBeGreaterThan(parametric * 0.8);
    expect(a.varFraction).toBeLessThan(parametric * 1.2);
  });

  it('converts the VaR fraction to a Decimal money loss at the boundary', () => {
    const loss = varLossAmount(new Prisma.Decimal(100_000), 0.0234);
    expect(loss.toString()).toBe('2340');
    expect(() => varLossAmount(new Prisma.Decimal(1), -0.1)).toThrow(/non-negative/);
  });

  it('rejects degenerate inputs', () => {
    expect(() => monteCarloVar1Day([0.01], { seed: 1 })).toThrow(/at least two/);
    expect(() => monteCarloVar1Day([0.01, NaN], { seed: 1 })).toThrow(/finite/);
    expect(() => monteCarloVar1Day([0.01, 0.02], { seed: 1, confidence: 1 })).toThrow(/confidence/);
  });
});
