// Rushd Quant — Monte Carlo gate (QDR-6, skill backtesting-rigor / risk-management).
//
// Three SEEDED, deterministic tools over return outcomes (same seed ⇒ byte-identical output):
//   1. IID trade bootstrap or moving-block book-day bootstrap → equity/maxDD/ruin distribution.
//   2. independent sign-flip permutation test; p = P(permuted mean ≥ observed mean).
//   3. fractional-Kelly sizing whose proposal is CLAMPED BY THE ENVELOPE — never bypassed.
//
// Money that reaches the envelope is Prisma.Decimal; the statistical bootstrap works in plain
// return-ratio space (documented boundary). No DB, no wall-clock, no LLM.
import { Prisma } from '@prisma/client';
import { applyEnvelope, type EnvelopeResult, type MarketState, type PortfolioState, type RiskLimits } from '../risk/envelope';

const D = Prisma.Decimal;

/** Versioned default: approximately one trading month of serial dependence per sampled block. */
export const BOOK_DAY_MOVING_BLOCK_LENGTH_V1 = 20;

/** mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Same seed ⇒ same stream. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, Math.round((p / 100) * (sortedAsc.length - 1))));
  return sortedAsc[idx];
}

export interface MonthlyBlockBootstrapResult {
  readonly observationUnit: 'monthly-block';
  readonly resamples: number;
  readonly nBlocks: number;
  readonly blocksPerPath: number;
  readonly observedBlockReturns: number[];
  readonly compoundedReturn: { p5: number; p50: number; p95: number };
}

/**
 * Resample complete contiguous TOM exposure windows. Daily observations are first compounded inside
 * their original window; the bootstrap never draws individual days and therefore preserves each
 * month's within-window dependence structure.
 */
export function bootstrapMonthlyBlocks(
  blocks: readonly (readonly number[])[],
  opts: { readonly seed: number; readonly resamples?: number },
): MonthlyBlockBootstrapResult {
  const resamples = Math.max(1000, opts.resamples ?? 1000);
  if (blocks.some((block) => block.some((dailyReturn) => !Number.isFinite(dailyReturn) || dailyReturn < -1))) {
    throw new Error('Monthly-block returns must be finite and no smaller than -1');
  }
  const observedBlockReturns = blocks
    .filter((block) => block.length > 0)
    .map((block) => block.reduce((wealth, dailyReturn) => wealth * (1 + dailyReturn), 1) - 1);
  const nBlocks = observedBlockReturns.length;
  const empty = {
    observationUnit: 'monthly-block' as const,
    resamples,
    nBlocks,
    blocksPerPath: nBlocks,
    observedBlockReturns,
    compoundedReturn: { p5: 0, p50: 0, p95: 0 },
  };
  if (nBlocks === 0) return empty;

  const rng = mulberry32(opts.seed);
  const outcomes: number[] = [];
  for (let sample = 0; sample < resamples; sample++) {
    let wealth = 1;
    for (let block = 0; block < nBlocks; block++) {
      wealth *= 1 + observedBlockReturns[Math.floor(rng() * nBlocks)];
    }
    outcomes.push(wealth - 1);
  }
  outcomes.sort((a, b) => a - b);
  return {
    ...empty,
    compoundedReturn: {
      p5: percentile(outcomes, 5),
      p50: percentile(outcomes, 50),
      p95: percentile(outcomes, 95),
    },
  };
}

export interface BootstrapResult {
  resamples: number;
  tradesPerPath: number;
  /** Omitted for legacy byte-stable trade bootstrap; shared books persist `book-day`. */
  observationUnit?: 'book-day';
  /** Present on newly generated evidence; optional only so historical cards remain readable. */
  method?: 'iid' | 'moving-block';
  /** Effective contiguous block length; present only for moving-block evidence. */
  blockLength?: number;
  finalEquity: { p5: number; p50: number; p95: number };
  maxDrawdown: { p5: number; p50: number; p95: number };
  riskOfRuin: number; // fraction of paths that touched ≤ ruinFraction × startEquity
}

export interface BootstrapOpts {
  resamples?: number; // ≥ 1000 (QDR-6)
  tradesPerPath?: number; // default = observed trade count
  startEquity?: number;
  ruinFraction?: number; // ruin threshold as a fraction of start equity
  seed: number;
  /** Shared strategy-book validation bootstraps close-to-close NAV days, not position trades. */
  observationUnit?: 'book-day';
  /** Moving-block length for book-day observations; defaults to the versioned 20-day constant. */
  blockLength?: number;
}

