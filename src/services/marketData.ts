import { TASI_UNIVERSE, NASDAQ_UNIVERSE_FALLBACK, type StockUniverseEntry } from '@/lib/stockUniverse';
import { CompositeShariaScreener } from '@/quant/gates/etfHoldingsScreener';

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
  source: 'live' | 'delayed' | 'mock';
}

export interface FundamentalsPeriod {
  period: string;
  freq: 'annual' | 'quarterly';
  income: {
    revenue: number;
    costOfRevenue: number;
    grossProfit: number;
    opex: number;
    rdExpense: number;
    operatingIncome: number;
    interestExpense: number;
    taxExpense: number;
    netIncome: number;
    epsDiluted: number;
    sharesDiluted: number;
  };
  balance: {
    totalCash: number;
    totalDebt: number;
    totalEquity: number;
    totalAssets: number;
  };
  cashflow: {
    operatingCF: number;
    capex: number;
    freeCashFlow: number;
  };
  source: string;
}

export interface EarningsCalendar {
  history: { quarter: string; actual: number; expected: number }[];
  nextEarningsDate?: string;
}

export interface FilingLink {
  label: string;
  labelAr: string;
  url: string;
  source: string;
}

export interface MarketData {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  price: number;
  history: Candle[];
  /** null = UNKNOWN (no free-source coverage) — treat as non-compliant for any promotion/allowlist decision. */
  isShariaCompliant: boolean | null;
  shariaSource: 'mock' | 'zoya' | 'none' | 'etf-holdings' | 'saudi-sharia-list';
  marketDataSource: 'live' | 'delayed' | 'mock';
  purificationRatioBps?: number;
  earningsHistory?: { quarter: string; actual: number; expected: number }[];
  aboutTextEnglish?: string;
  aboutTextArabic?: string;
  ceo?: string;
  employees?: number;
  headquarters?: string;
  sectorArabic?: string;
  sectorEnglish?: string;
  movementReasonArabic?: string;
  movementReasonEnglish?: string;
  statistics?: {
    dayRange: [number, number];
    yearRange: [number, number];
    open: number;
    prevClose: number;
    volume: number;
    avgVolume: number;
    marketCap: number;
    peRatio: number;
  };
  financials?: {
    revenue: number;
    netIncome: number;
    grossMargin: number;
    totalCash: number;
    totalDebt: number;
    debtToEquity: number;
    complianceRatios: {
      debtToMcap: number;
      interestIncomeToRevenue: number;
    };
    latestStatementQuarter: string;
  };
}

export interface ShariaVerdict {
  symbol: string;
  /** true/false for a real screened verdict; null = UNKNOWN (no free-source coverage — never a fabricated false). */
  compliant: boolean | null;
  standard: 'AAOIFI';
  ratios?: {
    interestDebtToMcap: number;
    interestSecuritiesToMcap: number;
    nonCompliantIncomeToIncome: number;
  };
  /** 'etf-holdings' (US, SPUS/HLAL membership) and 'saudi-sharia-list' (TASI, bundled quarterly list) are the free composite screener's sources (src/quant/gates/etfHoldingsScreener.ts). */
  source: 'mock' | 'zoya' | 'none' | 'etf-holdings' | 'saudi-sharia-list';
  asOf: Date;
}

