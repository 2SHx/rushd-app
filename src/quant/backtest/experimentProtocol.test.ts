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
      config: { validation } as unknown as Parameters<typeof createDraft>[0]['config'],
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

  it('seals the amended SPUS lane and leaves the other sealed manifests untouched', () => {
    const dir = join(__dirname, '..', '..', '..', 'docs', 'quant-experiments');
    for (const file of [
      'halal-spus-vol-managed-beta-v1.json',
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
