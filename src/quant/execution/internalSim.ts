// Rushd Quant — InternalSimBroker (QUANT_DESIGN.md §5).
// Deterministic paper fills for TASI and all keyless/mock mode. Fills at the reference
// price adjusted by a fixed slippage (adverse to the taker) plus a commission modeled as
// a price adjustment; qty fills in full. User-paper positions/cash live in the DB; QDR-8
// incubation books stay in their isolated deterministic engine ledgers. getPositions/getCash
// therefore return empty. Pure and deterministic so the backtester replays it identically.
import { Prisma } from '@prisma/client';
import type { BrokerAdapter, OrderRequest, OrderResult, Position } from './broker';

const D = Prisma.Decimal;
const SLIPPAGE_BPS = new D(5); // 0.05% adverse
const COMMISSION_BPS = new D(10); // 0.10%
const BPS = new D(10_000);

export class InternalSimBroker implements BrokerAdapter {
  readonly kind = 'INTERNAL_SIM' as const;

  async submitOrder(o: OrderRequest): Promise<OrderResult> {
    const slip = o.refPrice.mul(SLIPPAGE_BPS).div(BPS);
    const comm = o.refPrice.mul(COMMISSION_BPS).div(BPS);
    // BUY pays up (slippage + commission both raise cost); SELL receives less.
    const fill =
      o.side === 'BUY' ? o.refPrice.plus(slip).plus(comm) : o.refPrice.minus(slip).minus(comm);
    if (
      o.limitPrice
      && ((o.side === 'BUY' && fill.gt(o.limitPrice)) || (o.side === 'SELL' && fill.lt(o.limitPrice)))
    ) {
      return {
        brokerRef: `sim:${o.market}:${o.symbol}:${o.side}:rejected`,
        status: 'REJECTED',
        filledQty: new D(0),
        avgFillPrice: new D(0),
      };
    }
    return {
      brokerRef: `sim:${o.market}:${o.symbol}:${o.side}:${o.qty.toString()}`,
      status: 'FILLED',
      filledQty: o.qty,
      avgFillPrice: fill,
    };
  }

  async getOrder(ref: string): Promise<OrderResult> {
    // Sim fills are synchronous and terminal; a lookup echoes a filled shell.
    return { brokerRef: ref, status: 'FILLED', filledQty: new D(0), avgFillPrice: new D(0) };
  }

  async cancelOrder(): Promise<void> {
    // No resting orders in the sim — nothing to cancel.
  }

  async getPositions(): Promise<Position[]> {
    return []; // DB (PortfolioItem) is the source of truth for sim positions.
  }

  async getCash(): Promise<Prisma.Decimal> {
    return new D(0); // DB is the source of truth for virtual cash.
  }
}
