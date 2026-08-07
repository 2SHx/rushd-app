// Pure fail-closed coverage guard for historical universe membership. This module deliberately
// has no persistence or provider imports: ingestion owns producing these immutable snapshots.

export type MembershipState = 'IN' | 'OUT' | 'UNKNOWN';
export type LifecycleState = 'ACTIVE' | 'SUSPENDED' | 'DELISTED' | 'UNKNOWN';
export type ShariaEvidenceState = 'VERIFIED_COMPLIANT' | 'NON_COMPLIANT' | 'UNKNOWN';

export interface PointInTimeShariaEvidence {
  readonly id: string;
  readonly source: string;
  readonly hash: string;
  readonly verdict: ShariaEvidenceState;
  readonly asOf: Date;
  readonly availableAt: Date | null;
}

export interface PointInTimeMembershipRecord {
  readonly symbol: string;
  readonly membership: MembershipState;
  readonly lifecycle: LifecycleState;
  /** Required and no later than the decision for SUSPENDED/DELISTED states. */
  readonly lifecycleEffectiveAt: Date | null;
  /** Required for an IN member of a verified-halal universe. */
  readonly shariaEvidence: PointInTimeShariaEvidence | null;
}

export interface PointInTimeUniverseSnapshot {
  readonly id: string;
  readonly source: string;
  readonly hash: string;
  readonly asOf: Date;
  readonly availableAt: Date | null;
  /** Inclusive. */
  readonly effectiveFrom: Date;
  /** Exclusive; null means open-ended. */
  readonly effectiveTo: Date | null;
  /** Source-level completeness declarations; false means survivor coverage is not trustworthy. */
  readonly lifecycleCoverage: Readonly<{
    delisted: boolean;
    suspended: boolean;
  }>;
  readonly records: readonly PointInTimeMembershipRecord[];
}

export type PitMembershipFailure =
  | 'HISTORICAL_MEMBERSHIP_SNAPSHOTS_MISSING'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_EFFECTIVE_INTERVAL'
  | 'EFFECTIVE_INTERVAL_GAP'
  | 'EFFECTIVE_INTERVAL_OVERLAP'
  | 'TERMINAL_DATE_INJECTION'
  | 'SNAPSHOT_AVAILABILITY_MISSING'
  | 'SNAPSHOT_UNAVAILABLE_AT_DECISION'
  | 'LIFECYCLE_COVERAGE_MISSING'
  | 'MEMBERSHIP_COVERAGE_MISSING'
  | 'MEMBERSHIP_UNKNOWN'
  | 'LIFECYCLE_UNKNOWN'
  | 'LIFECYCLE_EVIDENCE_MISSING'
  | 'LIFECYCLE_EVIDENCE_UNAVAILABLE_AT_DECISION'
  | 'SHARIA_EVIDENCE_MISSING'
  | 'SHARIA_EVIDENCE_UNKNOWN'
  | 'SHARIA_NON_COMPLIANT_MEMBER_INCLUDED'
  | 'SHARIA_EVIDENCE_UNAVAILABLE_AT_DECISION';

export interface DataQualityPitEvidence {
  readonly failure: PitMembershipFailure;
  readonly setupId?: string;
  readonly decisionAt?: string;
  readonly snapshotId?: string;
  readonly symbol?: string;
  readonly field?: string;
  /** Formation-cycle index, for the rolling PIT sleeve schedule (see `pitSleeveSchedule.ts`). */
  readonly epoch?: string;
}

export class DataQualityPitError extends Error {
  readonly reasonCode = 'DATA_QUALITY_PIT_FAILURE' as const;
  readonly detailCode = 'HISTORICAL_UNIVERSE_MEMBERSHIP_MISSING' as const;

  constructor(readonly evidence: DataQualityPitEvidence) {
    super(`${evidence.failure}: historical universe membership is not point-in-time complete`);
    this.name = 'DataQualityPitError';
  }
}

export interface PointInTimeMembershipRequest {
  readonly snapshots: readonly PointInTimeUniverseSnapshot[];
  readonly decisionTimes: readonly Date[];
  /** The complete symbol domain that must be classified IN or OUT at every decision. */
  readonly requiredSymbols: readonly string[];
}

