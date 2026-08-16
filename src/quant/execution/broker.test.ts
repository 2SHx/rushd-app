import { afterEach, describe, it, expect, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { pickBrokerKind } from './broker';
import { InternalSimBroker } from './internalSim';
import { AlpacaPaperBroker } from './alpacaPaper';
import { selectBroker } from './registry';
import { assertLiveExecutionAllowed, isLiveExecutionAllowed, LiveExecutionBlocked } from './liveGuard';

const D = Prisma.Decimal;

describe('liveGuard (real-money dark by default)', () => {
  it('blocks by default and with fewer than all three conditions', () => {
    expect(isLiveExecutionAllowed({} as any)).toBe(false);
    expect(() => assertLiveExecutionAllowed({} as any)).toThrow(LiveExecutionBlocked);
    // flag + live url but no license
    expect(
      isLiveExecutionAllowed({
        QUANT_LIVE_EXECUTION: '1',
        ALPACA_BASE_URL: 'https://api.alpaca.markets',
      } as any),
    ).toBe(false);
    // paper url does not count as live even with flag + license
    expect(
      isLiveExecutionAllowed({
        QUANT_LIVE_EXECUTION: '1',
        ALPACA_BASE_URL: 'https://paper-api.alpaca.markets',
        QUANT_CMA_LICENSE_REF: 'lic-1',
      } as any),
    ).toBe(false);
  });

  it('allows only when all three conditions hold', () => {
    expect(
      isLiveExecutionAllowed({
        QUANT_LIVE_EXECUTION: '1',
        ALPACA_BASE_URL: 'https://api.alpaca.markets',
        QUANT_CMA_LICENSE_REF: 'lic-1',
      } as any),
    ).toBe(true);
  });
});

describe('InternalSimBroker fills', () => {
  it('BUY fills above ref (slippage+commission), SELL below, qty in full, deterministic', async () => {
    const b = new InternalSimBroker();
    const buy = await b.submitOrder({ symbol: 'AAPL', market: 'NASDAQ' as any, side: 'BUY' as any, qty: new D(10), refPrice: new D(100) });
    const sell = await b.submitOrder({ symbol: 'AAPL', market: 'NASDAQ' as any, side: 'SELL' as any, qty: new D(10), refPrice: new D(100) });
    expect(buy.status).toBe('FILLED');
    expect(buy.filledQty.equals(new D(10))).toBe(true);
    // 100 + 0.05% + 0.10% = 100.15
    expect(buy.avgFillPrice.equals(new D('100.15'))).toBe(true);
    expect(sell.avgFillPrice.equals(new D('99.85'))).toBe(true);
    const again = await b.submitOrder({ symbol: 'AAPL', market: 'NASDAQ' as any, side: 'BUY' as any, qty: new D(10), refPrice: new D(100) });
    expect(again.brokerRef).toBe(buy.brokerRef); // deterministic
  });
});

describe('AlpacaPaperBroker enforces the live gate at construction', () => {
  it('constructs on a paper URL but THROWS on a live URL without the 3 conditions', () => {
    // paper (default) is fine
    expect(() => new AlpacaPaperBroker('k', 's', 'https://paper-api.alpaca.markets')).not.toThrow();
    // a live URL with no flags is blocked — real orders cannot be reached
    expect(() => new AlpacaPaperBroker('k', 's', 'https://api.alpaca.markets')).toThrow(LiveExecutionBlocked);
    expect(() => new AlpacaPaperBroker('k', 's', 'https://paper-api.alpaca.markets.evil.example'))
      .toThrow('Unsupported Alpaca API origin');
  });
});

describe('AlpacaPaperBroker client-order idempotency', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reconciles a retry by client order ID without submitting a second order', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'alpaca-order-1',
        status: 'filled',
        filled_qty: '10',
        filled_avg_price: '101.25',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'alpaca-order-1',
        status: 'filled',
        filled_qty: '10',
        filled_avg_price: '101.25',
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const broker = new AlpacaPaperBroker('k', 's', 'https://paper-api.alpaca.markets');
    const order = {
      symbol: 'AAPL',
      market: 'NASDAQ' as const,
      side: 'BUY' as const,
      qty: new D(10),
      refPrice: new D(100),
      clientOrderId: 'rushd-strategy-1-2026-07-10-AAPL-BUY',
    };

    const first = await broker.submitOrder(order);
    const retry = await broker.submitOrder(order);

    expect(first).toEqual(retry);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({
      client_order_id: order.clientOrderId,
    });
    expect(fetchMock.mock.calls[2][0]).toBe(
      `https://paper-api.alpaca.markets/v2/orders:by_client_order_id?client_order_id=${encodeURIComponent(order.clientOrderId)}`,
    );
  });

  it('looks up the accepted order after Alpaca rejects a duplicate submission', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 422 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'alpaca-order-raced',
        status: 'new',
        filled_qty: '0',
        filled_avg_price: null,
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const broker = new AlpacaPaperBroker('k', 's', 'https://paper-api.alpaca.markets');

    const result = await broker.submitOrder({
      symbol: 'MSFT',
      market: 'NASDAQ',
      side: 'SELL',
      qty: new D(4),
      refPrice: new D(300),
      clientOrderId: 'rushd-strategy-1-2026-07-10-MSFT-SELL',
    });

    expect(result).toMatchObject({
      brokerRef: 'alpaca-order-raced',
      status: 'NEW',
    });
    expect(result.avgFillPrice.isZero()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fails closed when cancellation or source-of-truth reads fail', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const broker = new AlpacaPaperBroker('k', 's', 'https://paper-api.alpaca.markets');

    await expect(broker.cancelOrder('order-1')).rejects.toThrow('cancelOrder failed: 500');
    await expect(broker.cancelOrder('missing-order')).rejects.toThrow('cancelOrder failed: 404');
    await expect(broker.getPositions()).rejects.toThrow('getPositions failed: 503');
    await expect(broker.getCash()).rejects.toThrow('getCash failed: 401');
  });
});

