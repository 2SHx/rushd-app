// src/quant/data/pitFundamentalsBackfill.ts — point-in-time SEC EDGAR companyfacts backfill for
// the `Fundamentals` table (docs/PORTFOLIO_BUILD.md follow-up: the table was empty, so every
// pitShariaVerdict.ts screen resolved UNKNOWN). Reuses `TIER2_CONCEPT_KEYS` from
// src/quant/universe/tier2XbrlFetch.ts verbatim rather than re-deriving the us-gaap/dei concept
// mapping (owner directive).
//
// PIT contract (mirrors src/quant/data/secFundamentals.ts:45's `fact.end > fact.filed` guard,
// generalized to a per-fact check instead of a single best-fact pick):
//   - `end`   = the fiscal period the fact describes.
//   - `filed` = when the fact became public (accession filing date) — the ONLY value ever written
//     to `Fundamentals.releasedAt`. Never the fiscal `end`, never "now".
//   - A fact with `end > filed` (published before the period it claims to describe) is an
//     internally-inconsistent "prophecy" fact and is dropped, never persisted.
//   - When a period is described by facts from more than one concept (e.g. debt + revenue for the
//     same fiscal year-end, possibly filed on slightly different days for a restated tag), the
//     row's `releasedAt` is the MAX `filed` among the facts actually included — a row is only
//     "available" once every field it reports has actually been filed; using the min would leak a
//     later-published number as available earlier (a look-ahead).
//   - Annual facts only, one row per distinct fiscal period `end` — a real filing HISTORY per
//     symbol, not one current snapshot. Two checks, because SEC's `fp`/`form` fields are FILING-
//     level metadata (the accession's own DocumentFiscalPeriodFocus/DocumentType), NOT per-fact:
//     a 10-K's XBRL exhibit routinely embeds prior-QUARTER comparative facts (e.g. a "selected
//     quarterly financial data" footnote) that still carry `form: '10-K', fp: 'FY'` even though
//     the individual fact spans one quarter — confirmed against live SEC data (WAT's
//     InterestIncomeOther has `{start:"2009-04-05", end:"2009-07-04", form:"10-K", fp:"FY"}`, a
//     3-month span). So: (1) `form` must start with "10-K" and `fp` must be exactly "FY"
//     (necessary, filing-level annual classification); AND (2) for DURATION facts (those with a
//     `start`, e.g. revenue/interest-income — income-statement concepts), the `start..end` span
//     itself must be annual-length (350-380 days), which is the only field that actually
//     discriminates a quarter-comparative from a genuine full fiscal year within the same 10-K.
//     INSTANT facts (no `start`, e.g. debt/cash — balance-sheet concepts, "as of" one date) have
//     no span to check; live-data audit confirmed 0 non-FY-end contamination among instant facts
//     that already pass check (1), so no additional check is applied to them.
//   - When the same concept reports the same period more than once (original + amendment), the
//     EARLIEST `filed` wins — the original filing's actual public availability, not a later
//     restatement's, which would again shift PIT availability later than it truly was. This also
//     applies ACROSS alternate concept tags for the same `end` (e.g. legacy `Revenues` vs. the
//     newer ASC-606 `RevenueFromContractWithCustomerExcludingAssessedTax`): the earliest `filed`
//     of ANY eligible tag wins, never a fixed tag-preference order — a restated figure must never
//     be attributed to a date at which it was not yet public.
//
// Never fabricates: a missing CIK, missing concept, or unparseable fact yields a skip with a
// counted reason (see PitFundamentalsSkip), never a guessed value.
import type { XbrlFact } from '../universe/tier2XbrlFetch';
import { TIER2_CONCEPT_KEYS } from '../universe/tier2XbrlFetch';

export interface PitFundamentalsMetrics {
  sic: string | null;
  interestBearingDebtUsd: number | null;
  cashAndInterestSecuritiesUsd: number | null;
  nonCompliantIncomeUsd: number | null;
  totalRevenueUsd: number | null;
  /** Always '10-K' in this unit — see file header on scope. */
  form: '10-K';
  notes: string[];
}

export interface PitFundamentalsFiling {
  symbol: string;
  market: 'NASDAQ';
  /** ISO YYYY-MM-DD: the fiscal period this filing describes. */
  asOf: string;
  /** ISO YYYY-MM-DD: when this filing's data became public — the point-in-time key. */
  releasedAt: string;
  metrics: PitFundamentalsMetrics;
}

