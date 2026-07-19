// multi-mode-book-v3 — pre-registered R4-E8 CANDIDATE. It is multi-mode-book-v2 (commit a38ed59:
// v1's disjoint C1-screened momentum/MR/dual sleeves + FROZEN 20/40/40 allocator + the a-priori
// book-level 10%→25% drawdown-responsive exposure governor) with EVERY sleeve, allocator, and
// governor parameter inherited UNCHANGED and ZERO new tunable parameters. The single structural
// substitution: whenever the book holds IDLE capital — allocator residual cash, absolute-filter
// cash states, or governor-de-risked capital — that capital parks in the SPSK sukuk ETF instead of
// sitting flat in cash (fill next open, same 15 bps/side cost, same envelope/ADV caps). SPSK is
// SOLD FIRST to fund equity entries (equity exits always run first); before SPSK's first real bar
// (2019-12-31) idle capital fail-closes to cash — the honest pre-inception regime.
//
// This attacks BOTH of v2's binding rejection codes BY CONSTRUCTION: (1) DSR — sukuk carry is meant
// to replace the return the governor throws away by sitting in cash; (2) DRAWDOWN — sukuk's low
// equity correlation is meant to cut book-level tail drawdown. The substitution is a FIXED constant
// (the ballast symbol), NOT a fitted parameter: there is nothing here to tune, and the frozen 3×3
// governor plateau {8,10,12}×{20,25,30} is inherited from v2 verbatim.
//
// SHARIA (i18n-fintech instrument ruling, R4-E8): SPSK is admissible as an idle-capital ballast for
// PAPER-TRADING RESEARCH ONLY (conditional), Tier-1 fund-level treatment, reasonCode
// FUND_LEVEL_PURIFICATION_ONLY. It is index-provider Sharia-screened (Dow Jones Sukuk methodology,
// AAOIFI-aligned Gulf reading) — NEVER an unqualified "AAOIFI-compliant" claim. The 16 equity sleeve
// names keep their C1 Tier-2 verification; SPSK carries the separate ballast disclosure on the card.
//
// DATA CAVEAT (recorded, not hidden): the daily MarketBar spine stores RAW (unadjusted) YAHOO closes
// — SPSK's coupon/distribution carry is NOT in the price series (raw close fell 20.10→17.92 over the
// window). The very carry that motivates the substitution is therefore under-measured here; the FULL
// run reports the honest price-only economics and this limitation is a first-class part of the card.
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import type { AnalystSignal } from '../types';
import { MULTI_MODE_BOOK_V1, MULTI_MODE_UNIVERSE, multiModeBookSetup } from './multiModeBook';
import {
  MULTI_MODE_BOOK_V2, MultiModeBookV2ParamsSchema, multiModeBookV2Setup,
  type MultiModeBookV2Params,
} from './multiModeBookV2';
import type {
  PlateauNeighborhood, StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput,
} from './types';

export { MULTI_MODE_UNIVERSE };

/** The single structural substitution: idle capital parks in this sukuk ETF, not flat cash. Its
 * bars are in the book; the setup never trades it; the engine sweeps/liquidates it (idleBallastSymbol
 * policy). A FIXED constant, not a tunable parameter. */
export const MULTI_MODE_BALLAST_SYMBOL = 'SPSK' as const;

/** v3 reuses v2's schema EXACTLY (version bumped): zero new tunable parameters. */
export const MultiModeBookV3ParamsSchema = MultiModeBookV2ParamsSchema;
export type MultiModeBookV3Params = MultiModeBookV2Params;

/** v3 params ARE v2's a-priori params, unchanged. The ballast is structural, carried by the policy. */
export const MULTI_MODE_BOOK_V3: MultiModeBookV3Params = Object.freeze({ ...MULTI_MODE_BOOK_V2 });

function paramsOrDefault(params?: MultiModeBookV3Params): MultiModeBookV3Params {
  return MultiModeBookV3ParamsSchema.parse(params ?? MULTI_MODE_BOOK_V3);
}

/** v2's book policy (maxOpen/history + frozen 10%→25% governor) PLUS the SPSK idle-ballast sweep. */
export function multiModeBookV3Policy(params?: MultiModeBookV3Params): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxOpenPositions: 12,
    decisionHistoryBars: 295,
    drawdownStartFraction: p.drawdownStartFraction,
    drawdownCashFraction: p.drawdownCashFraction,
    idleBallastSymbol: MULTI_MODE_BALLAST_SYMBOL,
  };
}

export const multiModeBookV3Setup: StrategySetup<MultiModeBookV3Params> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'multi-mode-book-v3', version: 'v3', cadence: 'daily', universeCompatibility: 'fixed',
  defaultParams: MULTI_MODE_BOOK_V3,
  // The setup's tradable universe is v1's exact 16-name disjoint C1 charter, UNCHANGED. SPSK is not
  // a setup-traded name; the engine injects and manages it purely as the idle-capital ballast.
  prepareUniverse: (input) => multiModeBookSetup.prepareUniverse(input),

  // The frozen 3×3 governor plateau is inherited from v2 VERBATIM (same {8,10,12}×{20,25,30} grid).
  plateauNeighborhood(params): PlateauNeighborhood<MultiModeBookV3Params> {
    return multiModeBookV2Setup.plateauNeighborhood!(params);
  },

  // Sleeve selection/sizing/exit/signal are inherited from v1 VERBATIM (via v2), always with the
  // frozen v1 params — the governor and the ballast both live entirely in the engine policy.
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
