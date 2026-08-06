import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assessGateFeasibility, gateSpecFromConfig } from './gatePower';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type ExperimentState =
  | 'DRAFT'
  | 'SEALED'
  | 'CODIFIED'
  | 'QA_PASS'
  | 'FULL_CLAIMED'
  | 'ACCEPTED'
  | 'REJECTED';

export const EXPERIMENT_REJECTION_REASON_CODES = [
  'INSUFFICIENT_SAMPLE',
  'OOS_FAILURE',
  'DSR_FAILURE',
  'DRAWDOWN_RISK_FAILURE',
  'IMPLAUSIBLE_RESULT',
  'NO_PROFIT_PLATEAU_OVERFIT',
  'SHARIA_NON_COMPLIANT',
  'SHARIA_UNVERIFIABLE',
  'DATA_QUALITY_PIT_FAILURE',
  'REPRODUCIBILITY_FAILURE',
] as const;
export type ExperimentRejectionReasonCode = typeof EXPERIMENT_REJECTION_REASON_CODES[number];

export interface ExperimentManifest {
  schemaVersion: 1;
  setupId: string;
  version: string;
  config: JsonValue;
  configHash: string | null;
  state: ExperimentState;
  actors: {
    director: string;
    implementer?: string;
    auditor?: string;
    fullRunner?: string;
  };
  diagnosticRuns: number;
  fullRun: null | {
    outcome: 'FULL' | 'FAILURE';
    status: 'ACCEPTED' | 'REJECTED';
    reasonCodes: ExperimentRejectionReasonCode[];
    evidencePath?: string;
  };
  terminal: null | {
    status: 'ACCEPTED' | 'REJECTED';
    outcome: 'FULL' | 'FAILURE' | 'ABANDONED';
    reasonCodes: ExperimentRejectionReasonCode[];
    evidencePath?: string;
  };
}

export interface DraftInput {
  setupId: string;
  version: string;
  config: JsonValue;
  director: string;
}

export interface FinalizeExperimentInput {
  runKind: 'DIAGNOSTIC' | 'FULL' | 'FAILURE' | 'ABANDONED';
  status: 'ACCEPTED' | 'REJECTED';
  auditor: string;
  reasonCodes: ExperimentRejectionReasonCode[];
  evidencePath?: string;
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Experiment config must contain only finite JSON values');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

export function stableConfigHash(config: JsonValue): string {
  return createHash('sha256').update(canonicalJson(config)).digest('hex');
}

export function isExperimentRejectionReasonCode(value: unknown): value is ExperimentRejectionReasonCode {
  return EXPERIMENT_REJECTION_REASON_CODES.includes(value as ExperimentRejectionReasonCode);
}

function actor(value: string, role: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${role} identity is required`);
  return normalized;
}

function assertState(manifest: ExperimentManifest, expected: ExperimentState): void {
  if (manifest.state !== expected) {
    throw new Error(`Expected ${expected}, found ${manifest.state}`);
  }
}

function assertSealedConfig(manifest: ExperimentManifest): void {
  if (!manifest.configHash || stableConfigHash(manifest.config) !== manifest.configHash) {
    throw new Error('Sealed config hash mismatch');
  }
}

function isExperimentManifest(value: unknown): value is ExperimentManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ExperimentManifest>;
  return candidate.schemaVersion === 1
    && typeof candidate.setupId === 'string'
    && typeof candidate.version === 'string'
    && ['DRAFT', 'SEALED', 'CODIFIED', 'QA_PASS', 'FULL_CLAIMED', 'ACCEPTED', 'REJECTED']
      .includes(String(candidate.state))
    && typeof candidate.actors === 'object'
    && candidate.actors !== null
    && typeof candidate.actors.director === 'string'
    && Number.isInteger(candidate.diagnosticRuns)
    && (candidate.configHash === null || typeof candidate.configHash === 'string');
}

export function createDraft(input: DraftInput): ExperimentManifest {
  if (!input.setupId.trim() || !input.version.trim()) throw new Error('setupId and version are required');
  return {
    schemaVersion: 1,
    setupId: input.setupId.trim(),
    version: input.version.trim(),
    config: structuredClone(input.config),
    configHash: null,
    state: 'DRAFT',
    actors: { director: actor(input.director, 'director') },
    diagnosticRuns: 0,
    fullRun: null,
    terminal: null,
  };
}

/**
 * Refuse to seal a preregistration that cannot be won or cannot detect what it claims to predict.
 * Fires only when `config.validation` declares a numeric DSR gate (see `gateSpecFromConfig`);
 * manifests whose validation block describes no gate seal exactly as before.
 */
export function assertGateFeasibleAtSeal(manifest: ExperimentManifest): void {
  const spec = gateSpecFromConfig(manifest.config);
  if (!spec) return;
  const feasibility = assessGateFeasibility(spec);
  if (feasibility.verdict === 'FEASIBLE') return;
  throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: ${feasibility.verdict} — ${feasibility.detail}`);
}

