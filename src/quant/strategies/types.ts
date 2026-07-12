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

/** Pure, versioned G2 setup contract. Loading, sizing, Sharia veto, and execution stay outside it. */
export interface StrategySetup<Params> {
  readonly id: string;
  readonly version: string;
  /** Bar granularity the setup reasons over — routes the CLI to the intraday vs daily engine path. */
  readonly cadence: 'daily' | 'intraday';
  readonly defaultParams: Params;
  screen(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  entry(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  exit(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  signal(ctx: StrategyPointInTimeContext, params?: Params): AnalystSignal;
}
