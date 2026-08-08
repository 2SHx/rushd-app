// scripts/backfill-pit-fundamentals.ts — one-time/resumable backfill of the `Fundamentals` table
// from real SEC EDGAR companyfacts, for the halal NASDAQ universe (buildVerifiedUniverse()).
// Keyless: SEC EDGAR needs only a descriptive User-Agent. Rate-limited well under SEC's
// documented <=10 req/s ceiling (2 requests per symbol — companyfacts + submissions — with a fixed
// delay between symbols). Idempotent: writePitFundamentals uses createMany+skipDuplicates against
// the [symbol, market, asOf] unique key, so a rerun inserts 0 new rows and never mutates an
// existing one (see src/quant/data/pitFundamentalsIngest.ts).
//
//   npx tsx scripts/backfill-pit-fundamentals.ts [--delay-ms=300] [SYMBOL ...]
import { PrismaClient } from '@prisma/client';
import { buildVerifiedUniverse } from '../src/quant/universe/buildVerifiedUniverse';
import { loadTickerToCik, fetchPitFundamentalsHistory } from '../src/quant/data/pitFundamentalsFetch';
import { writePitFundamentals } from '../src/quant/data/pitFundamentalsIngest';
import type { PitFundamentalsSkip } from '../src/quant/data/pitFundamentalsBackfill';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const delayMs = Number.parseInt(arg('delay-ms') ?? '300', 10); // 2 req/symbol / 0.3s ~= 6.7 req/s
  const cliSymbols = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const symbols = cliSymbols.length ? cliSymbols : buildVerifiedUniverse().entries.map((e) => e.symbol);

  console.log(`PIT fundamentals backfill: ${symbols.length} symbol(s), source=SEC EDGAR companyfacts, keyless`);

  const tickerMap = await loadTickerToCik();
  console.log(`Resolved SEC ticker->CIK map: ${tickerMap.size} entries`);

  const allSkips: PitFundamentalsSkip[] = [];
  const perSymbolFilingCount = new Map<string, number>();
  let totalAttempted = 0;
  let totalInserted = 0;
  let releasedAtMin: string | null = null;
  let releasedAtMax: string | null = null;

  for (const symbol of symbols) {
    const cik = tickerMap.get(symbol.toUpperCase());
    if (!cik) {
      allSkips.push({ symbol, reasonCode: 'no_cik' });
      console.log(`  ${symbol}: SKIP no_cik`);
      await sleep(delayMs);
      continue;
    }

    const { filings, skips } = await fetchPitFundamentalsHistory(symbol, cik);
    allSkips.push(...skips);
    perSymbolFilingCount.set(symbol, filings.length);

    for (const f of filings) {
      if (releasedAtMin === null || f.releasedAt < releasedAtMin) releasedAtMin = f.releasedAt;
      if (releasedAtMax === null || f.releasedAt > releasedAtMax) releasedAtMax = f.releasedAt;
    }

    const write = await writePitFundamentals(prisma, filings);
    totalAttempted += write.attempted;
    totalInserted += write.inserted;

    console.log(
      `  ${symbol}: cik=${cik} filings=${filings.length} inserted=${write.inserted}` +
      (skips.length ? ` skips=${skips.map((s) => s.reasonCode).join(',')}` : ''),
    );

    await sleep(delayMs);
  }

  const symbolsWithFilings = Array.from(perSymbolFilingCount.entries()).filter(([, n]) => n > 0);
  const symbolsWithFourPlus = symbolsWithFilings.filter(([, n]) => n >= 4);
  const symbolsWithZero = symbols.filter((s) => (perSymbolFilingCount.get(s) ?? 0) === 0);

  const reasonTally = new Map<string, number>();
  for (const skip of allSkips) reasonTally.set(skip.reasonCode, (reasonTally.get(skip.reasonCode) ?? 0) + 1);

  console.log('\n=== Summary ===');
  console.log(`Symbols processed: ${symbols.length}`);
  console.log(`Rows attempted: ${totalAttempted}, inserted: ${totalInserted}`);
  console.log(`Distinct symbols with >=1 filing: ${symbolsWithFilings.length}`);
  console.log(`Distinct symbols with >=4 filings: ${symbolsWithFourPlus.length}`);
  console.log(`releasedAt range: ${releasedAtMin ?? 'n/a'} .. ${releasedAtMax ?? 'n/a'}`);
  console.log(`Symbols with ZERO filings: ${symbolsWithZero.length}`);
  console.log(`Skip reason tally: ${JSON.stringify(Object.fromEntries(reasonTally))}`);
  if (symbolsWithZero.length) {
    console.log(`Zero-filing symbols: ${symbolsWithZero.join(', ')}`);
  }
}

main()
  .catch((e) => {
    console.error('✗ backfill-pit-fundamentals failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
