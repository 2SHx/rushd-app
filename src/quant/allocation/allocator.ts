// QDR-7 deterministic paper-tournament allocator. Pure and DB-free: persistence and cron wiring
// remain fenced to R3-6, after an ACCEPTED mode exists.
import { Prisma } from '@prisma/client';
import { mulberry32 } from '@/quant/backtest/monteCarlo';
import type { ShariaValidationState, TerminalValidationStatus } from '@/quant/backtest/reportCard';

const D = Prisma.Decimal;
const ZERO = new D(0);
const ONE = new D(1);

export const ALLOCATOR_PRIOR_WEIGHT_DAYS = 63;
export const MAX_MODE_WEIGHT = new D('0.40');
export const DRAWDOWN_PENALTY = new D(1);

export type AllocationDisposition =
  | 'ALLOCATED'
  | 'BENCH'
  | 'REQUIRE_REVALIDATION'
  | 'DISQUALIFY'
  | 'INELIGIBLE';

export type AllocationReason =
  | 'ELIGIBLE'
  | 'REJECTED'
  | 'MISSING_EVIDENCE_CARD'
  | 'SHARIA_NOT_VERIFIED'
  | 'IMPLAUSIBLE_RESULT'
  | 'DRAWDOWN_BREAKER_BREACH'
  | 'TRACKING_ERROR_BREACH'
  | 'NON_POSITIVE_SCORE';

export interface AllocatorModeInput {
  modeId: string;
  validationStatus: TerminalValidationStatus;
  /** QDR-8: explicit per-version authorization admits a REJECTED near-miss to INCUBATION only. */
  incubationAuthorized?: boolean;
  evidenceCardComplete: boolean;
  shariaState: ShariaValidationState;
  implausible: boolean;
  validation: {
    deflatedSharpe: number;
    maxDrawdown: number;
  } | null;
  live: {
    days: number;
    deflatedSharpe: number;
    maxDrawdown: number;
    currentDrawdown: number;
    drawdownBreaker: number;
    trackingError: number;
    trackingErrorLimit: number;
  };
}

export interface AllocatorInput {
  seed: number;
  modes: AllocatorModeInput[];
  priorWeightDays?: number;
}

interface EvaluatedMode {
  modeId: string;
  disposition: AllocationDisposition;
  reason: AllocationReason;
  priorWeight: Prisma.Decimal;
  blendedDeflatedSharpe: Prisma.Decimal;
  blendedMaxDrawdown: Prisma.Decimal;
  score: Prisma.Decimal;
}

export interface AllocatorModeResult {
  modeId: string;
  disposition: AllocationDisposition;
  reason: AllocationReason;
  priorWeight: string;
  blendedDeflatedSharpe: string;
  blendedMaxDrawdown: string;
  score: string;
  allocation: string;
}

export interface AllocationResult {
  seed: number;
  priorWeightDays: number;
  maxModeWeight: string;
  allocations: Record<string, string>;
  cashAllocation: string;
  rankedModeIds: string[];
  modes: AllocatorModeResult[];
  reason: 'ALLOCATED' | 'NO_ALLOCATABLE_MODES';
}

function decimalString(value: Prisma.Decimal): string {
  return value.isZero() ? '0' : value.toString();
}

function assertFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

function assertRatio(name: string, value: number): void {
  assertFinite(name, value);
  if (value < 0 || value > 1) throw new Error(`${name} must be between 0 and 1`);
}

