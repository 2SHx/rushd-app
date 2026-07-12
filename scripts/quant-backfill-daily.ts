// QDR-6 deep-history unlock: BACKWARDS daily backfill for the halal NASDAQ universe.
// Unlike scripts/quant-ingest.ts (forward-only, via ingestBars), this walks each symbol's
// stored history backward using ingestBarsBackfill: keyless Yahoo, ~6 years, real bars only
// (source=YAHOO; never MOCK). Resumable/idempotent — a rerun inserts 0 new rows.
//
//   npx tsx scripts/quant-backfill-daily.ts [--days=2190] [SYMBOL ...]
import { PrismaClient } from '@prisma/client';
import { ingestBarsBackfill, BACKFILL_TARGET_DAYS } from '../src/quant/data/ingest';
import { NASDAQ_HALAL_UNIVERSE } from '../src/quant/strategies/bollingerMrLong';

process.loadEnvFile?.('.env');
process.env.MARKET_DATA_MODE = 'keyless'; // explicit real-but-keyless opt-in for this script
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function main() {
  const requestedDays = Number.parseInt(arg('days') ?? `${BACKFILL_TARGET_DAYS}`, 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : BACKFILL_TARGET_DAYS;

  const cliSymbols = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const symbols = cliSymbols.length ? cliSymbols : [...NASDAQ_HALAL_UNIVERSE];

  console.log(`Backwards daily backfill: ${symbols.length} symbol(s), target ${days} calendar days back, source=YAHOO`);

  let totalInserted = 0;
  let failed = 0;
  for (const symbol of symbols) {
    const before = await prisma.marketBar.count({ where: { symbol, market: 'NASDAQ', interval: 'DAY' } });
    try {
      const result = await ingestBarsBackfill(symbol, 'NASDAQ', { days });
      const after = await prisma.marketBar.count({ where: { symbol, market: 'NASDAQ', interval: 'DAY' } });
      totalInserted += result.inserted;
      console.log(
        `  ${symbol}: ${before} -> ${after} bars (+${result.inserted}); earliest ` +
        `${result.earliestBefore?.toISOString().slice(0, 10) ?? 'none'} -> ${result.earliestAfter?.toISOString().slice(0, 10) ?? 'none'}; source=${result.source}`,
      );
    } catch (err) {
      failed += 1;
      console.warn(`  ${symbol}: FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nSummary: ${totalInserted} new bars inserted across ${symbols.length} symbol(s), ${failed} failed`);
}

main()
  .catch((e) => {
    console.error('✗ backfill failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
