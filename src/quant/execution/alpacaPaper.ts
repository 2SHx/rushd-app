// Rushd Quant — AlpacaPaperBroker (QUANT_DESIGN.md §5). Real order lifecycle on Alpaca
// paper (virtual money) for NASDAQ, behind ALPACA_API_KEY/SECRET. Same REST shape as
// live — going live is only a base-URL change, hard-gated by liveGuard. With no key the
// registry never selects this class (mock-first); it is untested live by design.
import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@prisma/client';
import type { BrokerAdapter, OrderRequest, OrderResult, Position } from './broker';
import { assertLiveExecutionAllowed } from './liveGuard';

const D = Prisma.Decimal;
export const ALPACA_PAPER_BASE_URL = 'https://paper-api.alpaca.markets';
const READ_TIMEOUT_MS = 5_000;

export interface AlpacaPaperPortfolioSnapshot {
  retrievedAt: string;
  account: {
    status: string;
    currency: string;
    equity: string;
    cash: string;
    buyingPower: string;
    dayPnl: string;
    dayPnlPct: string;
    cashNegative: boolean;
    tradingBlocked: boolean;
  };
  positions: Array<{
    symbol: string;
    side: string;
    qty: string;
    avgEntryPrice: string;
    currentPrice: string;
    marketValue: string;
    unrealizedPnl: string;
    unrealizedPnlPct: string;
    changeToday: string;
  }>;
  openOrders: Array<{
    id: string;
    symbol: string;
    side: string;
    type: string;
    status: string;
    qty: string;
    filledQty: string;
    submittedAt: string | null;
  }>;
}

function decimal(value: unknown): Prisma.Decimal {
  try {
    return new D(String(value ?? '0'));
  } catch {
    throw new Error('Alpaca returned invalid numeric account data');
  }
}

