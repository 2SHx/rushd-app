import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getHalalUniverse, type HalalUniverseEntry } from '../data/universe';

const D = Prisma.Decimal;

export interface TargetWeight {
  symbol: string;
  weight: number; // e.g. 0.20 (20%)
  purificationRatio: number;
}

export interface PortfolioProposal {
  asOf: Date;
  weights: TargetWeight[];
  cashWeight: number;
  contributorTrace: Record<string, any>;
}

/**
 * Computes momentum score for a symbol: (Price_t - Price_t-90) / Price_t-90.
 * Point-in-time compliant: uses bars dated on or before asOf.
 */
async function computeMomentumScore(
  symbol: string,
  market: 'TASI' | 'NASDAQ',
  asOf: Date
): Promise<number | null> {
  const bars = await prisma.marketBar.findMany({
    where: {
      symbol,
      market,
      interval: 'DAY',
      ts: { lte: asOf }
    },
    orderBy: { ts: 'desc' },
    take: 90
  });

  if (bars.length < 20) {
    // Insufficient history to calculate momentum
    return null;
  }

  const currentPrice = Number(bars[0].close.toString());
  const oldestPrice = Number(bars[bars.length - 1].close.toString());

  if (oldestPrice <= 0) return null;
  return (currentPrice - oldestPrice) / oldestPrice;
}

/**
 * Constructs an optimized halal portfolio for a given asOf date, using momentum factor ranks
 * and applying risk limits (no leverage, concentration caps).
 */
export async function constructHalalPortfolio(
  market: 'TASI' | 'NASDAQ',
  asOf: Date,
  limits = { maxNameWeight: 0.20, maxPositions: 5 },
  symbolAllowlist?: readonly string[]
): Promise<PortfolioProposal> {
  const universe = await getHalalUniverse(market, symbolAllowlist);
  const scoredCandidates: { entry: HalalUniverseEntry; score: number }[] = [];

  for (const entry of universe) {
    const score = await computeMomentumScore(entry.symbol, market, asOf);
    if (score !== null) {
      scoredCandidates.push({ entry, score });
    }
  }

  // Sort candidates by momentum score in descending order (highest momentum first)
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Select top K positions
  const topPositions = scoredCandidates.slice(0, limits.maxPositions);
  const proposalWeights: TargetWeight[] = [];
  const count = topPositions.length;

  let allocatedWeight = 0;
  const equalWeight = count > 0 ? Math.min(1.0 / count, limits.maxNameWeight) : 0;

  topPositions.forEach(pos => {
    proposalWeights.push({
      symbol: pos.entry.symbol,
      weight: equalWeight,
      purificationRatio: pos.entry.purificationRatio
    });
    allocatedWeight += equalWeight;
  });

  const cashWeight = Math.max(0, 1.0 - allocatedWeight);

  // Compile contributor trace for audit trail
  const trace: Record<string, any> = {};
  scoredCandidates.forEach((pos, rank) => {
    trace[pos.entry.symbol] = {
      score: pos.score,
      rank: rank + 1,
      selected: rank < limits.maxPositions,
      allocatedWeight: rank < limits.maxPositions ? equalWeight : 0
    };
  });

  return {
    asOf,
    weights: proposalWeights,
    cashWeight,
    contributorTrace: trace
  };
}
