// Point-in-time AAOIFI Sharia verdicts. Pure, keyless, no Prisma/network — callers supply
// already-fetched filings as plain data (ingestion's job, not this module's). Reuses
// computeAaoifiScreen (tier2AaoifiScreener.ts) for the 30/30/5 ratio math verbatim; this module's
// ONLY job is choosing WHICH filing a decision date may rely on, and mapping that screen's
// fail-closed result onto the PointInTimeShariaEvidence shape (pointInTimeMembership.ts).
//
// THE distinction that matters: a filing has BOTH an `asOf` (the period it describes, e.g. a
// 10-Q's fiscal quarter end) and an `availableAt` (when it became public, e.g. an EDGAR
// acceptance timestamp). A decision at D may use a filing only when `availableAt <= D`; filtering
// on `asOf <= D` alone is a classic look-ahead — filings publish weeks-to-months after the period
// they cover, so an `asOf <= D` filing need not exist publicly yet at D. Mirrors
// PointInTimeStore.fundamentals (pointInTime.ts: `releasedAt <= asOf`, most-recent-first) — same
// pattern, applied to Sharia filings instead of raw fundamentals.
//
// A prior defect this module exists to make impossible: a 2026 holdings snapshot silently
// certifying 2018 trades (see shariaSnapshot.ts's "ORCL GUARD" comment) — evidence-after-the-fact
// smuggled into a past decision.
import { createHash } from 'node:crypto';
import { computeAaoifiScreen, type Tier2Inputs } from './tier2AaoifiScreener';
import type { PointInTimeShariaEvidence, ShariaEvidenceState } from './pointInTimeMembership';

/**
 * Sharia authorities RUSHD recognizes as sources for a PIT verdict, by explicit owner decision.
 * Only these three are admitted; any other authority (including ones excluded by owner decision
 * elsewhere in the codebase — see docs/references' Sharia authority stack) must never appear as a
 * source here. The type below makes any other authority a compile error, not just a doc promise.
 */
export const PIT_SHARIA_ADMITTED_AUTHORITIES = Object.freeze(['AAOIFI', 'Al-Rajhi', 'S&P Shariah'] as const);
export type PitShariaAuthority = (typeof PIT_SHARIA_ADMITTED_AUTHORITIES)[number];

/**
 * One already-fetched filing/disclosure, as plain data. `asOf` is the period the filing
 * describes; `availableAt` is when it became public — null when genuinely unknown, which fails
 * closed exactly like a missing filing and is NEVER treated as "available now".
 */
export interface PitShariaFiling {
  readonly symbol: string;
  readonly authority: PitShariaAuthority;
  readonly sic: string | null;
  readonly interestBearingDebtUsd: number | null;
  readonly cashAndInterestSecuritiesUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly nonCompliantIncomeUsd: number | null;
  readonly totalRevenueUsd: number | null;
  /** ISO YYYY-MM-DD: the period this filing describes. */
  readonly asOf: string;
  /** When this filing became public; null means unknown, not "now". */
  readonly availableAt: Date | null;
}

export interface PitShariaVerdictResult {
  readonly symbol: string;
  readonly decisionAt: Date;
  readonly verdict: ShariaEvidenceState;
  readonly reasonCodes: readonly string[];
  readonly source: string;
  readonly hash: string;
  readonly asOf: Date;
  readonly availableAt: Date | null;
  readonly purificationRatioBps: number | 'n/a — not computed';
}

export interface ResolvePitShariaVerdictOptions {
  /**
   * Staleness ceiling in days, measured from the SELECTED filing's covered period (`asOf`) to the
   * DECISION date — never to real "now": a backtest replaying 2019 must judge staleness as of
   * 2019, not as of today, or every historical decision would silently inherit today's freshness.
   * Default 550d = one fiscal year + typical filing lag, the same ceiling and rationale as
   * tier2AaoifiScreener's DEFAULT_MAX_INPUT_AGE_DAYS: a filing describing a period more than ~18
   * months before the decision is presumed too old to still describe the balance sheet the
   * decision is trading against, so it is excluded rather than trusted.
   */
  readonly staleAfterDays?: number;
}

const DEFAULT_STALENESS_HORIZON_DAYS = 550;

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function filingHash(filing: PitShariaFiling): string {
  const canonical = JSON.stringify({
    symbol: filing.symbol,
    authority: filing.authority,
    sic: filing.sic,
    interestBearingDebtUsd: filing.interestBearingDebtUsd,
    cashAndInterestSecuritiesUsd: filing.cashAndInterestSecuritiesUsd,
    marketCapUsd: filing.marketCapUsd,
    nonCompliantIncomeUsd: filing.nonCompliantIncomeUsd,
    totalRevenueUsd: filing.totalRevenueUsd,
    asOf: filing.asOf,
    availableAt: filing.availableAt ? filing.availableAt.toISOString() : null,
  });
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}