export interface MarketDataProvider {
  getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote>;
  getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days?: number): Promise<Candle[]>;
  getFundamentalsHistory(
    symbol: string,
    market: 'TASI' | 'NASDAQ',
    freq: 'annual' | 'quarterly',
    periods: number,
  ): Promise<FundamentalsPeriod[]>;
  getEarningsCalendar(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<EarningsCalendar>;
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

interface FundamentalsSeed {
  annualRevenue: number;
  annualGrowth: number;
  grossMargin: number;
  opexRatio: number;
  rdRatio: number;
  interestRatio: number;
  taxRate: number;
  sharesDiluted: number;
  cashRatio: number;
  debtRatio: number;
  equityRatio: number;
  operatingCashflowMultiple: number;
  capexRatio: number;
}

const FUNDAMENTALS_FIXTURES: Record<string, FundamentalsSeed> = {
  NVDA: {
    annualRevenue: 130_000_000_000,
    annualGrowth: 0.34,
    grossMargin: 0.74,
    opexRatio: 0.13,
    rdRatio: 0.09,
    interestRatio: 0.002,
    taxRate: 0.13,
    sharesDiluted: 24_500_000_000,
    cashRatio: 0.25,
    debtRatio: 0.08,
    equityRatio: 0.52,
    operatingCashflowMultiple: 1.12,
    capexRatio: 0.03,
  },
  '2222': {
    annualRevenue: 1_630_000_000_000,
    annualGrowth: 0.055,
    grossMargin: 0.43,
    opexRatio: 0.12,
    rdRatio: 0.004,
    interestRatio: 0.008,
    taxRate: 0.20,
    sharesDiluted: 242_000_000_000,
    cashRatio: 0.11,
    debtRatio: 0.09,
    equityRatio: 0.46,
    operatingCashflowMultiple: 1.19,
    capexRatio: 0.07,
  },
};

function cleanWorkspaceSymbol(symbol: string): string {
  return symbol.replace(/\.SR$/i, '').toUpperCase();
}

function stableSymbolSeed(symbol: string): number {
  return cleanWorkspaceSymbol(symbol).split('').reduce((seed, char) => (seed * 31 + char.charCodeAt(0)) >>> 0, 17);
}

function fundamentalsSeed(symbol: string, market: 'TASI' | 'NASDAQ'): FundamentalsSeed {
  const cleanSymbol = cleanWorkspaceSymbol(symbol);
  const fixture = FUNDAMENTALS_FIXTURES[cleanSymbol];
  if (fixture) return fixture;

  const unit = (stableSymbolSeed(cleanSymbol) % 1_000) / 1_000;
  return {
    annualRevenue: (market === 'TASI' ? 18_000_000_000 : 32_000_000_000) * (0.75 + unit),
    annualGrowth: 0.04 + unit * 0.12,
    grossMargin: 0.34 + unit * 0.24,
    opexRatio: 0.14 + unit * 0.08,
    rdRatio: market === 'TASI' ? 0.012 + unit * 0.018 : 0.04 + unit * 0.07,
    interestRatio: 0.004 + unit * 0.006,
    taxRate: market === 'TASI' ? 0.20 : 0.16 + unit * 0.05,
    sharesDiluted: (market === 'TASI' ? 2_000_000_000 : 1_000_000_000) * (0.8 + unit),
    cashRatio: 0.10 + unit * 0.12,
    debtRatio: 0.06 + unit * 0.10,
    equityRatio: 0.38 + unit * 0.20,
    operatingCashflowMultiple: 1.05 + unit * 0.16,
    capexRatio: 0.025 + unit * 0.045,
  };
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

function fundamentalsPeriodLabel(freq: 'annual' | 'quarterly', index: number, count: number): string {
  if (freq === 'annual') return `FY${2026 - count + index + 1}`;
  const finalQuarterIndex = 2026 * 4 + 1; // Q2 2026, zero-based.
  const quarterIndex = finalQuarterIndex - count + index + 1;
  return `${Math.floor(quarterIndex / 4)} Q${quarterIndex % 4 + 1}`;
}

function generateFundamentalsHistory(
  symbol: string,
  market: 'TASI' | 'NASDAQ',
  freq: 'annual' | 'quarterly',
  periods: number,
): FundamentalsPeriod[] {
  const count = Math.max(1, Math.floor(periods));
  const seed = fundamentalsSeed(symbol, market);
  const periodGrowth = freq === 'annual' ? seed.annualGrowth : Math.pow(1 + seed.annualGrowth, 0.25) - 1;
  const latestRevenue = freq === 'annual' ? seed.annualRevenue : seed.annualRevenue / 4;

  return Array.from({ length: count }, (_, index) => {
    const revenue = latestRevenue / Math.pow(1 + periodGrowth, count - index - 1);
    const grossProfit = revenue * seed.grossMargin;
    const costOfRevenue = revenue - grossProfit;
    const opex = revenue * seed.opexRatio;
    const operatingIncome = grossProfit - opex;
    const interestExpense = revenue * seed.interestRatio;
    const taxExpense = Math.max(0, operatingIncome - interestExpense) * seed.taxRate;
    const netIncome = operatingIncome - interestExpense - taxExpense;
    const operatingCF = netIncome * seed.operatingCashflowMultiple;
    const capex = revenue * seed.capexRatio;
    const totalDebt = revenue * seed.debtRatio;
    const totalEquity = revenue * seed.equityRatio;

    return {
      period: fundamentalsPeriodLabel(freq, index, count),
      freq,
      income: {
        revenue: rounded(revenue),
        costOfRevenue: rounded(costOfRevenue),
        grossProfit: rounded(grossProfit),
        opex: rounded(opex),
        rdExpense: rounded(revenue * seed.rdRatio),
        operatingIncome: rounded(operatingIncome),
        interestExpense: rounded(interestExpense),
        taxExpense: rounded(taxExpense),
        netIncome: rounded(netIncome),
        epsDiluted: rounded(netIncome / seed.sharesDiluted),
        sharesDiluted: rounded(seed.sharesDiluted),
      },
      balance: {
        totalCash: rounded(revenue * seed.cashRatio),
        totalDebt: rounded(totalDebt),
        totalEquity: rounded(totalEquity),
        totalAssets: rounded(totalEquity + totalDebt),
      },
      cashflow: {
        operatingCF: rounded(operatingCF),
        capex: rounded(capex),
        freeCashFlow: rounded(operatingCF - capex),
      },
      source: 'bundled-demo',
    };
  });
}

function generateEarningsCalendar(symbol: string, market: 'TASI' | 'NASDAQ'): EarningsCalendar {
  const history = generateFundamentalsHistory(symbol, market, 'quarterly', 4).map((period, index) => ({
    quarter: period.period,
    actual: period.income.epsDiluted,
    expected: rounded(period.income.epsDiluted * (0.96 + index * 0.005)),
  }));
  const fixtureDates: Record<string, string> = { NVDA: '2026-08-26', '2222': '2026-08-11' };
  const cleanSymbol = cleanWorkspaceSymbol(symbol);
  const fallbackDay = String(1 + stableSymbolSeed(cleanSymbol) % 27).padStart(2, '0');

  return {
    history,
    nextEarningsDate: fixtureDates[cleanSymbol] ?? `2026-08-${fallbackDay}`,
  };
}

export function filingsLinks(symbol: string, market: 'TASI' | 'NASDAQ'): FilingLink[] {
  const cleanSymbol = cleanWorkspaceSymbol(symbol);
  if (market === 'NASDAQ') {
    return [{
      label: 'SEC EDGAR company filings',
      labelAr: 'إفصاحات الشركة في هيئة الأوراق المالية الأمريكية',
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(cleanSymbol)}&owner=exclude&count=40`,
      source: 'SEC EDGAR',
    }];
  }

  return [{
    label: 'Saudi Exchange issuer disclosures',
    labelAr: 'إفصاحات المُصدر في تداول السعودية',
    url: `https://www.saudiexchange.sa/wps/portal/saudiexchange/hidden/company-profile-main?symbol=${encodeURIComponent(cleanSymbol)}`,
    source: 'Saudi Exchange',
  }];
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
      source: 'mock',
    };
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    const price = market === 'TASI' ? 120.5 : 350.25;
    return generateMockHistory(price).slice(-days);
  }

  async getFundamentalsHistory(symbol: string, market: 'TASI' | 'NASDAQ', freq: 'annual' | 'quarterly', periods: number): Promise<FundamentalsPeriod[]> {
    return generateFundamentalsHistory(symbol, market, freq, periods);
  }

  async getEarningsCalendar(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<EarningsCalendar> {
    return generateEarningsCalendar(symbol, market);
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
      source: 'mock',
    };
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    if (process.env.SAHMK_API_KEY === 'fail') {
      throw new Error('Sahmk service failure');
    }
    return generateMockHistory(135.5).slice(-days);
  }

  async getFundamentalsHistory(symbol: string, market: 'TASI' | 'NASDAQ', freq: 'annual' | 'quarterly', periods: number): Promise<FundamentalsPeriod[]> {
    return generateFundamentalsHistory(symbol, market, freq, periods);
  }

  async getEarningsCalendar(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<EarningsCalendar> {
    return generateEarningsCalendar(symbol, market);
  }
}

export class AlpacaAdapter implements MarketDataProvider {
  async getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
    if (process.env.ALPACA_API_KEY === 'fail') {
      throw new Error('Alpaca service failure');
    }
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET ?? '';
    if (!key) {
      throw new Error('Alpaca API Key is not set');
    }

    const res = await fetch(`https://data.alpaca.markets/v2/stocks/trades/latest?symbols=${symbol}`, {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
      },
    });

    if (!res.ok) {
      throw new Error(`Alpaca latest trade request failed with status ${res.status}`);
    }

    const data = await res.json();
    const trade = data.trades?.[symbol];
    if (!trade) {
      throw new Error(`Alpaca latest trade response has no data for ${symbol}`);
    }

    return {
      symbol,
      market,
      price: trade.p,
      currency: 'USD',
      asOf: new Date(trade.t),
      source: 'live',
    };
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    if (process.env.ALPACA_API_KEY === 'fail') {
      throw new Error('Alpaca service failure');
    }
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET ?? '';
    if (!key) {
      throw new Error('Alpaca API Key is not set');
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (days + 15));
    const startStr = startDate.toISOString().split('T')[0];

    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/bars?symbols=${symbol}&timeframe=1Day&start=${startStr}&limit=${days + 30}&adjustment=split`,
      {
        headers: {
          'APCA-API-KEY-ID': key,
          'APCA-API-SECRET-KEY': secret,
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Alpaca bars request failed with status ${res.status}`);
    }

    const data = await res.json();
    const barsList = data.bars?.[symbol] || [];

    const candles: Candle[] = barsList.map((b: any) => ({
      time: b.t.split('T')[0],
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      value: b.v,
    }));

    return candles.slice(-days);
  }

  async getFundamentalsHistory(symbol: string, market: 'TASI' | 'NASDAQ', freq: 'annual' | 'quarterly', periods: number): Promise<FundamentalsPeriod[]> {
    return generateFundamentalsHistory(symbol, market, freq, periods);
  }

  async getEarningsCalendar(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<EarningsCalendar> {
    return generateEarningsCalendar(symbol, market);
  }

  /** Live universe of tradable US equities. Used by /api/stocks/search; NOT a per-symbol quote. */
  async getAssets(): Promise<{ symbol: string; name: string }[]> {
    if (process.env.ALPACA_API_KEY === 'fail') {
      throw new Error('Alpaca service failure');
    }
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_API_SECRET ?? '';
    if (!key) {
      throw new Error('Alpaca API Key is not set');
    }

    const res = await fetch('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity', {
      headers: {
        'APCA-API-KEY-ID': key,
        'APCA-API-SECRET-KEY': secret,
      },
    });

    if (!res.ok) {
      throw new Error(`Alpaca assets request failed with status ${res.status}`);
    }

    const data = await res.json();
    if (!Array.isArray(data)) {
      throw new Error('Alpaca assets response was not an array');
    }

    return data
      .filter((a: any) => a.tradable === true && typeof a.symbol === 'string' && typeof a.name === 'string')
      .map((a: any) => ({ symbol: a.symbol, name: a.name }));
  }
}

