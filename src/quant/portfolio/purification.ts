// Purification base — AAOIFI Shari'ah Standard No. 21 (Financial Papers: Shares and Bonds) §3/4.
//
// QDR-23 (2026-08-26) ruled the shipped formula wrong at the BASE, not the ratio. It charged
// `max(0, avgFillPrice − costBasis) × filledQty × ratio` — the non-compliant-income ratio applied
// to REALIZED CAPITAL GAIN, with losses floored away. That is wrong twice over:
//
//   1. Capital appreciation is a PRICE MOVEMENT, not investee income. AAOIFI SS 21 obliges the
//      shareholder to dispose of their proportionate share of the investee's non-permissible
//      INCOME over the holding period — whether or not distributed, and whether or not the share
//      is later sold. Neither AAOIFI nor Al-Rajhi extends purification to price gains.
//   2. `max(0, ·)` makes the levy asymmetric in a way no authority in the stack requires.
//
// QDR-23 measured the overstatement at 30-80x on a book realizing ~106%/yr: 0.53-1.33 pp/yr on the
// gain base against 1.7-17.4 bps/yr on the income base.
//
// Note this rule is STRICTER than dividends-only in one direction: undistributed impermissible
// income is still purified, so a zero-dividend name is NOT exempt. It is narrower in another: a
// price gain on a fully-compliant name owes nothing.
//
// S&P Shariah's Dividend Adjustment Factor is a dividend-only instrument. Per QDR-23 it is
// admissible as a FLOOR when per-name income attribution is unavailable, never as the rule — and
// when it is used, the shortfall must be visible rather than silently defaulted.
//
// Authority stack: AAOIFI + Al-Rajhi + S&P Shariah only.

export type PurificationBasis =
  /** Full AAOIFI SS 21 income attribution: the investee's non-permissible income, prorated. */
  | 'AAOIFI_SS21_INCOME_ATTRIBUTION'
  /** Fallback when no income figure covers the holding period. Disclosed, never silent. */
  | 'DIVIDEND_FLOOR_SP_DAF';

export interface PurificationInput {
  /** Non-compliant income / total income for the investee. Already carried as `purificationRatio`. */
  readonly ratio: number;
  /** The investee's total revenue over the reported period, USD. Null when unavailable. */
  readonly totalRevenueUsd: number | null;
  /** Shares outstanding at the reporting date. Null when unavailable. */
  readonly sharesOutstanding: number | null;
  /** Shares the investor held (the quantity being assessed). */
  readonly heldShares: number;
  /** Days the position was held within the reported period. */
  readonly heldDays: number;
  /** Days in the investee's reported period (≈365 annual, ≈91 quarterly). */
  readonly periodDays: number;
  /** Dividends actually received over the holding period, USD. The floor's only input. */
  readonly dividendsReceivedUsd?: number;
}

export interface PurificationResult {
  readonly amountUsd: number;
  readonly basis: PurificationBasis;
  /** True when income attribution was unavailable and the dividend floor was used instead. */
  readonly attributionUnavailable: boolean;
}

const nonNegative = (value: number) => (Number.isFinite(value) && value > 0 ? value : 0);

/** Reported-period lengths in days. Quarterly filings describe ~91 days, annual ~365. */
export const PERIOD_DAYS = Object.freeze({ ANNUAL: 365, QUARTERLY: 91 });

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two instants, floored at zero. */
export function heldDaysBetween(openedAt: Date, asOf: Date): number {
  return Math.max(0, (asOf.getTime() - openedAt.getTime()) / MS_PER_DAY);
}

/**
 * Purification owed on one holding.
 *
 * income attribution = totalRevenue × ratio × (heldShares / sharesOutstanding) × (heldDays / periodDays)
 *
 * Revenue is the base because `ratio` is `nonCompliantIncomeToIncome` — a share OF income — so the
 * two compose into the investor's proportionate share of impermissible income. Prorating by
 * ownership fraction and by holding days is what SS 21's "attributable to the holding for the
 * period held" requires; charging a full period to an investor who held for a week would overstate
 * the obligation as surely as the gain base did.
 *
 * NEVER a function of price, cost basis, or realized gain. A purely compliant company owes nothing
 * however much its stock appreciated.
 */
export function purificationOwed(input: PurificationInput): PurificationResult {
  const {
    ratio, totalRevenueUsd, sharesOutstanding, heldShares, heldDays, periodDays,
  } = input;

  const canAttribute = totalRevenueUsd !== null && totalRevenueUsd > 0
    && sharesOutstanding !== null && sharesOutstanding > 0
    && periodDays > 0
    && heldShares > 0;

  if (!canAttribute) {
    // Floor, disclosed. Dividends are a strict subset of impermissible income, so this UNDERSTATES
    // the true obligation — which is exactly why it is marked rather than returned as if complete.
    const dividends = nonNegative(input.dividendsReceivedUsd ?? 0);
    return {
      amountUsd: dividends * nonNegative(ratio),
      basis: 'DIVIDEND_FLOOR_SP_DAF',
      attributionUnavailable: true,
    };
  }

  const ownershipFraction = heldShares / sharesOutstanding;
  // A position held longer than the reported period still purifies that period once.
  const periodFraction = Math.min(nonNegative(heldDays) / periodDays, 1);
  const amountUsd = totalRevenueUsd * nonNegative(ratio) * ownershipFraction * periodFraction;

  return {
    amountUsd,
    basis: 'AAOIFI_SS21_INCOME_ATTRIBUTION',
    attributionUnavailable: false,
  };
}
