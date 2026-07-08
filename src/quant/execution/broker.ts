// Rushd Quant — BrokerAdapter interface + registry (QUANT_DESIGN.md §5).
// Execution is market-agnostic: the committee/UI talk to one interface. The registry
// picks AlpacaPaperBroker for NASDAQ when an Alpaca key is present, otherwise the
// InternalSimBroker (TASI + all keyless/mock mode) — so the whole path runs with no keys.
import { Prisma } from '@prisma/client';
import type { Market, BrokerKind, OrderStatus, OrderSide } from '@prisma/client';

export interface OrderRequest {
  symbol: string;
  market: Market;
  side: OrderSide;
  qty: Prisma.Decimal;
  /** Reference price the sim fills around (latest close); Alpaca ignores it and fills live. */
  refPrice: Prisma.Decimal;
}

export interface OrderResult {
  brokerRef: string;
  status: OrderStatus;
  filledQty: Prisma.Decimal;
  avgFillPrice: Prisma.Decimal;
}

export interface Position {
  symbol: string;
  qty: Prisma.Decimal;
}

export interface BrokerAdapter {
  kind: BrokerKind;
  submitOrder(o: OrderRequest): Promise<OrderResult>;
  getOrder(ref: string): Promise<OrderResult>;
  cancelOrder(ref: string): Promise<void>;
  /** Positions/cash of record: the DB is the source of truth for sim; brokers report their own. */
  getPositions(): Promise<Position[]>;
  getCash(): Promise<Prisma.Decimal>;
}

// Broker impls import this interface; the registry lives in a separate module-load-safe
// factory to avoid a cycle (registry needs the concrete classes).
export function pickBrokerKind(market: Market, env: NodeJS.ProcessEnv = process.env): BrokerKind {
  if (process.env.NODE_ENV === 'test' && env === process.env) {
    return 'INTERNAL_SIM';
  }
  if (market === 'NASDAQ' && env.ALPACA_API_KEY && env.ALPACA_API_KEY !== 'mock-key') {
    return 'ALPACA_PAPER';
  }
  return 'INTERNAL_SIM';
}
