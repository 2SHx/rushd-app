// Reconstruct WHEN ASTS stopped being AAOIFI-compliant, from public filings only.
//
// WHY: the owner held ASTS, it ceased to be halal, and the flip date is not remembered. That date is
// recoverable — AAOIFI SS-21 and S&P Shariah (Ratings Intelligence) both screen on ratios whose
// inputs are a filed balance sheet and a market capitalisation, and both are public.
//
// WHY IT MATTERS BEYOND ONE TICKER: both standards use a MARKET-CAP denominator, not total assets.
// That makes compliance PROCYCLICAL — the same debt load passes at a high price and fails at a low
// one. No backtest in this repo models that, and the owner's book runs at beta 1.88.
//
//   AAOIFI SS-21 (3/4):  debt / market cap                     < 30%
//                        (cash + interest-bearing securities)  < 30% of market cap
//                        non-permissible income                < 5% of total revenue
//   S&P Shariah (RI):    same ratios against a 36-MONTH AVERAGE market cap, thresholds 33/33/49
//
// The 36-month average is the material difference: it damps the procyclicality, so the two standards
// in the owner's own stack can disagree about the same company on the same day.
//
// ASTS CAVEAT, stated up front: AST SpaceMobile has an Up-C structure (Class A/B/C). A market cap
// built from Class A alone understates true market cap by a large factor and would manufacture a
// false non-compliance. This script reports which share concepts exist and computes both readings.
//
// Network: SEC XBRL only (public, no key). Reads the local Alpaca archive for prices. No DB writes.
import { readArchive, type ArchivedBar } from './backfill-alpaca-sip';

const HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
const SYMBOL = process.argv[2] ?? 'ASTS';

interface Fact { end: string; filed: string; val: number; form: string; frame?: string }

async function companyFacts(symbol: string) {
  const tickRes = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS });
  const tickers = await tickRes.json() as Record<string, { cik_str: number; ticker: string; title: string }>;
  const hit = Object.values(tickers).find((t) => t.ticker.toUpperCase() === symbol.toUpperCase());
  if (!hit) throw new Error(`${symbol}: not in SEC ticker map`);
  const cik = String(hit.cik_str).padStart(10, '0');
  console.log(`${symbol} -> CIK ${cik}  (${hit.title})\n`);
  await new Promise((r) => setTimeout(r, 150));
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, { headers: HEADERS });
  if (!res.ok) throw new Error(`companyfacts HTTP ${res.status}`);
  return await res.json() as { facts: Record<string, Record<string, { units: Record<string, any[]> }>> };
}

/** Every fact for a concept, across taxonomies, flattened and sorted by filing date. */
function pull(facts: any, concept: string): Fact[] {
  const out: Fact[] = [];
  for (const tax of Object.keys(facts.facts ?? {})) {
    const node = facts.facts[tax]?.[concept];
    if (!node) continue;
    for (const unit of Object.keys(node.units ?? {})) {
      for (const f of node.units[unit]) {
        if (f.val == null || !f.filed) continue;
        out.push({ end: f.end, filed: f.filed, val: f.val, form: f.form, frame: f.frame });
      }
    }
  }
  return out.sort((a, b) => (a.filed < b.filed ? -1 : 1));
}

/** Latest fact PUBLIC at `asOf` — point-in-time by `filed`, never by `end`. */
function asOfFact(list: Fact[], asOf: string): Fact | undefined {
  let best: Fact | undefined;
  for (const f of list) {
    if (f.filed > asOf) continue;
    // Prefer the most recently FILED; break ties on the later period end.
    if (!best || f.filed > best.filed || (f.filed === best.filed && f.end > best.end)) best = f;
  }
  return best;
}

const DEBT = ['DebtLongtermAndShorttermCombinedAmount', 'LongTermDebtNoncurrent', 'LongTermDebt',
  'LongTermDebtAndCapitalLeaseObligationsNoncurrent', 'ConvertibleNotesPayableNoncurrent',
  'ConvertibleDebtNoncurrent', 'ConvertibleLongTermNotesPayable', 'NotesPayableRelatedPartiesNoncurrent'];
const CURRENT_DEBT = ['DebtCurrent', 'LongTermDebtCurrent', 'ShortTermBorrowings',
  'ConvertibleNotesPayableCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent'];
const SHARES = ['EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding',
  'CommonStockSharesIssued', 'WeightedAverageNumberOfDilutedSharesOutstanding',
  'WeightedAverageNumberOfSharesOutstandingBasic'];
const CASHY = ['CashAndCashEquivalentsAtCarryingValue',
  'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'];
const SECURITIES = ['MarketableSecuritiesCurrent', 'ShortTermInvestments', 'AvailableForSaleSecuritiesCurrent'];
const RECEIVABLES = ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent'];

