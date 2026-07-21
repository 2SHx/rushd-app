import { Prisma } from '@prisma/client';
import type { IntradayBar, Market, SymbolSnapshot } from '@prisma/client';
import type { AnalystSignal, Evidence } from '../types';

export interface StrategyPointInTimeContext {
  readonly symbol: string;
  readonly market: Market;
  readonly asOf: Date;
  readonly bars: readonly IntradayBar[];
  readonly snapshot: SymbolSnapshot | null;
  readonly positionQty: Prisma.Decimal;
  /**
   * Opaque engine-owned identity for an immutable replay batch. Set only when every context sharing
   * the object is derived from the same frozen market series; ordinary/direct strategy calls omit
   * it and therefore cannot reuse cached decisions.
   */
  readonly replayScope?: object;
  /**
   * Open-position provenance, populated by the engine when a position is held (else null).
   * Lets a stateless `exit()` express entry-relative rules (ATR hard stop, max-holding-days)
   * without owning position state. Intraday setups that never need them may ignore both.
   */
  readonly entryPrice?: Prisma.Decimal | null;
  readonly entryTs?: Date | null;
  /** Decision bar that created the held position; stable across delayed/jittered fills. */
  readonly entrySignalTs?: Date | null;
}

export interface StrategyCheck {
  matched: boolean;
  reasons: string[];
  evidence: Evidence[];
  /**
   * Optional per-name book-weight hint in (0, 1], emitted ONLY by an `entry()` that matches, e.g.
   * a volatility-scaled sizer (position ∝ 1/σ). The daily engine deploys `sizeFraction·cash` and
   * lets the risk envelope CLAMP it further (name/gross/vol-target/ADV/cash) — the hint can only
   * ever SHRINK exposure, never bypass the envelope. Absent (undefined) ⇒ legacy full-cash intent
   * (weight 1), so every pre-existing setup is byte-identical. See engine.simulateSetupDaily.
   */
  sizeFraction?: number;
}

/**
 * Universe-wide reference data handed to a setup ONCE before the per-symbol backtest loop, for
 * setups that must reason across names (e.g. cointegrated pairs need the partner's price series,
 * which the single-symbol engine ctx does not carry). `closesBySymbol` holds REAL daily closes only
 * (MOCK already excluded upstream); the setup is responsible for PIT-filtering to ≤ asOf on read.
 */
export interface UniversePrepareInput {
  readonly symbols: string[];
  readonly closesBySymbol: Map<string, { ts: Date; close: number }[]>;
  /** Engine-owned identity isolating prepared state across concurrent immutable replays. */
  readonly replayScope?: object;
  /** Optional REAL daily OHLCV subset for cross-sectional price-volume factors. */
  readonly dailyBarsBySymbol?: ReadonlyMap<string, readonly {
    ts: Date;
    close: number;
    volume: number;
  }[]>;
  /**
   * REAL daily benchmark series loaded explicitly by the harness. These symbols are reference-only:
   * they are never members of `symbols`, never enter the engine book, and can never receive weight.
   * A setup must still PIT-slice the series to `<= asOf` when computing a decision.
   */
  readonly benchmarkDailyBarsBySymbol?: ReadonlyMap<string, readonly {
    ts: Date;
    close: number;
    volume: number;
  }[]>;
  /** Optional compact PIT aggregates for setups whose screen depends on same-day cross-section. */
  readonly stocksInPlayBook?: ReadonlyMap<string, readonly {
    date: string;
    openingOpen: number;
    openingHigh: number;
    openingLow: number;
    openingClose: number;
    openingVolume: number;
    dailyHigh: number | null;
    dailyLow: number | null;
    dailyClose: number | null;
    dailyVolume: number | null;
  }[]>;
}

/**
 * One off-center parameter variant in a profit-plateau neighborhood (§6). `label` names the single
 * perturbed axis + step (e.g. `entryStdev+0.25`); `params` is a full, valid parameter set differing
 * from the center by exactly that step. Robustness probe only — never a candidate to REPLACE center.
 */
export interface PlateauVariant<Params> {
  readonly label: string;
  readonly params: Params;
}