export interface PitFundamentalsSkip {
  symbol: string;
  reasonCode: string;
  detail?: string;
}

function isValidSecDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

/** A genuine fiscal year spans 350-380 days: covers 364/371-day 52/53-week fiscal calendars and
 * ordinary 365/366-day calendar years, while excluding a quarter (~90d), a half-year (~180d), a
 * 9-month YTD stub (~270d), and an oddly long transition-period report (>380d, itself not a
 * normal annual period and correctly excluded under the DECIDED annual-only-granularity scope). */
const MIN_ANNUAL_SPAN_DAYS = 350;
const MAX_ANNUAL_SPAN_DAYS = 380;
const DAY_MS = 86_400_000;

/**
 * Per-fact eligibility: finite value, valid dates, plausible ordering, GENUINELY annual
 * form/period/span.
 *   1. `form` must start with "10-K" and `fp` must be exactly `'FY'` — necessary, but NOT
 *      sufficient (see file header): both are filing-level, not per-fact, so a 10-K's embedded
 *      quarterly comparative facts pass this check too.
 *   2. For a DURATION fact (has `start`) — the actual per-fact signal — the `start..end` span
 *      must fall in the annual window above. This is what actually rejects a 10-K's embedded
 *      quarter-comparative duration fact, which check (1) alone cannot distinguish.
 *   3. An INSTANT fact (no `start`) has no span to check; live SEC data confirms this leaks too —
 *      e.g. ON Semiconductor's `CashAndCashEquivalentsAtCarryingValue` embeds Q1/Q2/Q3 balances
 *      inside its 10-K's "selected quarterly data" note, still `form:'10-K', fp:'FY'`, with each
 *      one SEC-labeled `frame: "CY2012Q1I"` etc. When `frame` is present, a bare Q1/Q2/Q3
 *      (optionally `I`-instant or `YTD`-suffixed) is SEC's own sub-annual confirmation and is
 *      rejected too — the second, complementary signal to the span check above. (A fact with
 *      neither `start` nor a Q1/Q2/Q3 `frame` is annual as far as this filter can determine.)
 */
function factEligible(f: XbrlFact): f is XbrlFact & { filed: string } {
  if (!Number.isFinite(f.val)) return false;
  if (!isValidSecDateKey(f.end) || !isValidSecDateKey(f.filed)) return false;
  if (f.end > f.filed!) return false; // reject implausible ordering — mirrors secFundamentals.ts:45
  if (f.form && !f.form.startsWith('10-K')) return false;
  if (f.fp !== 'FY') return false; // explicit FY only — absent/other fp is never treated as annual
  if (f.start != null) {
    if (!isValidSecDateKey(f.start)) return false;
    const spanDays = (Date.parse(`${f.end}T00:00:00.000Z`) - Date.parse(`${f.start}T00:00:00.000Z`)) / DAY_MS;
    if (spanDays < MIN_ANNUAL_SPAN_DAYS || spanDays > MAX_ANNUAL_SPAN_DAYS) return false;
  }
  if (f.frame && /Q[1-3](I|YTD)?$/.test(f.frame)) return false; // SEC's own sub-annual label
  return true;
}

/**
 * Merge one or more alternate concept-tag names (e.g. old vs. new revenue tag) into a single
 * end-date -> fact map. The earliest `filed` wins for a given `end`, BOTH within one tag
 * (original filing vs. a later amendment) AND ACROSS tags (e.g. legacy `Revenues` vs. the newer
 * ASC-606 `RevenueFromContractWithCustomerExcludingAssessedTax` reporting the same fiscal year).
 * This is deliberately NOT a fixed tag-preference order (unlike tier2XbrlFetch's
 * `pickFirstConcept`, which only ever wants the single latest-available figure): a PIT filing
 * HISTORY must attribute every figure to the date it actually became public, and a newer tag
 * simply being listed first in `keys` must never let its (later) `filed` date pre-empt an older
 * tag's earlier one — that would attribute a restated/re-tagged figure to a date before it was
 * really available, an availability look-ahead.
 */
