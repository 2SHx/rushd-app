// src/services/market.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registry,
  fetchMarketData,
  SahmkAdapter,
  AlpacaAdapter,
  ZoyaAdapter,
  MockProvider,
  MockScreener,
  TokenBucket,
  getCachedQuote,
  YahooFinanceProvider
} from './marketData';

describe('Market Data Registry & Adapter Routing', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('selects MockProvider and MockScreener when no env keys are present', () => {
    delete process.env.SAHMK_API_KEY;
    delete process.env.ALPACA_API_KEY;
    delete process.env.ZOYA_API_KEY;

    const providerTasi = registry.getProvider('TASI');
    const providerNasdaq = registry.getProvider('NASDAQ');
    const screener = registry.getScreener();

    expect(providerTasi).toBeInstanceOf(MockProvider);
    expect(providerNasdaq).toBeInstanceOf(MockProvider);
    expect(screener).toBeInstanceOf(MockScreener);
  });

  it('swaps to SahmkAdapter for TASI when SAHMK_API_KEY is set', () => {
    process.env.SAHMK_API_KEY = 'test_sahmk_key';
    const providerTasi = registry.getProvider('TASI');
    expect(providerTasi).toBeInstanceOf(SahmkAdapter);
  });

  it('swaps to AlpacaAdapter for NASDAQ when ALPACA_API_KEY is set', () => {
    process.env.ALPACA_API_KEY = 'test_alpaca_key';
    const providerNasdaq = registry.getProvider('NASDAQ');
    expect(providerNasdaq).toBeInstanceOf(AlpacaAdapter);
  });

  it('swaps to ZoyaAdapter for Sharia screening when ZOYA_API_KEY is set', () => {
    process.env.ZOYA_API_KEY = 'test_zoya_key';
    const screener = registry.getScreener();
    expect(screener).toBeInstanceOf(ZoyaAdapter);
  });
});

describe('Fallback Behavior & Error/Rate-Limit Safety', () => {
  const origEnv = process.env;

  beforeEach(() => {
    process.env = { ...origEnv };
  });

  afterEach(() => {
    process.env = origEnv;
  });

  it('falls back to MockProvider quotes and candles when the active adapter throws', async () => {
    process.env.SAHMK_API_KEY = 'fail'; // Triggers simulated failure in SahmkAdapter
    const res = await fetchMarketData('1120.SR', 'TASI');
    
    // Fallback price is 120.5 (from MockProvider), not 135.5 (from SahmkAdapter)
    expect(res.price).toBe(120.5);
    expect(res.history.length).toBeGreaterThan(0);
  });

  it('falls back to MockScreener when the ZoyaAdapter throws', async () => {
    process.env.ZOYA_API_KEY = 'fail'; // Triggers simulated failure in ZoyaAdapter
    const res = await fetchMarketData('TSLA', 'NASDAQ');
    
    // MockScreener marks TSLA as non-compliant
    expect(res.isShariaCompliant).toBe(false);
  });

  it('falls back to MockProvider when quote rate limit is reached', async () => {
    const limitedProvider = {
      getQuote: vi.fn().mockRejectedValue(new Error('Should not be called')),
      getCandles: vi.fn()
    };
    
    // Create a wrapper function that uses a zero-token bucket to simulate rate limit
    const bucket = new TokenBucket(0, 0); // No tokens
    
    const key = `NASDAQ:AAPL`;
    const now = Date.now();

    // Directly test getCachedQuote with a rate limiter mock or check
    const mockAcquire = vi.spyOn(TokenBucket.prototype, 'tryAcquire').mockReturnValue(false);

    const quote = await getCachedQuote(limitedProvider, 'AAPL', 'NASDAQ');
    expect(quote.price).toBe(350.25); // MockProvider NASDAQ price
 
    mockAcquire.mockRestore();
  });
});

describe('YahooFinanceProvider Parser Logic', () => {
  it('correctly parses standard Yahoo Finance chart structure for quotes', async () => {
    const provider = new YahooFinanceProvider();
    
    const mockResponse = {
      chart: {
        result: [
          {
            meta: {
              regularMarketPrice: 182.52,
              currency: 'USD',
            }
          }
        ],
        error: null
      }
    };
    
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as any);

    const quote = await provider.getQuote('AAPL', 'NASDAQ');
    expect(quote.price).toBe(182.52);
    expect(quote.currency).toBe('USD');

    mockFetch.mockRestore();
  });
});
