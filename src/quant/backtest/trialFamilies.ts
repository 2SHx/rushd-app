// Terminal DSR trial-family registry. Counts include every related setup/plateau variant already
// examined; a setup's own plateau count may raise, but never lower, the family-wide count.
//
// QDR-9 two-tier deflation. EXPLORATORY is the fail-closed default and carries the registered family
// trial floor. CONFIRMATORY carries N = 1 and must be EARNED STRUCTURALLY — a single, pre-committed,
// never-inspected forward test is not a search over 99 variants, so deflating it as if it were is
// scientifically wrong and makes honest slow-effect research impossible to pass. Confirmatory status
// is granted ONLY when all six structural conditions below are proved by evidence supplied from
// outside the config. A config that merely *claims* to be confirmatory gets EXPLORATORY, and so does
// evidence with any element missing, unparseable, or out of order.

import { stableConfigHash } from './experimentProtocol';

export const TRIAL_FAMILY_COUNT_METHOD = 'related-setup-plateau-v1' as const;

const HALAL_CORE_SETUP_IDS = Object.freeze([
  'halal-risk-parity-core',
  'halal-markowitz-core',
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

const HALAL_CORE_REGISTERED_TRIALS = 99; // eleven related setups × nine frozen plateau trials

export type TrialTier = 'EXPLORATORY' | 'CONFIRMATORY';

/** The six structural conditions a lane must prove to be deflated as a single confirmatory test. */
export const CONFIRMATORY_CONDITIONS = Object.freeze([
  'SEALED_CONFIG_HASH_VERIFIED',
  'FORWARD_ONLY_HISTORICAL_MODE',
  'ZERO_DIAGNOSTIC_RUNS',
  'FORWARD_BOUNDARY_AFTER_SEAL',
  'OBSERVATIONS_AFTER_FORWARD_BOUNDARY',
  'EXACTLY_ONE_TERMINAL_EVALUATION',
] as const);
export type ConfirmatoryCondition = typeof CONFIRMATORY_CONDITIONS[number];

/**
 * Structural proof of confirmatory status. Every field is optional at the type level precisely so
 * that a partially-populated object fails closed to EXPLORATORY instead of failing to compile into
 * a false claim. `config`/`configHash` are re-hashed here — the caller's word is not evidence.
 * `sealedAt` must come from an immutable out-of-band record (the commit that sealed the manifest),
 * never from the sealed config itself, which cannot testify about its own age.
 */
export interface ConfirmatoryEvidenceInput {
  readonly config?: unknown;
  readonly configHash?: string | null;
  readonly historicalMode?: unknown;
  readonly diagnosticRuns?: unknown;
  readonly sealedAt?: unknown;
  readonly forwardBoundary?: unknown;
  readonly earliestObservation?: unknown;
  readonly terminalEvaluations?: unknown;
}

export interface TrialCountEvidence {
  readonly method: typeof TRIAL_FAMILY_COUNT_METHOD;
  readonly familyId: string;
  readonly plateauTrials: number;
  readonly familyTrials: number;
  readonly relatedSetups: number;
  readonly tier: TrialTier;
  /** Count this lane falls back to whenever confirmatory status is not structurally earned. */
  readonly exploratoryFamilyTrials: number;
  /** Conditions that were NOT proved; empty exactly when the tier is CONFIRMATORY. */
  readonly confirmatoryFailures: readonly ConfirmatoryCondition[];
}

function parsedTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Which of the six conditions this evidence fails to prove. Absent evidence fails all six. */
export function confirmatoryFailures(
  evidence: ConfirmatoryEvidenceInput | undefined,
): readonly ConfirmatoryCondition[] {
  if (!evidence) return CONFIRMATORY_CONDITIONS;
  const failures: ConfirmatoryCondition[] = [];

  const hash = evidence.configHash;
  const hashVerified = typeof hash === 'string' && hash.length > 0
    && evidence.config !== undefined
    && ((): boolean => {
      try {
        // stableConfigHash rejects non-finite/non-JSON values, which is itself a failed proof.
        return stableConfigHash(evidence.config as Parameters<typeof stableConfigHash>[0]) === hash;
      } catch {
        return false;
      }
    })();
  if (!hashVerified) failures.push('SEALED_CONFIG_HASH_VERIFIED');

  if (typeof evidence.historicalMode !== 'string' || !evidence.historicalMode.startsWith('FORWARD_ONLY')) {
    failures.push('FORWARD_ONLY_HISTORICAL_MODE');
  }
  if (evidence.diagnosticRuns !== 0) failures.push('ZERO_DIAGNOSTIC_RUNS');

  const sealedAt = parsedTime(evidence.sealedAt);
  const forwardBoundary = parsedTime(evidence.forwardBoundary);
  const earliestObservation = parsedTime(evidence.earliestObservation);
  if (sealedAt === null || forwardBoundary === null || !(forwardBoundary > sealedAt)) {
    failures.push('FORWARD_BOUNDARY_AFTER_SEAL');
  }
  if (forwardBoundary === null || earliestObservation === null || !(earliestObservation > forwardBoundary)) {
    failures.push('OBSERVATIONS_AFTER_FORWARD_BOUNDARY');
  }
  if (evidence.terminalEvaluations !== 1) failures.push('EXACTLY_ONE_TERMINAL_EVALUATION');

  return failures;
}

/**
 * Resolve the terminal DSR count; registered family evidence is a floor, never a cap.
 * Called without `evidence` (the default and the only pre-QDR-9 form) the answer is byte-identical
 * to the exploratory registry it has always returned.
 */
export function trialCountEvidence(
  setupId: string,
  plateauTrials: number,
  evidence?: ConfirmatoryEvidenceInput,
): TrialCountEvidence {
  if (!Number.isInteger(plateauTrials) || plateauTrials < 1) {
    throw new Error('plateauTrials must be a positive integer');
  }
  const isHalalCore = (HALAL_CORE_SETUP_IDS as readonly string[]).includes(setupId);
  const exploratoryFamilyTrials = isHalalCore
    ? Math.max(plateauTrials, HALAL_CORE_REGISTERED_TRIALS)
    : plateauTrials;
  const failures = confirmatoryFailures(evidence);
  const tier: TrialTier = failures.length === 0 ? 'CONFIRMATORY' : 'EXPLORATORY';
  return {
    method: TRIAL_FAMILY_COUNT_METHOD,
    familyId: isHalalCore ? 'halal-core-2026q3-v1' : `standalone:${setupId}`,
    plateauTrials,
    familyTrials: tier === 'CONFIRMATORY' ? 1 : exploratoryFamilyTrials,
    relatedSetups: isHalalCore ? HALAL_CORE_SETUP_IDS.length : 1,
    tier,
    exploratoryFamilyTrials,
    confirmatoryFailures: failures,
  };
}
