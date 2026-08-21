// src/quant/universe/tier2AaoifiScreener.ts — QDR-8 Tier-2: RUSHD's own AAOIFI-aligned ratio
// screener over SEC XBRL fundamentals (§2.3 agent-5 thresholds, mirrored from
// src/quant/gates/sharia.ts's contract comment): interest-bearing debt / mcap < 30%,
// (cash + interest-bearing securities) / mcap < 30%, non-compliant income / total revenue < 5%
// (this ratio IS the purification ratio), plus a sector/business-activity exclusion list. These
// are AAOIFI-aligned ratio criteria (industry-standard 30/30/5, market-cap denominator) — not a
// verbatim citation of a specific AAOIFI Sharia Standard clause. Pure function — no network, no
// DB. Callers supply already-fetched XBRL inputs (see tier2XbrlFetch.ts for the optional live
// source); a missing/non-finite required input, OR an input older than `maxInputAgeDays`
// (STALE_FUNDAMENTALS — several large filers stop separately tagging small non-operating income
// line items after a few years, which must never be silently treated as still-compliant), is
// fail-closed excluded, never defaulted to zero or skipped.
//
// PERIOD-AGNOSTIC BY DESIGN: `Tier2Inputs` carries a single already-selected `asOf`/metric set, not
// a `Fundamentals.period` discriminator — WHICH filing (annual vs quarterly) backs those numbers is
// entirely the caller's decision (see pointInTime.ts's `PointInTimeStore.fundamentals(period)` and
// sharia.ts's period rationale for the pending Sharia-gate join); this module never re-derives or
// assumes it, and the 30/30/5 arithmetic below is identical either way.
const DEBT_TO_MCAP_MAX_BPS = 3000; // 30%
const INTEREST_SECURITIES_TO_MCAP_MAX_BPS = 3000; // 30%
const NON_COMPLIANT_INCOME_TO_REVENUE_MAX_BPS = 500; // 5%
/** One fiscal year + typical filing lag; the default staleness ceiling for any XBRL input. */
const DEFAULT_MAX_INPUT_AGE_DAYS = 550;

/**
 * SIC-code exclusion ranges, inclusive — aligned with common AAOIFI-style business-activity
 * exclusion categories (conventional finance, alcohol, tobacco, gambling, pork, weapons), mirrored
 * from the existing sector veto (src/quant/gates/sharia.ts's category comment). This is NOT a
 * verbatim AAOIFI clause-to-SIC mapping (no such official mapping exists); SIC is a coarse SEC
 * classification — "adult entertainment" has no dedicated SIC code and is NOT screenable this
 * way; that gap is recorded honestly in README.md rather than guessed at here.
 */
const EXCLUDED_SIC_RANGES: { category: string; ranges: [number, number][] }[] = [
  { category: 'conventional_finance', ranges: [[6000, 6199], [6200, 6299], [6300, 6411]] },
  { category: 'alcohol', ranges: [[2080, 2085]] },
  { category: 'tobacco', ranges: [[2100, 2141]] },
  { category: 'gambling', ranges: [[7993, 7993], [7999, 7999]] },
  { category: 'pork', ranges: [[2013, 2013], [213, 213]] },
  { category: 'weapons', ranges: [[3480, 3489], [3760, 3769], [3795, 3795]] },
];

export function excludedSicCategory(sic: string | null): string | null {
  if (!sic) return null;
  const n = Number(sic);
  if (!Number.isFinite(n)) return null;
  for (const { category, ranges } of EXCLUDED_SIC_RANGES) {
    if (ranges.some(([min, max]) => n >= min && n <= max)) return category;
  }
  return null;
}

export interface Tier2Inputs {
  symbol: string;
  name: string;
  /** SEC SIC code (submissions.json `sic`), or null if unknown. */
  sic: string | null;
  interestBearingDebtUsd: number | null;
  cashAndInterestSecuritiesUsd: number | null;
  marketCapUsd: number | null;
  nonCompliantIncomeUsd: number | null;
  totalRevenueUsd: number | null;
  /** ISO date of the OLDEST contributing XBRL fact (not the newest) — a screen is only as fresh
   * as its weakest input, so this must never be the freshest date among several, or a stale
   * non-compliant-income tag could hide behind a fresh debt/revenue filing. Drives the
   * STALE_FUNDAMENTALS check below. */
  asOf: string;
  /** Informational-only notes (e.g. "non-compliant-income tag last filed 2013-06-30"). */
  notes?: string[];
}

