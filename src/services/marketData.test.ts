import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AlpacaAdapter,
  MockProvider,
  ProviderRegistry,
  SahmkAdapter,
  YahooFinanceProvider,
  ZoyaAdapter,
  getCachedShariaVerdict,
} from './marketData';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('live Sharia screening', () => {
  it('rejects an unverified Zoya response instead of guessing compliance', async () => {
    process.env.ZOYA_API_KEY = 'key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })));

    await expect(new ZoyaAdapter().screen('MSFT', 'NASDAQ')).rejects.toThrow('omitted is_compliant');
  });

  it('fails closed when live screening is unavailable', async () => {
    process.env.MARKET_DATA_MODE = 'live';
    class FailingScreener {
      async screen(): Promise<never> { throw new Error('unavailable'); }
    }

    const verdict = await getCachedShariaVerdict(new FailingScreener(), 'UNIQUE', 'NASDAQ');

    expect(verdict).toMatchObject({ compliant: false, source: 'none' });
  });

  it('does not reuse an expired verified verdict when live refresh fails', async () => {
    process.env.MARKET_DATA_MODE = 'live';
    vi.useFakeTimers();
    class FlakyVerifiedScreener {
      failing = false;
      async screen(symbol: string) {
        if (this.failing) throw new Error('unavailable');
        return { symbol, compliant: true, standard: 'AAOIFI' as const, source: 'zoya' as const, asOf: new Date() };
      }
    }
    const screener = new FlakyVerifiedScreener();
    const first = await getCachedShariaVerdict(screener, 'STALE', 'NASDAQ');
    expect(first).toMatchObject({ compliant: true, source: 'zoya' });

    screener.failing = true;
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    const staleRefresh = await getCachedShariaVerdict(screener, 'STALE', 'NASDAQ');

    expect(staleRefresh).toMatchObject({ compliant: false, source: 'none' });
    vi.useRealTimers();
  });
});

describe('ProviderRegistry market-data modes', () => {
  it('defaults to the bundled provider even when keys exist', () => {
    delete process.env.MARKET_DATA_MODE;
    process.env.ALPACA_API_KEY = 'key';
    process.env.SAHMK_API_KEY = 'key';
    const registry = new ProviderRegistry();

    expect(registry.getProvider('NASDAQ')).toBeInstanceOf(MockProvider);
    expect(registry.getProvider('TASI')).toBeInstanceOf(MockProvider);
  });

  it('uses Yahoo only when keyless mode is explicit', () => {
    process.env.MARKET_DATA_MODE = 'keyless';
    const registry = new ProviderRegistry();

    expect(registry.getProvider('NASDAQ')).toBeInstanceOf(YahooFinanceProvider);
    expect(registry.getProvider('TASI')).toBeInstanceOf(YahooFinanceProvider);
  });

  it('uses keyed adapters in live mode', () => {
    process.env.MARKET_DATA_MODE = 'live';
    process.env.ALPACA_API_KEY = 'key';
    process.env.SAHMK_API_KEY = 'key';
    const registry = new ProviderRegistry();

    expect(registry.getProvider('NASDAQ')).toBeInstanceOf(AlpacaAdapter);
    expect(registry.getProvider('TASI')).toBeInstanceOf(SahmkAdapter);
  });
});
