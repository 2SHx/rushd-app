// Offline, keyless, zero-network tests for src/quant/data/pitFundamentalsBackfill.ts. Fixtures
// below are hand-built but structurally faithful to real SEC EDGAR companyfacts/submissions JSON
// (same field names: val/end/filed/form/fp under facts['us-gaap'][concept].units.USD).
import { describe, expect, it, vi } from 'vitest';
import { selectAnnualFundamentalsHistory } from './pitFundamentalsBackfill';

function gaapFact(val: number, end: string, filed: string, extra: Partial<{ form: string; fp: string }> = {}) {
  return { val, end, filed, form: '10-K', fp: 'FY', ...extra };
}

describe('selectAnnualFundamentalsHistory — point-in-time contract', () => {
  it('sets releasedAt to the SEC `filed` date, never the fiscal `end` — acceptance #1', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [gaapFact(1_000, '2019-12-31', '2020-02-15')] } },
        },
      },
    };
    const { filings, skips } = selectAnnualFundamentalsHistory('ABCD', companyFacts, { sic: '3674' });
    expect(skips).toEqual([]);
    expect(filings).toHaveLength(1);
    expect(filings[0].asOf).toBe('2019-12-31');
    expect(filings[0].releasedAt).toBe('2020-02-15'); // filed, not end
    expect(filings[0].releasedAt).not.toBe(filings[0].asOf);

    // Prove the PIT consequence directly: a decision date D between `end` and `filed` must NOT
    // see this row as available, even though the period it describes already ended.
    const D_between = '2020-01-15'; // after end, before filed
    const D_after_filed = '2020-02-16';
    expect(filings[0].releasedAt <= D_between).toBe(false);
    expect(filings[0].releasedAt <= D_after_filed).toBe(true);
  });

  it('rejects a fact whose `end` postdates its own `filed` (a "prophecy" fact) — acceptance #2', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [gaapFact(1_000, '2020-06-01', '2020-01-01')] } }, // end > filed
        },
      },
    };
    const { filings, skips } = selectAnnualFundamentalsHistory('BAD1', companyFacts, { sic: null });
    expect(filings).toEqual([]);
    expect(skips).toEqual([{ symbol: 'BAD1', reasonCode: 'no_annual_10k_facts' }]);
  });

  it('persists one row per distinct fiscal period — a real history, not a single snapshot', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                gaapFact(900, '2021-12-31', '2022-02-10'),
                gaapFact(1_000, '2022-12-31', '2023-02-12'),
                gaapFact(1_100, '2023-12-31', '2024-02-14'),
                gaapFact(1_200, '2024-12-31', '2025-02-13'),
              ],
            },
          },
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('MULT', companyFacts, { sic: '7372' });
    expect(filings).toHaveLength(4);
    expect(filings.map((f) => f.asOf)).toEqual(['2021-12-31', '2022-12-31', '2023-12-31', '2024-12-31']);
    expect(new Set(filings.map((f) => f.releasedAt)).size).toBe(4); // genuinely distinct filings
  });

  it('a row\'s releasedAt is the MAX filed among its contributing concepts, not the min', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          LongTermDebt: { units: { USD: [gaapFact(500, '2022-12-31', '2023-02-01')] } },
          Revenues: { units: { USD: [gaapFact(1_000, '2022-12-31', '2023-03-15')] } }, // filed later
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('MIX1', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].releasedAt).toBe('2023-03-15');
    expect(filings[0].metrics.interestBearingDebtUsd).toBe(500);
    expect(filings[0].metrics.totalRevenueUsd).toBe(1_000);
  });

  it('the earliest filed wins when a period is amended/restated later under the same concept', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                gaapFact(1_000, '2022-12-31', '2023-02-15'), // original 10-K
                gaapFact(1_050, '2022-12-31', '2023-08-01', { form: '10-K/A' }), // later amendment
              ],
            },
          },
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('AMND', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].releasedAt).toBe('2023-02-15');
    expect(filings[0].metrics.totalRevenueUsd).toBe(1_000);
  });

  it('excludes 10-Q (non-annual) facts, never mixing quarterly figures into the annual history', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                { val: 250, end: '2022-03-31', filed: '2022-05-01', form: '10-Q', fp: 'Q1' },
                gaapFact(1_000, '2022-12-31', '2023-02-15'),
              ],
            },
          },
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('QTLY', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].asOf).toBe('2022-12-31');
  });

  it('never fabricates: missing concepts yield null fields, not guessed values', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: { units: { USD: [gaapFact(1_000, '2022-12-31', '2023-02-15')] } },
          // no debt, cash, or non-compliant-income tags at all
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('SPRS', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].metrics.interestBearingDebtUsd).toBeNull();
    expect(filings[0].metrics.cashAndInterestSecuritiesUsd).toBeNull();
    expect(filings[0].metrics.nonCompliantIncomeUsd).toBeNull();
  });

  it('a symbol with zero eligible annual facts yields a counted skip, never a fabricated row', () => {
    const { filings, skips } = selectAnnualFundamentalsHistory('EMPT', { facts: { 'us-gaap': {} } }, { sic: null });
    expect(filings).toEqual([]);
    expect(skips).toEqual([{ symbol: 'EMPT', reasonCode: 'no_annual_10k_facts' }]);
  });

  it('an unparseable fact (bad date, non-finite value) is dropped, not persisted with a guess', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                { val: Number.NaN, end: '2022-12-31', filed: '2023-02-15', form: '10-K', fp: 'FY' },
                { val: 1_000, end: '2022-02-30', filed: '2023-02-15', form: '10-K', fp: 'FY' }, // invalid date
                { val: 1_000, end: '2021-12-31', filed: 'not-a-date', form: '10-K', fp: 'FY' },
              ],
            },
          },
        },
      },
    };
    const { filings, skips } = selectAnnualFundamentalsHistory('JUNK', companyFacts, { sic: null });
    expect(filings).toEqual([]);
    expect(skips).toEqual([{ symbol: 'JUNK', reasonCode: 'no_annual_10k_facts' }]);
  });

  it('is a pure function: makes zero network calls', () => {
    const fetchSpy = vi.fn();
    const original = global.fetch;
    global.fetch = fetchSpy as any;
    try {
      selectAnnualFundamentalsHistory('NONE', { facts: { 'us-gaap': {} } }, { sic: null });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = original;
    }
  });
});
