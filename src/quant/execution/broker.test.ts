import { describe, it, expect } from 'vitest';
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
  });
});

describe('broker registry', () => {
  it('selects Alpaca paper for NASDAQ with a key, else InternalSim', () => {
    expect(pickBrokerKind('NASDAQ' as any, { ALPACA_API_KEY: 'sk-real' } as any)).toBe('ALPACA_PAPER');
    expect(pickBrokerKind('NASDAQ' as any, {} as any)).toBe('INTERNAL_SIM');
    expect(pickBrokerKind('TASI' as any, { ALPACA_API_KEY: 'sk-real' } as any)).toBe('INTERNAL_SIM');
    expect(selectBroker('TASI' as any, {} as any).kind).toBe('INTERNAL_SIM');
    expect(selectBroker('NASDAQ' as any, {} as any).kind).toBe('INTERNAL_SIM');
  });
});
