import { describe, it, expect } from 'vitest';
import { computeAaoifiScreen, excludedSicCategory, type Tier2Inputs } from './tier2AaoifiScreener';

const base: Tier2Inputs = {
  symbol: 'TEST',
  name: 'Test Corp',
  sic: '3674', // Semiconductors — not excluded
  interestBearingDebtUsd: 1_000,
  cashAndInterestSecuritiesUsd: 1_000,
  marketCapUsd: 100_000,
  nonCompliantIncomeUsd: 100,
  totalRevenueUsd: 10_000,
  asOf: '2026-01-01',
};

describe('computeAaoifiScreen', () => {
  it('passes a clean name and returns purificationRatioBps = round(nonCompliantIncome/revenue * 10000)', () => {
    const result = computeAaoifiScreen(base);
    expect(result.compliant).toBe(true);
    expect(result.purificationRatioBps).toBe(100); // 100/10000 = 1% = 100bps
    expect(result.reasonCodes).toEqual([]);
  });

  it('fails-closed on debt >= 30% of mcap', () => {
    const result = computeAaoifiScreen({ ...base, interestBearingDebtUsd: 30_000 });
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('debt_to_mcap_exceeds_30pct');
  });

  it('fails-closed on cash+interest-securities >= 30% of mcap', () => {
    const result = computeAaoifiScreen({ ...base, cashAndInterestSecuritiesUsd: 30_000 });
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('cash_and_interest_securities_to_mcap_exceeds_30pct');
  });

  it('fails-closed on non-compliant income >= 5% of revenue', () => {
    const result = computeAaoifiScreen({ ...base, nonCompliantIncomeUsd: 500 });
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('non_compliant_income_exceeds_5pct');
  });

  it('fails-closed on an excluded sector (conventional finance SIC)', () => {
    const result = computeAaoifiScreen({ ...base, sic: '6020' });
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('excluded_sector:conventional_finance');
  });

  for (const field of [
    'interestBearingDebtUsd',
    'cashAndInterestSecuritiesUsd',
    'marketCapUsd',
    'nonCompliantIncomeUsd',
    'totalRevenueUsd',
  ] as const) {
    it(`fails-closed when ${field} is missing (null) rather than defaulting to zero`, () => {
      const result = computeAaoifiScreen({ ...base, [field]: null });
      expect(result.compliant).toBe(false);
      expect(result.reasonCodes).toContain('missing_xbrl_inputs');
      expect(result.purificationRatioBps).toBe('n/a — not computed');
    });
  }

  it('fails-closed on a zero/negative market cap or revenue (division-by-zero guard)', () => {
    expect(computeAaoifiScreen({ ...base, marketCapUsd: 0 }).compliant).toBe(false);
    expect(computeAaoifiScreen({ ...base, totalRevenueUsd: -1 }).compliant).toBe(false);
  });
});

describe('computeAaoifiScreen — STALE_FUNDAMENTALS (fail-closed on old inputs, not just missing ones)', () => {
  const referenceDate = new Date('2026-07-19T00:00:00.000Z');

  it('passes a fresh input (well within the default 550-day ceiling)', () => {
    const result = computeAaoifiScreen({ ...base, asOf: '2026-01-01' }, { referenceDate }); // ~199d old
    expect(result.compliant).toBe(true);
    expect(result.reasonCodes).not.toContain('STALE_FUNDAMENTALS');
  });

  it('fails-closed on an input older than the default 550-day ceiling (e.g. a multi-year-stale XBRL tag)', () => {
    const result = computeAaoifiScreen({ ...base, asOf: '2023-09-30' }, { referenceDate }); // ~1023d old
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('STALE_FUNDAMENTALS');
    // ratios are still surfaced for transparency even though the name is excluded
    expect(result.ratios).not.toBeNull();
    expect(result.purificationRatioBps).toBe(100);
  });

  it('boundary: exactly maxInputAgeDays old still passes; one day older fails', () => {
    const maxInputAgeDays = 30;
    const exactBoundary = new Date(referenceDate.getTime() - maxInputAgeDays * 86_400_000);
    const oneDayOlder = new Date(referenceDate.getTime() - (maxInputAgeDays + 1) * 86_400_000);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const atBoundary = computeAaoifiScreen({ ...base, asOf: iso(exactBoundary) }, { referenceDate, maxInputAgeDays });
    expect(atBoundary.reasonCodes).not.toContain('STALE_FUNDAMENTALS');
    expect(atBoundary.compliant).toBe(true);

    const pastBoundary = computeAaoifiScreen({ ...base, asOf: iso(oneDayOlder) }, { referenceDate, maxInputAgeDays });
    expect(pastBoundary.reasonCodes).toContain('STALE_FUNDAMENTALS');
    expect(pastBoundary.compliant).toBe(false);
  });

  it('respects a custom maxInputAgeDays parameter', () => {
    const result = computeAaoifiScreen({ ...base, asOf: '2026-06-01' }, { referenceDate, maxInputAgeDays: 10 });
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('STALE_FUNDAMENTALS');
  });

  it('fails-closed on an unparseable asOf date rather than treating it as fresh', () => {
    const result = computeAaoifiScreen({ ...base, asOf: 'not-a-date' }, { referenceDate });
    expect(result.compliant).toBe(false);
    expect(result.reasonCodes).toContain('STALE_FUNDAMENTALS');
  });
});

describe('excludedSicCategory', () => {
  it('returns null for a non-excluded sector and null/garbage SIC', () => {
    expect(excludedSicCategory('3674')).toBeNull();
    expect(excludedSicCategory(null)).toBeNull();
    expect(excludedSicCategory('not-a-number')).toBeNull();
  });

  it('categorizes known excluded ranges', () => {
    expect(excludedSicCategory('6020')).toBe('conventional_finance');
    expect(excludedSicCategory('2082')).toBe('alcohol');
    expect(excludedSicCategory('2111')).toBe('tobacco');
    expect(excludedSicCategory('7993')).toBe('gambling');
    expect(excludedSicCategory('3480')).toBe('weapons');
  });
});