function annualFactsByEnd(
  node: any,
  keys: readonly string[],
  unit: 'USD' | 'shares' = 'USD',
): Map<string, XbrlFact & { filed: string }> {
  const merged = new Map<string, XbrlFact & { filed: string }>();
  for (const key of keys) {
    const list: XbrlFact[] | undefined = node?.[key]?.units?.[unit];
    for (const raw of list ?? []) {
      if (!factEligible(raw)) continue;
      const existing = merged.get(raw.end);
      if (!existing || raw.filed < existing.filed) merged.set(raw.end, raw); // earliest filed wins, across tags too
    }
  }
  return merged;
}

function sumParts(values: Array<number | undefined>): number | null {
  const parts = values.filter((v): v is number => typeof v === 'number');
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

/**
 * Pure core: builds the full annual filing HISTORY for one symbol from already-fetched SEC
 * companyfacts + submissions JSON. No network, no Date.now(), no randomness — fully offline
 * testable with captured fixtures. Returns an empty `filings` array (with a skip reason, never a
 * thrown error for ordinary data-quality gaps) when the symbol has no eligible annual facts.
 */
export function selectAnnualFundamentalsHistory(
  symbol: string,
  companyFacts: any,
  submission: any,
): { filings: PitFundamentalsFiling[]; skips: PitFundamentalsSkip[] } {
  const gaap = companyFacts?.facts?.['us-gaap'] ?? {};
  const sic: string | null = submission?.sic != null ? String(submission.sic) : null;

  const debtLT = annualFactsByEnd(gaap, TIER2_CONCEPT_KEYS.longTermDebt);
  const debtCur = annualFactsByEnd(gaap, TIER2_CONCEPT_KEYS.debtCurrent);
  const cash = annualFactsByEnd(gaap, TIER2_CONCEPT_KEYS.cash);
  const shortSec = annualFactsByEnd(gaap, TIER2_CONCEPT_KEYS.shortTermSecurities);
  const revenue = annualFactsByEnd(gaap, TIER2_CONCEPT_KEYS.revenue);
  const nonCompliant = annualFactsByEnd(gaap, TIER2_CONCEPT_KEYS.nonCompliantIncome);

  const ends = new Set<string>();
  for (const m of [debtLT, debtCur, cash, shortSec, revenue, nonCompliant]) {
    for (const end of Array.from(m.keys())) ends.add(end);
  }

  if (ends.size === 0) {
    return { filings: [], skips: [{ symbol, reasonCode: 'no_annual_10k_facts' }] };
  }

  const filings: PitFundamentalsFiling[] = [];
  const skips: PitFundamentalsSkip[] = [];

  for (const end of Array.from(ends).sort()) {
    const contributing = [
      debtLT.get(end), debtCur.get(end), cash.get(end), shortSec.get(end), revenue.get(end), nonCompliant.get(end),
    ].filter((f): f is XbrlFact & { filed: string } => Boolean(f));

    if (contributing.length === 0) continue; // unreachable (ends built from these maps), defensive only

    const releasedAt = contributing.reduce((max, f) => (f.filed > max ? f.filed : max), contributing[0].filed);

    // Defensive re-check at the assembled-row level (per-fact check above already guarantees this
    // for every individual contributing fact, but a row is only as trustworthy as its worst input).
    if (releasedAt < end) {
      skips.push({ symbol, reasonCode: 'implausible_filing_order', detail: `end=${end} releasedAt=${releasedAt}` });
      continue;
    }

    filings.push({
      symbol,
      market: 'NASDAQ',
      asOf: end,
      releasedAt,
      metrics: {
        sic,
        interestBearingDebtUsd: sumParts([debtLT.get(end)?.val, debtCur.get(end)?.val]),
        cashAndInterestSecuritiesUsd: sumParts([cash.get(end)?.val, shortSec.get(end)?.val]),
        nonCompliantIncomeUsd: nonCompliant.get(end)?.val ?? null,
        totalRevenueUsd: revenue.get(end)?.val ?? null,
        form: '10-K',
        notes: nonCompliant.get(end) ? [] : ['non_compliant_income_tag_absent_for_period'],
      },
    });
  }

  if (filings.length === 0 && skips.length === 0) {
    skips.push({ symbol, reasonCode: 'no_annual_10k_facts' });
  }

  return { filings, skips };
}
