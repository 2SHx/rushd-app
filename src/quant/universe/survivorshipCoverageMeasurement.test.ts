import { describe, expect, it, vi } from 'vitest';
import type { SpusNportSnapshot } from './spusNport';
import {
  buildSurvivorshipMeasurement,
  measureSurvivorshipCoverage,
  renderSurvivorshipMemo,
  UNAVAILABLE_REASONS,
} from '../../../scripts/measure-survivorship-coverage';

function snapshot(
  accession: string,
  reportDate: string,
  availableAt: string,
  holdings: readonly [symbol: string, valueUsd: string][],
  unresolvedValues: readonly string[] = [],
): SpusNportSnapshot {
  return {
    accession,
    reportDate: new Date(`${reportDate}T00:00:00.000Z`),
    availableAt: new Date(`${availableAt}T00:00:00.000Z`),
    registrantName: 'Synthetic fund',
    seriesName: 'Synthetic series',
    source: 'SEC_NPORT_P',
    primaryDocumentUrl: `https://example.invalid/${accession}.xml`,
    headerDocumentUrl: `https://example.invalid/${accession}.html`,
    primaryDocumentHash: `sha256:${'a'.repeat(64)}`,
    headerDocumentHash: `sha256:${'b'.repeat(64)}`,
    holdings: holdings.map(([symbol, valueUsd]) => ({
      symbol,
      symbolEvidence: 'FILING_TICKER',
      isin: null,
      name: symbol,
      title: 'Common Stock',
      cusip: '123456789',
      balance: '1',
      valueUsd,
      assetCategory: 'EC',
      issuerCategory: 'CORP',
    })),
    unresolvedHoldings: unresolvedValues.map((valueUsd, index) => ({
      isin: `US00000000${index.toString().padStart(2, '0')}`,
      name: `Unresolved ${index}`,
      title: 'Common Stock',
      cusip: `00000000${index}`,
      balance: '1',
      valueUsd,
      assetCategory: 'EC',
      issuerCategory: 'CORP',
      reason: 'NOT_IN_CROSSWALK',
    })),
    membershipUnknownSymbols: [],
    unidentifiedHoldings: [],
  };
}

const syntheticSnapshots = Object.freeze([
  snapshot('first', '2020-01-31', '2020-03-31', [['DEADCO', '60'], ['KEEP', '40']]),
  snapshot('second', '2020-04-30', '2020-06-30', [['KEEP', '100']]),
]);

describe('offline survivorship coverage measurement', () => {
  it('derives membership only from PIT snapshots and never substitutes a current-symbol domain', () => {
    const result = measureSurvivorshipCoverage(syntheticSnapshots);

    expect(result.formationDates[0].identifiedSymbols).toEqual(['DEADCO', 'KEEP']);
    expect(result.historicalIdentifiedSymbolCount).toBe(2);
    expect(result.m1.status).toBe('UNAVAILABLE');
    expect(result.m1.reasonCodes).toContain(UNAVAILABLE_REASONS.marketBars);
  });

  it('keeps permanent fund removals unclassified and confirmed-delisting counts unavailable', () => {
    const result = measureSurvivorshipCoverage(syntheticSnapshots);

    expect(result.m2.confirmedDelistingAdjacentOpportunityCount).toBeNull();
    expect(result.m2.unclassifiedPermanentRemovals.map((row) => row.symbol)).toEqual(['DEADCO']);
    expect(result.m2.reasonCodes).toContain(UNAVAILABLE_REASONS.lifecycle);
    expect(result.m3.confirmedDelistingExposureLowerBound).toBeNull();
    expect(result.m3.confirmedDelistingExposureUpperBound).toBeNull();
  });

  it('includes unresolved positions in fund weight and rank but never in symbol classification', () => {
    const snapshots = [
      snapshot('first', '2020-01-31', '2020-03-31', [['DEADCO', '60'], ['KEEP', '40']], ['100']),
      snapshot('second', '2020-04-30', '2020-06-30', [['KEEP', '100']]),
    ];
    const result = measureSurvivorshipCoverage(snapshots);
    const removal = result.m2.unclassifiedPermanentRemovals[0];

    expect(result.historicalIdentifiedSymbolCount).toBe(2);
    expect(result.formationDates[0].unresolvedMemberCount).toBe(1);
    expect(result.m2.unclassifiedPermanentRemovals).toHaveLength(1);
    expect(removal).toMatchObject({ symbol: 'DEADCO', finalFundWeight: '30.0000%', finalFundWeightRank: 2 });
  });

  it('renders byte-identical output without prohibited corrected performance metrics', () => {
    const result = measureSurvivorshipCoverage(syntheticSnapshots);
    const first = renderSurvivorshipMemo(result);
    const second = renderSurvivorshipMemo(result);

    expect(second).toBe(first);
    expect(first).not.toMatch(/CAGR|Sharpe|drawdown/i);
    expect(first).toContain('This memo measures exposure only. It produces no corrected return statistic.');
  });

  it('loads the committed fixtures without calling fetch', () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('network access is forbidden');
    });
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const result = buildSurvivorshipMeasurement();
      expect(result.formationDates).toHaveLength(25);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
