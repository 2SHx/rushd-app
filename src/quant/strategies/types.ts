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
   * Open-position provenance, populated by the engine when a position is held (else null).
   * Lets a stateless `exit()` express entry-relative rules (ATR hard stop, max-holding-days)
   * without owning position state. Intraday setups that never need them may ignore both.
   */
  readonly entryPrice?: Prisma.Decimal | null;
  readonly entryTs?: Date | null;
}

export interface StrategyCheck {
  matched: boolean;
  reasons: string[];
  evidence: Evidence[];
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
}

/** Pure, versioned G2 setup contract. Loading, sizing, Sharia veto, and execution stay outside it. */
export interface StrategySetup<Params> {
  readonly id: string;
  readonly version: string;
  /** Bar granularity the setup reasons over — routes the CLI to the intraday vs daily engine path. */
  readonly cadence: 'daily' | 'intraday';
  readonly defaultParams: Params;
  /**
   * Optional cross-name preload, invoked once by the CLI daily path before simulation. Cross-
   * sectional / pairs setups implement it; single-name setups omit it. Pure side effect into the
   * setup's own reference state — never the LLM, DB, or randomness.
   */
  prepareUniverse?(input: UniversePrepareInput): void;
  screen(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  entry(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  exit(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  signal(ctx: StrategyPointInTimeContext, params?: Params): AnalystSignal;
}
