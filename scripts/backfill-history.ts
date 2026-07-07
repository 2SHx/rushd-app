import { ingestBars } from '../src/quant/data/ingest';
import { TICKERS } from '../src/lib/tickers';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Backfilling 4 years (1200 days) of daily bars for all tickers...');
  const allTickers = [
    ...TICKERS.TASI.map(t => ({ ...t, market: 'TASI' as const })),
    ...TICKERS.NASDAQ.map(t => ({ ...t, market: 'NASDAQ' as const }))
  ];

  for (const t of allTickers) {
    try {
      console.log(`Ingesting 1200 bars for ${t.symbol} (${t.market})...`);
      const res = await ingestBars(t.symbol, t.market, { days: 1200 });
      console.log(`Successfully ingested ${res.upserted} bars from ${res.source} for ${t.symbol}`);
    } catch (err) {
      console.error(`Failed to ingest bars for ${t.symbol}:`, err);
    }
  }
  console.log('History backfill completed.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
