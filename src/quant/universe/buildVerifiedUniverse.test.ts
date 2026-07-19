import { describe, it, expect } from 'vitest';
import { buildVerifiedUniverse, lookupInUniverse } from './buildVerifiedUniverse';
import type { Tier2Inputs } from './tier2AaoifiScreener';

describe('buildVerifiedUniverse', () => {
  it('returns ≥200 Tier-1 names, each carrying symbol/tier/purificationRatioBps/reasonCodes', () => {
    const result = buildVerifiedUniverse();
    expect(result.entries.length).toBeGreaterThanOrEqual(200);
    for (const e of result.entries) {
      expect(typeof e.symbol).toBe('string');
      expect(e.tier).toBe('index-provider-screened');
      expect(e.purificationRatioBps).toBe('n/a — not computed');
      expect(Array.isArray(e.reasonCodes)).toBe(true);
    }
  });

  it('a symbol absent from the fixture (and no Tier-2 candidate) is fail-closed excluded', () => {
    const result = buildVerifiedUniverse();
    const looked = lookupInUniverse(result, 'NOT_A_REAL_TICKER_XYZ');
    expect('reasonCode' in looked).toBe(true);
    expect((looked as any).reasonCode).toBe('not_in_verified_universe');
  });

  it('widens coverage with a compliant Tier-2 candidate not already in Tier-1', () => {
    const candidate: Tier2Inputs = {
      symbol: 'ZZZZ',
      name: 'New Co',
      sic: '3674',
      interestBearingDebtUsd: 100,
      cashAndInterestSecuritiesUsd: 100,
      marketCapUsd: 100_000,
      nonCompliantIncomeUsd: 50,
      totalRevenueUsd: 10_000,
      asOf: '2026-01-01',
    };
    const result = buildVerifiedUniverse({ tier2Candidates: [candidate] });
    const entry = result.entries.find((e) => e.symbol === 'ZZZZ');
    expect(entry).toBeTruthy();
    expect(entry!.tier).toBe('rushd-xbrl-screened');
    expect(entry!.purificationRatioBps).toBe(50); // 50/10000 = 0.5% = 50bps
  });

  it('excludes a Tier-2 candidate with missing XBRL inputs, fail-closed', () => {
    const candidate: Tier2Inputs = {
      symbol: 'YYYY',
      name: 'Missing Data Co',
      sic: '3674',
      interestBearingDebtUsd: null,
      cashAndInterestSecuritiesUsd: 100,
      marketCapUsd: 100_000,
      nonCompliantIncomeUsd: 50,
      totalRevenueUsd: 10_000,
      asOf: '2026-01-01',
    };
    const result = buildVerifiedUniverse({ tier2Candidates: [candidate] });
    expect(result.entries.some((e) => e.symbol === 'YYYY')).toBe(false);
    expect(result.excluded.some((e) => e.symbol === 'YYYY' && e.reasonCode.includes('missing_xbrl_inputs'))).toBe(true);
  });

  it('a Tier-1 name is never re-screened/duplicated via a Tier-2 candidate of the same symbol', () => {
    const candidate: Tier2Inputs = {
      symbol: 'NVDA',
      name: 'NVIDIA Corp',
      sic: '3674',
      interestBearingDebtUsd: 1,
      cashAndInterestSecuritiesUsd: 1,
      marketCapUsd: 1,
      nonCompliantIncomeUsd: 1,
      totalRevenueUsd: 1,
      asOf: '2026-01-01',
    };
    const result = buildVerifiedUniverse({ tier2Candidates: [candidate] });
    const nvdaEntries = result.entries.filter((e) => e.symbol === 'NVDA');
    expect(nvdaEntries).toHaveLength(1);
    expect(nvdaEntries[0].tier).toBe('index-provider-screened'); // Tier-1 wins
  });

  it('never fabricates a Tier-3 (Zoya) entry even when the key flag is set', () => {
    const result = buildVerifiedUniverse({ zoyaKeyConfigured: true });
    expect(result.entries.some((e) => e.tier === 'zoya-verified')).toBe(false);
  });
});
