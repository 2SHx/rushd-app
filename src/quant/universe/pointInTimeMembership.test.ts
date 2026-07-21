import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  assertPointInTimeMembershipCoverage,
  assertTerminalPointInTimeMembership,
  DataQualityPitError,
  historicalMembershipMarker,
  PIT_MEMBERSHIP_REQUIRED_SETUP_IDS,
  requiresPointInTimeMembership,
  type PointInTimeMembershipRecord,
  type PointInTimeUniverseSnapshot,
} from './pointInTimeMembership';

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

function record(
  symbol: string,
  membership: PointInTimeMembershipRecord['membership'] = 'IN',
  lifecycle: PointInTimeMembershipRecord['lifecycle'] = 'ACTIVE',
): PointInTimeMembershipRecord {
  return {
    symbol,
    membership,
    lifecycle,
    lifecycleEffectiveAt: lifecycle === 'ACTIVE' ? null : date('2020-06-01'),
    shariaEvidence: membership === 'IN' ? {
      id: `sharia-${symbol}`,
      source: 'historical-screen',
      hash: `hash-${symbol}`,
      verdict: 'VERIFIED_COMPLIANT',
      asOf: date('2020-01-01'),
      availableAt: date('2020-01-02'),
    } : null,
  };
}

function snapshot(overrides: Partial<PointInTimeUniverseSnapshot> = {}): PointInTimeUniverseSnapshot {
  return {
    id: 'snapshot-2020',
    source: 'historical-provider',
    hash: 'sha256:2020',
    asOf: date('2020-01-01'),
    availableAt: date('2020-01-02'),
    effectiveFrom: date('2020-01-02'),
    effectiveTo: date('2021-01-01'),
    lifecycleCoverage: { delisted: true, suspended: true },
    records: [record('AAA'), record('BBB', 'OUT')],
    ...overrides,
  };
}

function resolve(snapshots: readonly PointInTimeUniverseSnapshot[], decisionTimes = [date('2020-07-01')]) {
  return assertPointInTimeMembershipCoverage({
    snapshots,
    decisionTimes,
    requiredSymbols: ['BBB', 'AAA'],
  });
}

function expectFailure(run: () => unknown, failure: DataQualityPitError['evidence']['failure']) {
  try {
    run();
    throw new Error('expected point-in-time coverage failure');
  } catch (error) {
    expect(error).toBeInstanceOf(DataQualityPitError);
    expect((error as DataQualityPitError).reasonCode).toBe('DATA_QUALITY_PIT_FAILURE');
    expect((error as DataQualityPitError).detailCode).toBe('HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING');
    expect((error as DataQualityPitError).evidence.failure).toBe(failure);
  }
}