function timestamp(value: unknown): string | null {
  const date = new Date(String(value ?? ''));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function mapStatus(s: string): OrderStatus {
  switch (s) {
    case 'filled':
      return 'FILLED';
    case 'partially_filled':
      return 'PARTIAL';
    case 'canceled':
    case 'expired':
      return 'CANCELLED';
    case 'rejected':
      return 'REJECTED';
    default:
      return 'NEW';
  }
}

export class AlpacaPaperBroker implements BrokerAdapter {
  readonly kind = 'ALPACA_PAPER' as const;

  constructor(
    private readonly key: string,
    private readonly secret: string,
    private readonly baseUrl: string = process.env.ALPACA_BASE_URL || ALPACA_PAPER_BASE_URL,
  ) {
    // A live (non-paper) URL is only permitted behind the full live-execution gate.
    // This is the enforcement point that keeps real-money orders dark by default.
    const isLive = baseUrl.includes('api.alpaca.markets') && !baseUrl.includes('paper');
    if (isLive) assertLiveExecutionAllowed();
  }

  private headers(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.key,
      'APCA-API-SECRET-KEY': this.secret,
      'Content-Type': 'application/json',
    };
  }

  private async read(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.headers(),
      cache: 'no-store',
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Alpaca paper read failed: ${res.status}`);
    return res.json();
  }

  private mapOrder(j: Record<string, unknown>, fallbackPrice = new D(0)): OrderResult {
    return {
      brokerRef: String(j.id),
      status: mapStatus(String(j.status)),
      filledQty: new D(String(j.filled_qty ?? '0')),
      avgFillPrice: new D(String(j.filled_avg_price ?? fallbackPrice.toString())),
    };
  }

  private async getOrderByClientId(clientOrderId: string): Promise<OrderResult | null> {
    const url = `${this.baseUrl}/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(clientOrderId)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Alpaca getOrderByClientId failed: ${res.status}`);
    return this.mapOrder((await res.json()) as Record<string, unknown>);
  }

  async submitOrder(o: OrderRequest): Promise<OrderResult> {
    if (o.clientOrderId) {
      const existing = await this.getOrderByClientId(o.clientOrderId);
      if (existing) return existing;
    }

    const res = await fetch(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        symbol: o.symbol,
        qty: o.qty.toString(),
        side: o.side.toLowerCase(),
        type: o.limitPrice ? 'limit' : 'market',
        ...(o.limitPrice ? { limit_price: o.limitPrice.toString() } : {}),
        time_in_force: 'day',
        ...(o.clientOrderId ? { client_order_id: o.clientOrderId } : {}),
      }),
    });
    if (!res.ok) {
      if (res.status === 422 && o.clientOrderId) {
        const existing = await this.getOrderByClientId(o.clientOrderId);
        if (existing) return existing;
      }
      throw new Error(`Alpaca order failed: ${res.status}`);
    }
    const j = (await res.json()) as Record<string, unknown>;
    return this.mapOrder(j, o.refPrice);
  }

  async getOrder(ref: string): Promise<OrderResult> {
    const res = await fetch(`${this.baseUrl}/v2/orders/${ref}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Alpaca getOrder failed: ${res.status}`);
    const j = (await res.json()) as Record<string, unknown>;
    return this.mapOrder(j);
  }

  async cancelOrder(ref: string): Promise<void> {
    await fetch(`${this.baseUrl}/v2/orders/${ref}`, { method: 'DELETE', headers: this.headers() });
  }

  /** One batched read model for the authenticated paper-portfolio UI. Never used for execution math. */
  async getPortfolioSnapshot(): Promise<AlpacaPaperPortfolioSnapshot> {
    const [accountRaw, positionsRaw, ordersRaw] = await Promise.all([
      this.read('/v2/account'),
      this.read('/v2/positions'),
      this.read('/v2/orders?status=open&direction=desc&limit=50'),
    ]);
    const account = accountRaw as Record<string, unknown>;
    const positions = positionsRaw as Record<string, unknown>[];
    const orders = ordersRaw as Record<string, unknown>[];
    const equity = decimal(account.equity);
    const lastEquity = decimal(account.last_equity);
    const dayPnl = equity.minus(lastEquity);
    const dayPnlPct = lastEquity.isPositive() ? dayPnl.div(lastEquity) : new D(0);
    const cash = decimal(account.cash);

    return {
      retrievedAt: new Date().toISOString(),
      account: {
        status: String(account.status ?? 'UNKNOWN'),
        currency: String(account.currency ?? 'USD'),
        equity: equity.toString(),
        cash: cash.toString(),
        buyingPower: decimal(account.buying_power).toString(),
        dayPnl: dayPnl.toString(),
        dayPnlPct: dayPnlPct.toString(),
        cashNegative: cash.isNegative(),
        tradingBlocked: account.trading_blocked === true,
      },
      positions: positions.map((position) => ({
        symbol: String(position.symbol ?? ''),
        side: String(position.side ?? 'long'),
        qty: decimal(position.qty).toString(),
        avgEntryPrice: decimal(position.avg_entry_price).toString(),
        currentPrice: decimal(position.current_price).toString(),
        marketValue: decimal(position.market_value).toString(),
        unrealizedPnl: decimal(position.unrealized_pl).toString(),
        unrealizedPnlPct: decimal(position.unrealized_plpc).toString(),
        changeToday: decimal(position.change_today).toString(),
      })),
      openOrders: orders.map((order) => ({
        id: String(order.id ?? ''),
        symbol: String(order.symbol ?? ''),
        side: String(order.side ?? ''),
        type: String(order.type ?? ''),
        status: String(order.status ?? ''),
        qty: decimal(order.qty).toString(),
        filledQty: decimal(order.filled_qty).toString(),
        submittedAt: timestamp(order.submitted_at),
      })),
    };
  }

  async getPositions(): Promise<Position[]> {
    const res = await fetch(`${this.baseUrl}/v2/positions`, { headers: this.headers() });
    if (!res.ok) return [];
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((r) => ({ symbol: String(r.symbol), qty: new D(String(r.qty ?? '0')) }));
  }

  async getCash(): Promise<Prisma.Decimal> {
    const res = await fetch(`${this.baseUrl}/v2/account`, { headers: this.headers() });
    if (!res.ok) return new D(0);
    const j = (await res.json()) as Record<string, unknown>;
    return new D(String(j.cash ?? '0'));
  }
}