function validateInput(input: AllocatorInput, priorWeightDays: number): void {
  if (!Number.isSafeInteger(input.seed)) throw new Error('seed must be a safe integer');
  if (!Number.isSafeInteger(priorWeightDays) || priorWeightDays <= 0) {
    throw new Error('priorWeightDays must be a positive integer');
  }
  const ids = new Set<string>();
  for (const mode of input.modes) {
    if (!mode.modeId.trim()) throw new Error('modeId must be non-empty');
    if (ids.has(mode.modeId)) throw new Error(`duplicate modeId: ${mode.modeId}`);
    ids.add(mode.modeId);
    if (!Number.isSafeInteger(mode.live.days) || mode.live.days < 0) {
      throw new Error(`${mode.modeId}.live.days must be a non-negative integer`);
    }
    if (mode.validation) {
      assertRatio(`${mode.modeId}.validation.deflatedSharpe`, mode.validation.deflatedSharpe);
      assertRatio(`${mode.modeId}.validation.maxDrawdown`, mode.validation.maxDrawdown);
    }
    assertRatio(`${mode.modeId}.live.deflatedSharpe`, mode.live.deflatedSharpe);
    assertRatio(`${mode.modeId}.live.maxDrawdown`, mode.live.maxDrawdown);
    assertRatio(`${mode.modeId}.live.currentDrawdown`, mode.live.currentDrawdown);
    assertRatio(`${mode.modeId}.live.drawdownBreaker`, mode.live.drawdownBreaker);
    assertFinite(`${mode.modeId}.live.trackingError`, mode.live.trackingError);
    assertFinite(`${mode.modeId}.live.trackingErrorLimit`, mode.live.trackingErrorLimit);
    if (mode.live.trackingError < 0 || mode.live.trackingErrorLimit < 0) {
      throw new Error(`${mode.modeId} tracking error values must be non-negative`);
    }
  }
}

function excluded(
  modeId: string,
  disposition: AllocationDisposition,
  reason: AllocationReason,
): EvaluatedMode {
  return {
    modeId,
    disposition,
    reason,
    priorWeight: ONE,
    blendedDeflatedSharpe: ZERO,
    blendedMaxDrawdown: ZERO,
    score: ZERO,
  };
}

function evaluateMode(mode: AllocatorModeInput, priorWeightDays: number): EvaluatedMode {
  if (mode.validationStatus !== 'ACCEPTED' && !mode.incubationAuthorized) {
    return excluded(mode.modeId, 'INELIGIBLE', 'REJECTED');
  }
  if (!mode.evidenceCardComplete || !mode.validation) {
    return excluded(mode.modeId, 'INELIGIBLE', 'MISSING_EVIDENCE_CARD');
  }
  if (mode.shariaState !== 'VERIFIED_COMPLIANT') {
    return excluded(mode.modeId, 'INELIGIBLE', 'SHARIA_NOT_VERIFIED');
  }
  if (mode.implausible) return excluded(mode.modeId, 'DISQUALIFY', 'IMPLAUSIBLE_RESULT');
  if (mode.live.currentDrawdown >= mode.live.drawdownBreaker) {
    return excluded(mode.modeId, 'BENCH', 'DRAWDOWN_BREAKER_BREACH');
  }
  if (mode.live.trackingError > mode.live.trackingErrorLimit) {
    return excluded(mode.modeId, 'REQUIRE_REVALIDATION', 'TRACKING_ERROR_BREACH');
  }

  const priorDays = new D(priorWeightDays);
  const liveDays = new D(mode.live.days);
  const priorWeight = priorDays.div(priorDays.add(liveDays));
  const liveWeight = ONE.sub(priorWeight);
  const blendedDeflatedSharpe = priorWeight.mul(mode.validation.deflatedSharpe)
    .add(liveWeight.mul(mode.live.deflatedSharpe));
  const blendedMaxDrawdown = priorWeight.mul(mode.validation.maxDrawdown)
    .add(liveWeight.mul(mode.live.maxDrawdown));
  const penalized = blendedDeflatedSharpe.sub(DRAWDOWN_PENALTY.mul(blendedMaxDrawdown));
  const score = penalized.gt(ZERO) ? penalized : ZERO;
  return {
    modeId: mode.modeId,
    disposition: score.gt(ZERO) ? 'ALLOCATED' : 'BENCH',
    reason: score.gt(ZERO) ? 'ELIGIBLE' : 'NON_POSITIVE_SCORE',
    priorWeight,
    blendedDeflatedSharpe,
    blendedMaxDrawdown,
    score,
  };
}