export interface Tier2Ratios {
  debtToMcapBps: number;
  cashAndInterestSecuritiesToMcapBps: number;
  nonCompliantIncomeToRevenueBps: number;
}

export interface Tier2ScreenResult {
  compliant: boolean;
  purificationRatioBps: number | 'n/a — not computed';
  ratios: Tier2Ratios | null;
  reasonCodes: string[];
}

function isPositiveFinite(n: number | null): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function isNonNegativeFinite(n: number | null): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

const bps = (num: number, denom: number): number => Math.round((num / denom) * 10_000);

/** Point-in-time market cap denominator: a filed share count times a real close known by the
 * decision. Missing, zero, or non-finite inputs propagate as null so the screen fails closed. */
export function marketCapUsdFromShares(sharesOutstanding: unknown, priceUsd: unknown): number | null {
  if (typeof sharesOutstanding !== 'number' || !Number.isFinite(sharesOutstanding) || sharesOutstanding <= 0) {
    return null;
  }
  if (typeof priceUsd !== 'number' || !Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const marketCap = sharesOutstanding * priceUsd;
  return Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null;
}

export interface ComputeAaoifiScreenOptions {
  /** Any XBRL input older than this (days) is fail-closed excluded (STALE_FUNDAMENTALS). */
  maxInputAgeDays?: number;
  /** The "now" the staleness check measures against; defaults to the real current time. */
  referenceDate?: Date;
}

/** Age of an ISO `YYYY-MM-DD` date vs. `referenceDate`, in whole days; null if unparseable. */
function ageInDays(asOf: string, referenceDate: Date): number | null {
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  if (!Number.isFinite(asOfDate.getTime())) return null;
  return Math.floor((referenceDate.getTime() - asOfDate.getTime()) / 86_400_000);
}

/** The AAOIFI-aligned ratio screen, pure and fail-closed. Never invents a passing verdict from
 * partial OR stale data. */
export function computeAaoifiScreen(
  inputs: Tier2Inputs,
  options: ComputeAaoifiScreenOptions = {},
): Tier2ScreenResult {
  const { maxInputAgeDays = DEFAULT_MAX_INPUT_AGE_DAYS, referenceDate = new Date() } = options;
  const reasonCodes: string[] = [];

  const sector = excludedSicCategory(inputs.sic);
  if (sector) reasonCodes.push(`excluded_sector:${sector}`);

  const age = ageInDays(inputs.asOf, referenceDate);
  if (age === null || age > maxInputAgeDays) reasonCodes.push('STALE_FUNDAMENTALS');

  if (
    !isPositiveFinite(inputs.marketCapUsd) ||
    !isPositiveFinite(inputs.totalRevenueUsd) ||
    !isNonNegativeFinite(inputs.interestBearingDebtUsd) ||
    !isNonNegativeFinite(inputs.cashAndInterestSecuritiesUsd) ||
    !isNonNegativeFinite(inputs.nonCompliantIncomeUsd)
  ) {
    reasonCodes.push('missing_xbrl_inputs');
    return { compliant: false, purificationRatioBps: 'n/a — not computed', ratios: null, reasonCodes };
  }

  const ratios: Tier2Ratios = {
    debtToMcapBps: bps(inputs.interestBearingDebtUsd, inputs.marketCapUsd),
    cashAndInterestSecuritiesToMcapBps: bps(inputs.cashAndInterestSecuritiesUsd, inputs.marketCapUsd),
    nonCompliantIncomeToRevenueBps: bps(inputs.nonCompliantIncomeUsd, inputs.totalRevenueUsd),
  };

  if (ratios.debtToMcapBps >= DEBT_TO_MCAP_MAX_BPS) reasonCodes.push('debt_to_mcap_exceeds_30pct');
  if (ratios.cashAndInterestSecuritiesToMcapBps >= INTEREST_SECURITIES_TO_MCAP_MAX_BPS) {
    reasonCodes.push('cash_and_interest_securities_to_mcap_exceeds_30pct');
  }
  if (ratios.nonCompliantIncomeToRevenueBps >= NON_COMPLIANT_INCOME_TO_REVENUE_MAX_BPS) {
    reasonCodes.push('non_compliant_income_exceeds_5pct');
  }

  const compliant = reasonCodes.length === 0;
  return {
    compliant,
    purificationRatioBps: ratios.nonCompliantIncomeToRevenueBps,
    ratios,
    reasonCodes,
  };
}
