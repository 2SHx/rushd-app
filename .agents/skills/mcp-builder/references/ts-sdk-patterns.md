# TypeScript MCP stdio server — skeleton & smoke test

## Dependencies (root devDependencies)

```bash
npm i -D @modelcontextprotocol/sdk tsx
```

## Skeleton (`mcp/<name>/index.ts`)

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'rushd-<name>', version: '0.1.0' });

server.tool(
  'get_quote',
  'Latest price for a symbol. Returns {symbol, market, price, currency, isShariaCompliant}. Mock data until provider API keys are set.',
  {
    symbol: z.string().describe('Ticker. TASI symbols are numeric ("2222" = Aramco); NASDAQ alphabetic ("AAPL").'),
    market: z.enum(['TASI', 'NASDAQ']).describe('Exchange. TASI prices in SAR, NASDAQ in USD.'),
  },
  async ({ symbol, market }) => {
    try {
      const data = await someExistingProjectFunction(symbol, market); // wrap, don't duplicate
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (e) {
      return { isError: true, content: [{ type: 'text', text: `get_quote failed: ${(e as Error).message}` }] };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('rushd-<name> MCP server running on stdio'); // stderr only — stdout is the protocol
```

Notes:
- SDK subpath imports end in `.js` even from TypeScript.
- Top-level await is fine under tsx.
- Importing from `src/` works if the imported module is pure TS (no Next.js/react imports) — `src/services/marketData.ts` qualifies.

## Stdio smoke test (no client needed)

```bash
( printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' \
  '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_quote","arguments":{"symbol":"2222","market":"TASI"}}}' \
  ; sleep 1 ) | npx tsx mcp/<name>/index.ts
```

Pass criteria: response id 1 contains `serverInfo`; id 2 lists exactly your tools; id 3 returns your JSON payload (or a clean `isError` for a bad-input variant). Anything on stdout that isn't JSON-RPC is a bug (a stray `console.log`).