export function sealExperiment(manifest: ExperimentManifest): ExperimentManifest {
  assertState(manifest, 'DRAFT');
  assertGateFeasibleAtSeal(manifest);
  const config = structuredClone(manifest.config);
  return { ...manifest, config, configHash: stableConfigHash(config), state: 'SEALED' };
}

export function markCodified(manifest: ExperimentManifest, implementer: string): ExperimentManifest {
  assertState(manifest, 'SEALED');
  assertSealedConfig(manifest);
  return {
    ...manifest,
    state: 'CODIFIED',
    actors: { ...manifest.actors, implementer: actor(implementer, 'implementer') },
  };
}

export function markQaPass(manifest: ExperimentManifest, auditor: string): ExperimentManifest {
  assertState(manifest, 'CODIFIED');
  assertSealedConfig(manifest);
  const auditorId = actor(auditor, 'auditor');
  if (manifest.actors.implementer === auditorId) {
    throw new Error('implementer and auditor must be distinct');
  }
  return {
    ...manifest,
    state: 'QA_PASS',
    actors: { ...manifest.actors, auditor: auditorId },
  };
}

export async function writeManifest(filePath: string, manifest: ExperimentManifest): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

export async function readManifest(filePath: string): Promise<ExperimentManifest> {
  const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  if (!isExperimentManifest(parsed)) throw new Error('Invalid experiment manifest');
  if (parsed.state !== 'DRAFT') assertSealedConfig(parsed);
  return parsed;
}

export async function claimFull(filePath: string, runner: string): Promise<ExperimentManifest> {
  const manifest = await readManifest(filePath);
  if (manifest.state !== 'QA_PASS') {
    if (['FULL_CLAIMED', 'ACCEPTED', 'REJECTED'].includes(manifest.state)) {
      throw new Error('FULL already claimed for this setup/version');
    }
    throw new Error(`FULL claim requires QA_PASS, found ${manifest.state}`);
  }
  const runnerId = actor(runner, 'FULL runner');
  if ([manifest.actors.director, manifest.actors.implementer, manifest.actors.auditor].includes(runnerId)) {
    throw new Error('FULL runner must be distinct from director, implementer, and auditor');
  }
  const claimPath = `${filePath}.full-claim`;
  let claimHandle;
  try {
    claimHandle = await open(claimPath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('FULL already claimed for this setup/version');
    }
    throw error;
  }
  await claimHandle.writeFile(`${JSON.stringify({
    setupId: manifest.setupId,
    version: manifest.version,
    configHash: manifest.configHash,
    runner: runnerId,
  }, null, 2)}\n`, 'utf8');
  await claimHandle.close();
  const claimed: ExperimentManifest = {
    ...manifest,
    state: 'FULL_CLAIMED',
    actors: { ...manifest.actors, fullRunner: runnerId },
  };
  await writeManifest(filePath, claimed);
  return claimed;
}

export async function recordDiagnostic(filePath: string, implementer: string): Promise<ExperimentManifest> {
  const manifest = await readManifest(filePath);
  if (manifest.state !== 'CODIFIED' && manifest.state !== 'QA_PASS') {
    throw new Error(`Diagnostic requires CODIFIED or QA_PASS, found ${manifest.state}`);
  }
  if (manifest.diagnosticRuns >= 1) throw new Error('Diagnostic already recorded for this setup/version');
  const implementerId = actor(implementer, 'implementer');
  if (manifest.actors.implementer !== implementerId) {
    throw new Error('Diagnostic runner must match the registered implementer');
  }
  const diagnosticPath = `${filePath}.diagnostic`;
  let diagnosticHandle;
  try {
    diagnosticHandle = await open(diagnosticPath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Diagnostic already recorded for this setup/version');
    }
    throw error;
  }
  await diagnosticHandle.writeFile(`${JSON.stringify({
    setupId: manifest.setupId,
    version: manifest.version,
    configHash: manifest.configHash,
    implementer: implementerId,
  }, null, 2)}\n`, 'utf8');
  await diagnosticHandle.close();
  const recorded = { ...manifest, diagnosticRuns: manifest.diagnosticRuns + 1 };
  await writeManifest(filePath, recorded);
  return recorded;
}

