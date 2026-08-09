// scripts/backfill-form25-delisting.ts — real SEC EDGAR Form 25 / 25-NSE delisting-lifecycle
// backfill for the halal NASDAQ universe (buildVerifiedUniverse()). Keyless: SEC EDGAR needs only
// a descriptive User-Agent (see tier2XbrlFetch.ts SEC_HEADERS). Rate-limited well under SEC's
// documented <=10 req/s ceiling: 1 base request per symbol (submissions.json) plus 1 extra request
// per older paginated `files[]` page (rare — only long-lived filers), with a fixed delay between
// symbols. This is a REPORTING run only: it prints real counts to stdout. It does NOT write to any
// database and does NOT wire into pointInTimeMembership.ts/spusNport.ts — that persistence/wiring
// design is a separate, later dispatch (see src/quant/data/pitDelistingLifecycle.ts file header
// for the coverage finding that dispatch must respect: delisted-only, never suspended).
//
//   npx tsx scripts/backfill-form25-delisting.ts [--delay-ms=300] [SYMBOL ...]
import { buildVerifiedUniverse } from '../src/quant/universe/buildVerifiedUniverse';
import { loadTickerToCik, fetchForm25History } from '../src/quant/data/pitDelistingFetch';
import { isConfirmedNasdaqCommonStockDelisting, resolveDelistingLifecycle } from '../src/quant/data/pitDelistingLifecycle';

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const delayMs = Number.parseInt(arg('delay-ms') ?? '300', 10);
  const cliSymbols = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const symbols = cliSymbols.length ? cliSymbols : buildVerifiedUniverse().entries.map((e) => e.symbol);

  console.log(`Form 25 delisting-lifecycle backfill: ${symbols.length} symbol(s), source=SEC EDGAR submissions, keyless`);

  const tickerMap = await loadTickerToCik();
  console.log(`Resolved SEC ticker->CIK map: ${tickerMap.size} entries`);

  const asOfIso = todayIso();
  let symbolsWithCik = 0;
  let symbolsWithoutCik = 0;
  let symbolsCoverageComplete = 0;
  let symbolsCoverageIncomplete = 0;
  let symbolsWithAnyForm25 = 0;
  let totalForm25Filings = 0;
  let totalQualifyingNasdaqCommonStockFilings = 0;
  let delistedCount = 0;
  let pendingNotYetEffectiveCount = 0;
  let observedFromMin: string | null = null;
  let observedToMax: string | null = null;
  const incompleteSymbols: string[] = [];
  const delistedSymbols: string[] = [];

  for (const symbol of symbols) {
    const cik = tickerMap.get(symbol.toUpperCase());
    if (!cik) {
      symbolsWithoutCik += 1;
      console.log(`  ${symbol}: SKIP no_cik`);
      await sleep(delayMs);
      continue;
    }
    symbolsWithCik += 1;

    const { filings, coverage } = await fetchForm25History(symbol, cik);
    totalForm25Filings += filings.length;
    if (filings.length > 0) symbolsWithAnyForm25 += 1;
    if (coverage.complete) symbolsCoverageComplete += 1;
    else {
      symbolsCoverageIncomplete += 1;
      incompleteSymbols.push(`${symbol}(${coverage.incompleteReason})`);
    }
    if (coverage.observedFrom && (observedFromMin === null || coverage.observedFrom < observedFromMin)) {
      observedFromMin = coverage.observedFrom;
    }
    if (coverage.observedTo && (observedToMax === null || coverage.observedTo > observedToMax)) {
      observedToMax = coverage.observedTo;
    }

    const resolved = resolveDelistingLifecycle(symbol, filings, coverage, asOfIso);
    if (resolved.lifecycle === 'DELISTED') {
      delistedCount += 1;
      delistedSymbols.push(symbol);
    }
    if (resolved.reasonCode === 'delisting_filed_not_yet_effective') pendingNotYetEffectiveCount += 1;

    console.log(
      `  ${symbol}: cik=${cik} form25Filings=${filings.length} coverage=${coverage.complete ? 'complete' : 'INCOMPLETE'}` +
      ` lifecycleToday=${resolved.lifecycle}` +
      (filings.length ? ` (${filings.map((f) => `${f.formType}@${f.filingDate}`).join(', ')})` : ''),
    );

    await sleep(delayMs);
  }

  console.log('\n=== Summary ===');
  console.log(`Symbols processed: ${symbols.length}`);
  console.log(`Symbols with resolved CIK: ${symbolsWithCik} (no CIK: ${symbolsWithoutCik})`);
  console.log(`Symbols with COMPLETE filing-history coverage: ${symbolsCoverageComplete} (incomplete: ${symbolsCoverageIncomplete})`);
  if (incompleteSymbols.length) console.log(`Incomplete-coverage symbols: ${incompleteSymbols.join(', ')}`);
  console.log(`Symbols with >=1 Form 25/25-NSE filing anywhere in history: ${symbolsWithAnyForm25}`);
  console.log(`Total Form 25/25-NSE filings found: ${totalForm25Filings}`);
  console.log(`Observed filing-history date range across all examined symbols: ${observedFromMin ?? 'n/a'} .. ${observedToMax ?? 'n/a'}`);
  console.log(`Symbols resolved DELISTED as of ${asOfIso}: ${delistedCount}${delistedSymbols.length ? ` (${delistedSymbols.join(', ')})` : ''}`);
  console.log(`Symbols with a filing pending effect (announced, 10-day clock running): ${pendingNotYetEffectiveCount}`);
  console.log(
    '\nNote: this universe is buildVerifiedUniverse() — CURRENT SPUS/halal survivors by construction, so a low or zero DELISTED count is expected and does not indicate a defect (see acceptance #5 in the dispatching task).',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