/**
 * A-priori robustness neighborhood declared by a setup for the QDR-6 profit-plateau gate. `center`
 * MUST equal the setup's chosen (default) params — the sweep is a ROBUSTNESS PROOF, not an
 * optimization, so the chosen params are NEVER updated from any neighbor's result. `axes` are the
 * 1–2 MOST sensitive params being perturbed; `neighbors` are small fixed ± steps on those axes. The
 * gate passes iff OOS expectancy stays same-sign and within a documented degradation bound across
 * ALL neighbors (see backtest/profitPlateau.ts).
 */
export interface PlateauNeighborhood<Params> {
  readonly axes: readonly string[];
  readonly center: Params;
  readonly neighbors: readonly PlateauVariant<Params>[];
}

/**
 * Declares how the CLI `--universe halal|wide|custom` override may replace a setup's symbol list:
 *   'halal-only'   — the edge is defined only on the NASDAQ halal core; the CLI ACCEPTS `halal` and
 *                    fully-halal custom baskets but REJECTS `wide` and any custom basket containing
 *                    unscreened names.
 *   'any-equities' — mechanically runs on any equities; `wide` and unscreened custom baskets are
 *                    allowed but flagged Sharia UNSCREENED_EXECUTION_BLOCKED downstream (never halal).
 *   'fixed'        — the setup owns a fixed research book (e.g. dual-momentum's seven assets,
 *                    tom-overlay's SPUS); ANY `--universe`/`--symbols` override is rejected with a
 *                    clear error, so it can never silently degrade to whichever names have DB rows.
 * Absent ⇒ the CLI applies a conservative fallback (fixed-book / intraday micro-cap setups → 'fixed',
 * every other daily setup → 'halal-only').
 */
export type UniverseCompatibility = 'halal-only' | 'any-equities' | 'fixed';

/** Pure, versioned G2 setup contract. Loading, sizing, Sharia veto, and execution stay outside it. */
export interface StrategySetup<Params> {
  readonly id: string;
  readonly version: string;
  /** Bar granularity the setup reasons over — routes the CLI to the intraday vs daily engine path. */
  readonly cadence: 'daily' | 'intraday';
  /** Declared universe-override policy for the CLI `--universe` flag (see UniverseCompatibility). */
  readonly universeCompatibility?: UniverseCompatibility;
  readonly defaultParams: Params;
  /** Explicit non-tradable daily reference series the harness must load or fail closed. */
  readonly benchmarkSymbols?: readonly string[];
  /**
   * Optional cross-name preload, invoked once by the CLI daily path before simulation. Cross-
   * sectional / pairs setups implement it; single-name setups omit it. Pure side effect into the
   * setup's own reference state — never the LLM, DB, or randomness.
   */
  prepareUniverse?(input: UniversePrepareInput): void;
  /**
   * Optional memory-bound hook for wide cross-sectional books: after prepareUniverse, returns the
   * union of symbols this setup could EVER select across every provided param set (center + plateau
   * neighbors). Names outside the union always carry target weight 0 and never trade, so the shared
   * engine can be fed only the union's full bar series — identical fills/NAV at a fraction of the
   * heap (an 8GB machine cannot hold 2,767 × 8.5y of Decimal bar series).
   */
  tradableBookSymbols?(replayScope: object | undefined, paramSets: readonly unknown[]): string[];
  /**
   * Optional a-priori robustness neighborhood for the QDR-6 profit-plateau gate. A setup that
   * declares its 1–2 most sensitive params here becomes plateau-EVALUABLE; setups that omit it stay
   * plateau-unproven (⇒ the gate defaults to NOT proven, honestly). The returned `center` MUST equal
   * the params the headline run used; the harness only READS the neighbors' OOS expectancy and never
   * feeds a neighbor back as the chosen params.
   */
  plateauNeighborhood?(params?: Params): PlateauNeighborhood<Params>;
  /**
   * Optional shared-book target weight. `null` means hold the current weight; a finite value in
   * [0,1] schedules a next-open rebalance through the unchanged risk/ADV/cash envelope. The book
   * executes reductions before additions in canonical symbol order. Legacy setups omit this hook.
   */
  targetWeight?(ctx: StrategyPointInTimeContext, params?: Params): number | null;
  screen(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  entry(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  exit(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  signal(ctx: StrategyPointInTimeContext, params?: Params): AnalystSignal;
}