export interface ResolvedPointInTimeMembership {
  readonly decisionAt: Date;
  readonly snapshotId: string;
  readonly source: string;
  readonly hash: string;
  readonly records: readonly PointInTimeMembershipRecord[];
}

/** Exact audited C1 sleeves whose terminal historical runs require genuine PIT membership. */
export const PIT_MEMBERSHIP_REQUIRED_SETUP_IDS = Object.freeze([
  'ts-momentum-halal-basket-v4',
  'bollinger-mr-long-v3',
  'halal-markowitz-core',
  'halal-risk-parity-core',
  // QDR-11 lane. Its SLEEVE re-forms on a genuine rolling PIT schedule (G9-PIT), but that is a
  // different guarantee from historical MEMBERSHIP and point-in-time Sharia evidence, which still do
  // not exist. Fail closed: diagnostics run, terminal replay is blocked until they do. A lane that
  // measures diversification honestly must not certify holdings it cannot screen at each decision.
  'halal-decorrelated-risk-parity-core',
  'halal-momentum-risk-parity-core',
  'halal-sector-capped-risk-parity-core',
  'halal-sector-capped-risk-parity-wide',
  'halal-concentrated-momentum-core',
  'halal-managed-momentum-core',
  'halal-momentum-markowitz-core',
  'halal-trend-rider-core',
  'halal-fast-momentum-core',
  'halal-residual-fast-momentum-core',
] as const);

const PIT_MEMBERSHIP_REQUIRED_SET: ReadonlySet<string> = new Set(PIT_MEMBERSHIP_REQUIRED_SETUP_IDS);

export function requiresPointInTimeMembership(setupId: string): boolean {
  return PIT_MEMBERSHIP_REQUIRED_SET.has(setupId);
}

export interface TerminalPointInTimeMembershipRequest {
  readonly setupId: string;
  readonly terminal: boolean;
  /** Omitted until ingestion supplies genuine historical snapshot coverage. */
  readonly coverage?: PointInTimeMembershipRequest;
}

/**
 * Terminal preflight for the audited C1 sleeves. With no genuine snapshot inventory the run fails
 * before touching prices or persistence; diagnostics remain explicitly non-terminal.
 */
export function assertTerminalPointInTimeMembership(
  request: TerminalPointInTimeMembershipRequest,
): readonly ResolvedPointInTimeMembership[] {
  if (!request.terminal || !requiresPointInTimeMembership(request.setupId)) return Object.freeze([]);
  if (!request.coverage) {
    fail('HISTORICAL_MEMBERSHIP_SNAPSHOTS_MISSING', { setupId: request.setupId });
  }
  return assertPointInTimeMembershipCoverage(request.coverage);
}

export function historicalMembershipMarker(
  setupId: string,
  terminal: boolean,
): 'unverified-diagnostic-only' | null {
  return !terminal && requiresPointInTimeMembership(setupId) ? 'unverified-diagnostic-only' : null;
}

function fail(failure: PitMembershipFailure, detail: Omit<DataQualityPitEvidence, 'failure'> = {}): never {
  throw new DataQualityPitError(Object.freeze({ failure, ...detail }));
}

function iso(date: Date): string {
  return date.toISOString();
}

function requireDate(date: Date | null, field: string, snapshotId?: string): Date {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    fail('INVALID_TIMESTAMP', { snapshotId, field });
  }
  return date;
}

