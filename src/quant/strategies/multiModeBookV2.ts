// multi-mode-book-v2 — pre-registered R4-E6 CANDIDATE. It is multi-mode-book-v1 (commit 455d8ea:
// disjoint C1-screened momentum/MR/dual sleeves, shared-cash engine, FROZEN 20/40/40 allocator
// split) with EXACTLY ONE added axis: a book-level drawdown-responsive exposure governor that
// attacks E1/E3's tail-risk rejection (DRAWDOWN_RISK_FAILURE — MC p95 book DD 46.40% vs the 30%
// gate). Every sleeve param is inherited UNCHANGED from v1 (MULTI_MODE_BOOK_V1); the sleeve
// entry/exit/screen/signal logic is delegated to v1 verbatim so no parent behaviour drifts.
//
// GOVERNOR (a-priori, derived from the GATE ITSELF, never from any viewed equity curve): linear
// exposure scaling 1.0 at ≤10% book drawdown → 0.0 (all cash) at ≥25% book drawdown, computed on
// the book's running peak-to-trough NAV drawdown, applied as a multiplier on NEW position sizes
// only. Existing positions still exit by their sleeve rules and de-risking sells are always allowed.
// This maps exactly onto the engine's pre-existing `drawdownExposureScalar` / StrategyBookPolicy
// `{drawdownStartFraction, drawdownCashFraction}` down-only governor (portfolioEngine.ts) — v2 adds
// no new engine code, only a policy carrying the two frozen thresholds. The frozen 3×3 plateau
// neighborhood {8%,10%,12%} × {20%,25%,30%} probes governor robustness (center {10%,25%}); the
// chosen thresholds are NEVER updated from the sweep.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import type { AnalystSignal } from '../types';
import {
  MULTI_MODE_BOOK_V1,
  MULTI_MODE_UNIVERSE,
  multiModeBookSetup,
} from './multiModeBook';
import type {
  PlateauNeighborhood, StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput,
} from './types';

export { MULTI_MODE_UNIVERSE };

/** Governor thresholds are the ONLY new axis; sleeve weights stay v1-frozen and are not re-declared. */
export const MultiModeBookV2ParamsSchema = z.object({
  version: z.literal('v2'),
  allocatorSeed: z.literal(42),
  validationTrials: z.literal(3),
  /** Full exposure at or below this book drawdown (a-priori 0.10). */
  drawdownStartFraction: z.number().min(0).max(1),
  /** All-cash at or above this book drawdown (a-priori 0.25). */
  drawdownCashFraction: z.number().min(0).max(1),
}).superRefine((params, ctx) => {
  if (!(params.drawdownCashFraction > params.drawdownStartFraction)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'drawdownCashFraction must exceed drawdownStartFraction',
    });
  }
});

export type MultiModeBookV2Params = z.infer<typeof MultiModeBookV2ParamsSchema>;

export const MULTI_MODE_BOOK_V2: MultiModeBookV2Params = Object.freeze({
  version: 'v2',
  allocatorSeed: 42,
  validationTrials: 3,
  drawdownStartFraction: 0.10,
  drawdownCashFraction: 0.25,
});

function paramsOrDefault(params?: MultiModeBookV2Params): MultiModeBookV2Params {
  return MultiModeBookV2ParamsSchema.parse(params ?? MULTI_MODE_BOOK_V2);
}

/** v1's book policy plus the frozen down-only drawdown governor. maxOpen/history are v1-identical. */
export function multiModeBookV2Policy(params?: MultiModeBookV2Params): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxOpenPositions: 12,
    decisionHistoryBars: 295,
    drawdownStartFraction: p.drawdownStartFraction,
    drawdownCashFraction: p.drawdownCashFraction,
  };
}

const GOVERNOR_STARTS = [0.08, 0.10, 0.12] as const;
const GOVERNOR_CASHES = [0.20, 0.25, 0.30] as const;
const asPct = (fraction: number): number => Math.round(fraction * 100);

export const multiModeBookV2Setup: StrategySetup<MultiModeBookV2Params> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'multi-mode-book-v2', version: 'v2', cadence: 'daily', universeCompatibility: 'fixed',
  defaultParams: MULTI_MODE_BOOK_V2,
  prepareUniverse: (input) => multiModeBookSetup.prepareUniverse(input),

  plateauNeighborhood(params): PlateauNeighborhood<MultiModeBookV2Params> {
    const center = paramsOrDefault(params);
    const neighbors = [];
    for (const start of GOVERNOR_STARTS) {
      for (const cash of GOVERNOR_CASHES) {
        if (start === center.drawdownStartFraction && cash === center.drawdownCashFraction) continue;
        neighbors.push({
          label: `start${asPct(start)}|cash${asPct(cash)}`,
          params: { ...center, drawdownStartFraction: start, drawdownCashFraction: cash },
        });
      }
    }
    return { axes: ['drawdownStartFraction', 'drawdownCashFraction'], center, neighbors };
  },

  // Sleeve selection/sizing is inherited from v1 VERBATIM, always with the frozen v1 params —
  // the governor lives entirely in the engine policy, never in these hooks.
  screen(ctx: StrategyPointInTimeContext): StrategyCheck {
    return multiModeBookSetup.screen(ctx, MULTI_MODE_BOOK_V1);
  },
  entry(ctx: StrategyPointInTimeContext): StrategyCheck {
    return multiModeBookSetup.entry(ctx, MULTI_MODE_BOOK_V1);
  },
  exit(ctx: StrategyPointInTimeContext): StrategyCheck {
    return multiModeBookSetup.exit(ctx, MULTI_MODE_BOOK_V1);
  },
  signal(ctx: StrategyPointInTimeContext): AnalystSignal {
    return multiModeBookSetup.signal(ctx, MULTI_MODE_BOOK_V1);
  },
};
