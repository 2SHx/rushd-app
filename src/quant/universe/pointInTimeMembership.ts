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

/**
 * QDR-14: a DECLARED, structural waiver of the `suspended` half of `lifecycleCoverage` — the
 * `delisted` half is never waivable, by anyone, for any class. `acknowledged` is a literal `true`
 * so a waiver object cannot exist half-declared; `reason` and `hash` make it inspectable and
 * printable rather than an invisible relaxation of the check.
 */
export interface SurvivorshipCoverageWaiver {
  readonly acknowledged: true;
  /** Why `suspended` coverage is being waived for this snapshot; carried into the audit trail. */
  readonly reason: string;
  /** Content hash of the waiver's supporting evidence, so it cannot be silently swapped post hoc. */
  readonly hash: string;
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
  /**
   * QDR-14: absent (undefined) behaves byte-identically to today — `suspended: false` refuses
   * unconditionally. A declared waiver only ever permits the `suspended` half, and only when the
   * request's `productClass` is `'DIVERSIFICATION'`; see `assertPointInTimeMembershipCoverage`.
   */
  readonly survivorshipWaiver?: SurvivorshipCoverageWaiver;
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

/**
 * Mirrors `gatePower.ts`'s `ProductClass` byte-for-byte (this module imports nothing — see the
 * 'has no network, provider, or database dependency' test — so the union is duplicated, not
 * imported). Absent ⇒ no waiver can ever apply, matching QDR-10's ALPHA fail-closed default.
 */
export type PitProductClass = 'ALPHA' | 'BETA' | 'DIVERSIFICATION';

export interface PointInTimeMembershipRequest {
  readonly snapshots: readonly PointInTimeUniverseSnapshot[];
  readonly decisionTimes: readonly Date[];
  /** The complete symbol domain that must be classified IN or OUT at every decision. */
  readonly requiredSymbols: readonly string[];
  /** QDR-14: only `'DIVERSIFICATION'` can ever exercise a declared `survivorshipWaiver`. */
  readonly productClass?: PitProductClass;
}

export interface ResolvedPointInTimeMembership {
  readonly decisionAt: Date;
  readonly snapshotId: string;
  readonly source: string;
  readonly hash: string;
  readonly records: readonly PointInTimeMembershipRecord[];
  /**
   * QDR-14: null unless this decision's terminal card was permitted ONLY because a declared
   * survivorship-coverage waiver stood in for missing `suspended` coverage — never invisible.
   */
  readonly survivorshipWaiverApplied: SurvivorshipCoverageWaiver | null;
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
  // QDR-14: the catastrophic-stop A/B inherits the baseline's audited C1 sleeve and therefore its
  // fence. Omitting this id would silently relax the survivorship fence for a NEW lane, which is the
  // exact failure the allowlist exists to prevent.
  'halal-stopped-fast-momentum-core',
  // QDR-14: the point-in-time revenue-growth SELECTION gate inherits the baseline's audited C1
  // sleeve and therefore its fence. Historical membership, delisting lifecycle and per-name PIT
  // Sharia evidence do not exist for 2018-2026, so every run of this version is unverified-
  // diagnostic-only and cannot produce a terminal card.
  'halal-fundamental-momentum-core',
  // QDR-15: the allocation-transport lane runs the SAME frozen engine over the SAME audited C1
  // sleeve. Only the book share changes, so it inherits the survivorship fence unchanged.
  'halal-fast-momentum-cash-core',
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
    // QDR-14: split lifecycle coverage into its two halves. `delisted` is NEVER waivable, for any
    // productClass, regardless of any declared waiver — checked first and unconditionally.
    if (!snapshot.lifecycleCoverage.delisted) {
      fail('LIFECYCLE_COVERAGE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id, field: 'delisted' });
    }
    // `suspended` may be waived, but ONLY by a snapshot-declared waiver AND ONLY for a
    // 'DIVERSIFICATION' request. Absence of a waiver (undefined) is byte-identical to today: this
    // still fails unconditionally. `waiver.acknowledged` is typed `true`, so a half-declared waiver
    // cannot type-check into existence.
    const waiver = snapshot.survivorshipWaiver;
    const waiverApplies = waiver !== undefined && waiver.acknowledged === true
      && request.productClass === 'DIVERSIFICATION';
    if (!snapshot.lifecycleCoverage.suspended && !waiverApplies) {
      fail('LIFECYCLE_COVERAGE_MISSING', { decisionAt: decisionIso, snapshotId: snapshot.id, field: 'suspended' });
    }
    const survivorshipWaiverApplied = !snapshot.lifecycleCoverage.suspended && waiverApplies
      ? waiver!
      : null;

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
      survivorshipWaiverApplied,
      records: Object.freeze(resolvedRecords),
    });
  }));
}
