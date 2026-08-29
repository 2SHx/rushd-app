// Balance-sheet inputs for the AAOIFI / S&P Shariah screens, via SEC's XBRL frames API.
//
// WHY: the owner held ASTS, it ceased to be permissible, and nobody saw it coming. Reconstructing it
// after the fact showed the breach was legible four quarters early — debt went 13.7% -> 13.7% ->
// 30.8% of trailing average market cap while the position was held. A forced sale is a sale at a
// date someone else picks; a WARNED sale is a date you pick. This panel is what makes the second
// possible.
//
// Instantaneous (balance-sheet) frames take the 'I' suffix: CY2024Q1I. Duration frames (revenue,
// handled in backfill-revenue-frames.ts) do not.
//
// SAME TWO LIMITATIONS AS THE REVENUE PANEL, and they matter more here because a compliance verdict
// is an enforcement decision rather than a ranking:
//   • frames returns the LATEST reported value, so a restatement overwrites the original;
//   • frames carries no filing date, so availability is approximated by a fixed lag.
// Both are acceptable for a WARNING system, whose output is "look at this name", and are NOT
// acceptable as the basis for an automated divestment. Enforcement must still run off the live
// screener. This file must never be wired into `evaluateShariaGate`.
//
// Network: SEC only. Writes data/fundamentals/balance-frames.json.gz. No DB writes.
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
const SPACING_MS = 140;
export const BALANCE_CACHE = path.join(process.cwd(), 'data', 'fundamentals', 'balance-frames.json.gz');

/**
 * Grouped by role. Within a group the order is preference order and the FIRST present wins.
 *
 * The debt split is deliberate and carries a defect already recorded in backfill-sharia-facts.ts:
 * US-GAAP `LongTermDebt` is the total carrying amount INCLUDING current maturities, while
 * `LongTermDebtNoncurrent` excludes them. Summing a TOTAL with a CURRENT concept double-counts.
 * So `debtTotal` is used alone when present, and only `debtNoncurrent` is ever summed with
 * `debtCurrent`.
 */
export const BALANCE_CONCEPTS: Record<string, { tax: string; unit: string; concepts: string[]; duration?: boolean }> = {
  /**
   * DUAL-CLASS FALLBACK. `dei:EntityCommonStockSharesOutstanding` is dimensionless, and a company
   * with Class A/B/C shares tags its cover-page count WITH a class dimension — which dimensionless
   * frames exclude. Measured on the verified universe: 11 names had no share count at all, and they
   * are exactly the multi-class filers (META, CMCSA, UPS, ASTS, MSTR, NKE, ACN...). ASTS being
   * among them is why the breach the owner actually experienced could not be reconstructed.
   *
   * Weighted-average DILUTED shares is a DURATION concept (frame `CY2026Q2`, no `I` suffix), is
   * dimensionless, and sums the classes. For market cap in a multi-class company it is arguably the
   * better denominator anyway, since it counts the economic claim rather than one share class.
   */
  sharesDiluted: {
    tax: 'us-gaap', unit: 'shares', duration: true,
    concepts: ['WeightedAverageNumberOfDilutedSharesOutstanding', 'WeightedAverageNumberOfSharesOutstandingBasic'],
  },
  /**
   * TOTAL LIABILITIES, used as a rigorous UPPER BOUND on interest-bearing debt.
   *
   * Nine names in the universe file a complete balance sheet (assets, cash, receivables) and tag no
   * debt concept at all — ANET, ISRG, VRTX, CDNS, MPWR, DXCM, GRMN and similar, which are genuinely
   * debt-light. Refusing to score them is over-conservative, but inferring "debt = 0" from silence
   * is the absent-evidence-is-not-zero error again. Total liabilities resolves it without either:
   * interest-bearing debt cannot exceed total liabilities, so if liabilities/market-cap already
   * clears the 30% limit, the name passes no matter how the debt splits. That is a proof, not an
   * inference.
   */
  liabilities: { tax: 'us-gaap', unit: 'USD', concepts: ['Liabilities'] },
  /**
   * DERIVED-LIABILITIES FALLBACK. `Liabilities` itself is a subtotal some filers never tag directly
   * (CDNS, MNST, GRMN, EXPD, DECK tag zero quarters of it — confirmed against SEC companyfacts, not
   * guessed). `LiabilitiesAndStockholdersEquity` and `StockholdersEquity` are the two sides of the
   * balance-sheet identity and are near-universally tagged because the sheet must foot; their
   * difference IS total liabilities, not an estimate of it. Used only when `liabilities` is absent.
   */
  liabEquityTotal: { tax: 'us-gaap', unit: 'USD', concepts: ['LiabilitiesAndStockholdersEquity'] },
  stockholdersEquity: {
    tax: 'us-gaap', unit: 'USD',
    concepts: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  },
  shares: { tax: 'dei', unit: 'shares', concepts: ['EntityCommonStockSharesOutstanding'] },
  sharesGaap: { tax: 'us-gaap', unit: 'shares', concepts: ['CommonStockSharesOutstanding', 'CommonStockSharesIssued'] },
  // `LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities` is APD's total-debt tag (their
  // plain `LongTermDebtAndCapitalLeaseObligations` stopped being filed after 2023Q1). `NotesPayable`
  // is a REIT total-debt line (verified for MAA: SecuredDebt + UnsecuredDebt == NotesPayable exactly
  // for every quarter checked) — placed last so it only fills gaps left by the more specific concepts.
  debtTotal: {
    tax: 'us-gaap', unit: 'USD',
    concepts: ['DebtLongtermAndShorttermCombinedAmount', 'LongTermDebt', 'LongTermDebtAndCapitalLeaseObligations',
      'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities', 'NotesPayable'],
  },
  // `ConvertibleLongTermNotesPayable` / `ConvertibleNotesPayableCurrent` are AKAM's actual debt tags
  // (Akamai funds itself entirely via convertible notes and tags no plain `LongTermDebt*` concept at
  // all — confirmed against SEC companyfacts, series is smooth and monotonic across issuance dates).
  debtNoncurrent: {
    tax: 'us-gaap', unit: 'USD',
    concepts: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligationsNoncurrent', 'ConvertibleLongTermNotesPayable'],
  },
  debtCurrent: {
    tax: 'us-gaap', unit: 'USD',
    concepts: ['DebtCurrent', 'LongTermDebtCurrent', 'ShortTermBorrowings', 'ConvertibleNotesPayableCurrent'],
  },
  cash: { tax: 'us-gaap', unit: 'USD', concepts: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', 'CashAndDueFromBanks', 'Cash'] },
  securities: { tax: 'us-gaap', unit: 'USD', concepts: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesCurrent', 'OtherShortTermInvestments'] },
  // Alias breadth measured, not guessed: with only the first two concepts, 17 of 144 otherwise-
  // passing names in the verified universe had NO receivables fact and were being scored as 0.0%
  // — a clean pass on a test that never ran. These are the tags large filers actually use for the
  // same line.
  receivables: {
    tax: 'us-gaap',
    unit: 'USD',
    concepts: [
      'AccountsReceivableNetCurrent',
      'ReceivablesNetCurrent',
      'AccountsAndOtherReceivablesNetCurrent',
      'AccountsReceivableGrossCurrent',
      'NotesAndLoansReceivableNetCurrent',
      'AccountsNotesAndLoansReceivableNetCurrent',
      'ReceivablesFromCustomers',
    ],
  },
  assets: { tax: 'us-gaap', unit: 'USD', concepts: ['Assets'] },
};

/** cik -> 'YYYYQn' -> field -> value */
export type BalancePanel = Record<string, Record<string, Record<string, number>>>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function frame(tax: string, concept: string, unit: string, period: string) {
  const url = `https://data.sec.gov/api/xbrl/frames/${tax}/${concept}/${unit}/${period}.json`;
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(90_000) });
    if (res.status === 429) { await sleep(20_000); return frame(tax, concept, unit, period); }
    if (!res.ok) return [];
    const body = await res.json() as { data?: { cik: number; val: number }[] };
    return body.data ?? [];
  } catch { return []; }
}

