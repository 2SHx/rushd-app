export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  value?: number;
}

export interface Quote {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  price: number;
  currency: 'SAR' | 'USD';
  asOf: Date;
}

export interface MarketData {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  price: number;
  history: Candle[];
  isShariaCompliant: boolean;
}

export interface ShariaVerdict {
  symbol: string;
  compliant: boolean;
  standard: 'AAOIFI';
  ratios?: {
    interestDebtToMcap: number;
    interestSecuritiesToMcap: number;
    nonCompliantIncomeToIncome: number;
  };
  source: 'mock' | 'zoya';
  asOf: Date;
}

export interface MarketDataProvider {
  getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote>;
  getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days?: number): Promise<Candle[]>;
}

export interface ShariaScreener {
  screen(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict>;
}

// -------------------------------------------------------------
// Helper: Mock Candle History Generation
// -------------------------------------------------------------
export function generateMockHistory(basePrice: number): Candle[] {
  const history: Candle[] = [];
  let currentPrice = basePrice;
  const now = new Date();
  
  for (let i = 60; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    const volatility = basePrice * 0.05;
    const open = currentPrice + (Math.random() - 0.5) * volatility;
    const high = open + Math.random() * volatility;
    const low = open - Math.random() * volatility;
    const close = (open + high + low) / 3;
    
    history.push({
      time: date.toISOString().split('T')[0],
      open,
      high,
      low,
      close,
      value: Math.floor(Math.random() * 10000)
    });
    currentPrice = close;
  }
  return history;
}

// -------------------------------------------------------------
// Default Mock Providers
// -------------------------------------------------------------
export class MockProvider implements MarketDataProvider {
  async getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
    const price = market === 'TASI' ? 120.5 : 350.25;
    return {
      symbol,
      market,
      price,
      currency: market === 'TASI' ? 'SAR' : 'USD',
      asOf: new Date(),
    };
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    const price = market === 'TASI' ? 120.5 : 350.25;
    return generateMockHistory(price).slice(-days);
  }
}

export class MockScreener implements ShariaScreener {
  async screen(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict> {
    const compliant = symbol !== 'TSLA' && symbol !== 'META';
    return {
      symbol,
      compliant,
      standard: 'AAOIFI',
      source: 'mock',
      asOf: new Date(),
    };
  }
}

// -------------------------------------------------------------
// Adapter Stubs behind Env Keys
// -------------------------------------------------------------
export class SahmkAdapter implements MarketDataProvider {
  async getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
    if (process.env.SAHMK_API_KEY === 'fail') {
      throw new Error('Sahmk service failure');
    }
    return {
      symbol,
      market,
      price: 135.5, // Distinct price to confirm Sahmk routing
      currency: 'SAR',
      asOf: new Date(),
    };
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    if (process.env.SAHMK_API_KEY === 'fail') {
      throw new Error('Sahmk service failure');
    }
    return generateMockHistory(135.5).slice(-days);
  }
}

export class AlpacaAdapter implements MarketDataProvider {
  async getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
    if (process.env.ALPACA_API_KEY === 'fail') {
      throw new Error('Alpaca service failure');
    }
    return {
      symbol,
      market,
      price: 365.25, // Distinct price to confirm Alpaca routing
      currency: 'USD',
      asOf: new Date(),
    };
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    if (process.env.ALPACA_API_KEY === 'fail') {
      throw new Error('Alpaca service failure');
    }
    return generateMockHistory(365.25).slice(-days);
  }
}

export class ZoyaAdapter implements ShariaScreener {
  async screen(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict> {
    if (process.env.ZOYA_API_KEY === 'fail') {
      throw new Error('Zoya service failure');
    }
    // Return distinct verdict to confirm Zoya routing
    const compliant = symbol !== 'AAPL'; 
    return {
      symbol,
      compliant,
      standard: 'AAOIFI',
      source: 'zoya',
      asOf: new Date(),
    };
  }
}

// -------------------------------------------------------------
// Provider Registry
// -------------------------------------------------------------
export class ProviderRegistry {
  getProvider(market: 'TASI' | 'NASDAQ'): MarketDataProvider {
    if (market === 'TASI' && process.env.SAHMK_API_KEY) {
      return new SahmkAdapter();
    }
    if (market === 'NASDAQ' && process.env.ALPACA_API_KEY) {
      return new AlpacaAdapter();
    }
    return new MockProvider();
  }

