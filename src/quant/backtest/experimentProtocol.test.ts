import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDraft,
  claimFull,
  finalizeExperiment,
  markCodified,
  markQaPass,
  sealExperiment,
  stableConfigHash,
  readManifest,
  recordDiagnostic,
  recordFullResult,
  writeManifest,
} from './experimentProtocol';
import { trialCountEvidence } from './trialFamilies';

const backtestMocks = vi.hoisted(() => ({ runLab: vi.fn() }));
vi.mock('./runLab', async () => ({
  ...(await vi.importActual<typeof import('./runLab')>('./runLab')),
  runLab: backtestMocks.runLab,
}));

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function manifestPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'rushd-experiment-'));
  tempDirectories.push(directory);
  return join(directory, 'manifest.json');
}

function qaPassedManifest() {
  return markQaPass(markCodified(sealExperiment(createDraft({
    setupId: 'alpha', version: 'v1', config: { threshold: 5 }, director: 'director-a',
  })), 'implementer-a'), 'auditor-b');
}

describe('experiment manifest protocol', () => {
  it('hashes semantically identical configs identically regardless of key order', () => {
    const first = { z: [3, 2, 1], a: { y: 2, x: 1 } };
    const reordered = { a: { x: 1, y: 2 }, z: [3, 2, 1] };

    expect(stableConfigHash(first)).toBe(stableConfigHash(reordered));
    expect(stableConfigHash(first)).toBe('e4b0bcaf941766b0135d98d73dbdfbe228be87cc9730494c5bcd1638191dcd32');
  });

  it('rejects config mutation after the draft is sealed', () => {
    const sealed = sealExperiment(createDraft({
      setupId: 'alpha',
      version: 'v1',
      config: { threshold: 5 },
      director: 'director-a',
    }));
    (sealed.config as { threshold: number }).threshold = 6;

    expect(() => markCodified(sealed, 'implementer-a')).toThrow('Sealed config hash mismatch');
  });

  it('requires distinct implementer and auditor identities', () => {
    const codified = markCodified(sealExperiment(createDraft({
      setupId: 'alpha', version: 'v1', config: {}, director: 'director-a',
    })), 'actor-a');

    expect(() => markQaPass(codified, 'actor-a')).toThrow('implementer and auditor must be distinct');
    expect(markQaPass(codified, 'auditor-b').state).toBe('QA_PASS');
  });

  it('does not allow a diagnostic run to create a terminal verdict', async () => {
    const path = manifestPath();
    await writeManifest(path, qaPassedManifest());

    const diagnostic = await recordDiagnostic(path, 'implementer-a');
    expect(diagnostic).toMatchObject({ state: 'QA_PASS', diagnosticRuns: 1, terminal: null });
    await expect(recordDiagnostic(path, 'implementer-a')).rejects.toThrow('Diagnostic already recorded');

    await expect(finalizeExperiment(path, {
      runKind: 'DIAGNOSTIC',
      status: 'REJECTED',
      auditor: 'auditor-b',
      reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).rejects.toThrow('Diagnostic runs cannot terminalize');
  });

  it('grants exactly one diagnostic claim under concurrent attempts', async () => {
    const path = manifestPath();
    await writeManifest(path, qaPassedManifest());

    const claims = await Promise.allSettled([
      recordDiagnostic(path, 'implementer-a'),
      recordDiagnostic(path, 'implementer-a'),
    ]);

    expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === 'rejected')).toHaveLength(1);
    expect((await readManifest(path)).diagnosticRuns).toBe(1);
  });

  it('claims the diagnostic before starting runLab', async () => {
    const { parseArgs, parseRunLabOptions, protocolConfigForOptions, runBacktestCli } =
      await import('../../../scripts/backtest');
    const path = manifestPath();
    const argv = [
      '--setup', 'alpha', '--period', '1Y', '--diagnostic', 'true',
      '--manifest', path, '--implementer', 'implementer-a',
    ];
    const options = parseRunLabOptions(parseArgs(argv));
    const manifest = markQaPass(markCodified(sealExperiment(createDraft({
      setupId: 'alpha', version: 'v1', config: protocolConfigForOptions(options), director: 'director-a',
    })), 'implementer-a'), 'auditor-b');
    await writeManifest(path, manifest);
    backtestMocks.runLab.mockReset();
    backtestMocks.runLab.mockResolvedValue({
      card: {}, outFile: null, backtestRunId: null, diagnostic: true,
      symbols: [], universeTag: 'halal', periodPreset: '1Y', from: '2025-01-01', to: '2025-12-31',
    });

    const attempts = await Promise.allSettled([runBacktestCli(argv), runBacktestCli(argv)]);

    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === 'rejected')).toHaveLength(1);
    expect(backtestMocks.runLab).toHaveBeenCalledTimes(1);
  });

  it('grants one atomic FULL claim and refuses every second claimant', async () => {
    const path = manifestPath();
    await writeManifest(path, qaPassedManifest());

    const claims = await Promise.allSettled([
      claimFull(path, 'orchestrator-a'),
      claimFull(path, 'orchestrator-b'),
    ]);

    expect(claims.filter((claim) => claim.status === 'fulfilled')).toHaveLength(1);
    expect(claims.filter((claim) => claim.status === 'rejected')).toHaveLength(1);
    expect((await readManifest(path)).state).toBe('FULL_CLAIMED');
    await expect(claimFull(path, 'orchestrator-c')).rejects.toThrow('FULL already claimed');
  });

  it('reserves the FULL claim for an orchestrator distinct from every governed role', async () => {
    const path = manifestPath();
    await writeManifest(path, qaPassedManifest());

    for (const identity of ['director-a', 'implementer-a', 'auditor-b']) {
      await expect(claimFull(path, identity)).rejects.toThrow('FULL runner must be distinct');
    }
    await expect(claimFull(path, 'orchestrator-c')).resolves.toMatchObject({
      state: 'FULL_CLAIMED',
      actors: { fullRunner: 'orchestrator-c' },
    });
  });

  it('records exactly one terminal closure after a FULL claim', async () => {
    const path = manifestPath();
    await writeManifest(path, qaPassedManifest());
    await claimFull(path, 'orchestrator-a');
    const result = await recordFullResult(path, 'orchestrator-a', {
      outcome: 'FULL', status: 'ACCEPTED', reasonCodes: [],
      evidencePath: 'results/alpha-v1.json',
    });
    expect(result).toMatchObject({ state: 'FULL_CLAIMED', terminal: null });

    const closures = await Promise.allSettled([
      finalizeExperiment(path, {
        runKind: 'FULL', status: 'ACCEPTED', auditor: 'auditor-b', reasonCodes: [],
        evidencePath: 'results/alpha-v1.json',
      }),
      finalizeExperiment(path, {
        runKind: 'FULL', status: 'ACCEPTED', auditor: 'auditor-b', reasonCodes: [],
        evidencePath: 'results/alpha-v1.json',
      }),
    ]);

    expect(closures.filter((closure) => closure.status === 'fulfilled')).toHaveLength(1);
    expect(closures.filter((closure) => closure.status === 'rejected')).toHaveLength(1);
    expect(['ACCEPTED', 'REJECTED']).toContain((await readManifest(path)).state);
    await expect(finalizeExperiment(path, {
      runKind: 'FAILURE', status: 'REJECTED', auditor: 'auditor-b',
      reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).rejects.toThrow('Terminal verdict already recorded');
  });

  it('allows abandonment only after QA and only by the registered auditor', async () => {
    const codifiedPath = manifestPath();
    const codified = markCodified(sealExperiment(createDraft({
      setupId: 'alpha', version: 'v1', config: {}, director: 'director-a',
    })), 'implementer-a');
    await writeManifest(codifiedPath, codified);
    await expect(finalizeExperiment(codifiedPath, {
      runKind: 'ABANDONED', status: 'REJECTED', auditor: 'auditor-b',
      reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).rejects.toThrow('Cannot abandon experiment from CODIFIED');

    const missingPath = manifestPath();
    const missingAuditor = qaPassedManifest();
    delete missingAuditor.actors.auditor;
    await writeManifest(missingPath, missingAuditor);
    await expect(finalizeExperiment(missingPath, {
      runKind: 'ABANDONED', status: 'REJECTED', auditor: 'auditor-b',
      reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).rejects.toThrow('registered QA auditor is required');

    const wrongPath = manifestPath();
    await writeManifest(wrongPath, qaPassedManifest());
    await expect(finalizeExperiment(wrongPath, {
      runKind: 'ABANDONED', status: 'REJECTED', auditor: 'auditor-c',
      reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).rejects.toThrow('Terminal auditor must match the QA auditor');

    const approvedPath = manifestPath();
    await writeManifest(approvedPath, qaPassedManifest());
    await expect(finalizeExperiment(approvedPath, {
      runKind: 'ABANDONED', status: 'REJECTED', auditor: 'auditor-b',
      reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).resolves.toMatchObject({ state: 'REJECTED', terminal: { outcome: 'ABANDONED' } });
  });
});

describe('seal-time gate feasibility (QDR-9)', () => {
  const GATE = {
    minimumOosDsr: 0.95,
    maximumPlausibleSharpe: 3,
    observationsPerYear: 252 / 5,
    relatedFamilyTrials: 108,
    hypothesizedAnnualSharpe: 0.8,
  };

  function draftWith(validation: Record<string, unknown>) {
    return createDraft({
      setupId: 'gate-probe',
      version: 'v1',
      // QDR-13 (G10): a BETA/DIVERSIFICATION `validation` block requires a paired `runConfig` sibling
      // to seal at all (`assertRunConfigPairedWithGate`). Harmless for the plain-ALPHA `GATE` fixture
      // below, which never reads it.
      config: { validation, runConfig: { setup: 'gate-probe', seed: 42 } } as unknown as Parameters<typeof createDraft>[0]['config'],
      director: 'director-a',
    });
  }

  it('refuses a preregistration whose acceptance set is provably empty', () => {
    expect(() => sealExperiment(draftWith({ ...GATE, minimumOosObservations: 100 })))
      .toThrow(/EMPTY_ACCEPTANCE_SET/);
  });

  it('refuses an underpowered preregistration with a distinguishable error and a window size', () => {
    const underpowered = draftWith({
      ...GATE, minimumOosObservations: 150, trialTier: 'CONFIRMATORY', confirmatoryTrials: 1,
    });

    expect(() => sealExperiment(underpowered)).toThrow(/UNDERPOWERED/);
    expect(() => sealExperiment(underpowered)).toThrow(/n >= 216/);
    expect(() => sealExperiment(underpowered)).not.toThrow(/EMPTY_ACCEPTANCE_SET/);
  });

  it('refuses a confirmatory lane whose exploratory fallback could never clear the gate', () => {
    expect(() => sealExperiment(draftWith({
      ...GATE, minimumOosObservations: 100, trialTier: 'CONFIRMATORY', confirmatoryTrials: 1,
    }))).toThrow(/EMPTY_FALLBACK_ACCEPTANCE_SET/);
  });

  it('QDR-16 seals only an explicit confirmatory calendar window bound to its evidence boundary', () => {
    const validation = {
      ...GATE,
      minimumOosObservations: 487,
      relatedFamilyTrials: 117,
      trialTier: 'CONFIRMATORY',
      confirmatoryTrials: 1,
    };
    const config = {
      validation,
      runConfig: { setup: 'confirmatory-lane', from: '2026-08-19', to: '2036-07-31' },
      evidenceBoundary: 'forward-only-after-2026-08-19T00:00:00.000Z',
    } as unknown as Parameters<typeof createDraft>[0]['config'];
    const draft = (override: Record<string, unknown> = {}) => createDraft({
      setupId: 'confirmatory-lane', version: 'v1',
      config: { ...(config as Record<string, unknown>), ...override } as Parameters<typeof createDraft>[0]['config'],
      director: 'director-a',
    });

    expect(sealExperiment(draft()).state).toBe('SEALED');
    expect(() => sealExperiment(draft({
      runConfig: { setup: 'confirmatory-lane', from: 'SEAL-REQUIRED-YYYY-MM-DD', to: '2036-07-31' },
    }))).toThrow(/literal YYYY-MM-DD/);
    expect(() => sealExperiment(draft({
      runConfig: { setup: 'confirmatory-lane', from: '2036-07-31', to: '2026-08-19' },
    }))).toThrow(/from < to/);
    expect(() => sealExperiment(draft({
      runConfig: { setup: 'confirmatory-lane', from: '2026-08-19', to: '2036-07-31', period: 'FULL' },
    }))).toThrow(/runConfig\.period is forbidden/);
    expect(() => sealExperiment(draft({ evidenceBoundary: 'forward-only-after-2026-08-20T00:00:00.000Z' })))
      .toThrow(/evidenceBoundary/);
  });

  it('QDR-16 does not impose a calendar window on exploratory manifests', () => {
    expect(sealExperiment(createDraft({
      setupId: 'exploratory-lane', version: 'v1',
      config: { validation: { trialTier: 'EXPLORATORY' } },
      director: 'director-a',
    })).state).toBe('SEALED');
  });

  const BETA_GATE = {
    minimumOosObservations: 104,
    observationsPerYear: 252 / 5,
    relatedFamilyTrials: 108,
    productClass: 'BETA',
    benchmarkSymbol: 'SPUS',
    targetAnnualVol: 0.1,
    volCeiling: 0.13,
    volFloor: 0.06,
    hypothesizedBeta: 0.62,
    maxAnnualTurnover: 4,
    maxAnnualCostDragBps: 60,
    declaredVolatilityFalseAlarmRate: 0.002,
    declaredHalfWindowFalseAlarmRate: 0.015,
    declaredNegativeBenchmarkBlockFraction: 0.44,
  };

  it('seals a well-formed BETA preregistration', () => {
    const sealed = sealExperiment(draftWith(BETA_GATE));

    expect(sealed.state).toBe('SEALED');
    expect(sealed.configHash).toBe(stableConfigHash(sealed.config));
  });

  it('refuses a BETA seal whose volatility band is empty and one that is under-powered on volatility', () => {
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, volCeiling: 0.06, volFloor: 0.06 })))
      .toThrow(/EMPTY_BETA_VOLATILITY_BAND/);
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, volCeiling: 0.05 })))
      .toThrow(/EMPTY_BETA_VOLATILITY_BAND/);
    // QDR-10 2026-08-06b: the power assertion sits on criterion (a), full window AND each half.
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, declaredVolatilityFalseAlarmRate: 0.06 })))
      .toThrow(/UNDERPOWERED_BETA_VOLATILITY/);
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, declaredHalfWindowFalseAlarmRate: 0.06 })))
      .toThrow(/UNDERPOWERED_BETA_VOLATILITY/);
    // The corrected observation floor is 104, replacing the void 156; 103 is refused, 104 seals.
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, minimumOosObservations: 103 })))
      .toThrow(/UNDERPOWERED_BETA_VOLATILITY/);
    expect(sealExperiment(draftWith({ ...BETA_GATE, minimumOosObservations: 104 })).state).toBe('SEALED');
    // The model-free falsifier: a benchmark that falls 8.8% of blocks is not any real index.
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, declaredNegativeBenchmarkBlockFraction: 0.088 })))
      .toThrow(/BENCHMARK_MODEL_SANITY_FAILURE/);
    // ...and so is one that almost never rises. 0.70 sits 5.4 SE above the reference at n=104.
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, declaredNegativeBenchmarkBlockFraction: 0.70 })))
      .toThrow(/BENCHMARK_MODEL_SANITY_FAILURE/);
    // But 0.50 now SEALS, and that is deliberate: one SE at n=104 is 4.9pp, so 0.50 is 1.3 SE from
    // the 43.5% reference and statistically indistinguishable from a real index at this sample size.
    // Refusing it would repeat the drift bug's error — a threshold ignoring estimation noise.
    expect(sealExperiment(draftWith({ ...BETA_GATE, declaredNegativeBenchmarkBlockFraction: 0.5 })).state)
      .toBe('SEALED');
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, benchmarkSymbol: undefined })))
      .toThrow(/benchmarkSymbol/);
    expect(() => sealExperiment(draftWith({ ...BETA_GATE, maxAnnualTurnover: undefined })))
      .toThrow(/maxAnnualTurnover/);
  });

  it('QDR-10: a BETA version can never close under an ALPHA label, and vice versa', async () => {
    const path = manifestPath();
    const beta = markQaPass(markCodified(sealExperiment(createDraft({
      setupId: 'beta-lane',
      version: 'v1',
      config: { validation: BETA_GATE, runConfig: { setup: 'beta-lane', seed: 42 } } as unknown as Parameters<typeof createDraft>[0]['config'],
      director: 'director-a',
    })), 'implementer-a'), 'auditor-b');
    await writeManifest(path, { ...beta, state: 'FULL_CLAIMED', actors: { ...beta.actors, fullRunner: 'runner-c' } });

    await expect(recordFullResult(path, 'runner-c', {
      outcome: 'FULL', status: 'ACCEPTED', reasonCodes: [], evidencePath: 'results/beta.json',
    })).rejects.toThrow('BETA-class experiment cannot close as ACCEPTED');
    await expect(recordFullResult(path, 'runner-c', {
      outcome: 'FULL', status: 'ACCEPTED_BETA', reasonCodes: [], evidencePath: 'results/beta.json',
    })).resolves.toMatchObject({ fullRun: { status: 'ACCEPTED_BETA' } });

    const alphaPath = manifestPath();
    await writeManifest(alphaPath, qaPassedManifest());
    await expect(finalizeExperiment(alphaPath, {
      runKind: 'ABANDONED', status: 'REJECTED_BETA', auditor: 'auditor-b', reasonCodes: ['REPRODUCIBILITY_FAILURE'],
    })).rejects.toThrow('ALPHA-class experiment cannot close as REJECTED_BETA');
  });

  it('QDR-10: mutating productClass after seal breaks the hash and deflates to EXPLORATORY', () => {
    const sealed = sealExperiment(draftWith(BETA_GATE));
    const shopped = {
      ...sealed,
      config: { validation: { ...BETA_GATE, productClass: 'ALPHA' } } as unknown as typeof sealed.config,
    };

    expect(stableConfigHash(shopped.config)).not.toBe(sealed.configHash);
    expect(trialCountEvidence('beta-lane', 108, {
      config: shopped.config,
      configHash: sealed.configHash,
      historicalMode: 'FORWARD_ONLY_NO_HISTORICAL_FULL',
      diagnosticRuns: 0,
      sealedAt: '2026-08-06T12:00:00.000Z',
      forwardBoundary: '2026-08-07T20:00:00.000Z',
      earliestObservation: '2026-08-14T20:00:00.000Z',
      terminalEvaluations: 1,
    })).toMatchObject({
      tier: 'EXPLORATORY',
      familyTrials: 108,
      confirmatoryFailures: ['SEALED_CONFIG_HASH_VERIFIED'],
    });
  });

  it('QDR-16 refuses the legacy SPUS v1 reseal and leaves other sealed manifests untouched', () => {
    const dir = join(__dirname, '..', '..', '..', 'docs', 'quant-experiments');
    const spus = JSON.parse(readFileSync(join(dir, 'halal-spus-vol-managed-beta-v1.json'), 'utf8')) as {
      setupId: string; version: string; config: Parameters<typeof createDraft>[0]['config'];
    };
    expect(() => sealExperiment(createDraft({
      setupId: spus.setupId, version: spus.version, config: spus.config, director: 'director-a',
    }))).toThrow(/CONFIRMATORY config\.runConfig requires literal YYYY-MM-DD from\/to/);

    for (const file of [
      'halal-causal-tcn-alpha-v1.json',
      'halal-residual-fast-momentum-core-v1.json',
    ]) {
      const sealed = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
        setupId: string; version: string; config: Parameters<typeof createDraft>[0]['config']; configHash: string;
      };
      const resealed = sealExperiment(createDraft({
        setupId: sealed.setupId, version: sealed.version, config: sealed.config, director: 'director-a',
      }));

      expect(resealed.state).toBe('SEALED');
      expect(resealed.configHash).toBe(sealed.configHash);
    }
  });
});