describe('AlpacaPaperBroker portfolio snapshot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads account, positions, and open orders together with Decimal-derived day P&L', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'ACTIVE', currency: 'USD', equity: '101250.50', last_equity: '100000',
        cash: '-825.25', buying_power: '198349.50', trading_blocked: false,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        symbol: 'SPUS', side: 'long', qty: '12.5', avg_entry_price: '42', current_price: '44',
        market_value: '550', unrealized_pl: '25', unrealized_plpc: '0.047619', change_today: '0.01',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'order-1', symbol: 'AAPL', side: 'buy', type: 'limit', status: 'new', qty: '2',
        filled_qty: '0', submitted_at: '2026-07-15T08:00:00Z',
      }]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await new AlpacaPaperBroker('k', 's', 'https://paper-api.alpaca.markets')
      .getPortfolioSnapshot();

    expect(result.account).toMatchObject({
      equity: '101250.5',
      cash: '-825.25',
      dayPnl: '1250.5',
      dayPnlPct: '0.012505',
      cashNegative: true,
    });
    expect(result.positions[0]).toMatchObject({ symbol: 'SPUS', qty: '12.5', unrealizedPnl: '25' });
    expect(result.openOrders[0]).toMatchObject({ id: 'order-1', symbol: 'AAPL', submittedAt: '2026-07-15T08:00:00.000Z' });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'https://paper-api.alpaca.markets/v2/account',
      'https://paper-api.alpaca.markets/v2/positions',
      'https://paper-api.alpaca.markets/v2/orders?status=open&direction=desc&limit=50',
    ]);
  });
});

describe('broker registry', () => {
  it('selects execution independently of market-data mode and defaults keyless to InternalSim', () => {
    expect(pickBrokerKind('NASDAQ' as any, {
      QUANT_PAPER_BROKER: 'ALPACA_PAPER',
      QUANT_SHADOW_PAPER_MUTATIONS: '1',
      MARKET_DATA_MODE: 'bundled',
      ALPACA_API_KEY: 'pk-real',
      ALPACA_API_SECRET: 'secret',
    } as any)).toBe('ALPACA_PAPER');
    expect(pickBrokerKind('NASDAQ' as any, {
      MARKET_DATA_MODE: 'live',
      ALPACA_API_KEY: 'pk-real',
      ALPACA_API_SECRET: 'secret',
    } as any)).toBe('INTERNAL_SIM');
    expect(pickBrokerKind('NASDAQ' as any, {} as any)).toBe('INTERNAL_SIM');
    expect(pickBrokerKind('TASI' as any, {
      QUANT_PAPER_BROKER: 'ALPACA_PAPER',
      QUANT_SHADOW_PAPER_MUTATIONS: '1',
      ALPACA_API_KEY: 'pk-real',
      ALPACA_API_SECRET: 'secret',
    } as any)).toBe('INTERNAL_SIM');
    expect(selectBroker('TASI' as any, {} as any).kind).toBe('INTERNAL_SIM');
    expect(selectBroker('NASDAQ' as any, {} as any).kind).toBe('INTERNAL_SIM');
  });

  it('fails closed for incomplete or unknown remote-paper configuration', () => {
    expect(() => pickBrokerKind('NASDAQ' as any, {
      QUANT_PAPER_BROKER: 'ALPACA_PAPER',
    } as any)).toThrow('mutations are disabled');
    expect(() => pickBrokerKind('NASDAQ' as any, {
      QUANT_PAPER_BROKER: 'ALPACA_PAPER',
      QUANT_SHADOW_PAPER_MUTATIONS: '1',
      ALPACA_API_KEY: 'pk-real',
    } as any)).toThrow('ALPACA_PAPER requires');
    expect(() => pickBrokerKind('NASDAQ' as any, {
      QUANT_PAPER_BROKER: 'some-broker',
    } as any)).toThrow('Unsupported QUANT_PAPER_BROKER');
  });

  it('rejects non-paper endpoints and keeps remote paper unreachable from generic routes', () => {
    expect(() => pickBrokerKind('NASDAQ' as any, {
      QUANT_PAPER_BROKER: 'ALPACA_PAPER',
      QUANT_SHADOW_PAPER_MUTATIONS: '1',
      ALPACA_API_KEY: 'pk-real',
      ALPACA_API_SECRET: 'secret',
      ALPACA_BASE_URL: 'https://api.alpaca.markets',
    } as any)).toThrow('exact paper endpoint');
    expect(() => selectBroker('NASDAQ' as any, {
      QUANT_PAPER_BROKER: 'ALPACA_PAPER',
      QUANT_SHADOW_PAPER_MUTATIONS: '1',
      ALPACA_API_KEY: 'pk-real',
      ALPACA_API_SECRET: 'secret',
    } as any)).toThrow('restricted to the bounded shadow-paper runner');
  });
});
