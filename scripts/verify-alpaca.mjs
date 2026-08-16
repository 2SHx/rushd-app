#!/usr/bin/env node
// Read-only Alpaca PAPER preflight. It never submits, cancels, or modifies an order.
// Usage: node scripts/verify-alpaca.mjs
import {
  ALPACA_PAPER_BASE_URL,
  evaluateAlpacaPaperPreflight,
  isExactAlpacaPaperUrl,
} from './paper-preflight.mjs';

process.loadEnvFile?.('.env');

const key = process.env.ALPACA_API_KEY;
const secret = process.env.ALPACA_API_SECRET;
const baseUrl = process.env.ALPACA_BASE_URL || ALPACA_PAPER_BASE_URL;

if (!key || !secret) {
  console.error('✗ ALPACA_API_KEY / ALPACA_API_SECRET not set in .env.');
  console.error('  Get free paper keys at https://alpaca.markets (see docs/ENV.md), then rerun.');
  process.exit(1);
}
if (!isExactAlpacaPaperUrl(baseUrl)) {
  console.error('✗ ALPACA_BASE_URL is not the exact Alpaca paper endpoint. Aborting.');
  process.exit(1);
}

const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
console.log(`→ Credentials loaded | paper base ${baseUrl}`);

async function main() {
  // 1) Paper trading account
  const [acct, positions, openOrders] = await Promise.all([
    fetch(`${baseUrl}/v2/account`, { headers }),
    fetch(`${baseUrl}/v2/positions`, { headers }),
    fetch(`${baseUrl}/v2/orders?status=open&direction=desc&limit=50`, { headers }),
  ]);
  if (!acct.ok || !positions.ok || !openOrders.ok) {
    console.error(`✗ Paper-state read failed: account=${acct.status} positions=${positions.status} orders=${openOrders.status}`);
    console.error('  Double-check the Key/Secret are from a PAPER account.');
    process.exit(1);
  }
  const a = await acct.json();
  const p = await positions.json();
  const o = await openOrders.json();
  const preflight = evaluateAlpacaPaperPreflight({ baseUrl, account: a, positions: p, openOrders: o });
  console.log(
    `→ Paper state — status=${preflight.account.status}, cash=$${preflight.account.cash}, `
      + `buying_power=$${preflight.account.buyingPower}, positions=${preflight.positionCount}, `
      + `open_orders=${preflight.openOrderCount}`,
  );

  // 2) Live market data (a few daily bars for MSFT)
  const bars = await fetch(
    'https://data.alpaca.markets/v2/stocks/bars?symbols=MSFT&timeframe=1Day&limit=3',
    { headers },
  );
  if (!bars.ok) {
    console.error(`✗ Market-data check failed: HTTP ${bars.status} ${await bars.text().catch(() => '')}`);
    console.error('  (Data may need the free market-data subscription enabled on the account.)');
    process.exit(1);
  }
  const b = await bars.json();
  const last = b.bars?.MSFT?.at(-1);
  console.log(last ? `✓ Market data OK — MSFT ${last.t} close $${last.c}` : '✓ Market data reachable (no bars returned)');

  if (!preflight.ready) {
    console.error(`✗ REMOTE PAPER EXECUTION BLOCKED — ${preflight.blockers.join(', ')}`);
    process.exit(2);
  }
  console.log('✓ Remote paper account is clean and eligible for a separately authorized bounded smoke test.');
}

main().catch((e) => {
  console.error('✗ Verification error:', e.message);
  process.exit(1);
});
