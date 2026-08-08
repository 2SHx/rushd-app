// src/quant/backtest/gateConfigWiring.test.ts — QDR-13 (G10): the sealed BETA/DIVERSIFICATION gate
// block must be reachable at run time via `RunLabOptions.gateConfig`, never silently resolve to
// ALPHA because it was read off `effectiveParams`/`setup.defaultParams` instead of the sealed
// manifest. Pins all five G10 acceptance behaviors, roadmap row `G10` (docs/QUANT_DESIGN.md §9b).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDraft,
  markCodified,
  readManifest,
  sealExperiment,
  stableConfigHash,
  writeManifest,
  type JsonValue,
} from './experimentProtocol';

const tempDirectories: string[] = [];
afterEach(() => {
  for (const directory of tempDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function manifestPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'rushd-gate-config-wiring-'));
  tempDirectories.push(directory);
  return join(directory, 'manifest.json');
}

// A structurally FEASIBLE BETA gate — identical shape to the one `experimentProtocol.test.ts`'s
// seal-time suite already proves clears `assessBetaGateFeasibility` (n=104, criterion-(a) rates
// within the corrected bar, a benchmark-model sanity fraction inside the widened band).
const BETA_VALIDATION = {
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

// `gapper-orb` owns a FIXED research book (no --universe/--symbols override permitted), so the
// smallest real, DB-free, fixture-backed CLI invocation is one captured date, no overrides.
const MATCHING_ARGV = ['--setup', 'gapper-orb', '--from', '2021-02-11', '--to', '2021-02-11', '--seed', '42'];
// Exactly what `protocolConfigForOptions` builds from `MATCHING_ARGV` (period/universe/candidatesPath/
// engine/feed/source stay undefined ⇒ JSON.stringify drops them; symbols/confirmFull/seed/oosFraction
// always have defaults).
const MATCHING_RUN_CONFIG = {
  setup: 'gapper-orb', from: '2021-02-11', to: '2021-02-11',
  symbols: null, confirmFull: false, seed: 42, oosFraction: 0.3,
};

function betaDraft(runConfig?: Record<string, unknown>) {
  return createDraft({
    setupId: 'gapper-orb',
    version: 'v1',
    config: { validation: BETA_VALIDATION, ...(runConfig ? { runConfig } : {}) } as unknown as JsonValue,
    director: 'director-a',
  });
}

describe('G10 (QDR-13): the sealed BETA/DIVERSIFICATION gate block is reachable at run time', () => {
  it('1. refuses to seal a BETA productClass block with no paired runConfig', () => {
    expect(() => sealExperiment(betaDraft())).toThrow(/runConfig/);
    // ...and a DIVERSIFICATION declaration is refused the same way (scoped to BETA/DIVERSIFICATION,
    // not to every ALPHA DSR gate — see experimentProtocol.ts's assertRunConfigPairedWithGate doc).
    expect(() => sealExperiment(createDraft({
      setupId: 'gate-probe', version: 'v1',
      config: { validation: { productClass: 'DIVERSIFICATION' } } as unknown as JsonValue,
      director: 'director-a',
    }))).toThrow(/minimumOosObservations/); // gateSpecFromConfig itself throws first — still refused
  });

  it('accepts the identical BETA block once a paired runConfig is present', () => {
    const sealed = sealExperiment(betaDraft(MATCHING_RUN_CONFIG));
    expect(sealed.state).toBe('SEALED');
    expect(sealed.configHash).toBe(stableConfigHash(sealed.config));
  });

  it('2. + 3. a matching runConfig passes assertFrozenCliConfig and resolves BETA at run time; a mismatched one is refused', async () => {
    const { runBacktestCli } = await import('../../../scripts/backtest');
    const path = manifestPath();
    const sealed = markCodified(sealExperiment(betaDraft(MATCHING_RUN_CONFIG)), 'implementer-a');
    await writeManifest(path, sealed);

    // FAILS assertFrozenCliConfig for any CLI options other than the sealed runConfig (one field
    // changed: --to a date with no captured fixture — proving the run never even starts).
    const mismatched = MATCHING_ARGV.map((v) => (v === '2021-02-11' ? '2021-02-12' : v));
    await expect(runBacktestCli([
      ...mismatched, '--diagnostic', 'true', '--manifest', path, '--implementer', 'implementer-a',
    ])).rejects.toThrow('CLI config does not match the sealed experiment manifest');
    expect((await readManifest(path)).diagnosticRuns).toBe(0); // the refused attempt claimed nothing

    // PASSES assertFrozenCliConfig for the matching CLI options, and `runLab` — reading
    // `options.gateConfig`, threaded from `manifest.config.validation` — resolves the card BETA.
    const result = await runBacktestCli([
      ...MATCHING_ARGV, '--diagnostic', 'true', '--manifest', path, '--implementer', 'implementer-a',
    ]);
    expect(result.card.productClass).toBe('BETA');
    expect((await readManifest(path)).diagnosticRuns).toBe(1);
    // 120s, not 30s: this is a GENUINE end-to-end diagnostic run — the only proof in the suite that
    // card.productClass resolves BETA rather than ALPHA through the real CLI path. It takes ~14s
    // alone but exceeded 30s under full-suite parallel load. The cost is paid only when the run is
    // actually slow; shortening the budget would trade the one test that proves the fix for speed.
  }, 120_000);

  it('4. mutating productClass after seal without updating configHash is refused by assertSealedConfig before runLab ever runs', async () => {
    const path = manifestPath();
    const sealed = markCodified(sealExperiment(betaDraft(MATCHING_RUN_CONFIG)), 'implementer-a');
    await writeManifest(path, sealed);

    // Shop the class directly on disk — the hash on disk is now stale for the mutated config.
    const onDisk = JSON.parse(readFileSync(path, 'utf8')) as { config: { validation: { productClass: string } } };
    onDisk.config.validation.productClass = 'ALPHA';
    await writeManifest(path, { ...sealed, config: onDisk.config });

    await expect(readManifest(path)).rejects.toThrow('Sealed config hash mismatch');
    // `runBacktestCli`'s diagnostic-with-manifest path calls `readManifest` (via `assertFrozenCliConfig`)
    // before anything else — the tampered manifest can never reach `runLab`.
    const { runBacktestCli } = await import('../../../scripts/backtest');
    await expect(runBacktestCli([
      ...MATCHING_ARGV, '--diagnostic', 'true', '--manifest', path, '--implementer', 'implementer-a',
    ])).rejects.toThrow('Sealed config hash mismatch');
  });

  it('5. halal-residual-fast-momentum-core-v1.json passes assertFrozenCliConfig byte-identically to pre-G10 behavior, with zero edits to the file', async () => {
    const { assertFrozenCliConfig, parseArgs, parseRunLabOptions, protocolConfigForOptions } = await import('../../../scripts/backtest');
    const filePath = join(__dirname, '..', '..', '..', 'docs', 'quant-experiments', 'halal-residual-fast-momentum-core-v1.json');
    const before = readFileSync(filePath, 'utf8');
    const onDisk = JSON.parse(before) as { configHash: string; config: Record<string, unknown> };

    // This record adds `runConfig` to NO already-sealed manifest — confirmed structurally, read-only.
    expect(onDisk.config.runConfig).toBeUndefined();

    const matchingArgv = [
      '--setup', 'halal-residual-fast-momentum-core', '--from', '2020-06-01', '--to', '2026-07-17',
      '--seed', '42', '--engine', 'shared', '--feed', 'yahoo-daily', '--source', 'db',
    ];
    const matchingOptions = parseRunLabOptions(parseArgs(matchingArgv));
    // QDR-13's `declaredRunConfig = manifest.config.runConfig ?? manifest.config` reduces, for a
    // manifest with no `runConfig` (every manifest sealed today, this one included), to EXACTLY the
    // pre-G10 check: `manifest.configHash === stableConfigHash(protocolConfigForOptions(options))`.
    expect(stableConfigHash(protocolConfigForOptions(matchingOptions))).toBe(onDisk.configHash);

    // ...and still fails for any other CLI options, exactly as before.
    const mismatchedOptions = parseRunLabOptions(parseArgs([
      ...matchingArgv.slice(0, -2), '--source', 'fixtures',
    ]));
    expect(stableConfigHash(protocolConfigForOptions(mismatchedOptions))).not.toBe(onDisk.configHash);

    // The REAL function, not a reconstruction of its logic (gap found at QA review): the two
    // assertions above pin the hash algebra, but only this pins the comparison assertFrozenCliConfig
    // actually performs, so a future change to it is caught against this real sealed manifest.
    await expect(assertFrozenCliConfig(filePath, matchingOptions)).resolves.toMatchObject({
      setupId: 'halal-residual-fast-momentum-core',
    });
    await expect(assertFrozenCliConfig(filePath, mismatchedOptions)).rejects
      .toThrow(/does not match the sealed experiment manifest/);

    // The OTHER half of its OR — the setupId branch — was never exercised. A manifest whose
    // configHash matches while its setupId does not must still be refused.
    const wrongSetup = { ...matchingOptions, setup: 'halal-risk-parity-core' };
    await expect(assertFrozenCliConfig(filePath, wrongSetup)).rejects
      .toThrow(/does not match the sealed experiment manifest/);

    expect(readFileSync(filePath, 'utf8')).toBe(before); // untouched throughout — read-only
  });

  it('a PRESENT runConfig is not a RUNNABLE one — `runConfig: {}` is refused at seal', async () => {
    // Probed at QA review: an empty object is a plain object, so it used to seal cleanly — yet
    // stableConfigHash({}) can never equal any real invocation's hash, so the manifest was sealed
    // permanently unrunnable, which is precisely what the pairing guard exists to prevent.
    const { createDraft, sealExperiment } = await import('./experimentProtocol');
    const betaGate = {
      productClass: 'BETA', minimumOosObservations: 104, observationsPerYear: 252 / 5,
      relatedFamilyTrials: 108, benchmarkSymbol: 'SPUS', targetAnnualVol: 0.10,
      volCeiling: 0.13, volFloor: 0.06, hypothesizedBeta: 0.85, maxAnnualTurnover: 4,
      maxAnnualCostDragBps: 40, declaredVolatilityFalseAlarmRate: 0.002,
      declaredHalfWindowFalseAlarmRate: 0.015, declaredNegativeBenchmarkBlockFraction: 0.43,
    };
    const draftWith = (runConfig: unknown) => createDraft({
      setupId: 'probe-setup', version: 'v1', director: 'director-a',
      config: { validation: betaGate, runConfig } as never,
    });

    expect(() => sealExperiment(draftWith({}))).toThrow(/runConfig\.setup must be "probe-setup"/);
    expect(() => sealExperiment(draftWith({ setup: 'a-different-setup' })))
      .toThrow(/runConfig\.setup must be "probe-setup"/);
    expect(() => sealExperiment(draftWith({ setup: 'probe-setup' }))).not.toThrow();
  });
});
