import { describe, expect, it } from 'vitest';
import { selectSecSharesOutstanding, type SecFactPoint } from './secFundamentals';

describe('SEC shares outstanding point-in-time selection', () => {
  it('excludes same-day and future filings when intraday availability is unknown', () => {
    const facts: SecFactPoint[] = [
      { val: 10_000_000, filed: '2026-01-05', end: '2025-12-31' },
      { val: 20_000_000, filed: '2026-01-06', end: '2025-12-31' },
      { val: 30_000_000, filed: '2026-01-07', end: '2025-12-31' },
    ];

    expect(selectSecSharesOutstanding([facts], '2026-01-06')).toEqual({
      shares: 10_000_000,
      filedDate: '2026-01-05',
      endDate: '2025-12-31',
    });
  });

  it('uses the latest fiscal end to break ties between eligible filings', () => {
    const facts: SecFactPoint[] = [
      { val: 10_000_000, filed: '2026-01-05', end: '2025-09-30' },
      { val: 11_000_000, filed: '2026-01-05', end: '2025-12-31' },
    ];

    expect(selectSecSharesOutstanding([facts], '2026-01-06')?.shares).toBe(11_000_000);
  });

  it('can include the filing day for end-of-day fundamentals ingestion', () => {
    const facts: SecFactPoint[] = [
      { val: 11_000_000, filed: '2026-01-05', end: '2025-12-31' },
      { val: 12_000_000, filed: '2026-01-06', end: '2025-12-31' },
    ];

    expect(selectSecSharesOutstanding([facts], '2026-01-05', { filedInclusive: true })?.shares)
      .toBe(11_000_000);
  });

  it.each([
    ['measurement end after filing', { val: 10, filed: '2026-01-05', end: '2026-01-06' }],
    ['invalid measurement end', { val: 10, filed: '2026-01-05', end: '2026-02-30' }],
    ['invalid filing date', { val: 10, filed: 'bad-date', end: '2025-12-31' }],
  ])('rejects malformed SEC fact date order: %s', (_label, fact) => {
    expect(selectSecSharesOutstanding([[fact]], '2026-01-07')).toBeNull();
  });
});