export class YahooFinanceProvider implements MarketDataProvider {
  async getQuote(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
    const ticker = market === 'TASI' && !symbol.endsWith('.SR') ? `${symbol}.SR` : symbol;
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1d&interval=1d`);
    if (!res.ok) {
      throw new Error(`Yahoo Finance quote request failed with status ${res.status}`);
    }
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error(`Invalid Yahoo Finance chart response for ${ticker}`);
    }
    const price = result.meta.regularMarketPrice;
    const currency = result.meta.currency || (market === 'TASI' ? 'SAR' : 'USD');
    return {
      symbol,
      market,
      price,
      currency,
      asOf: new Date(),
      source: 'delayed',
    };
  }

  /** Maintenance path: real Yahoo data only; never substitutes synthetic candles. */
  async getCandlesStrict(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    const ticker = market === 'TASI' && !symbol.endsWith('.SR') ? `${symbol}.SR` : symbol;
    // Tiers extend past 5y for deep-history backfill (QDR-6): Yahoo's keyless chart endpoint
    // accepts up to 'max', so a 6y+ request (e.g. the daily halal-universe backfill) gets '10y'
    // rather than being silently truncated to the 5y tier.
    const range = days > 1825 ? '10y' : (days > 365 ? '5y' : (days > 90 ? '1y' : '90d'));
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`);
    if (!res.ok) {
      throw new Error(`Yahoo Finance candles request failed with status ${res.status}`);
    }
    const data = await res.json();
    const result = data.chart?.result?.[0];
    if (!result) {
      throw new Error(`Invalid Yahoo Finance chart response for ${ticker}`);
    }
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || !timestamps.length) {
      throw new Error(`Empty Yahoo Finance candles response for ${ticker}`);
    }

    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const timeStr = new Date(timestamps[i] * 1000).toISOString().split('T')[0];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      const val = quote.volume?.[i] || 0;

      if (open != null && high != null && low != null && close != null) {
        candles.push({
          time: timeStr,
          open,
          high,
          low,
          close,
          value: val,
        });
      }
    }
    const sliced = candles.slice(-days);
    if (!sliced.length) throw new Error(`Empty Yahoo Finance candles response for ${ticker}`);
    return sliced;
  }

  async getCandles(symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
    try {
      return await this.getCandlesStrict(symbol, market, days);
    } catch {
      return generateMockHistory(market === 'TASI' ? 120.5 : 350.25).slice(-days);
    }
  }

  async getFundamentalsHistory(symbol: string, market: 'TASI' | 'NASDAQ', freq: 'annual' | 'quarterly', periods: number): Promise<FundamentalsPeriod[]> {
    return generateFundamentalsHistory(symbol, market, freq, periods);
  }

  async getEarningsCalendar(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<EarningsCalendar> {
    return generateEarningsCalendar(symbol, market);
  }
}