function noEligibleFilingResult(
  symbol: string,
  decisionAt: Date,
  reasonCodes: readonly string[],
): PitShariaVerdictResult {
  return {
    symbol,
    decisionAt,
    verdict: 'UNKNOWN',
    reasonCodes,
    source: 'none',
    hash: `sha256:${createHash('sha256')
      .update(`no-eligible-filing:${symbolKey(symbol)}:${decisionAt.toISOString()}`)
      .digest('hex')}`,
    asOf: decisionAt,
    availableAt: null,
    purificationRatioBps: 'n/a — not computed',
  };
}

/**
 * Resolve the single PIT Sharia verdict a decision at `decisionAt` may rely on for `symbol`, from
 * a set of already-fetched filings (possibly covering many symbols and dates). Selects the
 * most-recently-PUBLISHED (`availableAt`) filing that was actually public by `decisionAt` — never
 * the most recent by `asOf`, which would be the exact look-ahead this module exists to prevent —
 * then screens it with the existing 30/30/5 ratio math. Fail-closed throughout: no eligible
 * filing, a stale one, or one with unknown `availableAt` all resolve to UNKNOWN, never compliant.
 */
export function resolvePitShariaVerdict(
  filings: readonly PitShariaFiling[],
  symbol: string,
  decisionAt: Date,
  options: ResolvePitShariaVerdictOptions = {},
): PitShariaVerdictResult {
  const { staleAfterDays = DEFAULT_STALENESS_HORIZON_DAYS } = options;
  const decisionMs = decisionAt.getTime();
  const key = symbolKey(symbol);

  // Filings with `availableAt === null` are excluded here, not defaulted to "available now" — an
  // unknown publish date is exactly as unusable as a missing filing (acceptance #2).
  const eligible = filings.filter((f) =>
    symbolKey(f.symbol) === key && f.availableAt !== null && f.availableAt.getTime() <= decisionMs,
  );
  if (eligible.length === 0) {
    return noEligibleFilingResult(symbol, decisionAt, ['NO_FILING_AVAILABLE_AT_DECISION']);
  }

  const selected = [...eligible].sort((a, b) => b.availableAt!.getTime() - a.availableAt!.getTime())[0];
  const asOfDate = new Date(`${selected.asOf}T00:00:00.000Z`);
  const source = selected.authority;
  const hash = filingHash(selected);

  // Defensive data-quality guard, not just a look-ahead filter: a filing publicly available
  // before the period it claims to describe is internally inconsistent (a "prophecy" filing) and
  // must never be silently trusted — flag and fail closed rather than guess which field is wrong.
  if (Number.isFinite(asOfDate.getTime()) && asOfDate.getTime() > selected.availableAt!.getTime()) {
    return {
      symbol,
      decisionAt,
      verdict: 'UNKNOWN',
      reasonCodes: ['IMPLAUSIBLE_FILING_ORDER'],
      source,
      hash,
      asOf: asOfDate,
      availableAt: selected.availableAt,
      purificationRatioBps: 'n/a — not computed',
    };
  }

  const inputs: Tier2Inputs = {
    symbol: selected.symbol,
    name: selected.symbol,
    sic: selected.sic,
    interestBearingDebtUsd: selected.interestBearingDebtUsd,
    cashAndInterestSecuritiesUsd: selected.cashAndInterestSecuritiesUsd,
    marketCapUsd: selected.marketCapUsd,
    nonCompliantIncomeUsd: selected.nonCompliantIncomeUsd,
    totalRevenueUsd: selected.totalRevenueUsd,
    asOf: selected.asOf,
  };
  // referenceDate = decisionAt (never real "now"): staleness is judged as of the decision being
  // replayed, so a historical decision cannot inherit today's freshness or today's staleness.
  const screen = computeAaoifiScreen(inputs, { maxInputAgeDays: staleAfterDays, referenceDate: decisionAt });

  // A data-quality gap (stale or missing XBRL inputs) is UNKNOWN, not a genuine screen failure —
  // only a data-complete screen may assert NON_COMPLIANT (acceptance #2 vs. sector/ratio fails).
  const dataQualityIssue = screen.reasonCodes.includes('STALE_FUNDAMENTALS')
    || screen.reasonCodes.includes('missing_xbrl_inputs');
  const verdict: ShariaEvidenceState = dataQualityIssue
    ? 'UNKNOWN'
    : screen.compliant ? 'VERIFIED_COMPLIANT' : 'NON_COMPLIANT';

  return {
    symbol,
    decisionAt,
    verdict,
    reasonCodes: screen.reasonCodes,
    source,
    hash,
    asOf: asOfDate,
    availableAt: selected.availableAt,
    purificationRatioBps: screen.purificationRatioBps,
  };
}

/**
 * Maps a resolved verdict onto the exact `PointInTimeShariaEvidence` shape membership snapshots
 * carry — no field renaming, no shape drift, no `as` cast at call sites. `id` is caller-supplied
 * because that identity belongs to the snapshot record, not the verdict computation.
 */
export function toPointInTimeShariaEvidence(
  result: PitShariaVerdictResult,
  id: string,
): PointInTimeShariaEvidence {
  return {
    id,
    source: result.source,
    hash: result.hash,
    verdict: result.verdict,
    asOf: result.asOf,
    availableAt: result.availableAt,
  };
}
