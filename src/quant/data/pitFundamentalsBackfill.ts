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
//   - Annual (`form` starts with "10-K", `fp` is "FY" or absent) facts only, one row per distinct
//     fiscal period `end` — a real filing HISTORY per symbol, not one current snapshot.
//   - When the same concept reports the same period more than once (original + amendment), the
//     EARLIEST `filed` wins — the original filing's actual public availability, not a later
//     restatement's, which would again shift PIT availability later than it truly was.
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

/** Per-fact eligibility: finite value, valid dates, plausible ordering, annual form/period. */
function factEligible(f: XbrlFact): f is XbrlFact & { filed: string } {
  if (!Number.isFinite(f.val)) return false;
  if (!isValidSecDateKey(f.end) || !isValidSecDateKey(f.filed)) return false;
  if (f.end > f.filed!) return false; // reject implausible ordering — mirrors secFundamentals.ts:45
  if (f.form && !f.form.startsWith('10-K')) return false;
  if (f.fp && f.fp !== 'FY') return false;
  return true;
}

/**
 * Merge one or more alternate concept-tag names (e.g. old vs. new revenue tag) into a single
 * end-date -> fact map. Earlier keys in `keys` win when two tags report the same `end` (mirrors
 * tier2XbrlFetch's `pickFirstConcept` preference order); within one tag, the earliest `filed`
 * wins for a given `end` (the original filing, not a later amendment).
 */
function annualFactsByEnd(
  node: any,
  keys: readonly string[],
  unit: 'USD' | 'shares' = 'USD',
): Map<string, XbrlFact & { filed: string }> {
  const merged = new Map<string, XbrlFact & { filed: string }>();
  for (const key of keys) {
    const list: XbrlFact[] | undefined = node?.[key]?.units?.[unit];
    const perKeyByEnd = new Map<string, XbrlFact & { filed: string }>();
    for (const raw of list ?? []) {
      if (!factEligible(raw)) continue;
      const existing = perKeyByEnd.get(raw.end);
      if (!existing || raw.filed < existing.filed) perKeyByEnd.set(raw.end, raw);
    }
    for (const [end, fact] of Array.from(perKeyByEnd.entries())) {
      if (!merged.has(end)) merged.set(end, fact); // first key in `keys` order wins a same-end tie
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
