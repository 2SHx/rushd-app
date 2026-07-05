import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { fetchMarketData } from '../../src/services/marketData';

const server = new McpServer({ name: 'rushd-market', version: '0.1.0' });

const marketSchema = {
  symbol: z.string().min(1).describe('Ticker. TASI symbols are numeric ("2222" = Aramco); NASDAQ symbols are alphabetic ("AAPL", "TSLA").'),
  market: z.enum(['TASI', 'NASDAQ']).describe('Exchange the symbol trades on. TASI prices in SAR, NASDAQ in USD.'),
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

server.tool(
  'get_quote',
  'Latest price for a symbol. Returns {symbol, market, price, currency, isShariaCompliant}. Currency is SAR for TASI, USD for NASDAQ. Mock data until SAHMK_API_KEY (TASI) or ALPACA_API_KEY (NASDAQ) is set.',
  marketSchema,
  async ({ symbol, market }) => {
    try {
      const data = await fetchMarketData(symbol, market);
      const currency = market === 'TASI' ? 'SAR' : 'USD';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            symbol: data.symbol,
            market: data.market,
            price: round2(data.price),
            currency,
            isShariaCompliant: data.isShariaCompliant,
          }),
        }],
      };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `get_quote failed: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  'get_candles',
  'Daily OHLC candle history for a symbol, most recent last. Returns {symbol, market, candles: [{time, open, high, low, close}]} with prices rounded to 2 decimal places. Mock data until SAHMK_API_KEY (TASI) or ALPACA_API_KEY (NASDAQ) is set.',
  {
    ...marketSchema,
    days: z.number().int().min(1).max(60).optional().describe('Number of most recent daily candles to return, 1-60. Defaults to 30.'),
  },
  async ({ symbol, market, days }) => {
    try {
      const n = days ?? 30;
      const data = await fetchMarketData(symbol, market);
      const candles = data.history.slice(-n).map((c) => ({
        time: c.time,
        open: round2(c.open),
        high: round2(c.high),
        low: round2(c.low),
        close: round2(c.close),
      }));
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ symbol: data.symbol, market: data.market, candles }),
        }],
      };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `get_candles failed: ${(e as Error).message}` }] };
    }
  },
);

server.tool(
  'check_sharia_compliance',
  'AAOIFI-style Sharia compliance screening for a symbol. Returns {symbol, compliant, standard, note}. Uses a mock screening rule until ZOYA_API_KEY is set for live Zoya integration.',
  marketSchema,
  async ({ symbol, market }) => {
    try {
      const data = await fetchMarketData(symbol, market);
      const note = process.env.ZOYA_API_KEY
        ? 'Screened via live Zoya integration.'
        : 'Mock screening only — Zoya integration pending until ZOYA_API_KEY is set.';
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            symbol: data.symbol,
            compliant: data.isShariaCompliant,
            standard: 'AAOIFI (mock screening)',
            note,
          }),
        }],
      };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `check_sharia_compliance failed: ${(e as Error).message}` }] };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('rushd-market MCP server running on stdio');
}

main().catch((e) => {
  console.error('rushd-market MCP server failed to start', e);
  process.exit(1);
});