function movingBlockIndices(
  observationCount: number,
  sampleLength: number,
  blockLength: number,
  rng: () => number,
): number[] {
  if (observationCount === 0 || sampleLength === 0) return [];
  const effectiveBlockLength = Math.min(blockLength, observationCount);
  const maxStart = observationCount - effectiveBlockLength;
  const indices: number[] = [];
  while (indices.length < sampleLength) {
    const start = Math.floor(rng() * (maxStart + 1));
    for (let offset = 0; offset < effectiveBlockLength && indices.length < sampleLength; offset++) {
      indices.push(start + offset);
    }
  }
  return indices;
}

/** Exposed for deterministic structural tests; each chunk is one contiguous observed run. */
export function movingBlockSampleIndices(
  observationCount: number,
  opts: { readonly seed: number; readonly sampleLength: number; readonly blockLength?: number },
): number[] {
  const blockLength = opts.blockLength ?? BOOK_DAY_MOVING_BLOCK_LENGTH_V1;
  if (!Number.isInteger(observationCount) || observationCount < 0) {
    throw new Error('observationCount must be a non-negative integer');
  }
  if (!Number.isInteger(opts.sampleLength) || opts.sampleLength < 0) {
    throw new Error('sampleLength must be a non-negative integer');
  }
  if (!Number.isInteger(blockLength) || blockLength < 1) {
    throw new Error('blockLength must be a positive integer');
  }
  return movingBlockIndices(observationCount, opts.sampleLength, blockLength, mulberry32(opts.seed));
}

/**
 * Bootstrap the equity-curve distribution. Trades are sampled IID for compatibility; shared-book
 * days use overlapping moving blocks so short-range dependence survives. Each path compounds
 * `tradesPerPath` returns and records terminal equity, max drawdown, and ruin.
 */
export function bootstrapTradeOutcomes(tradeReturns: number[], opts: BootstrapOpts): BootstrapResult {
  const resamples = Math.max(1000, opts.resamples ?? 1000);
  const tradesPerPath = opts.tradesPerPath ?? tradeReturns.length;
  const startEquity = opts.startEquity ?? 100_000;
  const ruinLevel = startEquity * (opts.ruinFraction ?? 0.5);
  const rng = mulberry32(opts.seed);

  if (tradeReturns.some((value) => !Number.isFinite(value) || value < -1)) {
    throw new Error('Bootstrap returns must be finite and no smaller than -1');
  }
  const method = opts.observationUnit === 'book-day' ? 'moving-block' as const : 'iid' as const;
  const requestedBlockLength = opts.blockLength ?? BOOK_DAY_MOVING_BLOCK_LENGTH_V1;
  if (method === 'moving-block' && (!Number.isInteger(requestedBlockLength) || requestedBlockLength < 1)) {
    throw new Error('blockLength must be a positive integer');
  }
  const blockLength = method === 'moving-block' && tradeReturns.length
    ? Math.min(requestedBlockLength, tradeReturns.length)
    : undefined;

  const observationLabel = opts.observationUnit ? { observationUnit: opts.observationUnit } : {};
  const empty: BootstrapResult = {
    resamples, tradesPerPath,
    method,
    finalEquity: { p5: startEquity, p50: startEquity, p95: startEquity },
    maxDrawdown: { p5: 0, p50: 0, p95: 0 },
    riskOfRuin: 0,
    ...observationLabel,
    ...(blockLength ? { blockLength } : {}),
  };
  if (tradeReturns.length === 0 || tradesPerPath === 0) return empty;

  const finals: number[] = [];
  const maxDDs: number[] = [];
  let ruined = 0;

  for (let s = 0; s < resamples; s++) {
    let equity = startEquity;
    let peak = startEquity;
    let maxDD = 0;
    let wasRuined = false;
    const sampledIndices = method === 'moving-block'
      ? movingBlockIndices(tradeReturns.length, tradesPerPath, blockLength!, rng)
      : Array.from({ length: tradesPerPath }, () => Math.floor(rng() * tradeReturns.length));
    for (const sampledIndex of sampledIndices) {
      const r = tradeReturns[sampledIndex];
      equity *= 1 + r;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? (peak - equity) / peak : 0;
      if (dd > maxDD) maxDD = dd;
      if (equity <= ruinLevel) wasRuined = true;
    }
    finals.push(equity);
    maxDDs.push(maxDD);
    if (wasRuined) ruined++;
  }

  finals.sort((a, b) => a - b);
  maxDDs.sort((a, b) => a - b);
  return {
    resamples, tradesPerPath,
    method,
    finalEquity: { p5: percentile(finals, 5), p50: percentile(finals, 50), p95: percentile(finals, 95) },
    maxDrawdown: { p5: percentile(maxDDs, 5), p50: percentile(maxDDs, 50), p95: percentile(maxDDs, 95) },
    riskOfRuin: ruined / resamples,
    ...observationLabel,
    ...(blockLength ? { blockLength } : {}),
  };
}

