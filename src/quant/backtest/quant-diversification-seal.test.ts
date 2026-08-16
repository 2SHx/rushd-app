// QDR-11 A/B ISOLATION as a seal-time REFUSAL: exactly one variable, against a NAMED prior SEALED
// version. A novel strategy cannot enter as DIVERSIFICATION, and a comparator cannot be a strawman
// constructed for the occasion — which is the failure mode that produced a 2.6x overstatement once
// already, with no error in the mechanism at all.
import { describe, expect, it, vi } from 'vitest';
import {
  assertDiversificationComparator,
  createDraft,
  sealExperiment,
  type ComparatorResolver,
  type ExperimentManifest,
  type JsonValue,
} from './experimentProtocol';

/** QDR-11's sealed 3x3 grid, gating cell first. */
const PLATEAU_GRID = (() => {
  // QDR-11's full 3x3 grid, sealed cell FIRST. A 1-cell fixture used to seal here — the gap QA
  // found — and assertDiversificationGateSpec now refuses it.
  const all = [0.20, 0.25, 0.30].flatMap((c) => [60, 80, 100].map((p) => `sectorCap=${c},poolSize=${p}`));
  return ['sectorCap=0.25,poolSize=80', ...all.filter((c) => c !== 'sectorCap=0.25,poolSize=80')];
})();

const GATE = {
  productClass: 'DIVERSIFICATION',
  minimumOosObservations: 644,
  observationsPerYear: 252,
  relatedFamilyTrials: 108,
  trialTier: 'CONFIRMATORY',
  confirmatoryTrials: 1,
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
  survivorshipCoverageWaiverAcknowledged: false,
  plateauCells: PLATEAU_GRID,
};

const MECHANISM = {
  seed: 42,
  signal: { kind: 'none' },
  portfolio: { weighting: 'inverse-volatility', lookbackDays: 252, perNameCap: 0.20, breadthFloor: 15 },
  execution: { commissionBpsPerSide: 10, slippageBpsPerSide: 5 },
  plateau: { cells: 9 },
  // QDR-13 (G10): a DIVERSIFICATION `validation` block requires a paired `runConfig` sibling to seal
  // at all (`assertRunConfigPairedWithGate`). `runConfig` is also excluded from the A/B isolation
  // diff (`DIVERSIFICATION_AB_VARIABLE_BLOCKS`), so its presence here never trips the "differs in
  // more than the universe block" refusal against `INCUMBENT_CONFIG` or a historical anchor.
  runConfig: { setup: 'halal-decorrelated-risk-parity-core', seed: 42 },
};

function draft(config: Record<string, unknown>): ExperimentManifest {
  return createDraft({
    setupId: 'halal-decorrelated-risk-parity-core',
    version: 'v1',
    config: config as unknown as JsonValue,
    director: 'director-a',
  });
}

const TREATMENT = {
  ...MECHANISM,
  universe: { rule: 'selectCorrelationBalancedSleeve', maxNames: 40, sectorCap: 0.25, poolSize: 80 },
  validation: GATE,
};

/** The incumbent, as it would appear in the sealed inventory: identical except the universe block. */
const INCUMBENT_CONFIG = {
  ...MECHANISM,
  universe: { rule: 'selectDollarVolumeSleeve', maxNames: 40 },
  validation: { minimumOosObservations: 100, minimumOosDsr: 0.95, maximumPlausibleSharpe: 3, observationsPerYear: 12, relatedFamilyTrials: 9, hypothesizedAnnualSharpe: 0.8 },
};

const resolver = (overrides: Partial<{ sealed: boolean; config: unknown }> = {}): ComparatorResolver =>
  (versionId) => (versionId === 'halal-risk-parity-core@v1'
    ? {
      versionId,
      sealed: overrides.sealed ?? true,
      config: (overrides.config ?? INCUMBENT_CONFIG) as JsonValue,
    }
    : null);

