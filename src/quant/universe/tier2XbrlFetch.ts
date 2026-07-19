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
  filed?: string;
  form?: string;
  fp?: string;
}

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

    const longTermDebt = pickFirstConcept(gaap, ['LongTermDebt']);
    const debtCurrent = pickFirstConcept(gaap, ['DebtCurrent']);
    const cash = pickFirstConcept(gaap, ['CashAndCashEquivalentsAtCarryingValue']);
    const shortTermSecurities = pickFirstConcept(gaap, ['MarketableSecuritiesCurrent', 'ShortTermInvestments']);
    const revenue = pickFirstConcept(gaap, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues']);
    const nonCompliantIncome = pickFirstConcept(gaap, [
      'InterestIncomeOther',
      'InvestmentIncomeInterest',
      'InvestmentIncomeInterestAndDividend',
    ]);
    const sharesDei = pickFirstConcept(dei, ['EntityCommonStockSharesOutstanding'], 'shares');
    const sharesGaap = pickFirstConcept(gaap, ['CommonStockSharesOutstanding'], 'shares');

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

export { excludedSicCategory };
