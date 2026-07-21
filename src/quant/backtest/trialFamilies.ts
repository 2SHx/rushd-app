// Terminal DSR trial-family registry. Counts include every related setup/plateau variant already
// examined; a setup's own plateau count may raise, but never lower, the family-wide count.

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

export interface TrialCountEvidence {
  readonly method: typeof TRIAL_FAMILY_COUNT_METHOD;
  readonly familyId: string;
  readonly plateauTrials: number;
  readonly familyTrials: number;
  readonly relatedSetups: number;
}

/** Resolve the terminal DSR count; registered family evidence is a floor, never a cap. */
export function trialCountEvidence(setupId: string, plateauTrials: number): TrialCountEvidence {
  if (!Number.isInteger(plateauTrials) || plateauTrials < 1) {
    throw new Error('plateauTrials must be a positive integer');
  }
  if ((HALAL_CORE_SETUP_IDS as readonly string[]).includes(setupId)) {
    return {
      method: TRIAL_FAMILY_COUNT_METHOD,
      familyId: 'halal-core-2026q3-v1',
      plateauTrials,
      familyTrials: Math.max(plateauTrials, HALAL_CORE_REGISTERED_TRIALS),
      relatedSetups: HALAL_CORE_SETUP_IDS.length,
    };
  }
  return {
    method: TRIAL_FAMILY_COUNT_METHOD,
    familyId: `standalone:${setupId}`,
    plateauTrials,
    familyTrials: plateauTrials,
    relatedSetups: 1,
  };
}