  getScreener(): ShariaScreener {
    if (process.env.ZOYA_API_KEY) {
      return new ZoyaAdapter();
    }
    return new MockScreener();
  }
}

export const registry = new ProviderRegistry();

// -------------------------------------------------------------
// Rate Limiter: In-Memory Token Bucket
// -------------------------------------------------------------
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(private maxTokens: number, private refillRatePerSecond: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
    this.lastRefill = now;
  }

  tryAcquire(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

// -------------------------------------------------------------
// In-Memory Caching and Wrapped Functions
// -------------------------------------------------------------
const quoteCache = new Map<string, { quote: Quote; expiresAt: number }>();
const candlesCache = new Map<string, { candles: Candle[]; expiresAt: number }>();
const shariaCache = new Map<string, { verdict: ShariaVerdict; expiresAt: number }>();

const quoteLimiter = new TokenBucket(15, 3);
const candlesLimiter = new TokenBucket(15, 3);
const shariaLimiter = new TokenBucket(15, 3);

function getEndOfDayTime(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export async function getCachedQuote(provider: MarketDataProvider, symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
  const key = `${market}:${symbol}`;
  const now = Date.now();
  const cached = quoteCache.get(key);

  if (cached && now < cached.expiresAt) {
    return cached.quote;
  }

  if (!quoteLimiter.tryAcquire()) {
    console.warn(`Rate limit hit for quote ${key}. Serving cached/mock.`);
    if (cached) return cached.quote;
    return new MockProvider().getQuote(symbol, market);
  }

  try {
    const quote = await provider.getQuote(symbol, market);
    quoteCache.set(key, { quote, expiresAt: now + 60000 }); // 60s TTL
    return quote;
  } catch (err) {
    console.error(`Error fetching quote for ${key}:`, err);
    if (cached) return cached.quote;
    return new MockProvider().getQuote(symbol, market);
  }
}

export async function getCachedCandles(provider: MarketDataProvider, symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
  const key = `${market}:${symbol}:${days}`;
  const now = Date.now();
  const cached = candlesCache.get(key);

  if (cached && now < cached.expiresAt) {
    return cached.candles;
  }

  if (!candlesLimiter.tryAcquire()) {
    console.warn(`Rate limit hit for candles ${key}. Serving cached/mock.`);
    if (cached) return cached.candles;
    return new MockProvider().getCandles(symbol, market, days);
  }

  try {
    const candles = await provider.getCandles(symbol, market, days);
    candlesCache.set(key, { candles, expiresAt: getEndOfDayTime() }); // End of day TTL
    return candles;
  } catch (err) {
    console.error(`Error fetching candles for ${key}:`, err);
    if (cached) return cached.candles;
    return new MockProvider().getCandles(symbol, market, days);
  }
}

export async function getCachedShariaVerdict(screener: ShariaScreener, symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict> {
  const key = `${market}:${symbol}`;
  const now = Date.now();
  const cached = shariaCache.get(key);

  if (cached && now < cached.expiresAt) {
    return cached.verdict;
  }

  if (!shariaLimiter.tryAcquire()) {
    console.warn(`Rate limit hit for Sharia screening ${key}. Serving cached/mock.`);
    if (cached) return cached.verdict;
    return new MockScreener().screen(symbol, market);
  }

  try {
    const verdict = await screener.screen(symbol, market);
    shariaCache.set(key, { verdict, expiresAt: now + 24 * 60 * 60 * 1000 }); // 24h TTL
    return verdict;
  } catch (err) {
    console.error(`Error screening Sharia compliance for ${key}:`, err);
    if (cached) return cached.verdict;
    return new MockScreener().screen(symbol, market);
  }
}

// -------------------------------------------------------------
// Façade entry point used by UI and MCP
// -------------------------------------------------------------
export async function fetchMarketData(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<MarketData> {
  const provider = registry.getProvider(market);
  const screener = registry.getScreener();

  const quote = await getCachedQuote(provider, symbol, market);
  const history = await getCachedCandles(provider, symbol, market);
  const verdict = await getCachedShariaVerdict(screener, symbol, market);

  return {
    symbol,
    market,
    price: quote.price,
    history,
    isShariaCompliant: verdict.compliant,
  };
}
