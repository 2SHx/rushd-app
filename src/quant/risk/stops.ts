// Rushd Quant — deterministic static + trailing stops (skill: risk-management).
//
// The Ukemi principle: the exit is pre-committed BEFORE the fall, enforced by code,
// never LLM discretion. Evaluated on CLOSED bar closes only — the caller ratchets
// `peakClose` from completed bars, so a forming candle can never move a stop
// (no repainting). Prices are money ⇒ all math is Prisma.Decimal, never float.
// The active stop level feeds `MarketState.stopPrice`, which the risk envelope
// already uses for its per-trade risk-budget clamp (risk/envelope.ts).
import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Versioned policy parameters — never hardcoded at call sites. */
export const STOP_PARAMS = {
  version: 'stops.v1',
  staticStopPct: 0.08, // fixed floor: 8% below entry
  trailingStopPct: 0.1, // recovery lock: 10% below the highest close since entry
} as const;

export type StopReason = 'STATIC_STOP' | 'TRAILING_STOP';

export interface StopEvaluation {
  exit: boolean;
  reason: StopReason | null;
  staticStop: Decimal;
  trailingStop: Decimal;
  /** The binding (higher) stop level — feed this to MarketState.stopPrice. */
  activeStop: Decimal;
}

function assertPct(pct: number, label: string): void {
  if (!Number.isFinite(pct) || pct <= 0 || pct >= 1) {
    throw new Error(`${label} must be a fraction in (0, 1)`);
  }
}

/** Static stop: entry × (1 − stopPct). Fixed at entry, never moves. */
export function staticStopPrice(entryPrice: Decimal, stopPct: number): Decimal {
  assertPct(stopPct, 'stopPct');
  if (entryPrice.lte(0)) throw new Error('entryPrice must be positive');
  return entryPrice.mul(new D(1).minus(new D(stopPct.toString())));
}

/** Trailing stop: peakClose × (1 − trailPct). Only ever rises, because peakClose only ever rises. */
export function trailingStopPrice(peakClose: Decimal, trailPct: number): Decimal {
  assertPct(trailPct, 'trailPct');
  if (peakClose.lte(0)) throw new Error('peakClose must be positive');
  return peakClose.mul(new D(1).minus(new D(trailPct.toString())));
}

/**
 * Evaluate both stops against the last CLOSED bar's close. The binding stop is the
 * higher of the two (the trailing stop can only tighten, never loosen, the static
 * floor). `peakClose` must be maintained by the caller as max(prior peak, close) over
 * closed bars, so it can never fall.
 */
export function evaluateStops(
  position: { entryPrice: Decimal; peakClose: Decimal },
  lastClose: Decimal,
  params: typeof STOP_PARAMS = STOP_PARAMS,
): StopEvaluation {
  if (lastClose.lte(0)) throw new Error('lastClose must be positive');
  if (position.peakClose.lt(position.entryPrice)) {
    throw new Error('peakClose cannot be below entryPrice — ratchet it from closed bars');
  }
  const staticStop = staticStopPrice(position.entryPrice, params.staticStopPct);
  const trailingStop = trailingStopPrice(position.peakClose, params.trailingStopPct);
  const activeStop = D.max(staticStop, trailingStop);
  const exit = lastClose.lte(activeStop);
  const reason: StopReason | null = exit
    ? (trailingStop.gte(staticStop) ? 'TRAILING_STOP' : 'STATIC_STOP')
    : null;
  return { exit, reason, staticStop, trailingStop, activeStop };
}