async function main() {
  mkdirSync(path.dirname(BALANCE_CACHE), { recursive: true });
  const panel: BalancePanel = existsSync(BALANCE_CACHE)
    ? JSON.parse(gunzipSync(readFileSync(BALANCE_CACHE)).toString('utf8')) : {};

  const quarters: string[] = [];
  for (let y = 2016; y <= 2026; y += 1) for (let q = 1; q <= 4; q += 1) quarters.push(`CY${y}Q${q}I`);

  /**
   * Re-running to widen ONE field's aliases should not re-download the other eighteen concepts.
   * The first widening run took ~5 minutes per quarter — 3.5 hours to add receivables aliases —
   * because every concept was re-fetched before the cache was consulted, and the fetch is where the
   * megabytes are. `--only-fields=receivables,cash` restricts the sweep to what actually changed.
   */
  const onlyFields = process.argv.find((a) => a.startsWith('--only-fields='))?.split('=')[1]
    ?.split(',').map((f) => f.trim()).filter(Boolean);
  const fields = Object.entries(BALANCE_CONCEPTS)
    .filter(([field]) => !onlyFields || onlyFields.includes(field));
  if (onlyFields) console.log(`restricted to fields: ${fields.map(([f]) => f).join(', ')}\n`);

  for (let qi = 0; qi < quarters.length; qi += 1) {
    const cy = quarters[qi];
    const key = cy.slice(2).replace('I', ''); // 'CY2024Q1I' -> '2024Q1'
    let added = 0;
    for (const [field, spec] of fields) {
      for (const concept of spec.concepts) {
        // Duration concepts use the frame label WITHOUT the instantaneous 'I' suffix.
        const period = spec.duration ? cy.replace(/I$/, '') : cy;
        const rows = await frame(spec.tax, concept, spec.unit, period);
        for (const r of rows) {
          const cik = String(r.cik);
          if (!panel[cik]) panel[cik] = {};
          if (!panel[cik][key]) panel[cik][key] = {};
          // First concept in preference order wins; later aliases never overwrite.
          if (panel[cik][key][field] === undefined && Number.isFinite(r.val)) {
            panel[cik][key][field] = r.val;
            added += 1;
          }
        }
        await sleep(SPACING_MS);
      }
    }
    if (added) console.log(`  ${key}  +${added} facts   (${Object.keys(panel).length} filers)`);
    if (qi % 4 === 3 || qi === quarters.length - 1) {
      writeFileSync(BALANCE_CACHE, gzipSync(Buffer.from(JSON.stringify(panel), 'utf8'), { level: 6 }));
    }
  }

  console.log(`\nfilers  ${Object.keys(panel).length}`);
  console.log(`cache   ${BALANCE_CACHE}`);
}

if (process.argv[1]?.includes('backfill-balance-frames')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
