import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeAaoifiScreen } from './tier2AaoifiScreener';
import {
  PIT_SHARIA_ADMITTED_AUTHORITIES,
  resolvePitShariaVerdict,
  toPointInTimeShariaEvidence,
  type PitShariaFiling,
} from './pitShariaVerdict';
import {
  assertPointInTimeMembershipCoverage,
  DataQualityPitError,
  type PointInTimeShariaEvidence,
  type PointInTimeUniverseSnapshot,
} from './pointInTimeMembership';

const decision = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** A clean, complete, comfortably-compliant filing (mirrors tier2AaoifiScreener.test.ts's fixture). */
const cleanFiling = (overrides: Partial<PitShariaFiling> = {}): PitShariaFiling => ({
  symbol: 'ABC',
  authority: 'AAOIFI',
  sic: '3674', // semiconductors — not excluded
  interestBearingDebtUsd: 1_000,
  cashAndInterestSecuritiesUsd: 1_000,
  marketCapUsd: 100_000,
  nonCompliantIncomeUsd: 100,
  totalRevenueUsd: 10_000,
  asOf: '2024-01-01',
  availableAt: at('2024-02-15'),
  ...overrides,
});

describe('resolvePitShariaVerdict — fail-closed cases (acceptance #2)', () => {
  it('no filing at all for the symbol ⇒ UNKNOWN, never compliant', () => {
    const result = resolvePitShariaVerdict([], 'ABC', decision('2024-06-01'));
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('NO_FILING_AVAILABLE_AT_DECISION');
  });

  it('a filing with unknown availableAt ⇒ UNKNOWN, never compliant (not treated as "available now")', () => {
    const filing = cleanFiling({ availableAt: null });
    const result = resolvePitShariaVerdict([filing], 'ABC', decision('2024-06-01'));
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('NO_FILING_AVAILABLE_AT_DECISION');
  });

  it('a filing older than the declared staleness horizon ⇒ UNKNOWN, never compliant', () => {
    const decisionAt = decision('2026-01-01');
    const filing = cleanFiling({ asOf: '2024-01-01', availableAt: at('2024-02-15') }); // ~700d old at decisionAt
    const result = resolvePitShariaVerdict([filing], 'ABC', decisionAt);
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('STALE_FUNDAMENTALS');
  });
});

describe('resolvePitShariaVerdict — declared 550-day staleness horizon (acceptance #6)', () => {
  // 550 days = one fiscal year + typical filing lag; same ceiling as tier2AaoifiScreener's own
  // DEFAULT_MAX_INPUT_AGE_DAYS, reused here rather than inventing a second, inconsistent number.
  it('exactly 550 days old still resolves; 551 days old is UNKNOWN', () => {
    const decisionAt = decision('2026-01-01');
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const at550 = iso(new Date(decisionAt.getTime() - 550 * 86_400_000));
    const at551 = iso(new Date(decisionAt.getTime() - 551 * 86_400_000));

    const okFiling = cleanFiling({ asOf: at550, availableAt: at(at550) });
    const staleFiling = cleanFiling({ asOf: at551, availableAt: at(at551) });

    expect(resolvePitShariaVerdict([okFiling], 'ABC', decisionAt).verdict).toBe('VERIFIED_COMPLIANT');
    const stale = resolvePitShariaVerdict([staleFiling], 'ABC', decisionAt);
    expect(stale.verdict).toBe('UNKNOWN');
    expect(stale.reasonCodes).toContain('STALE_FUNDAMENTALS');
  });

  it('a caller may narrow the horizon; a filing that passes the default fails a stricter one', () => {
    const decisionAt = decision('2024-06-01');
    const filing = cleanFiling({ asOf: '2024-01-01', availableAt: at('2024-02-15') }); // ~150d old
    expect(resolvePitShariaVerdict([filing], 'ABC', decisionAt).verdict).toBe('VERIFIED_COMPLIANT');
    const strict = resolvePitShariaVerdict([filing], 'ABC', decisionAt, { staleAfterDays: 30 });
    expect(strict.verdict).toBe('UNKNOWN');
    expect(strict.reasonCodes).toContain('STALE_FUNDAMENTALS');
  });
});

describe('resolvePitShariaVerdict — no look-ahead on `availableAt` vs. `asOf` (acceptance #1)', () => {
  it('excludes a filing whose period precedes D but which published AFTER D — proving the flip it would otherwise cause', () => {
    const filingA = cleanFiling({ asOf: '2024-01-01', availableAt: at('2024-02-15') }); // clean, safely public before D
    const filingB = cleanFiling({
      asOf: '2024-03-31', // period still precedes D
      availableAt: at('2024-07-01'), // but only became PUBLIC after D
      interestBearingDebtUsd: 40_000, // 40% of mcap — breaches the 30% debt ratio
    });
    const decisionAt = decision('2024-06-01');

    const result = resolvePitShariaVerdict([filingA, filingB], 'ABC', decisionAt);
    expect(result.verdict).toBe('VERIFIED_COMPLIANT');
    expect(result.asOf.toISOString().slice(0, 10)).toBe('2024-01-01'); // filing A, not B

    // Prove the counterfactual: selecting by `asOf` alone (the look-ahead bug) would have picked
    // B — its asOf is later than A's — and flipped the verdict to NON_COMPLIANT.
    const byAsOfAlone = [filingA, filingB]
      .filter((f) => f.asOf <= '2024-06-01')
      .sort((a, b) => (a.asOf < b.asOf ? 1 : -1))[0];
    expect(byAsOfAlone).toBe(filingB);
    const counterfactual = computeAaoifiScreen(
      {
        symbol: filingB.symbol,
        name: filingB.symbol,
        sic: filingB.sic,
        interestBearingDebtUsd: filingB.interestBearingDebtUsd,
        cashAndInterestSecuritiesUsd: filingB.cashAndInterestSecuritiesUsd,
        marketCapUsd: filingB.marketCapUsd,
        nonCompliantIncomeUsd: filingB.nonCompliantIncomeUsd,
        totalRevenueUsd: filingB.totalRevenueUsd,
        asOf: filingB.asOf,
      },
      { referenceDate: decisionAt },
    );
    expect(counterfactual.compliant).toBe(false); // the flip this module's PIT filtering prevents
  });
});

describe('resolvePitShariaVerdict — evolving verdicts over time (acceptance #4)', () => {
  it('the same symbol returns DIFFERENT verdicts at different decision dates as new filings publish', () => {
    const filingClean = cleanFiling({ asOf: '2024-01-01', availableAt: at('2024-02-01') });
    const filingBreach = cleanFiling({
      asOf: '2024-04-01',
      availableAt: at('2024-05-01'),
      interestBearingDebtUsd: 40_000,
    });
    const filings = [filingClean, filingBreach];

    const early = resolvePitShariaVerdict(filings, 'ABC', decision('2024-03-01'));
    expect(early.verdict).toBe('VERIFIED_COMPLIANT');

    const late = resolvePitShariaVerdict(filings, 'ABC', decision('2024-06-01'));
    expect(late.verdict).toBe('NON_COMPLIANT');
  });
});

describe('resolvePitShariaVerdict — reuses computeAaoifiScreen, does not reimplement (acceptance #3)', () => {
  it('purificationRatioBps and reason codes are the exact values tier2AaoifiScreener computes', () => {
    const decisionAt = decision('2024-06-01');
    const result = resolvePitShariaVerdict([cleanFiling({ nonCompliantIncomeUsd: 250 })], 'ABC', decisionAt);
    expect(result.purificationRatioBps).toBe(250); // 250/10000 = 2.5% = 250bps, tier2's bps() math
    expect(result.verdict).toBe('VERIFIED_COMPLIANT');

    const breach = resolvePitShariaVerdict(
      [cleanFiling({ interestBearingDebtUsd: 30_000 })],
      'ABC',
      decisionAt,
    );
    expect(breach.reasonCodes).toContain('debt_to_mcap_exceeds_30pct'); // tier2's own reason-code literal
    expect(breach.verdict).toBe('NON_COMPLIANT');
  });

  it('a fresh, complete filing in an excluded sector is a definitive NON_COMPLIANT, not a data-quality UNKNOWN', () => {
    const result = resolvePitShariaVerdict([cleanFiling({ sic: '6020' })], 'ABC', decision('2024-06-01'));
    expect(result.verdict).toBe('NON_COMPLIANT');
    expect(result.reasonCodes).toContain('excluded_sector:conventional_finance');
  });

  it('fails-closed on an internally inconsistent filing whose period is after its own publish date', () => {
    const filing = cleanFiling({ asOf: '2024-08-01', availableAt: at('2024-06-01') });
    const result = resolvePitShariaVerdict([filing], 'ABC', decision('2024-09-01'));
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCodes).toContain('IMPLAUSIBLE_FILING_ORDER');
  });
});