function allocateWithCap(ranked: readonly EvaluatedMode[]): Map<string, Prisma.Decimal> {
  const weights = new Map(ranked.map(mode => [mode.modeId, ZERO]));
  let remaining = ONE;
  let pool = ranked.filter(mode => mode.score.gt(ZERO));

  while (pool.length > 0 && remaining.gt(ZERO)) {
    const totalScore = pool.reduce((sum, mode) => sum.add(mode.score), ZERO);
    if (!totalScore.gt(ZERO)) break;
    const overCap = pool.filter(mode => remaining.mul(mode.score).div(totalScore).gt(MAX_MODE_WEIGHT));
    if (overCap.length === 0) {
      for (const mode of pool) weights.set(mode.modeId, remaining.mul(mode.score).div(totalScore));
      remaining = ZERO;
      break;
    }
    for (const mode of overCap) weights.set(mode.modeId, MAX_MODE_WEIGHT);
    remaining = remaining.sub(MAX_MODE_WEIGHT.mul(overCap.length));
    pool = pool.filter(mode => !overCap.includes(mode));
  }
  return weights;
}

/**
 * Allocate one unit of paper-tournament capital. Seed affects exact-score ranking ties only;
 * scores and continuous weights contain no randomness and no wall-clock state.
 */
export function allocateTournamentCapital(input: AllocatorInput): AllocationResult {
  const priorWeightDays = input.priorWeightDays ?? ALLOCATOR_PRIOR_WEIGHT_DAYS;
  validateInput(input, priorWeightDays);
  const evaluated = input.modes.map(mode => evaluateMode(mode, priorWeightDays));
  const tieRng = mulberry32(input.seed);
  const tieKeys = new Map(
    [...evaluated].sort((a, b) => a.modeId.localeCompare(b.modeId)).map(mode => [mode.modeId, tieRng()]),
  );
  const ranked = [...evaluated].sort((a, b) => {
    const scoreOrder = b.score.comparedTo(a.score);
    if (scoreOrder !== 0) return scoreOrder;
    const tieOrder = tieKeys.get(a.modeId)! - tieKeys.get(b.modeId)!;
    return tieOrder || a.modeId.localeCompare(b.modeId);
  });
  const weights = allocateWithCap(ranked);
  const allocated = Array.from(weights.values()).reduce((sum, weight) => sum.add(weight), ZERO);
  const cashAllocation = ONE.sub(allocated);
  const allocations = Object.fromEntries(
    [...evaluated]
      .sort((a, b) => a.modeId.localeCompare(b.modeId))
      .map(mode => [mode.modeId, decimalString(weights.get(mode.modeId) ?? ZERO)]),
  );
  const modes = [...evaluated]
    .sort((a, b) => a.modeId.localeCompare(b.modeId))
    .map(mode => ({
      modeId: mode.modeId,
      disposition: mode.disposition,
      reason: mode.reason,
      priorWeight: decimalString(mode.priorWeight),
      blendedDeflatedSharpe: decimalString(mode.blendedDeflatedSharpe),
      blendedMaxDrawdown: decimalString(mode.blendedMaxDrawdown),
      score: decimalString(mode.score),
      allocation: allocations[mode.modeId],
    }));

  return {
    seed: input.seed,
    priorWeightDays,
    maxModeWeight: decimalString(MAX_MODE_WEIGHT),
    allocations,
    cashAllocation: decimalString(cashAllocation),
    rankedModeIds: ranked.filter(mode => mode.score.gt(ZERO)).map(mode => mode.modeId),
    modes,
    reason: allocated.gt(ZERO) ? 'ALLOCATED' : 'NO_ALLOCATABLE_MODES',
  };
}