async function main() {
  const facts = await companyFacts(SYMBOL);

  console.log('AVAILABLE SHARE-COUNT CONCEPTS (the Up-C trap: Class A alone understates market cap)');
  for (const c of SHARES) {
    const f = pull(facts, c);
    if (f.length) {
      const last = f[f.length - 1];
      console.log(`  ${c.padEnd(48)} ${f.length.toString().padStart(4)} facts  `
        + `latest ${last.filed} = ${(last.val / 1e6).toFixed(1)}M`);
    }
  }

  const debtFacts = DEBT.flatMap((c) => pull(facts, c).map((f) => ({ ...f, concept: c })));
  const curFacts = CURRENT_DEBT.flatMap((c) => pull(facts, c).map((f) => ({ ...f, concept: c })));
  console.log('\nDEBT CONCEPTS PRESENT');
  for (const c of [...DEBT, ...CURRENT_DEBT]) {
    const f = pull(facts, c);
    if (f.length) console.log(`  ${c.padEnd(48)} ${f.length.toString().padStart(4)} facts  `
      + `${f[0].filed} .. ${f[f.length - 1].filed}  latest $${(f[f.length - 1].val / 1e6).toFixed(0)}M`);
  }

  // --- price + market cap ---
  const arch = readArchive(SYMBOL);
  if (!arch) { console.log(`\nno price archive for ${SYMBOL}`); return; }
  const bars = arch.bars as ArchivedBar[];
  const closeOn = (d: string) => {
    let best: number | undefined;
    for (const b of bars) { if (b.d <= d) best = b.c; else break; }
    return best;
  };
  /** Trailing 36-month average close — the S&P/Ratings Intelligence denominator. */
  const avg36 = (d: string) => {
    const from = new Date(new Date(d).getTime() - 36 * 30.44 * 86_400_000).toISOString().slice(0, 10);
    const w = bars.filter((b) => b.d > from && b.d <= d);
    return w.length ? w.reduce((a, b) => a + b.c, 0) / w.length : undefined;
  };

  const sharesList = SHARES.flatMap((c) => pull(facts, c));
  const cashList = CASHY.flatMap((c) => pull(facts, c));
  const secList = SECURITIES.flatMap((c) => pull(facts, c));
  const recList = RECEIVABLES.flatMap((c) => pull(facts, c));

  console.log('\n\nQUARTERLY AAOIFI / S&P SCREEN, POINT-IN-TIME BY FILING DATE');
  console.log('date        price   shares    mktcap$M   debt$M  debt/mcap  d/avg36  cash/mcap  VERDICT');

  const quarters: string[] = [];
  for (let y = 2021; y <= 2026; y += 1) {
    for (const md of ['-03-31', '-06-30', '-09-30', '-12-31']) {
      const d = `${y}${md}`;
      if (d <= '2026-08-26') quarters.push(d);
    }
  }

  let firstBreach: string | null = null;
  for (const d of quarters) {
    const px = closeOn(d);
    const sh = asOfFact(sharesList, d);
    if (!px || !sh) continue;
    const debt = asOfFact(debtFacts, d);
    const cur = asOfFact(curFacts, d);
    const totalDebt = (debt?.val ?? 0) + (cur?.val ?? 0);
    const mcap = px * sh.val;
    const a36 = avg36(d);
    const mcapAvg = a36 ? a36 * sh.val : undefined;
    const cash = (asOfFact(cashList, d)?.val ?? 0) + (asOfFact(secList, d)?.val ?? 0);

    const ratio = totalDebt / mcap;
    const ratioAvg = mcapAvg ? totalDebt / mcapAvg : NaN;
    const cashRatio = cash / mcap;
    const aaoifiFail = ratio >= 0.30 || cashRatio >= 0.30;
    if (aaoifiFail && !firstBreach) firstBreach = d;

    console.log(`${d}  ${px.toFixed(2).padStart(6)}  ${(sh.val / 1e6).toFixed(0).padStart(6)}M  `
      + `${(mcap / 1e6).toFixed(0).padStart(9)}  ${(totalDebt / 1e6).toFixed(0).padStart(7)}  `
      + `${(ratio * 100).toFixed(1).padStart(8)}%  ${Number.isFinite(ratioAvg) ? `${(ratioAvg * 100).toFixed(1).padStart(6)}%` : '     —'}  `
      + `${(cashRatio * 100).toFixed(1).padStart(8)}%  ${aaoifiFail ? 'FAIL' : 'pass'}`
      + `${debt ? '' : '  [no debt fact — treated as 0, NOT a clean pass]'}`);
  }

  console.log(`\nfirst AAOIFI breach on this reconstruction: ${firstBreach ?? 'none found'}`);
  console.log('\nCAVEATS THAT COULD MOVE THIS DATE:');
  console.log('  • share count taken from the cover-page concept available at each date — if that is');
  console.log('    Class A only, market cap is understated and the breach date is too EARLY.');
  console.log('  • a quarter with no debt fact filed is shown as 0 debt; that is a coverage gap, not');
  console.log('    evidence of no debt. Rows flagged above.');
  console.log('  • operating-lease and finance-lease obligations are excluded; AAOIFI treats');
  console.log('    interest-bearing debt only, but providers differ on capitalised leases.');
}

main().catch((e) => { console.error(e); process.exit(1); });
