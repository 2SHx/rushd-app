import { Prisma } from '@prisma/client';
import type { Market } from '@prisma/client';
import { IntradayPointInTimeStore } from '../data/pointInTime';
import type { StrategyPointInTimeContext } from './types';

/** The only DB-loading path exposed to strategy setups; every read is bounded by asOf. */
export async function loadStrategyPointInTimeContext(
  store: IntradayPointInTimeStore,
  symbol: string,
  market: Market,
  asOf: Date,
  positionQty = new Prisma.Decimal(0),
): Promise<StrategyPointInTimeContext> {
  const [bars, snapshot] = await Promise.all([
    store.bars(symbol, market, asOf, 24 * 60),
    store.snapshot(symbol, market, asOf),
  ]);
  return { symbol, market, asOf, bars, snapshot, positionQty };
}
