import { describe, expect, it } from 'vitest';
import {
  computeGapMetrics,
  isGapCandidate,
  filterCommonStockAssets,
  isInMcapBand,
  isPitEligibleCandidateDay,
  parsePositiveIntegerCap,
  compareCandidateDays,
  parseSnapshotArtifactCandidate,
  parseCandidateArtifact,
  isCandidateSplitSafe,
  assertSplitQueryCoversFacts,
  GAPPER_CANDIDATE_PARAMS_V1,
} from './gapperCandidates';

describe('gapperCandidates (pure daily-bar candidate generator)', () => {
  it('computes open-gap and range-move percentages vs prior close', () => {
    const metrics = computeGapMetrics({ open: 10.6, high: 11, close: 10.8, volume: 1 }, 10);
    expect(metrics?.openGapPct).toBeCloseTo(6, 9);
    expect(metrics?.rangeMovePct).toBeCloseTo(10, 9);
  });

  it('returns null when prior close is missing or non-positive', () => {
    expect(computeGapMetrics({ open: 1, high: 1, close: 1, volume: 1 }, null)).toBeNull();
    expect(computeGapMetrics({ open: 1, high: 1, close: 1, volume: 1 }, 0)).toBeNull();
    expect(computeGapMetrics({ open: 1, high: 1, close: 1, volume: 1 }, -5)).toBeNull();
  });

  it('flags a candidate on open-gap alone, above the v1 volume floor', () => {
    const metrics = { openGapPct: 3.5, rangeMovePct: 1 };
    expect(isGapCandidate(metrics, 400_000)).toBe(true);
  });

  it('flags a candidate on range-move alone, above the v1 volume floor', () => {
    const metrics = { openGapPct: 0, rangeMovePct: 5.2 };
    expect(isGapCandidate(metrics, 400_000)).toBe(true);
  });

  it('rejects below both thresholds', () => {
    const metrics = { openGapPct: 1, rangeMovePct: 2 };
    expect(isGapCandidate(metrics, 10_000_000)).toBe(false);
  });

  it('rejects below the daily-volume floor even with a huge gap', () => {
    const metrics = { openGapPct: 50, rangeMovePct: 60 };
    expect(isGapCandidate(metrics, 100)).toBe(false);
  });

  it('respects the exact v1 thresholds at the boundary (inclusive)', () => {
    expect(
      isGapCandidate(
        { openGapPct: GAPPER_CANDIDATE_PARAMS_V1.openGapMinPct, rangeMovePct: 0 },
        GAPPER_CANDIDATE_PARAMS_V1.minVolume,
      ),
    ).toBe(true);
  });

  it('filters out ETFs, warrants, rights, units, SPAC shells by name/symbol heuristics', () => {
    const filtered = filterCommonStockAssets([
      { symbol: 'ABCD', name: 'Acme Biotech, Inc. Common Stock' },
      { symbol: 'AAAP', name: 'Pacer Funds Trust Pacer Barings CLO Market Flex ETF' },
      { symbol: 'ABCW', name: 'Acme Biotech Warrant' },
      { symbol: 'ABCU', name: 'Acme Acquisition Corp Unit' },
      { symbol: 'ABCR', name: 'Acme Acquisition Corp Rights' },
      { symbol: 'ABCDE', name: 'Widget Preferred Shares Series A' },
    ]);
    expect(filtered).toEqual([{ symbol: 'ABCD', name: 'Acme Biotech, Inc. Common Stock' }]);
  });

  it('checks mcap band membership inclusively at both edges', () => {
    const band = { mcapMin: 10_000_000, mcapMax: 400_000_000 };
    expect(isInMcapBand(10_000_000, band)).toBe(true);
    expect(isInMcapBand(400_000_000, band)).toBe(true);
    expect(isInMcapBand(9_999_999, band)).toBe(false);
    expect(isInMcapBand(400_000_001, band)).toBe(false);
  });

  it('keeps a historically eligible day when the same symbol is out of band later', () => {
    const band = { mcapMin: 10_000_000, mcapMax: 400_000_000 };
    const candidateMetrics = { openGapPct: 6, rangeMovePct: 8 };
    const historicalDay = { metrics: candidateMetrics, volume: 500_000, pitMcap: 250_000_000 };
    const laterCurrentDay = { metrics: candidateMetrics, volume: 500_000, pitMcap: 700_000_000 };

    expect(isPitEligibleCandidateDay(historicalDay, band)).toBe(true);
    expect(isPitEligibleCandidateDay(laterCurrentDay, band)).toBe(false);
  });

  it.each(['', '0', '-1', '1.5', '1e3', 'nope'])('rejects invalid positive-integer cap %s', (raw) => {
    expect(() => parsePositiveIntegerCap(raw, 1000, 'max-candidate-backfill')).toThrow(/positive integer/);
  });

  it('sorts candidate days deterministically before capping', () => {
    const candidates = [
      { symbol: 'ZZZ', date: '2026-01-02' },
      { symbol: 'BBB', date: '2026-01-01' },
      { symbol: 'AAA', date: '2026-01-01' },
    ];
    expect(candidates.sort(compareCandidateDays).slice(0, 2)).toEqual([
      { symbol: 'AAA', date: '2026-01-01' },
      { symbol: 'BBB', date: '2026-01-01' },
    ]);
  });

  it('preserves authoritative raw-price PIT snapshot inputs from the artifact', () => {
    const candidate = parseSnapshotArtifactCandidate({
      symbol: 'ABCD',
      date: '2026-01-06',
      mcap: 250_000_000,
      mcapPrice: 12.5,
      sharesOutstanding: 20_000_000,
      endDate: '2025-12-31',
      secFiledDate: '2026-01-05',
      mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
      mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE',
    }, 0);

    expect(candidate).toMatchObject({
      mcap: 250_000_000,
      mcapPrice: 12.5,
      sharesOutstanding: 20_000_000,
      endDate: '2025-12-31',
      secFiledDate: '2026-01-05',
    });
  });

  it('rejects adjustment-incompatible snapshot artifact provenance', () => {
    expect(() => parseSnapshotArtifactCandidate({
      symbol: 'ABCD',
      date: '2026-01-06',
      mcap: 250_000_000,
      mcapPrice: 12.5,
      sharesOutstanding: 20_000_000,
      endDate: '2025-12-31',
      secFiledDate: '2026-01-05',
      mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
      mcapPriceSource: 'ALPACA_IEX_SPLIT_ADJUSTED_PRIOR_CLOSE',
    }, 3)).toThrow(/entry 3.*ALPACA_IEX_RAW_PRIOR_CLOSE/);
  });

  const validArtifact = {
    symbol: 'ABCD',
    date: '2026-01-06',
    mcap: 250_000_000,
    mcapPrice: 12.5,
    sharesOutstanding: 20_000_000,
    endDate: '2025-12-31',
    secFiledDate: '2026-01-05',
    mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
    mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE',
  } as const;

  it('deduplicates identical candidate pairs and rejects conflicting evidence', () => {
    expect(parseCandidateArtifact({ candidates: [validArtifact, validArtifact] }).candidates).toHaveLength(1);
    expect(parseCandidateArtifact({ candidateCount: 1, candidates: [validArtifact, validArtifact] }).candidates)
      .toHaveLength(1);
    expect(() => parseCandidateArtifact({
      candidates: [validArtifact, { ...validArtifact, mcapPrice: 13, mcap: 260_000_000 }],
    })).toThrow(/conflicting duplicate evidence for ABCD 2026-01-06/);
  });

  it('rejects malformed candidate artifacts before use', () => {
    expect(() => parseCandidateArtifact({})).toThrow(/candidates array/);
    expect(() => parseCandidateArtifact({ candidates: [validArtifact], candidateCount: 2 })).toThrow(/candidateCount/);
    expect(() => parseCandidateArtifact({ candidates: [validArtifact], generatedAt: 'invalid' })).toThrow(/generatedAt/);
  });

  const completedCorporateActionScreen = {
    status: 'COMPLETE',
    provider: 'ALPACA',
    endpoint: '/v1/corporate-actions',
    types: ['forward_split', 'reverse_split', 'unit_split'],
    queryFilterDateField: 'process_date',
    dateFields: { forward_split: 'ex_date', reverse_split: 'ex_date', unit_split: 'effective_date' },
    processDateQueryRange: {
      startDate: '1900-01-01',
      endDate: '2026-07-12',
      coverageComplete: true,
      coverageBasis: 'All pages returned by Alpaca for the declared process_date range.',
    },
    effectiveDateEligibilityRange: {
      strictlyAfterFactEnd: '2025-12-31',
      throughCandidateDate: '2026-01-06',
      predicate: 'effectiveDate > candidate.endDate && effectiveDate <= candidate.date',
    },
    actionsFetched: 10,
    candidatesScreened: 2,
    candidatesRejected: 1,
    candidatesPassed: 1,
    limitation: 'Unavailable, malformed, or insufficient coverage fails the run.',
  };

  function strictArtifact(screen: unknown = completedCorporateActionScreen) {
    return {
      generatedAt: '2026-07-12T05:59:54.338Z',
      candidateCount: 1,
      totalDiscoveredCandidateCount: 1,
      corporateActionScreen: screen,
      candidates: [validArtifact],
    };
  }

  it('accepts the completed, internally consistent Alpaca split screen in strict mode', () => {
    expect(parseCandidateArtifact(strictArtifact(), { requireCompletedCorporateActionScreen: true }).candidates)
      .toEqual([validArtifact]);
  });

  it('accepts a capped emission enclosed by the full split-screen population range', () => {
    const artifact = strictArtifact({
      ...completedCorporateActionScreen,
      candidatesScreened: 4,
      candidatesRejected: 1,
      candidatesPassed: 3,
      effectiveDateEligibilityRange: {
        ...completedCorporateActionScreen.effectiveDateEligibilityRange,
        strictlyAfterFactEnd: '2025-09-30',
        throughCandidateDate: '2026-02-01',
      },
    });
    artifact.totalDiscoveredCandidateCount = 3;
    expect(parseCandidateArtifact(artifact, { requireCompletedCorporateActionScreen: true }).candidates)
      .toEqual([validArtifact]);
  });

  it.each([
    ['starts after an emitted fact end', '2026-01-01', '2026-02-01'],
    ['ends before an emitted candidate date', '2025-09-30', '2026-01-05'],
  ])('strict mode rejects a screen range that %s', (_label, strictlyAfterFactEnd, throughCandidateDate) => {
    expect(() => parseCandidateArtifact(strictArtifact({
      ...completedCorporateActionScreen,
      effectiveDateEligibilityRange: {
        ...completedCorporateActionScreen.effectiveDateEligibilityRange,
        strictlyAfterFactEnd,
        throughCandidateDate,
      },
    }), { requireCompletedCorporateActionScreen: true })).toThrow(/complete, internally consistent/);
  });

  it.each([
    ['total disagrees with screen passed', { totalDiscoveredCandidateCount: 2 }],
    ['emitted count disagrees with canonical entries', { candidateCount: 2 }],
    ['emitted count exceeds total population', { totalDiscoveredCandidateCount: 0 }],
  ])('strict mode rejects when %s', (_label, override) => {
    expect(() => parseCandidateArtifact(
      { ...strictArtifact(), ...override },
      { requireCompletedCorporateActionScreen: true },
    )).toThrow();
  });

  it.each([
    ['missing screen', undefined],
    ['failed status', { ...completedCorporateActionScreen, status: 'FAILED' }],
    ['incomplete coverage', {
      ...completedCorporateActionScreen,
      processDateQueryRange: { ...completedCorporateActionScreen.processDateQueryRange, coverageComplete: false },
    }],
    ['wrong provider', { ...completedCorporateActionScreen, provider: 'OTHER' }],
    ['wrong range start', {
      ...completedCorporateActionScreen,
      processDateQueryRange: { ...completedCorporateActionScreen.processDateQueryRange, startDate: '2020-01-01' },
    }],
    ['wrong range end', {
      ...completedCorporateActionScreen,
      processDateQueryRange: { ...completedCorporateActionScreen.processDateQueryRange, endDate: '2026-07-11' },
    }],
    ['inconsistent counts', { ...completedCorporateActionScreen, candidatesPassed: 2 }],
  ])('strict mode rejects %s', (_label, screen) => {
    const artifact = strictArtifact(screen);
    if (screen === undefined) delete (artifact as { corporateActionScreen?: unknown }).corporateActionScreen;
    expect(() => parseCandidateArtifact(artifact, { requireCompletedCorporateActionScreen: true }))
      .toThrow(/complete, internally consistent Alpaca split-safe/);
  });

  it.each([
    ['corrupted candidate date', { date: '2026-02-30' }],
    ['corrupted measurement end', { endDate: '2026-02-30' }],
    ['measurement end after filing', { endDate: '2026-01-06' }],
    ['corrupted filing date', { secFiledDate: 'not-a-date' }],
    ['same-day filing', { secFiledDate: '2026-01-06' }],
    ['future filing', { secFiledDate: '2026-01-07' }],
    ['non-positive shares', { sharesOutstanding: 0 }],
    ['non-finite shares', { sharesOutstanding: Number.POSITIVE_INFINITY }],
    ['non-finite mcap', { mcap: Number.NaN }],
    ['arithmetic mismatch', { mcap: 249_000_000 }],
  ])('rejects %s before snapshot persistence', (_label, override) => {
    expect(() => parseSnapshotArtifactCandidate({ ...validArtifact, ...override }, 4)).toThrow(/entry 4/);
  });

  describe('corporate-action integrity gate', () => {
    const candidate = { symbol: 'ABCD', endDate: '2025-12-31', secFiledDate: '2026-01-05', date: '2026-02-10' };
    const action = (effectiveDate: string, overrides = {}) => ({
      type: 'reverse_split',
      symbols: ['ABCD'],
      effectiveDate,
      ...overrides,
    });

    it('allows a split on or before the selected SEC fact measurement end', () => {
      expect(isCandidateSplitSafe(candidate, [action('2025-12-31')])).toBe(true);
    });

    it('rejects a split between the fact end and its filing date', () => {
      expect(isCandidateSplitSafe(candidate, [action('2026-01-02')])).toBe(false);
    });

    it('rejects a split on the filing day after the fact end', () => {
      expect(isCandidateSplitSafe(candidate, [action('2026-01-05')])).toBe(false);
    });

    it('rejects a split after the filing and before the candidate', () => {
      expect(isCandidateSplitSafe(candidate, [action('2026-02-01')])).toBe(false);
    });

    it('rejects a split effective on the candidate day', () => {
      expect(isCandidateSplitSafe(candidate, [action('2026-02-10')])).toBe(false);
    });

    it('allows a split after the candidate', () => {
      expect(isCandidateSplitSafe(candidate, [action('2026-02-11')])).toBe(true);
    });

    it('ignores other symbols and unsupported corporate-action types', () => {
      expect(isCandidateSplitSafe(candidate, [
        action('2026-02-01', { symbols: ['WXYZ'] }),
        action('2026-02-01', { type: 'cash_dividend' }),
      ])).toBe(true);
    });

    it('fails closed when process-date query coverage starts after a fact end', () => {
      expect(() => assertSplitQueryCoversFacts([candidate], '2026-01-01')).toThrow(/coverage starts/);
      expect(() => assertSplitQueryCoversFacts([candidate], '1900-01-01')).not.toThrow();
    });
  });
});
