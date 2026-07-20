// Rushd Quant — hybrid rebalance trigger (skill: risk-management).
//
// Pure decision function the rebalancer/cron consults BEFORE executing a pass:
// rebalance when EITHER the calendar interval has elapsed (quarterly time trigger)
// OR any name's weight has drifted past the threshold (drift trigger). Weights are
// dimensionless fractions (not money), so Number is the documented boundary here;
// the executing rebalancer keeps all money math in Prisma.Decimal.
// No wall-clock: `asOf` is supplied by the caller (point-in-time, backtest-safe).

/** Versioned policy parameters — never hardcoded at call sites. */
export const REBALANCE_TRIGGER_PARAMS = {
  version: 'rebalance-trigger.v1',
  maxCalendarDays: 91, // quarterly time-based trigger
  driftThreshold: 0.05, // 5 percentage-point absolute weight drift per name
} as const;

export type RebalanceReason = 'TIME' | 'DRIFT';

export interface RebalanceCheck {
  rebalance: boolean;
  reasons: RebalanceReason[];
  /** Largest absolute per-name drift |current − target| observed (fraction). */
  maxDrift: number;
  /** Symbol carrying maxDrift, or null when both books are empty. */
  maxDriftSymbol: string | null;
  daysSinceLast: number | null; // null ⇒ never rebalanced
}

const DAY_MS = 86_400_000;

function assertWeights(weights: Readonly<Record<string, number>>, label: string): void {
  for (const [symbol, w] of Object.entries(weights)) {
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(`${label} weight for ${symbol} must be a finite non-negative fraction`);
    }
  }
}

/**
 * Hybrid trigger: TIME when `asOf − lastRebalanceAt ≥ maxCalendarDays` (or the book has
 * never been rebalanced), DRIFT when any symbol in the union of current/target books
 * drifts ≥ `driftThreshold` in absolute weight. Both reasons can fire together.
 */
export function shouldRebalance(
  args: {
    asOf: Date;
    lastRebalanceAt: Date | null;
    currentWeights: Readonly<Record<string, number>>;
    targetWeights: Readonly<Record<string, number>>;
  },
  params: typeof REBALANCE_TRIGGER_PARAMS = REBALANCE_TRIGGER_PARAMS,
): RebalanceCheck {
  assertWeights(args.currentWeights, 'current');
  assertWeights(args.targetWeights, 'target');

  const reasons: RebalanceReason[] = [];
  const daysSinceLast = args.lastRebalanceAt
    ? (args.asOf.getTime() - args.lastRebalanceAt.getTime()) / DAY_MS
    : null;
  if (daysSinceLast === null || daysSinceLast >= params.maxCalendarDays) reasons.push('TIME');

  let maxDrift = 0;
  let maxDriftSymbol: string | null = null;
  const symbols = new Set([...Object.keys(args.currentWeights), ...Object.keys(args.targetWeights)]);
  for (const symbol of Array.from(symbols)) {
    const drift = Math.abs((args.currentWeights[symbol] ?? 0) - (args.targetWeights[symbol] ?? 0));
    if (drift > maxDrift) {
      maxDrift = drift;
      maxDriftSymbol = symbol;
    }
  }
  if (maxDrift >= params.driftThreshold) reasons.push('DRIFT');

  return { rebalance: reasons.length > 0, reasons, maxDrift, maxDriftSymbol, daysSinceLast };
}
