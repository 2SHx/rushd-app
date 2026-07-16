import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AlpacaAdapter,
  MockProvider,
  ProviderRegistry,
  SahmkAdapter,
  YahooFinanceProvider,
  ZoyaAdapter,
  filingsLinks,
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

describe('YahooFinanceProvider candle failure policy', () => {
  it('strict maintenance candles throw on an empty Yahoo response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      chart: { result: [{ timestamp: [], indicators: { quote: [{}] } }] },
    }), { status: 200 })));

    await expect(new YahooFinanceProvider().getCandlesStrict('AAPL', 'NASDAQ', 30)).rejects.toThrow(/Empty Yahoo/);
  });

  it('normal candles preserve the synthetic fallback when strict Yahoo fetching fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));

    const candles = await new YahooFinanceProvider().getCandles('AAPL', 'NASDAQ', 5);

    expect(candles).toHaveLength(5);
  });
});

describe('M13 stock-workspace data contract', () => {
  it('returns deterministic 5-year and 8-quarter bundled fundamentals for NVDA and Aramco', async () => {
    const provider = new MockProvider();

    const nvdaAnnual = await provider.getFundamentalsHistory('NVDA', 'NASDAQ', 'annual', 5);
    const nvdaAnnualAgain = await provider.getFundamentalsHistory('NVDA', 'NASDAQ', 'annual', 5);
    const aramcoQuarterly = await provider.getFundamentalsHistory('2222.SR', 'TASI', 'quarterly', 8);

    expect(nvdaAnnual).toHaveLength(5);
    expect(aramcoQuarterly).toHaveLength(8);
    expect(nvdaAnnualAgain).toEqual(nvdaAnnual);
    expect(nvdaAnnual.every((period) => period.freq === 'annual' && period.source === 'bundled-demo')).toBe(true);
    expect(aramcoQuarterly.every((period) => period.freq === 'quarterly' && period.source === 'bundled-demo')).toBe(true);
    expect(nvdaAnnual.at(-1)?.income.revenue).not.toBe(aramcoQuarterly.at(-1)?.income.revenue);
  });

  it('returns fixture earnings history and a next date without external keys', async () => {
    const provider = new MockProvider();

    const nvda = await provider.getEarningsCalendar('NVDA', 'NASDAQ');
    const aramco = await provider.getEarningsCalendar('2222', 'TASI');

    expect(nvda.history.length).toBeGreaterThan(0);
    expect(aramco.history.length).toBeGreaterThan(0);
    expect(nvda.nextEarningsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(aramco.nextEarningsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('builds market-specific first-party filing destinations', () => {
    const nasdaq = filingsLinks('NVDA', 'NASDAQ');
    const tasi = filingsLinks('2222.SR', 'TASI');

    expect(new URL(nasdaq[0].url).hostname).toBe('www.sec.gov');
    expect(nasdaq[0].url).toContain('NVDA');
    expect(new URL(tasi[0].url).hostname).toBe('www.saudiexchange.sa');
    expect(tasi[0].url).toContain('2222');
    expect(nasdaq[0]).toMatchObject({ source: 'SEC EDGAR' });
    expect(tasi[0]).toMatchObject({ source: 'Saudi Exchange' });
  });
});
