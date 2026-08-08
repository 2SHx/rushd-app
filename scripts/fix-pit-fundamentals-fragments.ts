// scripts/fix-pit-fundamentals-fragments.ts — ONE-TIME correction pass for the quarter-fragment
// and cross-tag-preference defects fixed in src/quant/data/pitFundamentalsBackfill.ts (see that
// file's header for the corrected PIT contract). `writePitFundamentals`'s createMany+skipDuplicates
// is insert-only by design (docs/PORTFOLIO_BUILD.md follow-up), so it cannot itself remove or
// correct an already-persisted row — this script bridges that gap for the specific bug fix, by
// recomputing the CORRECT filing history straight from live SEC data (the same pure, offline-
// tested `selectAnnualFundamentalsHistory`) and deleting ONLY the rows that the corrected logic
// no longer produces, or that the corrected logic would produce with DIFFERENT content (a
// cross-tag mis-attribution). Nothing is ever fabricated: a row survives only if the freshly
// recomputed history still contains it with matching content, or is deleted and immediately
// eligible for a clean re-insert on the same run.
//
//   npx tsx scripts/fix-pit-fundamentals-fragments.ts [--delay-ms=300] [--dry-run]
import { PrismaClient, type Fundamentals } from '@prisma/client';
import { loadTickerToCik, fetchPitFundamentalsHistory } from '../src/quant/data/pitFundamentalsFetch';
import { writePitFundamentals } from '../src/quant/data/pitFundamentalsIngest';
import type { PitFundamentalsFiling } from '../src/quant/data/pitFundamentalsBackfill';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}
const dryRun = process.argv.includes('--dry-run');
const delayMs = Number.parseInt(arg('delay-ms') ?? '300', 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const METRIC_FIELDS = [
  'sic', 'interestBearingDebtUsd', 'cashAndInterestSecuritiesUsd', 'nonCompliantIncomeUsd', 'totalRevenueUsd', 'form', 'notes',
] as const;

async function main() {
  const cliSymbols = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const distinct = await prisma.fundamentals.findMany({ select: { symbol: true }, distinct: ['symbol'] });
  const symbols = cliSymbols.length ? cliSymbols : distinct.map((r) => r.symbol).sort();
  console.log(`Fragment/cross-tag correction pass over ${symbols.length} symbols already in Fundamentals${dryRun ? ' [DRY RUN]' : ''}`);

  const tickerMap = await loadTickerToCik();

  let deletedFragment = 0;
  let deletedMisattributed = 0;
  let kept = 0;
  let unverifiedSymbols = 0;
  const idsToDelete: string[] = [];
  const allCorrectFilings: PitFundamentalsFiling[] = [];

  for (const symbol of symbols) {
    const cik = tickerMap.get(symbol.toUpperCase());
    const existing: Fundamentals[] = await prisma.fundamentals.findMany({ where: { symbol } });

    if (!cik) {
      // No ground truth to recompute against — never delete blind. Leave untouched, flag it.
      unverifiedSymbols++;
      console.log(`  ${symbol}: SKIP no_cik — ${existing.length} existing row(s) left untouched (unverified)`);
      continue;
    }

    const { filings } = await fetchPitFundamentalsHistory(symbol, cik);
    allCorrectFilings.push(...filings);
    const correctByAsOf = new Map(filings.map((f) => [f.asOf, f]));

    let symFrag = 0;
    let symMis = 0;
    for (const row of existing) {
      const asOf = isoDay(row.asOf);
      const correct = correctByAsOf.get(asOf);
      if (!correct) {
        idsToDelete.push(row.id);
        symFrag++;
        continue;
      }
      const releasedMatches = isoDay(row.releasedAt) === correct.releasedAt;
      // Field-by-field, NOT JSON.stringify: Postgres jsonb does not preserve our object literal's
      // key insertion order (confirmed empirically), so a raw string compare produces false
      // positives on every row even when every field value is identical.
      const rm = row.metrics as Record<string, unknown>;
      const cm = correct.metrics as unknown as Record<string, unknown>;
      const metricsMatch = METRIC_FIELDS.every((k) => JSON.stringify(rm[k]) === JSON.stringify(cm[k]));
      if (!releasedMatches || !metricsMatch) {
        idsToDelete.push(row.id);
        symMis++;
        continue;
      }
      kept++;
    }
    deletedFragment += symFrag;
    deletedMisattributed += symMis;
    if (symFrag || symMis) {
      console.log(`  ${symbol}: existing=${existing.length} correct=${filings.length} delete_fragment=${symFrag} delete_misattributed=${symMis}`);
    }
    await sleep(delayMs);
  }

  console.log('\n=== Diagnosis ===');
  console.log(`Rows to delete as FRAGMENT (asOf no longer in corrected annual history): ${deletedFragment}`);
  console.log(`Rows to delete as MISATTRIBUTED (correct asOf but wrong releasedAt/metrics — cross-tag bug): ${deletedMisattributed}`);
  console.log(`Rows kept as-is (already correct): ${kept}`);
  console.log(`Symbols left untouched (no CIK resolved, unverified): ${unverifiedSymbols}`);
  console.log(`Total rows marked for deletion: ${idsToDelete.length}`);

  if (dryRun) {
    console.log('\n[DRY RUN] No writes performed.');
    return;
  }

  if (idsToDelete.length) {
    const del = await prisma.fundamentals.deleteMany({ where: { id: { in: idsToDelete } } });
    console.log(`Deleted ${del.count} row(s).`);
  }

  const write = await writePitFundamentals(prisma, allCorrectFilings);
  console.log(`Re-insert pass: attempted=${write.attempted} inserted=${write.inserted} (skipDuplicates against unchanged correct rows)`);
}

main()
  .catch((e) => {
    console.error('✗ fix-pit-fundamentals-fragments failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