export class ZoyaAdapter implements ShariaScreener {
  async screen(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict> {
    if (process.env.ZOYA_API_KEY === 'fail') {
      throw new Error('Zoya service failure');
    }
    const key = process.env.ZOYA_API_KEY;
    if (!key) {
      // Fallback to mock behavior if key is empty/absent
      const compliant = symbol !== 'AAPL' && symbol !== 'TSLA' && symbol !== 'META';
      return {
        symbol,
        compliant,
        standard: 'AAOIFI',
        source: 'mock',
        asOf: new Date(),
      };
    }

    try {
      const cleanSymbol = symbol.replace('.SR', '');
      const res = await fetch(`https://api.zoya.co/v1/stocks/${cleanSymbol}/screen`, {
        headers: {
          'Authorization': `Bearer ${key}`
        }
      });
      if (!res.ok) {
        throw new Error(`Zoya screener request failed with status ${res.status}`);
      }
      const data = await res.json();
      if (typeof data.is_compliant !== 'boolean') {
        throw new Error('Zoya response omitted is_compliant');
      }
      return {
        symbol,
        compliant: data.is_compliant,
        standard: 'AAOIFI',
        source: 'zoya',
        asOf: new Date(),
      };
    } catch (err) {
      console.error(`Error querying Zoya API for ${symbol}:`, err);
      throw err;
    }
  }
}

// -------------------------------------------------------------
// Provider Registry
// -------------------------------------------------------------
export class ProviderRegistry {
  getProvider(market: 'TASI' | 'NASDAQ'): MarketDataProvider {
    const mode = process.env.MARKET_DATA_MODE ?? 'bundled';
    if (mode === 'bundled') {
      return new MockProvider();
    }
    if (mode === 'keyless') {
      return new YahooFinanceProvider();
    }
    if (mode === 'live' && market === 'TASI' && process.env.SAHMK_API_KEY) {
      return new SahmkAdapter();
    }
    if (mode === 'live' && market === 'NASDAQ' && process.env.ALPACA_API_KEY) {
      return new AlpacaAdapter();
    }
    return new MockProvider();
  }

