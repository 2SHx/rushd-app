import { ingestBars } from '../src/quant/data/ingest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Ingesting benchmark data (4 years / 1200 days)...');
  
  const benchmarks = [
    { symbol: 'SPY', market: 'NASDAQ' as const },
    { symbol: 'SPUS', market: 'NASDAQ' as const }
  ];

  for (const b of benchmarks) {
    try {
      console.log(`Ingesting bars for benchmark ${b.symbol} (${b.market})...`);
      const res = await ingestBars(b.symbol, b.market, { days: 1200 });
      console.log(`✓ Successfully ingested ${res.upserted} bars from ${res.source} for ${b.symbol}`);
    } catch (err) {
      console.error(`✗ Failed to ingest benchmark ${b.symbol}:`, err);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
