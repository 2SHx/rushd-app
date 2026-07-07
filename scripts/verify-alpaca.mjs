#!/usr/bin/env node
// Verify the Alpaca PAPER keys in .env work — checks the paper trading account and a
// live market-data bar. Never prints the secret. Usage: node scripts/verify-alpaca.mjs
process.loadEnvFile?.('.env');

const key = process.env.ALPACA_API_KEY;
const secret = process.env.ALPACA_API_SECRET;
const baseUrl = process.env.ALPACA_BASE_URL || 'https://paper-api.alpaca.markets';

if (!key || !secret) {
  console.error('✗ ALPACA_API_KEY / ALPACA_API_SECRET not set in .env.');
  console.error('  Get free paper keys at https://alpaca.markets (see docs/ENV.md), then rerun.');
  process.exit(1);
}
if (baseUrl.includes('api.alpaca.markets') && !baseUrl.includes('paper')) {
  console.error('✗ ALPACA_BASE_URL points at the LIVE endpoint. Unset it for paper. Aborting.');
  process.exit(1);
}

const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
const mask = (s) => (s ? `${s.slice(0, 4)}…(${s.length} chars)` : '(unset)');
console.log(`→ Key ${mask(key)} | paper base ${baseUrl}`);

async function main() {
  // 1) Paper trading account
  const acct = await fetch(`${baseUrl}/v2/account`, { headers });
  if (!acct.ok) {
    console.error(`✗ Account check failed: HTTP ${acct.status} ${await acct.text().catch(() => '')}`);
    console.error('  Double-check the Key/Secret are from a PAPER account.');
    process.exit(1);
  }
  const a = await acct.json();
  console.log(`✓ Paper account OK — status=${a.status}, buying_power=$${a.buying_power}, cash=$${a.cash}`);

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

  console.log('\nAll good. Next: ingest bars then run a committee pass —');
  console.log('  curl -s -X POST localhost:3000/api/cron/quant-ingest -H "Authorization: Bearer $CRON_SECRET"');
}

main().catch((e) => {
  console.error('✗ Verification error:', e.message);
  process.exit(1);
});