export interface PermutationResult {
  observedMean: number;
  pValue: number; // P(permuted mean ≥ observed) under independent sign symmetry
  permutations: number;
  /** Optional only so historical cards remain readable. */
  method?: 'independent-sign-flip';
}

/**
 * Seeded independent sign permutation. This tests sign symmetry only; it does not perturb entry
 * timestamps or simulate alternative fills. A high p-value means no demonstrated directional edge.
 */
export function signFlipPermutationTest(
  tradeReturns: number[],
  opts: { permutations?: number; seed: number },
): PermutationResult {
  const permutations = Math.max(1000, opts.permutations ?? 1000);
  const observedMean = tradeReturns.length
    ? tradeReturns.reduce((s, v) => s + v, 0) / tradeReturns.length
    : 0;
  if (tradeReturns.length === 0) {
    return { observedMean: 0, pValue: 1, permutations, method: 'independent-sign-flip' };
  }

  const rng = mulberry32(opts.seed);
  let atLeast = 0;
  for (let p = 0; p < permutations; p++) {
    let sum = 0;
    for (const r of tradeReturns) sum += rng() < 0.5 ? -r : r;
    if (sum / tradeReturns.length >= observedMean) atLeast++;
  }
  return { observedMean, pValue: atLeast / permutations, permutations, method: 'independent-sign-flip' };
}

/**
 * Fractional-Kelly fraction from win-rate and payoff ratio (avg win / avg loss, both > 0).
 * f* = W − (1−W)/R ; we scale by `fraction` (e.g. 0.25 = quarter-Kelly) and floor at 0.
 */
export function fractionalKellyFraction(winRate: number, payoffRatio: number, fraction = 0.25): number {
  if (payoffRatio <= 0) return 0;
  const full = winRate - (1 - winRate) / payoffRatio;
  return Math.max(0, full * fraction);
}

/** Win-rate + payoff ratio estimated from a per-trade return series (empirical inputs to Kelly). */
export function kellyInputsFromTrades(tradeReturns: number[]): { winRate: number; payoffRatio: number } {
  const wins = tradeReturns.filter((r) => r > 0);
  const losses = tradeReturns.filter((r) => r < 0);
  const winRate = tradeReturns.length ? wins.length / tradeReturns.length : 0;
  const avgWin = wins.length ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 0;
  const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : 0;
  return { winRate, payoffRatio };
}

export interface KellySizing {
  kellyFraction: number;
  proposedQty: Prisma.Decimal; // Kelly-implied, BEFORE the envelope
  envelope: EnvelopeResult; // the CLAMPED result — this is what may actually trade
}

/**
 * Fractional-Kelly position sizing, then CLAMPED by the risk envelope. The Kelly fraction sets
 * an aggressive notional (fraction·equity), but the returned decision is whatever the envelope
 * allows after name-weight / vol-target / risk / liquidity / cash caps. Kelly can only ever
 * SHRINK exposure vs the envelope, never expand past it.
 */
export function kellySizedDecision(
  tradeReturns: number[],
  pf: PortfolioState,
  mkt: MarketState,
  limits: RiskLimits,
  fraction = 0.25,
): KellySizing {
  const { winRate, payoffRatio } = kellyInputsFromTrades(tradeReturns);
  const kellyFraction = fractionalKellyFraction(winRate, payoffRatio, fraction);
  const notional = pf.equity.mul(new D(kellyFraction.toFixed(8)));
  const proposedQty = mkt.price.gt(0) ? notional.div(mkt.price) : new D(0);
  const envelope = applyEnvelope({ action: 'BUY', qty: proposedQty }, pf, mkt, limits, false);
  return { kellyFraction, proposedQty, envelope };
}
