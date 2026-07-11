#!/usr/bin/env node
// QDR-6 G1: explicit, resumable Alpaca-IEX minute-bar backfill.
import { ingestIntradayBars, INITIAL_INTRADAY_BACKFILL_DAYS } from '../src/quant/data/intraday';

process.loadEnvFile?.('.env');

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function main() {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    throw new Error('ALPACA_API_KEY/ALPACA_API_SECRET are required for the real-data backfill');
  }
  const symbols = (arg('symbols') ?? 'AAPL,MSFT,NVDA')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z]{1,10}$/.test(symbol));
  const requestedDays = Number.parseInt(arg('days') ?? `${INITIAL_INTRADAY_BACKFILL_DAYS}`, 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0
    ? Math.min(requestedDays, INITIAL_INTRADAY_BACKFILL_DAYS)
    : INITIAL_INTRADAY_BACKFILL_DAYS;

  process.env.MARKET_DATA_MODE = 'live'; // Running this script is the explicit live-data opt-in.
  for (const symbol of symbols) {
    const result = await ingestIntradayBars(symbol, 'NASDAQ', { days });
    console.log(`${symbol}: ${result.created}/${result.requested} new minute bars (${result.tier})`);
  }
}

main().catch((error) => {
  console.error(`Intraday backfill failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
