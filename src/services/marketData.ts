export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  value?: number;
}

export interface MarketData {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  price: number;
  history: Candle[];
  isShariaCompliant: boolean;
}

function generateMockHistory(basePrice: number): Candle[] {
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

export async function fetchMarketData(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<MarketData> {
  const isTasi = market === 'TASI';
  let price = isTasi ? 120.5 : 350.25;
  let isShariaCompliant = true;
  let history: Candle[] = [];

  try {
    if (isTasi && process.env.SAHMK_API_KEY) {
      // Placeholder for actual SAHMK API fetch
      history = generateMockHistory(price);
    } else if (!isTasi && process.env.ALPACA_API_KEY) {
      // Placeholder for actual Alpaca API fetch
      history = generateMockHistory(price);
    } else {
      history = generateMockHistory(price);
    }
    
    if (process.env.ZOYA_API_KEY) {
       // Placeholder for Zoya AAOIFI compliance check
    } else {
       // Mock AAOIFI rules
       if (symbol === 'TSLA' || symbol === 'META') isShariaCompliant = false;
    }
  } catch (error) {
    console.error("Error fetching market data", error);
    history = generateMockHistory(price);
  }

  if (history.length === 0) history = generateMockHistory(price);
  price = history[history.length - 1].close;

  return {
    symbol,
    market,
    price,
    history,
    isShariaCompliant
  };
}
