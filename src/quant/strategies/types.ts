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
  readonly defaultParams: Params;
  screen(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  entry(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  exit(ctx: StrategyPointInTimeContext, params?: Params): StrategyCheck;
  signal(ctx: StrategyPointInTimeContext, params?: Params): AnalystSignal;
}
