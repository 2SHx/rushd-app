// Rushd Quant — BrokerAdapter interface + registry (QUANT_DESIGN.md §5).
// Execution is market-agnostic: the committee/UI talk to one interface. The registry
// picks a paper broker independently of the market-data provider. InternalSim remains the
// keyless/default path; a remote paper broker must be selected explicitly and configured fully.
import { Prisma } from '@prisma/client';
import type { Market, BrokerKind, OrderStatus, OrderSide } from '@prisma/client';

export interface OrderRequest {
  symbol: string;
  market: Market;
  side: OrderSide;
  qty: Prisma.Decimal;
  /** Reference price the sim fills around (latest close); Alpaca ignores it and fills live. */
  refPrice: Prisma.Decimal;
  /** Optional worst acceptable fill price; adapters must reject fills beyond it. */
  limitPrice?: Prisma.Decimal;
  /** Stable broker-side idempotency key for safely reconciling remote retries. */
  clientOrderId?: string;
}

export interface OrderResult {
  brokerRef: string;
  status: OrderStatus;
  filledQty: Prisma.Decimal;
  avgFillPrice: Prisma.Decimal;
}

export function validateOrderFill(fill: OrderResult, requestedQty: Prisma.Decimal): OrderResult {
  if (fill.filledQty.isNegative() || fill.filledQty.gt(requestedQty)) {
    throw new Error('Broker returned an invalid filled quantity');
  }
  if (fill.filledQty.gt(0) && !fill.avgFillPrice.isPositive()) {
    throw new Error('Broker returned an invalid fill price');
  }
  if (fill.status === 'FILLED' && !fill.filledQty.eq(requestedQty)) {
    throw new Error('Broker marked a non-complete quantity as filled');
  }
  return fill;
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

  const configured = env.QUANT_PAPER_BROKER?.trim().toUpperCase();
  if (!configured || configured === 'INTERNAL_SIM') return 'INTERNAL_SIM';
  if (configured !== 'ALPACA_PAPER') {
    throw new Error(`Unsupported QUANT_PAPER_BROKER: ${env.QUANT_PAPER_BROKER}`);
  }
  if (market !== 'NASDAQ') return 'INTERNAL_SIM';
  if (env.QUANT_SHADOW_PAPER_MUTATIONS !== '1') {
    throw new Error('ALPACA_PAPER mutations are disabled');
  }
  if (!env.ALPACA_API_KEY || env.ALPACA_API_KEY === 'mock-key' || !env.ALPACA_API_SECRET) {
    throw new Error('ALPACA_PAPER requires non-mock ALPACA_API_KEY and ALPACA_API_SECRET');
  }
  const baseUrl = (env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets').replace(/\/$/, '');
  if (baseUrl !== 'https://paper-api.alpaca.markets') {
    throw new Error('ALPACA_PAPER requires the exact paper endpoint');
  }
  return 'ALPACA_PAPER';
}
