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
export const ALPACA_LIVE_BASE_URL = 'https://api.alpaca.markets';
// Alpaca's market-data API is always served from this separate, fixed host (same key/secret),
// regardless of paper vs. live trading — never overridable via ALPACA_BASE_URL/env, so there is
// no way to misconfigure it onto an unexpected origin. Read-only; used only to verify a caller
// -supplied --ref-price is not stale before the per-order cash cap check (see shadowPaperRunner).
export const ALPACA_DATA_BASE_URL = 'https://data.alpaca.markets';
const READ_TIMEOUT_MS = 5_000;

function exactAlpacaOrigin(value: string): 'paper' | 'live' {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Unsupported Alpaca API origin');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new Error('Unsupported Alpaca API origin');
  }
  if (url.origin === ALPACA_PAPER_BASE_URL) return 'paper';
  if (url.origin === ALPACA_LIVE_BASE_URL) return 'live';
  throw new Error('Unsupported Alpaca API origin');
}

export function isExactAlpacaPaperBaseUrl(value: string): boolean {
  try {
    return exactAlpacaOrigin(value) === 'paper';
  } catch {
    return false;
  }
}

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
  private readonly baseUrl: string;

  constructor(
    private readonly key: string,
    private readonly secret: string,
    baseUrl: string = process.env.ALPACA_BASE_URL || ALPACA_PAPER_BASE_URL,
  ) {
    // A live (non-paper) URL is only permitted behind the full live-execution gate.
    // This is the enforcement point that keeps real-money orders dark by default.
    const kind = exactAlpacaOrigin(baseUrl);
    if (kind === 'live') assertLiveExecutionAllowed();
    this.baseUrl = new URL(baseUrl).origin;
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
    const res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
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
      // Bounded like every other outbound call in this class: a hung POST must surface as a
      // catchable timeout, never leave the caller (and the durable ShadowPaperRun row) waiting
      // indefinitely on whether a money-moving order was accepted.
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
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
    const res = await fetch(`${this.baseUrl}/v2/orders/${ref}`, { headers: this.headers(), signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Alpaca getOrder failed: ${res.status}`);
    const j = (await res.json()) as Record<string, unknown>;
    return this.mapOrder(j);
  }

  async cancelOrder(ref: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v2/orders/${ref}`, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Alpaca cancelOrder failed: ${res.status}`);
    }
  }

  /**
   * Fresh mid-quote (bid+ask)/2 for a symbol, from the fixed, pinned market-data host above.
   * If NBBO quotes are inactive/off-hours (ap or bp is 0), falls back to the latest executed trade price.
   * Read-only; used only to verify a caller-supplied --ref-price against a live price before the
   * per-order cash cap check — never to size an order and never itself a transmission point.
   */
  async getLatestQuote(symbol: string): Promise<Prisma.Decimal> {
    try {
      const res = await fetch(`${ALPACA_DATA_BASE_URL}/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`, {
        headers: this.headers(),
        cache: 'no-store',
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        const quote = (j.quote ?? {}) as Record<string, unknown>;
        const bid = decimal(quote.bp);
        const ask = decimal(quote.ap);
        if (bid.gt(0) && ask.gt(0)) {
          return bid.plus(ask).div(2);
        }
      } else if (res.status !== 404 && res.status !== 422) {
        throw new Error(`Alpaca getLatestQuote failed: ${res.status}`);
      }
    } catch (e) {
      if ((e as Error).message?.startsWith('Alpaca getLatestQuote failed:')) {
        throw e;
      }
    }

    // Off-hours / one-sided quote fallback: query latest executed trade price
    try {
      const resTrade = await fetch(`${ALPACA_DATA_BASE_URL}/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`, {
        headers: this.headers(),
        cache: 'no-store',
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      });
      if (!resTrade.ok) throw new Error(`Alpaca getLatestTrade failed: ${resTrade.status}`);
      const jTrade = (await resTrade.json()) as Record<string, unknown>;
      const trade = (jTrade.trade ?? {}) as Record<string, unknown>;
      const tradePrice = decimal(trade.p);
      if (tradePrice.gt(0)) {
        return tradePrice;
      }
    } catch (e) {
      if ((e as Error).message?.startsWith('Alpaca getLatestTrade failed:')) {
        throw e;
      }
    }

    throw new Error('Alpaca returned an invalid quote');
  }

  /**
   * Raw Alpaca account/positions/open-orders JSON, untouched (snake_case keys, no redaction).
   * Read-only. Feeds scripts/paper-preflight.mjs's evaluateAlpacaPaperPreflight, which expects
   * Alpaca's own shape — getPortfolioSnapshot() below is a *different*, redacted shape for the UI
   * and must not be reused here.
   */
  async getPreflightSnapshot(): Promise<{ account: unknown; positions: unknown[]; openOrders: unknown[] }> {
    const [account, positions, openOrders] = await Promise.all([
      this.read('/v2/account'),
      this.read('/v2/positions'),
      this.read('/v2/orders?status=open&direction=desc&limit=50'),
    ]);
    return { account, positions: positions as unknown[], openOrders: openOrders as unknown[] };
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
    const res = await fetch(`${this.baseUrl}/v2/positions`, { headers: this.headers(), signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Alpaca getPositions failed: ${res.status}`);
    const rows = (await res.json()) as Record<string, unknown>[];
    return rows.map((r) => ({ symbol: String(r.symbol), qty: new D(String(r.qty ?? '0')) }));
  }

  async getCash(): Promise<Prisma.Decimal> {
    const res = await fetch(`${this.baseUrl}/v2/account`, { headers: this.headers(), signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Alpaca getCash failed: ${res.status}`);
    const j = (await res.json()) as Record<string, unknown>;
    return new D(String(j.cash ?? '0'));
  }
}