describe('a DIVERSIFICATION seal must resolve a real prior SEALED comparator', () => {
  it('FAILS CLOSED when no resolver is supplied — no resolver is not "no check"', () => {
    // A caller that forgets to wire one must not be able to seal: "no resolver" is
    // indistinguishable from "no comparator exists", and both are refusals.
    expect(() => sealExperiment(draft(TREATMENT)))
      .toThrow(/no resolver was supplied/);
  });

  it('refuses a comparator that resolves to nothing', () => {
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: () => null }))
      .toThrow(/resolves to no SEALED manifest/);
  });

  it('refuses a comparator that exists but was never SEALED', () => {
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: resolver({ sealed: false }) }))
      .toThrow(/resolves to no SEALED manifest/);
  });

  it('points the reader at the Revisit-when clause rather than at a code fix', () => {
    // The incumbent having no sealed manifest is a DESIGN trigger, not an implementation bug, so
    // the error has to say so — otherwise the next reader "fixes" it by writing the manifest, which
    // would be fabricating a preregistration after its own data existed.
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: () => null }))
      .toThrow(/needs its own design record before any such seal/);
  });

  it('seals when the comparator is real, sealed, and differs only in the universe block', () => {
    const sealed = sealExperiment(draft(TREATMENT), { resolveComparator: resolver() });
    expect(sealed.state).toBe('SEALED');
    expect(sealed.configHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('exactly one variable — a second one makes the difference unattributable', () => {
  it('refuses arms whose SIZING differs alongside the universe rule', () => {
    const tampered = { ...INCUMBENT_CONFIG, portfolio: { ...MECHANISM.portfolio, perNameCap: 0.10 } };
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: resolver({ config: tampered }) }))
      .toThrow(/differ in more than the universe block — portfolio/);
  });

  it('refuses arms whose SEED differs — reproducibility is part of the comparison', () => {
    const tampered = { ...INCUMBENT_CONFIG, seed: 7 };
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: resolver({ config: tampered }) }))
      .toThrow(/differ in more than the universe block — seed/);
  });

  it('refuses a smuggled extra block, and NAMES every differing block at once', () => {
    const tampered = {
      ...INCUMBENT_CONFIG,
      signal: { kind: 'momentum', lookbackDays: 252 },
      execution: { commissionBpsPerSide: 2, slippageBpsPerSide: 1 },
    };
    const run = () => sealExperiment(draft(TREATMENT), { resolveComparator: resolver({ config: tampered }) });
    expect(run).toThrow(/signal/);
    expect(run).toThrow(/execution/);
  });

  it('permits the validation and hypothesis blocks to differ — the gate block is class-specific', () => {
    // The incumbent is an ALPHA lane; it cannot carry a DIVERSIFICATION gate block, and demanding
    // that it does would make the class unreachable rather than well-controlled.
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: resolver() })).not.toThrow();
  });

  it('is insensitive to key ORDER — identical means identical in the hash\'s own sense', () => {
    const reordered = {
      plateau: MECHANISM.plateau,
      execution: { slippageBpsPerSide: 5, commissionBpsPerSide: 10 },
      portfolio: { breadthFloor: 15, perNameCap: 0.20, lookbackDays: 252, weighting: 'inverse-volatility' },
      signal: MECHANISM.signal,
      seed: 42,
      universe: INCUMBENT_CONFIG.universe,
      validation: INCUMBENT_CONFIG.validation,
    };
    expect(() => sealExperiment(draft(TREATMENT), { resolveComparator: resolver({ config: reordered }) }))
      .not.toThrow();
  });
});

describe('the check is scoped to the class that needs it', () => {
  it('never consults the resolver for an ALPHA lane', () => {
    const resolve = vi.fn<ComparatorResolver>(() => null);
    const alpha = draft({
      ...MECHANISM,
      universe: { rule: 'selectDollarVolumeSleeve', maxNames: 40 },
      validation: {
        minimumOosObservations: 500, minimumOosDsr: 0.95, maximumPlausibleSharpe: 3,
        observationsPerYear: 252 / 5, relatedFamilyTrials: 1, hypothesizedAnnualSharpe: 1.6,
      },
    });
    assertDiversificationComparator(alpha, resolve);
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses a DIVERSIFICATION class declared without a complete gate block, naming what is missing', () => {
    // `productClass` is itself a GATE_KEY, so declaring the class IS declaring a gate: the block is
    // parsed and throws on the first missing field. QDR-11's "present-but-incomplete throws at seal"
    // is therefore satisfied upstream, with a message that says which field, not just that one is
    // absent. Asserting that real behaviour rather than a message of my own invention.
    const incomplete = draft({
      ...MECHANISM,
      universe: { rule: 'x' },
      validation: { productClass: 'DIVERSIFICATION' },
    });
    expect(() => assertDiversificationComparator(incomplete, resolver()))
      .toThrow(/minimumOosObservations/);
  });

  it('still seals an absent-entirely gate block as EXPLORATORY ALPHA — the fail-closed default', () => {
    const bare = draft({ ...MECHANISM, universe: { rule: 'x' } });
    expect(sealExperiment(bare).state).toBe('SEALED');
  });
});
