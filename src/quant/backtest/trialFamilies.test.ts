import { describe, expect, it } from 'vitest';
import { stableConfigHash } from './experimentProtocol';
import { computeMetrics, type EquityPoint } from './metrics';
import { CONFIRMATORY_CONDITIONS, trialCountEvidence, type ConfirmatoryEvidenceInput } from './trialFamilies';

const HALAL_CORE_SETUP_IDS = [
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
  'halal-fast-momentum-cash-core',
] as const;

const SEALED_CONFIG = { setup: 'halal-spus-vol-managed-beta', seed: 42 };

function provenConfirmatory(): ConfirmatoryEvidenceInput {
  return {
    config: SEALED_CONFIG,
    configHash: stableConfigHash(SEALED_CONFIG),
    historicalMode: 'FORWARD_ONLY_NO_HISTORICAL_FULL',
    diagnosticRuns: 0,
    sealedAt: '2026-08-06T12:00:00.000Z',
    forwardBoundary: '2026-08-07T20:00:00.000Z',
    earliestObservation: '2026-08-14T20:00:00.000Z',
    terminalEvaluations: 1,
  };
}

function knownPositiveCurve(): EquityPoint[] {
  let seed = 42;
  let equity = 100;
  const curve: EquityPoint[] = [{ ts: new Date('2024-01-01T00:00:00.000Z'), equity }];
  for (let day = 1; day < 250; day++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    equity *= 1 + 0.001 + (seed / 2147483648 - 0.5) * 0.02;
    curve.push({ ts: new Date(Date.UTC(2024, 0, 1 + day)), equity });
  }
  return curve;
}

describe('terminal DSR trial-family registry', () => {
  it('uses all 117 related halal-core trials and never falls below the local plateau', () => {
    const evidence = trialCountEvidence('halal-residual-fast-momentum-core', 9);
    const raisedPlateau = trialCountEvidence('halal-fast-momentum-core', 120);

    expect(evidence.familyTrials).toBe(117);
    expect(evidence.familyTrials).toBeGreaterThan(evidence.plateauTrials);
    expect(raisedPlateau.familyTrials).toBe(120);
    expect(raisedPlateau.familyTrials).toBeGreaterThanOrEqual(raisedPlateau.plateauTrials);
  });

  it('a larger related family cannot improve DSR for a known positive sample', () => {
    const curve = knownPositiveCurve();
    const local = computeMetrics(curve, { trades: 249, turnover: 1, trials: 9 });
    const family = trialCountEvidence('halal-residual-fast-momentum-core', 9);
    const corrected = computeMetrics(curve, { trades: 249, turnover: 1, trials: family.familyTrials });

    expect(corrected.deflatedSharpe).toBeLessThanOrEqual(local.deflatedSharpe);
  });
});

describe('two-tier trial deflation (QDR-9)', () => {
  it('keeps exploratory back-compat for every registered core setup and for standalone setups', () => {
    for (const setupId of HALAL_CORE_SETUP_IDS) {
      const evidence = trialCountEvidence(setupId, 9);
      expect(evidence).toMatchObject({
        familyId: 'halal-core-2026q3-v1',
        familyTrials: 117,
        relatedSetups: 13,
        tier: 'EXPLORATORY',
      });
    }
    expect(trialCountEvidence('halal-spus-vol-managed-beta', 108)).toMatchObject({
      familyId: 'standalone:halal-spus-vol-managed-beta',
      familyTrials: 108,
      relatedSetups: 1,
      tier: 'EXPLORATORY',
    });
    expect(trialCountEvidence('halal-fast-momentum-core', 120).familyTrials).toBe(120);
  });

  it('grants N=1 only when all six structural conditions are proved', () => {
    const confirmed = trialCountEvidence('halal-spus-vol-managed-beta', 108, provenConfirmatory());

    expect(confirmed.tier).toBe('CONFIRMATORY');
    expect(confirmed.familyTrials).toBe(1);
    expect(confirmed.exploratoryFamilyTrials).toBe(108);
    expect(confirmed.confirmatoryFailures).toEqual([]);
  });

  it.each([
    ['SEALED_CONFIG_HASH_VERIFIED', { configHash: 'deadbeef' }],
    ['SEALED_CONFIG_HASH_VERIFIED', { config: undefined }],
    ['FORWARD_ONLY_HISTORICAL_MODE', { historicalMode: undefined }],
    ['FORWARD_ONLY_HISTORICAL_MODE', { historicalMode: 'PIPELINE_ONLY_NO_PERFORMANCE' }],
    ['ZERO_DIAGNOSTIC_RUNS', { diagnosticRuns: undefined }],
    ['ZERO_DIAGNOSTIC_RUNS', { diagnosticRuns: 1 }],
    ['FORWARD_BOUNDARY_AFTER_SEAL', { sealedAt: undefined }],
    ['FORWARD_BOUNDARY_AFTER_SEAL', { sealedAt: '2026-08-08T00:00:00.000Z' }],
    ['OBSERVATIONS_AFTER_FORWARD_BOUNDARY', { earliestObservation: undefined }],
    ['OBSERVATIONS_AFTER_FORWARD_BOUNDARY', { earliestObservation: '2026-08-07T20:00:00.000Z' }],
    ['EXACTLY_ONE_TERMINAL_EVALUATION', { terminalEvaluations: undefined }],
    ['EXACTLY_ONE_TERMINAL_EVALUATION', { terminalEvaluations: 2 }],
  ] as const)('fails closed to EXPLORATORY when %s is unproved', (condition, override) => {
    const evidence = trialCountEvidence(
      'halal-spus-vol-managed-beta',
      108,
      { ...provenConfirmatory(), ...override },
    );
    const core = trialCountEvidence('halal-residual-fast-momentum-core', 9, {
      ...provenConfirmatory(),
      ...override,
    });

    expect(evidence.tier).toBe('EXPLORATORY');
    expect(evidence.familyTrials).toBe(108);
    expect(evidence.confirmatoryFailures).toContain(condition);
    expect(core.tier).toBe('EXPLORATORY');
    expect(core.familyTrials).toBe(117);
  });

  it('treats absent evidence and a bare self-assertion as proof of nothing', () => {
    expect(trialCountEvidence('halal-spus-vol-managed-beta', 108).confirmatoryFailures)
      .toEqual([...CONFIRMATORY_CONDITIONS]);
    expect(trialCountEvidence('halal-spus-vol-managed-beta', 108, {} as ConfirmatoryEvidenceInput))
      .toMatchObject({ tier: 'EXPLORATORY', familyTrials: 108 });
    expect(trialCountEvidence('halal-spus-vol-managed-beta', 108, {
      ...provenConfirmatory(),
      config: { setup: 'halal-spus-vol-managed-beta', seed: 43 },
    }).tier).toBe('EXPLORATORY');
  });
});
