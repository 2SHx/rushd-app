// Does our own AAOIFI screen actually reproduce a real Shariah index?
//
// Before any strategy is measured on a self-screened universe, the screen itself has to be checked
// against something external — otherwise a permissive screen would quietly hand the book a larger
// candidate set and every result would improve for a reason that has nothing to do with strategy.
//
// THE TEST: SPUS's N-PORT filings state exactly which names the fund held on each report date.
// Comparing our compliant set against that on the same dates gives a direct answer, and it is a
// much sharper test than comparing returns — two different universes can produce similar returns by
// accident, but they cannot produce the same NAMES by accident.
//
// WHAT AGREEMENT WOULD AND WOULD NOT MEAN: perfect agreement is not expected and would be suspicious.
// SPUS tracks S&P 500 Shariah, so it is bounded by S&P 500 membership, which our screen is not; names
// we pass that SPUS lacks are usually just non-S&P-500. The failure that matters is the other
// direction — names SPUS HOLDS that our screen REJECTS. Those are cases where we are stricter than a
// real Shariah index, and each one needs a reason.
import { loadFactsCacheOrExit, compliantUniverseAt, screenBreakdownAt, screenSymbolAt, type PriceLookup } from './pit-sharia-universe';
import { loadCapturedSpusNportSnapshots } from '../src/quant/universe/spusNport';
import { readArchive, listArchivedSymbols } from './backfill-alpaca-sip';

function buildPrices(): { prices: PriceLookup; calendar: string[] } {
  const closes = new Map<string, Map<string, number>>();
  const all = new Set<string>();
  for (const symbol of listArchivedSymbols()) {
    const a = readArchive(symbol);
    if (!a) continue;
    const m = new Map<string, number>();
    for (const b of a.bars) { m.set(b.d, b.c); all.add(b.d); }
    closes.set(symbol, m);
  }
  return {
    prices: { closeAt: (s, d) => closes.get(s)?.get(d) ?? null },
    calendar: Array.from(all).sort(),
  };
}

/** Nearest session on or before `date`, so a weekend report date still resolves to real prices. */
function sessionOnOrBefore(calendar: string[], date: string): string | null {
  let best: string | null = null;
  for (const d of calendar) { if (d <= date) best = d; else break; }
  return best;
}

function main() {
  const archive = loadFactsCacheOrExit();
  const { prices, calendar } = buildPrices();
  const snaps = loadCapturedSpusNportSnapshots() as any[];

  console.log(`facts cache: ${Object.keys(archive.symbols).length} symbols, ${archive.unresolved.length} unresolved\n`);
  console.log('agreement with SPUS actual holdings, by N-PORT report date\n');
  console.log(`${'report date'.padEnd(13)} ${'SPUS held'.padStart(9)} ${'we pass'.padStart(8)} ${'both'.padStart(6)}`
    + ` ${'we reject'.padStart(10)} ${'recall'.padStart(7)}   top rejection reasons on names SPUS held`);
  console.log('-'.repeat(118));

  const rejectionTally = new Map<string, number>();
  let totalHeld = 0; let totalRecalled = 0;

  for (const snap of snaps) {
    const reportDate = (snap.reportDate instanceof Date ? snap.reportDate.toISOString() : String(snap.reportDate)).slice(0, 10);
    const session = sessionOnOrBefore(calendar, reportDate);
    if (!session) continue;

    const spusHeld = new Set<string>((snap.holdings ?? []).map((h: any) => h.symbol).filter(Boolean));
    spusHeld.delete('CASH&OTHER');
    const ours = new Set(compliantUniverseAt(archive, prices, session));
    const both = Array.from(spusHeld).filter((s) => ours.has(s));
    const missed = Array.from(spusHeld).filter((s) => !ours.has(s));

    // Why did we reject names a real Shariah index held? This is the direction that matters.
    const why = new Map<string, number>();
    for (const s of missed) {
      const r = screenSymbolAt(archive, prices, s, session);
      const codes = r ? r.reasonCodes : ['no_filing_or_price'];
      for (const c of codes) {
        why.set(c, (why.get(c) ?? 0) + 1);
        rejectionTally.set(c, (rejectionTally.get(c) ?? 0) + 1);
      }
    }
    totalHeld += spusHeld.size; totalRecalled += both.length;
    const top = Array.from(why.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([c, n]) => `${c}:${n}`).join('  ');
    console.log(`${reportDate.padEnd(13)} ${String(spusHeld.size).padStart(9)} ${String(ours.size).padStart(8)}`
      + ` ${String(both.length).padStart(6)} ${String(missed.length).padStart(10)} ${(both.length / spusHeld.size * 100).toFixed(1).padStart(6)}%   ${top}`);
  }

  console.log(`\noverall recall of SPUS holdings: ${(totalRecalled / totalHeld * 100).toFixed(1)}%`
    + `  (${totalRecalled.toLocaleString()} of ${totalHeld.toLocaleString()} name-dates)`);
  console.log('\nwhy we rejected names SPUS actually held:');
  for (const [code, n] of Array.from(rejectionTally.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(6)}  ${code}`);
  }

  console.log('\nuniverse size and screen breakdown, sampled yearly:');
  console.log(`${'date'.padEnd(13)} ${'compliant'.padStart(10)} ${'no data'.padStart(8)}   leading exclusion reasons`);
  for (const year of ['2016', '2018', '2020', '2022', '2024', '2026']) {
    const session = sessionOnOrBefore(calendar, `${year}-06-30`);
    if (!session) continue;
    const b = screenBreakdownAt(archive, prices, session);
    const top = b.reasons.slice(0, 3).map(([c, n]) => `${c}:${n}`).join('  ');
    console.log(`${session.padEnd(13)} ${String(b.compliant).padStart(10)} ${String(b.noData).padStart(8)}   ${top}`);
  }
}

main();