function symbolKey(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/**
 * Resolves every requested decision against one and only one immutable membership snapshot.
 * Any absent/unknown/future survivor or Sharia evidence aborts the whole replay.
 */
export function assertPointInTimeMembershipCoverage(
  request: PointInTimeMembershipRequest,
): readonly ResolvedPointInTimeMembership[] {
  const snapshots = [...request.snapshots];
  for (const snapshot of snapshots) {
    const from = requireDate(snapshot.effectiveFrom, 'effectiveFrom', snapshot.id);
    const to = snapshot.effectiveTo === null ? null : requireDate(snapshot.effectiveTo, 'effectiveTo', snapshot.id);
    requireDate(snapshot.asOf, 'asOf', snapshot.id);
    if (to && to.getTime() <= from.getTime()) {
      fail('INVALID_EFFECTIVE_INTERVAL', { snapshotId: snapshot.id });
    }
  }

  const requiredSymbols = Array.from(new Set(request.requiredSymbols.map(symbolKey))).sort();
  const decisions = [...request.decisionTimes]
    .map((decisionAt) => requireDate(decisionAt, 'decisionAt'))
    .sort((a, b) => a.getTime() - b.getTime());

  return Object.freeze(decisions.map((decisionAt) => {
    const decisionMs = decisionAt.getTime();
    const decisionIso = iso(decisionAt);
    const covering = snapshots.filter((snapshot) =>
      snapshot.effectiveFrom.getTime() <= decisionMs
      && (snapshot.effectiveTo === null || decisionMs < snapshot.effectiveTo.getTime()),
    );
    if (covering.length === 0) fail('EFFECTIVE_INTERVAL_GAP', { decisionAt: decisionIso });
    if (covering.length > 1) fail('EFFECTIVE_INTERVAL_OVERLAP', { decisionAt: decisionIso });

    const snapshot = covering[0];
    if (snapshot.asOf.getTime() > decisionMs) {
      fail('TERMINAL_DATE_INJECTION', { decisionAt: decisionIso, snapshotId: snapshot.id });
    }
    const availableAt = snapshot.availableAt === null
      ? fail('SNAPSHOT_AVAILABILITY_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id })
      : requireDate(snapshot.availableAt, 'availableAt', snapshot.id);
    if (availableAt.getTime() > decisionMs) {
      fail('SNAPSHOT_UNAVAILABLE_AT_DECISION', { decisionAt: decisionIso, snapshotId: snapshot.id });
    }
    if (!snapshot.lifecycleCoverage.delisted || !snapshot.lifecycleCoverage.suspended) {
      fail('LIFECYCLE_COVERAGE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id });
    }

    const recordsBySymbol = new Map<string, PointInTimeMembershipRecord>();
    for (const record of snapshot.records) recordsBySymbol.set(symbolKey(record.symbol), record);
    const resolvedRecords = requiredSymbols.map((symbol) => {
      const record = recordsBySymbol.get(symbol);
      if (!record) fail('MEMBERSHIP_COVERAGE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
      if (record.membership === 'UNKNOWN') {
        fail('MEMBERSHIP_UNKNOWN', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
      }
      if (record.lifecycle === 'UNKNOWN') {
        fail('LIFECYCLE_UNKNOWN', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
      }
      if (record.lifecycle === 'DELISTED' || record.lifecycle === 'SUSPENDED') {
        if (record.lifecycleEffectiveAt === null) {
          fail('LIFECYCLE_EVIDENCE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
        }
        const lifecycleAt = requireDate(record.lifecycleEffectiveAt, 'lifecycleEffectiveAt', snapshot.id);
        if (lifecycleAt.getTime() > decisionMs) {
          fail('LIFECYCLE_EVIDENCE_UNAVAILABLE_AT_DECISION', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
        }
      }
      if (record.membership === 'IN') {
        const sharia = record.shariaEvidence;
        if (!sharia) fail('SHARIA_EVIDENCE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
        if (sharia.verdict === 'UNKNOWN') {
          fail('SHARIA_EVIDENCE_UNKNOWN', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
        }
        if (sharia.verdict === 'NON_COMPLIANT') {
          fail('SHARIA_NON_COMPLIANT_MEMBER_INCLUDED', {
            decisionAt: decisionIso,
            snapshotId: snapshot.id,
            symbol,
          });
        }
        const shariaAsOf = requireDate(sharia.asOf, 'shariaEvidence.asOf', snapshot.id);
        const shariaAvailableAt = sharia.availableAt === null
          ? fail('SHARIA_EVIDENCE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol })
          : requireDate(sharia.availableAt, 'shariaEvidence.availableAt', snapshot.id);
        if (shariaAsOf.getTime() > decisionMs || shariaAvailableAt.getTime() > decisionMs) {
          fail('SHARIA_EVIDENCE_UNAVAILABLE_AT_DECISION', { decisionAt: decisionIso, snapshotId: snapshot.id, symbol });
        }
      }
      return record;
    });

    return Object.freeze({
      decisionAt,
      snapshotId: snapshot.id,
      source: snapshot.source,
      hash: snapshot.hash,
      records: Object.freeze(resolvedRecords),
    });
  }));
}