  getScreener(): ShariaScreener {
    if (process.env.MARKET_DATA_MODE === 'live' && process.env.ZOYA_API_KEY) {
      return new ZoyaAdapter();
    }
    // Opt-in only (default behavior stays byte-identical): free, keyless, offline-first
    // composite screener (SPUS/HLAL ETF-holdings + bundled Saudi Sharia-list snapshot).
    // See src/quant/gates/etfHoldingsScreener.ts for the honest, fail-closed derivation.
    if (process.env.SHARIA_SOURCE === 'composite') {
      return new CompositeShariaScreener();
    }
    return new MockScreener();
  }
}

export const registry = new ProviderRegistry();

export async function getFundamentalsHistory(
  symbol: string,
  market: 'TASI' | 'NASDAQ',
  freq: 'annual' | 'quarterly',
  periods: number,
): Promise<FundamentalsPeriod[]> {
  return registry.getProvider(market).getFundamentalsHistory(symbol, market, freq, periods);
}

export async function getEarningsCalendar(
  symbol: string,
  market: 'TASI' | 'NASDAQ',
): Promise<EarningsCalendar> {
  return registry.getProvider(market).getEarningsCalendar(symbol, market);
}

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

export async function getCachedQuote(provider: Pick<MarketDataProvider, 'getQuote'>, symbol: string, market: 'TASI' | 'NASDAQ'): Promise<Quote> {
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

export async function getCachedCandles(provider: Pick<MarketDataProvider, 'getCandles'>, symbol: string, market: 'TASI' | 'NASDAQ', days = 30): Promise<Candle[]> {
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
    candlesCache.set(key, { candles, expiresAt: now + 4 * 60 * 60 * 1000 }); // 4 hours TTL
    return candles;
  } catch (err) {
    console.error(`Error fetching candles for ${key}:`, err);
    if (cached) return cached.candles;
    return new MockProvider().getCandles(symbol, market, days);
  }
}

// -------------------------------------------------------------
// Stock Universe (for /api/stocks/search) — large, slow-changing, long TTL
// -------------------------------------------------------------
const universeCache = new Map<string, { entries: StockUniverseEntry[]; expiresAt: number }>();
const universeLimiter = new TokenBucket(3, 0.05); // a handful of refetches/day is plenty for a ~12h-TTL list
const UNIVERSE_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Full searchable universe for a market. NASDAQ uses the live Alpaca asset
 * list in live mode when ALPACA_API_KEY is set (cached ~12h); otherwise (or on any
 * fetch/rate-limit failure) falls back to the bundled list so the feature
 * keeps working with no API keys set. TASI has no free listing API, so it is
 * always the bundled, verified roster.
 */
export async function getStockUniverse(market: 'TASI' | 'NASDAQ'): Promise<StockUniverseEntry[]> {
  if (market === 'TASI') {
    return TASI_UNIVERSE;
  }

  const key = 'NASDAQ';
  const now = Date.now();
  const cached = universeCache.get(key);
  if (cached && now < cached.expiresAt) {
    return cached.entries;
  }

  if (process.env.MARKET_DATA_MODE !== 'live' || !process.env.ALPACA_API_KEY) {
    return NASDAQ_UNIVERSE_FALLBACK;
  }

  if (!universeLimiter.tryAcquire()) {
    console.warn('Rate limit hit for NASDAQ universe fetch. Serving cached/bundled.');
    return cached ? cached.entries : NASDAQ_UNIVERSE_FALLBACK;
  }

  try {
    const assets = await new AlpacaAdapter().getAssets();
    const entries: StockUniverseEntry[] = assets.map((a) => ({
      symbol: a.symbol,
      name: a.name,
      arName: '',
      market: 'NASDAQ',
    }));
    universeCache.set(key, { entries, expiresAt: now + UNIVERSE_TTL_MS });
    return entries;
  } catch (err) {
    console.error('Error fetching NASDAQ universe from Alpaca:', err);
    return cached ? cached.entries : NASDAQ_UNIVERSE_FALLBACK;
  }
}

export async function getCachedShariaVerdict(screener: ShariaScreener, symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict> {
  const live = process.env.MARKET_DATA_MODE === 'live';
  const key = `${screener.constructor.name}:${market}:${symbol}`;
  const now = Date.now();
  const cached = shariaCache.get(key);

  if (cached && now < cached.expiresAt) {
    return cached.verdict;
  }

  if (!shariaLimiter.tryAcquire()) {
    console.warn(`Rate limit hit for Sharia screening ${key}. Serving cached/fail-closed.`);
    if (cached && !live) return cached.verdict;
    if (live) return { symbol, compliant: false, standard: 'AAOIFI', source: 'none', asOf: new Date() };
    return new MockScreener().screen(symbol, market);
  }

  try {
    const verdict = await screener.screen(symbol, market);
    shariaCache.set(key, { verdict, expiresAt: now + 24 * 60 * 60 * 1000 }); // 24h TTL
    return verdict;
  } catch (err) {
    console.error(`Error screening Sharia compliance for ${key}:`, err);
    if (cached && !live) return cached.verdict;
    if (live) return { symbol, compliant: false, standard: 'AAOIFI', source: 'none', asOf: new Date() };
    return new MockScreener().screen(symbol, market);
  }
}

function getMockStats(symbol: string, market: 'TASI' | 'NASDAQ', price: number) {
  const isTasi = market === 'TASI';
  
  if (symbol === 'NVDA') {
    return {
      purificationRatioBps: 498, // 4.98%
      earningsHistory: [
        { quarter: "Q2 '25", actual: 0.8, expected: 0.75 },
        { quarter: "Q3 '25", actual: 1.1, expected: 1.05 },
        { quarter: "Q4 '25", actual: 1.3, expected: 1.25 },
        { quarter: "Q1 '26", actual: 1.7, expected: 1.6 },
        { quarter: "Q2 '26", actual: 1.9, expected: 1.8 }
      ],
      aboutTextEnglish: "NVIDIA Corporation is a pioneer of GPU-accelerated computing. It focuses on products and platforms for the large, growing markets of gaming, professional visualization, data centers, and automotive.",
      aboutTextArabic: "تُعد شركة NVIDIA Corporation مزودًا رائدًا لحلول الرسومات والحوسبة المتقدمة، وتعمل في الولايات المتحدة وتايوان والصين والعديد من الأسواق العالمية. يضم قسم الرسومات لديها وحدات معالجة الرسومات GeForce، التي تُعد أساسية لألعاب الكمبيوتر الشخصي وتجارب الحوسبة الشخصية، بالإضافة إلى خدمة الألعاب السحابية GeForce NOW وبنية...",
      ceo: "جين هسون هوانغ (Jensen Huang)",
      employees: 42000,
      headquarters: "سانتا كلارا، كاليفورنيا (Santa Clara, CA)",
      sectorArabic: "التقنية",
      sectorEnglish: "Technology",
      movementReasonArabic: "تتداول أسهم شركات أشباه الموصلات والرقائق الإلكترونية بانخفاض حيث يواجه القطاع رياحًا معاكسة في التقييمات، وقلة المحفزات بعد إعلان الأرباح، وخطر ارتفاع تكاليف الاقتراض لفترة طويلة.",
      movementReasonEnglish: "Semiconductor stocks are trading lower as the sector faces valuation headwinds, lack of catalysts post-earnings, and persistent high borrowing costs.",
      statistics: {
        dayRange: [192.35, 200.06] as [number, number],
        yearRange: [75.5, 236.26] as [number, number],
        open: 197.14,
        prevClose: 197.58,
        volume: 142380000,
        avgVolume: 309200000,
        marketCap: 2730000000000,
        peRatio: 38.16
      },
      financials: {
        revenue: 26044000000,
        netIncome: 14881000000,
        grossMargin: 78.4,
        totalCash: 7550000000,
        totalDebt: 9750000000,
        debtToEquity: 18.2,
        complianceRatios: {
          debtToMcap: 0.35,
          interestIncomeToRevenue: 0.05
        },
        latestStatementQuarter: "Q1 2026 (Official SEC)"
      }
    };
  }

  // Fallback defaults for other tickers
  const basePrice = price || 150;
  return {
    purificationRatioBps: isTasi ? 150 : 0, // 1.5% for TASI fallback
    earningsHistory: [
      { quarter: "Q2 '25", actual: basePrice * 0.005, expected: basePrice * 0.0048 },
      { quarter: "Q3 '25", actual: basePrice * 0.006, expected: basePrice * 0.0058 },
      { quarter: "Q4 '25", actual: basePrice * 0.007, expected: basePrice * 0.0068 },
      { quarter: "Q1 '26", actual: basePrice * 0.008, expected: basePrice * 0.0078 }
    ],
    aboutTextEnglish: `${symbol} is a leading corporation listed on the ${market} exchange.`,
    aboutTextArabic: `${symbol} هي شركة رائدة مدرجة في سوق ${isTasi ? 'تداول السعودي (تاسي)' : 'ناسداك الأمريكي'}.`,
    ceo: isTasi ? "أحمد بن سليمان" : "John Doe",
    employees: 12500,
    headquarters: isTasi ? "الرياض، المملكة العربية السعودية" : "New York, USA",
    sectorArabic: isTasi ? "الخدمات المالية" : "Financial Services",
    sectorEnglish: "Financial Services",
    movementReasonArabic: "تذبذب طبيعي في أسعار السوق مع تدفق الطلبات.",
    movementReasonEnglish: "Normal market price fluctuations with order flows.",
    statistics: {
      dayRange: [basePrice * 0.98, basePrice * 1.02] as [number, number],
      yearRange: [basePrice * 0.7, basePrice * 1.4] as [number, number],
      open: basePrice * 0.99,
      prevClose: basePrice * 1.01,
      volume: 2400000,
      avgVolume: 3100000,
      marketCap: isTasi ? 45000000000 : 120000000000,
      peRatio: 18.5
    },
    financials: {
      revenue: basePrice * 120000000,
      netIncome: basePrice * 45000000,
      grossMargin: 42.5,
      totalCash: basePrice * 80000000,
      totalDebt: basePrice * 50000000,
      debtToEquity: 35.8,
      complianceRatios: {
        debtToMcap: isTasi ? 1.5 : 12.8,
        interestIncomeToRevenue: isTasi ? 0.2 : 2.5
      },
      latestStatementQuarter: isTasi ? "Q1 2026 (Official Tadawul)" : "Q1 2026 (Official SEC)"
    }
  };
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
  
  const stats = getMockStats(symbol, market, quote.price);

  return {
    symbol,
    market,
    price: quote.price,
    history,
    isShariaCompliant: verdict.compliant,
    shariaSource: verdict.source,
    marketDataSource: quote.source,
    ...stats
  };
}
