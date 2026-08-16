// QDR-14: the survivorship-coverage waiver. `lifecycleCoverage.suspended: false` may permit a
// terminal card ONLY through a declared `survivorshipWaiver` on the snapshot AND only when the
// request's `productClass` is `'DIVERSIFICATION'`. `lifecycleCoverage.delisted: false` is never
// waivable, for any class. Absence of a waiver must behave byte-identically to pre-QDR-14 behavior.
import { describe, expect, it } from 'vitest';
import {
  assertDiversificationGateSpec,
  type DiversificationGateSpec,
} from '../backtest/gatePower';
import {
  assertPointInTimeMembershipCoverage,
  DataQualityPitError,
  type PointInTimeMembershipRecord,
  type PointInTimeUniverseSnapshot,
  type SurvivorshipCoverageWaiver,
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

const WAIVER: SurvivorshipCoverageWaiver = {
  acknowledged: true,
  reason: 'QDR-14 test fixture: suspended-lifecycle coverage is not yet backfilled for this source',
  hash: 'sha256:waiver-fixture',
};

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

function resolve(
  snap: PointInTimeUniverseSnapshot,
  productClass?: 'ALPHA' | 'BETA' | 'DIVERSIFICATION',
  requiredSymbols: readonly string[] = ['BBB', 'AAA'],
) {
  return assertPointInTimeMembershipCoverage({
    snapshots: [snap],
    decisionTimes: [date('2020-07-01')],
    requiredSymbols,
    productClass,
  });
}

function expectFailure(run: () => unknown, failure: DataQualityPitError['evidence']['failure']) {
  try {
    run();
    throw new Error('expected point-in-time coverage failure');
  } catch (error) {
    expect(error).toBeInstanceOf(DataQualityPitError);
    expect((error as DataQualityPitError).evidence.failure).toBe(failure);
  }
}

const ALL_CLASSES = [undefined, 'ALPHA', 'BETA', 'DIVERSIFICATION'] as const;

describe('QDR-14 survivorship-coverage waiver', () => {
  it('1. suspended:false with NO declared waiver refuses every productClass, byte-identical to today', () => {
    const suspendedGap = snapshot({ lifecycleCoverage: { delisted: true, suspended: false } });
    for (const productClass of ALL_CLASSES) {
      expectFailure(() => resolve(suspendedGap, productClass), 'LIFECYCLE_COVERAGE_MISSING');
    }
  });

  it('2. a declared waiver refuses every class except DIVERSIFICATION, and passes only for DIVERSIFICATION', () => {
    const waived = snapshot({
      lifecycleCoverage: { delisted: true, suspended: false },
      survivorshipWaiver: WAIVER,
    });
    expectFailure(() => resolve(waived, undefined), 'LIFECYCLE_COVERAGE_MISSING');
    expectFailure(() => resolve(waived, 'ALPHA'), 'LIFECYCLE_COVERAGE_MISSING');
    expectFailure(() => resolve(waived, 'BETA'), 'LIFECYCLE_COVERAGE_MISSING');

    const result = resolve(waived, 'DIVERSIFICATION');
    expect(result).toHaveLength(1);
    expect(result[0].survivorshipWaiverApplied).toEqual(WAIVER);
  });

  it('3. delisted:false refuses unconditionally, regardless of waiver or class', () => {
    const delistedGapPlain = snapshot({ lifecycleCoverage: { delisted: false, suspended: true } });
    const delistedGapWaived = snapshot({
      lifecycleCoverage: { delisted: false, suspended: false },
      survivorshipWaiver: WAIVER,
    });
    for (const productClass of ALL_CLASSES) {
      expectFailure(() => resolve(delistedGapPlain, productClass), 'LIFECYCLE_COVERAGE_MISSING');
      expectFailure(() => resolve(delistedGapWaived, productClass), 'LIFECYCLE_COVERAGE_MISSING');
    }
  });

  it('4. a required symbol with LIFECYCLE UNKNOWN still refuses, unchanged, even inside a waived snapshot', () => {
    const waivedWithUnknownRecord = snapshot({
      lifecycleCoverage: { delisted: true, suspended: false },
      survivorshipWaiver: WAIVER,
      records: [record('AAA', 'OUT', 'UNKNOWN'), record('BBB', 'OUT')],
    });
    expectFailure(
      () => resolve(waivedWithUnknownRecord, 'DIVERSIFICATION'),
      'LIFECYCLE_UNKNOWN',
    );
  });

  it('5. a DIVERSIFICATION gate block missing survivorshipCoverageWaiverAcknowledged throws at seal', () => {
    const { survivorshipCoverageWaiverAcknowledged: _omit, ...withoutWaiverField } = FULL_DIVERSIFICATION_SPEC;
    expect(() => assertDiversificationGateSpec(withoutWaiverField as DiversificationGateSpec))
      .toThrow(/survivorshipCoverageWaiverAcknowledged/);
    // The complete spec, with the field explicitly declared, is unaffected.
    expect(() => assertDiversificationGateSpec(FULL_DIVERSIFICATION_SPEC)).not.toThrow();
  });
});

const PLATEAU_CELLS = [0.20, 0.25, 0.30].flatMap((c) => [60, 80, 100].map((p) => `sectorCap=${c},poolSize=${p}`));

const FULL_DIVERSIFICATION_SPEC: DiversificationGateSpec = {
  productClass: 'DIVERSIFICATION',
  observations: 644,
  observationsPerYear: 252,
  trials: 1,
  fallbackTrials: 108,
  comparatorUniverseRule: 'selectDollarVolumeSleeve',
  comparatorVersionId: 'halal-risk-parity-core@v1',
  sectorMapHash: 'sha256:0f3c',
  formationCadenceDays: 252,
  correlationLookbackDays: 252,
  minEffectiveBetsRatio: 1.10,
  minVolatilityReduction: 0.05,
  hypothesizedEffectiveBetsRatio: 1.28,
  hypothesizedVolReduction: 0.116,
  hypothesizedMonteCarloP95Drawdown: 0.41,
  bootstrapBlockLength: 20,
  plateauCells: PLATEAU_CELLS,
  survivorshipCoverageWaiverAcknowledged: true,
};
