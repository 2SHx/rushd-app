// src/quant/universe/tier2XbrlFetch.ts — OPTIONAL, network-touching Tier-2 input fetcher for
// SEC EDGAR (companyfacts + submissions), mirroring the fetch/User-Agent/retry-free pattern of
// src/quant/data/secFundamentals.ts (kept as a separate file rather than imported from there —
// that file only resolves shares/mcap, not debt/cash/revenue/interest-income concepts, and this
// module must never edit it). NOT imported by buildVerifiedUniverse's default path and NEVER
// invoked by any test in this module — Tier-2 candidates are supplied pre-fetched. This exists
// only for a future live-refresh script. Every failure returns null; nothing is ever fabricated.
import { excludedSicCategory } from './tier2AaoifiScreener';
import type { Tier2Inputs } from './tier2AaoifiScreener';

const SEC_HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };

async function fetchJson(url: string, timeoutMs = 20_000): Promise<any> {
  const res = await fetch(url, { headers: SEC_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`SEC fetch failed ${url}: HTTP ${res.status}`);
  return res.json();
}

interface XbrlFact {
  val: number;
  end: string;
  /**
   * ISO period-start date, present on DURATION facts (income-statement concepts like revenue or
   * interest income) and ABSENT on INSTANT facts (balance-sheet concepts like debt or cash,
   * reported "as of" `end` with no span). `pitFundamentalsBackfill.ts` uses this to reject
   * duration facts whose (end - start) span is not annual-length — SEC's `fp` field is a
   * FILING-level tag (the 10-K's own DocumentFiscalPeriodFocus), not a per-fact one, so a 10-K's
   * embedded "selected quarterly data" comparative facts still carry `fp: 'FY', form: '10-K'`
   * even though they cover a single quarter; only the actual start/end span distinguishes them.
   */
  start?: string;
  filed?: string;
  form?: string;
  fp?: string;
  /**
   * SEC's own calendar-alignment label (e.g. "CY2016" for a full year, "CY2016Q4I" for an
   * instant balance at a Q4/FY-end, "CY2012Q2I" for an instant balance mid-year, "CY2012Q2" for a
   * quarter-duration). When present, a `frame` ending in a bare Q1/Q2/Q3 (optionally with an "I"
   * instant or "YTD" suffix) is SEC's own confirmation that the fact is a sub-annual period —
   * used by `pitFundamentalsBackfill.ts` as a second, independent signal alongside the start/end
   * span check (duration facts) to catch INSTANT balance-sheet facts (debt/cash — no `start` to
   * measure a span from) that a 10-K embeds as quarterly comparatives, e.g. a real fact observed
   * for ON Semiconductor: `{end:"2012-03-31", form:"10-K", fp:"FY", frame:"CY2012Q1I"}`.
   */
  frame?: string;
}

/**
 * The exact us-gaap/dei concept names this module screens on, exported so
 * `src/quant/data/pitFundamentalsBackfill.ts` (the point-in-time filing-HISTORY backfill, which
 * needs every annual fact per concept, not just the latest) reuses the same mapping instead of
 * re-deriving it. Do not add a concept here without also checking `computeAaoifiScreen`'s inputs.
 */
export const TIER2_CONCEPT_KEYS = {
  longTermDebt: ['LongTermDebt'],
  debtCurrent: ['DebtCurrent'],
  cash: ['CashAndCashEquivalentsAtCarryingValue'],
  shortTermSecurities: ['MarketableSecuritiesCurrent', 'ShortTermInvestments'],
  revenue: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues'],
  nonCompliantIncome: ['InterestIncomeOther', 'InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend'],
  sharesDei: ['EntityCommonStockSharesOutstanding'],
  sharesGaap: ['CommonStockSharesOutstanding'],
} as const;

function pickLatestAnnual(list: XbrlFact[] | undefined): XbrlFact | null {
  if (!Array.isArray(list)) return null;
  const annual = list.filter((x) => x.form?.startsWith('10-K') && (!x.fp || x.fp === 'FY'));
  const pool = annual.length ? annual : list;
  let best: XbrlFact | null = null;
  for (const f of pool) if (!best || f.end > best.end) best = f;
  return best;
}

function pickFirstConcept(node: any, keys: string[], unit: 'USD' | 'shares' = 'USD'): XbrlFact | null {
  for (const k of keys) {
    const best = pickLatestAnnual(node?.[k]?.units?.[unit]);
    if (best) return best;
  }
  return null;
}

/**
 * Live SEC EDGAR fetch of one symbol's raw Tier-2 inputs (debt, cash+securities, revenue,
 * non-compliant/interest income, SIC, shares outstanding). Does NOT compute market cap — callers
 * combine `sharesOutstanding` with a real, already-known price (e.g. the Tier-1 fixture's own
 * price column) to avoid a redundant network round trip for a quote.
 */
export async function fetchTier2XbrlInputs(
  symbol: string,
  name: string,
): Promise<Omit<Tier2Inputs, 'marketCapUsd'> & { sharesOutstanding: number | null }> {
  const fallback = {
    symbol,
    name,
    sic: null,
    interestBearingDebtUsd: null,
    cashAndInterestSecuritiesUsd: null,
    nonCompliantIncomeUsd: null,
    totalRevenueUsd: null,
    asOf: new Date(0).toISOString().slice(0, 10),
    sharesOutstanding: null,
    notes: ['fetch_failed_fail_closed'],
  };

  try {
    const tickers = await fetchJson('https://www.sec.gov/files/company_tickers.json');
    const entry = Object.values(tickers as Record<string, { cik_str: number; ticker: string }>).find(
      (e) => e.ticker.toUpperCase() === symbol.toUpperCase(),
    );
    if (!entry) return fallback;
    const cik = String(entry.cik_str).padStart(10, '0');

    const [facts, submission] = await Promise.all([
      fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`),
      fetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`),
    ]);

    const gaap = facts.facts?.['us-gaap'] ?? {};
    const dei = facts.facts?.dei ?? {};

    const longTermDebt = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.longTermDebt]);
    const debtCurrent = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.debtCurrent]);
    const cash = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.cash]);
    const shortTermSecurities = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.shortTermSecurities]);
    const revenue = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.revenue]);
    const nonCompliantIncome = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.nonCompliantIncome]);
    const sharesDei = pickFirstConcept(dei, [...TIER2_CONCEPT_KEYS.sharesDei], 'shares');
    const sharesGaap = pickFirstConcept(gaap, [...TIER2_CONCEPT_KEYS.sharesGaap], 'shares');

    const debtParts = [longTermDebt?.val, debtCurrent?.val].filter((v): v is number => typeof v === 'number');
    const cashParts = [cash?.val, shortTermSecurities?.val].filter((v): v is number => typeof v === 'number');

    // Oldest (not newest) of the four ratio-driving facts — `computeAaoifiScreen`'s staleness
    // check must see the weakest link (e.g. a company that stopped separately tagging interest
    // income years ago must not be hidden behind a fresh debt/revenue filing date).
    const asOfCandidates = [longTermDebt, cash, revenue, nonCompliantIncome]
      .map((x) => x?.end)
      .filter((x): x is string => Boolean(x))
      .sort();

    return {
      symbol,
      name,
      sic: submission?.sic ?? null,
      interestBearingDebtUsd: debtParts.length ? debtParts.reduce((a, b) => a + b, 0) : null,
      cashAndInterestSecuritiesUsd: cashParts.length ? cashParts.reduce((a, b) => a + b, 0) : null,
      nonCompliantIncomeUsd: nonCompliantIncome?.val ?? null,
      totalRevenueUsd: revenue?.val ?? null,
      asOf: asOfCandidates[0] ?? fallback.asOf,
      sharesOutstanding: sharesDei?.val ?? sharesGaap?.val ?? null,
      notes: nonCompliantIncome ? [`non_compliant_income tag end=${nonCompliantIncome.end}`] : ['non_compliant_income_tag_absent'],
    };
  } catch {
    return fallback; // fail-closed: never fabricate a partial result on a network/parse error
  }
}

export { excludedSicCategory, SEC_HEADERS, fetchJson };
export type { XbrlFact };