describe('acceptance #5: output populates PointInTimeShariaEvidence without shape changes', () => {
  function snapshotWith(evidence: PointInTimeShariaEvidence): PointInTimeUniverseSnapshot {
    return {
      id: 'snap-1',
      source: 'pit-sharia-test',
      hash: 'sha256:snap',
      asOf: decision('2024-05-30'),
      availableAt: decision('2024-05-30'),
      effectiveFrom: decision('2024-05-30'),
      effectiveTo: null,
      lifecycleCoverage: { delisted: true, suspended: true },
      records: [
        { symbol: 'ABC', membership: 'IN', lifecycle: 'ACTIVE', lifecycleEffectiveAt: null, shariaEvidence: evidence },
      ],
    };
  }

  it('maps directly onto PointInTimeShariaEvidence and clears assertPointInTimeMembershipCoverage end-to-end', () => {
    const decisionAt = decision('2024-06-01');
    const compliant = resolvePitShariaVerdict([cleanFiling()], 'ABC', decisionAt);
    const evidence: PointInTimeShariaEvidence = toPointInTimeShariaEvidence(compliant, 'ev-abc-1');
    expect(evidence.verdict).toBe('VERIFIED_COMPLIANT');

    expect(() => assertPointInTimeMembershipCoverage({
      snapshots: [snapshotWith(evidence)],
      decisionTimes: [decisionAt],
      requiredSymbols: ['ABC'],
    })).not.toThrow();
  });

  it('a NON_COMPLIANT verdict hard-vetoes the member through the same integration path', () => {
    const decisionAt = decision('2024-06-01');
    const breach = resolvePitShariaVerdict(
      [cleanFiling({ interestBearingDebtUsd: 40_000 })],
      'ABC',
      decisionAt,
    );
    const evidence = toPointInTimeShariaEvidence(breach, 'ev-abc-2');

    expect(() => assertPointInTimeMembershipCoverage({
      snapshots: [snapshotWith(evidence)],
      decisionTimes: [decisionAt],
      requiredSymbols: ['ABC'],
    })).toThrow(DataQualityPitError);
  });

  it('an UNKNOWN verdict (no filing) also blocks the member through the same integration path', () => {
    const decisionAt = decision('2024-06-01');
    const unscreened = resolvePitShariaVerdict([], 'ABC', decisionAt);
    const evidence = toPointInTimeShariaEvidence(unscreened, 'ev-abc-3');

    expect(() => assertPointInTimeMembershipCoverage({
      snapshots: [snapshotWith(evidence)],
      decisionTimes: [decisionAt],
      requiredSymbols: ['ABC'],
    })).toThrow(DataQualityPitError);
  });
});

describe('acceptance #7: admitted-authority allowlist excludes the Egyptian Fatwa Authority', () => {
  it('the admitted list is exactly AAOIFI, Al-Rajhi, and S&P Shariah', () => {
    expect(PIT_SHARIA_ADMITTED_AUTHORITIES).toEqual(['AAOIFI', 'Al-Rajhi', 'S&P Shariah']);
  });

  it('no source string in this module names the Egyptian Fatwa Authority, in English or Arabic', () => {
    const source = readFileSync(new URL('./pitShariaVerdict.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Egyptian Fatwa/i);
    expect(source).not.toContain('دار الإفتاء');
  });

  it('has no network, provider, or database dependency', () => {
    const source = readFileSync(new URL('./pitShariaVerdict.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('prisma');
  });
});