describe('assertPointInTimeMembershipCoverage', () => {
  it('resolves valid historical coverage with provenance and canonical symbol order', () => {
    const result = resolve([snapshot()]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      decisionAt: date('2020-07-01'),
      snapshotId: 'snapshot-2020',
      source: 'historical-provider',
      hash: 'sha256:2020',
    });
    expect(result[0].records.map(({ symbol, membership }) => [symbol, membership])).toEqual([
      ['AAA', 'IN'],
      ['BBB', 'OUT'],
    ]);
  });

  it('rejects a terminal-date survivor snapshot injected into an earlier interval', () => {
    expectFailure(() => resolve([snapshot({
      id: 'terminal-2026-07-17',
      asOf: date('2026-07-17'),
      availableAt: date('2026-07-17'),
    })]), 'TERMINAL_DATE_INJECTION');
  });

  it('rejects missing and future snapshot availability', () => {
    expectFailure(() => resolve([snapshot({ availableAt: null })]), 'SNAPSHOT_AVAILABILITY_MISSING');
    expectFailure(
      () => resolve([snapshot({ availableAt: date('2020-08-01') })]),
      'SNAPSHOT_UNAVAILABLE_AT_DECISION',
    );
  });

  it('rejects a gap in effective membership coverage', () => {
    expectFailure(() => resolve([snapshot({ effectiveTo: date('2020-06-01') })]), 'EFFECTIVE_INTERVAL_GAP');
  });

  it('rejects UNKNOWN and absent symbol classifications', () => {
    expectFailure(() => resolve([snapshot({
      records: [record('AAA', 'UNKNOWN'), record('BBB', 'OUT')],
    })]), 'MEMBERSHIP_UNKNOWN');
    expectFailure(() => resolve([snapshot({ records: [record('AAA')] })]), 'MEMBERSHIP_COVERAGE_MISSING');
  });

  it('retains delisted and suspended names, and rejects sources that omit either population', () => {
    const inactive = snapshot({
      records: [record('AAA', 'OUT', 'DELISTED'), record('BBB', 'OUT', 'SUSPENDED')],
    });
    const result = resolve([inactive]);
    expect(result[0].records.map(({ lifecycle }) => lifecycle)).toEqual(['DELISTED', 'SUSPENDED']);

    expectFailure(() => resolve([snapshot({
      lifecycleCoverage: { delisted: false, suspended: true },
    })]), 'LIFECYCLE_COVERAGE_MISSING');
    expectFailure(() => resolve([snapshot({
      lifecycleCoverage: { delisted: true, suspended: false },
    })]), 'LIFECYCLE_COVERAGE_MISSING');
  });

  it('carries deterministic structured evidence for the offending decision and snapshot', () => {
    const run = () => resolve([snapshot({ availableAt: null })]);
    for (let i = 0; i < 2; i++) {
      try {
        run();
      } catch (error) {
        expect((error as DataQualityPitError).evidence).toEqual({
          failure: 'SNAPSHOT_AVAILABILITY_MISSING',
          decisionAt: '2020-07-01T00:00:00.000Z',
          snapshotId: 'snapshot-2020',
        });
      }
    }
  });

  it('is deterministic across input ordering and does not mutate snapshots', () => {
    const first = snapshot({
      effectiveTo: date('2020-07-01'),
      records: [record('BBB', 'OUT'), record('AAA')],
    });
    const second = snapshot({
      id: 'snapshot-2020-h2',
      hash: 'sha256:2020-h2',
      asOf: date('2020-07-01'),
      availableAt: date('2020-07-01'),
      effectiveFrom: date('2020-07-01'),
      records: [record('BBB', 'OUT'), record('AAA')],
    });
    const originalOrder = first.records.map(({ symbol }) => symbol);
    const chronological = assertPointInTimeMembershipCoverage({
      snapshots: [first, second],
      decisionTimes: [date('2020-08-01'), date('2020-06-01')],
      requiredSymbols: ['BBB', 'AAA'],
    });
    const reversed = assertPointInTimeMembershipCoverage({
      snapshots: [second, first],
      decisionTimes: [date('2020-06-01'), date('2020-08-01')],
      requiredSymbols: ['AAA', 'BBB'],
    });
    expect(chronological).toEqual(reversed);
    expect(first.records.map(({ symbol }) => symbol)).toEqual(originalOrder);
  });

  it('requires PIT Sharia evidence for every included member', () => {
    expectFailure(() => resolve([snapshot({
      records: [{ ...record('AAA'), shariaEvidence: null }, record('BBB', 'OUT')],
    })]), 'SHARIA_EVIDENCE_MISSING');
    expectFailure(() => resolve([snapshot({
      records: [{
        ...record('AAA'),
        shariaEvidence: { ...record('AAA').shariaEvidence!, availableAt: date('2020-08-01') },
      }, record('BBB', 'OUT')],
    })]), 'SHARIA_EVIDENCE_UNAVAILABLE_AT_DECISION');
  });

  it('hard-vetoes an included non-compliant member while accepting compliant IN and evidence-free OUT', () => {
    const nonCompliant = record('AAA');
    expectFailure(() => resolve([snapshot({
      records: [{
        ...nonCompliant,
        shariaEvidence: { ...nonCompliant.shariaEvidence!, verdict: 'NON_COMPLIANT' },
      }, record('BBB', 'OUT')],
    })]), 'SHARIA_NON_COMPLIANT_MEMBER_INCLUDED');

    expect(() => resolve([snapshot({ records: [record('AAA'), record('BBB', 'OUT')] })])).not.toThrow();
  });

  it('has no network, provider, or database dependency', () => {
    const source = readFileSync(new URL('./pointInTimeMembership.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('prisma');
  });
});

describe('terminal C1 membership preflight', () => {
  it('pins the audited setup list and fails closed without ingested snapshots', () => {
    expect(PIT_MEMBERSHIP_REQUIRED_SETUP_IDS).toHaveLength(12);
    for (const setupId of PIT_MEMBERSHIP_REQUIRED_SETUP_IDS) {
      expect(requiresPointInTimeMembership(setupId)).toBe(true);
      expectFailure(
        () => assertTerminalPointInTimeMembership({ setupId, terminal: true }),
        'HISTORICAL_MEMBERSHIP_SNAPSHOTS_MISSING',
      );
    }
  });

  it('does not block unaffected setups or explicitly non-terminal diagnostics', () => {
    expect(assertTerminalPointInTimeMembership({ setupId: 'dual-momentum-rotation', terminal: true })).toEqual([]);
    expect(assertTerminalPointInTimeMembership({
      setupId: PIT_MEMBERSHIP_REQUIRED_SETUP_IDS[0],
      terminal: false,
    })).toEqual([]);
    expect(historicalMembershipMarker(PIT_MEMBERSHIP_REQUIRED_SETUP_IDS[0], false))
      .toBe('unverified-diagnostic-only');
    expect(historicalMembershipMarker('dual-momentum-rotation', false)).toBeNull();
  });
});
