// Rushd Quant — AlpacaPaperBroker (QUANT_DESIGN.md §5). Real order lifecycle on Alpaca
// paper (virtual money) for NASDAQ, behind ALPACA_API_KEY/SECRET. Same REST shape as
// live — going live is only a base-URL change, hard-gated by liveGuard. With no key the
// registry never selects this class (mock-first); it is untested live by design.
import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@prisma/client';
import type { BrokerAdapter, OrderRequest, OrderResult, Position } from './broker';
import { assertLiveExecutionAllowed } from './liveGuard';

const D = Prisma.Decimal;
const PAPER_BASE = 'https://paper-api.alpaca.markets';

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
    private readonly baseUrl: string = process.env.ALPACA_BASE_URL || PAPER_BASE,
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
