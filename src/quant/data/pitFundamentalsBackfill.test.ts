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

  it('rejects a form=10-K duration fact with ABSENT fp and a mid-year end — acceptance #1', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                { val: 250, end: '2022-06-30', filed: '2022-08-01', form: '10-K' }, // no fp at all
              ],
            },
          },
        },
      },
    };
    const { filings, skips } = selectAnnualFundamentalsHistory('FRAG', companyFacts, { sic: null });
    expect(filings).toEqual([]);
    expect(skips).toEqual([{ symbol: 'FRAG', reasonCode: 'no_annual_10k_facts' }]);
  });

  it('rejects a form=10-K, fp=FY duration fact whose start..end span is a quarter — acceptance #1 (real-shape defect)', () => {
    // Confirmed against live SEC EDGAR (WAT/Waters Corp): a 10-K's XBRL exhibit embeds prior-
    // quarter comparative duration facts (a "selected quarterly financial data" footnote) that
    // STILL carry form:'10-K', fp:'FY' — both are FILING-level tags, not per-fact ones. E.g. the
    // real fact `{start:"2009-04-05", end:"2009-07-04", val:595000, form:"10-K", fp:"FY",
    // filed:"2011-02-25"}` is a 3-month span, not a fiscal year, yet passes any fp/form-only
    // filter. Only the start..end SPAN (~90 days here, well outside the 350-380-day annual
    // window) actually distinguishes it from a genuine FY fact — this is the real leak acceptance
    // #1 must close, not merely the absent-fp case above.
    const companyFacts = {
      facts: {
        'us-gaap': {
          InterestIncomeOther: {
            units: {
              USD: [
                { val: 595_000, start: '2009-04-05', end: '2009-07-04', filed: '2011-02-25', form: '10-K', fp: 'FY' },
              ],
            },
          },
        },
      },
    };
    const { filings, skips } = selectAnnualFundamentalsHistory('QFRG', companyFacts, { sic: null });
    expect(filings).toEqual([]);
    expect(skips).toEqual([{ symbol: 'QFRG', reasonCode: 'no_annual_10k_facts' }]);
  });

  it('rejects an INSTANT (no-start) form=10-K, fp=FY fact whose frame is a Q1/Q2/Q3 sub-period — acceptance #1 (instant contamination)', () => {
    // Confirmed against live SEC EDGAR (ON Semiconductor): a 10-K embeds quarterly cash balances
    // as a "selected quarterly data" note — instant facts have no `start` to span-check, but SEC
    // itself labels them `frame: "CY2012Q1I"` etc. The real fact:
    // `{end:"2012-03-31", val:580100000, form:"10-K", fp:"FY", frame:"CY2012Q1I"}`.
    const companyFacts = {
      facts: {
        'us-gaap': {
          CashAndCashEquivalentsAtCarryingValue: {
            units: {
              USD: [
                { val: 580_100_000, end: '2012-03-31', filed: '2013-02-26', form: '10-K', fp: 'FY', frame: 'CY2012Q1I' },
              ],
            },
          },
        },
      },
    };
    const { filings, skips } = selectAnnualFundamentalsHistory('IFRG', companyFacts, { sic: null });
    expect(filings).toEqual([]);
    expect(skips).toEqual([{ symbol: 'IFRG', reasonCode: 'no_annual_10k_facts' }]);
  });

  it('admits an INSTANT form=10-K, fp=FY fact whose frame is a genuine FY-end (Q4I) balance', () => {
    const companyFacts = {
      facts: {
        'us-gaap': {
          CashAndCashEquivalentsAtCarryingValue: {
            units: {
              USD: [
                { val: 486_900_000, end: '2012-12-31', filed: '2013-02-26', form: '10-K', fp: 'FY', frame: 'CY2012Q4I' },
              ],
            },
          },
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('IOKF', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].metrics.cashAndInterestSecuritiesUsd).toBe(486_900_000);
  });

  it('admits a form=10-K, fp=FY duration fact whose span is a genuine 52/53-week fiscal year', () => {
    // Guard against over-restriction: a real annual span (364 days here) must NOT be rejected by
    // the same window that rejects the ~90-day quarter fragment above.
    const companyFacts = {
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [
                { val: 2_167_423_000, start: '2016-01-01', end: '2016-12-31', filed: '2017-02-24', form: '10-K', fp: 'FY' },
              ],
            },
          },
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('OKFY', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].asOf).toBe('2016-12-31');
    expect(filings[0].metrics.totalRevenueUsd).toBe(2_167_423_000);
  });

  it('cross-tag ties resolve by earliest filed, never by tag preference/listing order — acceptance #2', () => {
    // TIER2_CONCEPT_KEYS.revenue = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues']
    // — the NEWER ASC-606 tag is listed FIRST. If it were also filed later (a post-transition
    // restatement of the same FY), tag-preference order would wrongly attribute the newer figure
    // to whichever date happens to win by list position. Earliest-filed-wins must pick the
    // legacy `Revenues` tag's earlier `filed` date instead, regardless of key order.
    const companyFacts = {
      facts: {
        'us-gaap': {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: { USD: [gaapFact(1_050, '2017-12-31', '2019-02-26')] }, // restated, filed LATER
          },
          Revenues: {
            units: { USD: [gaapFact(1_000, '2017-12-31', '2018-02-20')] }, // original, filed EARLIER
          },
        },
      },
    };
    const { filings } = selectAnnualFundamentalsHistory('XTAG', companyFacts, { sic: null });
    expect(filings).toHaveLength(1);
    expect(filings[0].releasedAt).toBe('2018-02-20'); // earliest filed, not the first-listed tag
    expect(filings[0].metrics.totalRevenueUsd).toBe(1_000); // the figure actually public on that date
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