export async function recordFullResult(
  filePath: string,
  runner: string,
  result: NonNullable<ExperimentManifest['fullRun']>,
): Promise<ExperimentManifest> {
  const manifest = await readManifest(filePath);
  if (manifest.state !== 'FULL_CLAIMED') throw new Error(`FULL result requires FULL_CLAIMED, found ${manifest.state}`);
  if (manifest.actors.fullRunner !== actor(runner, 'FULL runner')) {
    throw new Error('FULL result runner must match the claim owner');
  }
  if (result.outcome === 'FULL' && !result.evidencePath?.trim()) {
    throw new Error('Completed FULL result requires an evidence path');
  }
  if (result.outcome === 'FAILURE' && result.status !== 'REJECTED') {
    throw new Error('Failed FULL result must be REJECTED');
  }
  const receiptPath = `${filePath}.full-result`;
  let receiptHandle;
  try {
    receiptHandle = await open(receiptPath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('FULL result already recorded');
    throw error;
  }
  const fullRun = { ...result, reasonCodes: [...result.reasonCodes] };
  await receiptHandle.writeFile(`${JSON.stringify({
    setupId: manifest.setupId,
    version: manifest.version,
    configHash: manifest.configHash,
    runner: manifest.actors.fullRunner,
    ...fullRun,
  }, null, 2)}\n`, 'utf8');
  await receiptHandle.close();
  const recorded: ExperimentManifest = { ...manifest, fullRun };
  await writeManifest(filePath, recorded);
  return recorded;
}

export async function finalizeExperiment(
  filePath: string,
  input: FinalizeExperimentInput,
): Promise<ExperimentManifest> {
  if (input.runKind === 'DIAGNOSTIC') throw new Error('Diagnostic runs cannot terminalize');
  const manifest = await readManifest(filePath);
  if (manifest.state === 'ACCEPTED' || manifest.state === 'REJECTED') {
    throw new Error('Terminal verdict already recorded');
  }
  if (input.runKind === 'ABANDONED' && !['QA_PASS', 'FULL_CLAIMED'].includes(manifest.state)) {
    throw new Error(`Cannot abandon experiment from ${manifest.state}`);
  }
  const auditorId = actor(input.auditor, 'auditor');
  if (!manifest.actors.auditor) throw new Error('A registered QA auditor is required for terminal closure');
  if (manifest.actors.auditor !== auditorId) {
    throw new Error('Terminal auditor must match the QA auditor');
  }
  if (manifest.actors.implementer === auditorId) {
    throw new Error('implementer and auditor must be distinct');
  }
  if (input.runKind !== 'ABANDONED' && manifest.state !== 'FULL_CLAIMED') {
    throw new Error(`Terminal closure requires FULL_CLAIMED, found ${manifest.state}`);
  }
  if (input.runKind !== 'ABANDONED') {
    const receipt = manifest.fullRun;
    if (!receipt) throw new Error('FULL result receipt is required before auditor finalization');
    const sameEvidence = receipt.evidencePath === input.evidencePath;
    const sameReasons = JSON.stringify(receipt.reasonCodes) === JSON.stringify(input.reasonCodes);
    if (receipt.outcome !== input.runKind || receipt.status !== input.status || !sameEvidence || !sameReasons) {
      throw new Error('Auditor finalization must match the recorded FULL result');
    }
  }
  if ((input.runKind === 'FAILURE' || input.runKind === 'ABANDONED') && input.status !== 'REJECTED') {
    throw new Error(`${input.runKind} must close as REJECTED`);
  }
  if (input.runKind === 'FULL' && !input.evidencePath?.trim()) {
    throw new Error('FULL closure requires a terminal evidence path');
  }
  if (input.status === 'ACCEPTED' && input.reasonCodes.length) {
    throw new Error('ACCEPTED must not have rejection reason codes');
  }
  if (input.status === 'REJECTED' && !input.reasonCodes.length) {
    throw new Error('REJECTED requires at least one reason code');
  }

  const terminalPath = `${filePath}.terminal`;
  let terminalHandle;
  try {
    terminalHandle = await open(terminalPath, 'wx');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Terminal verdict already recorded');
    }
    throw error;
  }
  const terminal: NonNullable<ExperimentManifest['terminal']> = {
    status: input.status,
    outcome: input.runKind,
    reasonCodes: [...input.reasonCodes],
    ...(input.evidencePath ? { evidencePath: input.evidencePath } : {}),
  };
  await terminalHandle.writeFile(`${JSON.stringify({
    setupId: manifest.setupId,
    version: manifest.version,
    configHash: manifest.configHash,
    auditor: auditorId,
    ...terminal,
  }, null, 2)}\n`, 'utf8');
  await terminalHandle.close();
  const finalized: ExperimentManifest = {
    ...manifest,
    state: input.status,
    actors: { ...manifest.actors, auditor: auditorId },
    terminal,
  };
  await writeManifest(filePath, finalized);
  return finalized;
}
