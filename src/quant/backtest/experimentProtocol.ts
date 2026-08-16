import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { assessGateFeasibility, gateSpecFromConfig, productClassFromConfig } from './gatePower';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/**
 * QDR-10, widened by QDR-11: terminal labels are class-scoped. ALPHA ends 'ACCEPTED'/'REJECTED'
 * exactly as before; BETA ends 'ACCEPTED_BETA'/'REJECTED_BETA'; DIVERSIFICATION ends
 * 'ACCEPTED_DIVERSIFICATION'/'REJECTED_DIVERSIFICATION'. No class can emit another's labels. Still
 * exactly two terminal outcomes per class — QDR-7's binary finalization rule is preserved verbatim,
 * and its ordered rejection-reason-code list is NOT disturbed.
 */
export const TERMINAL_STATUSES = [
  'ACCEPTED', 'REJECTED',
  'ACCEPTED_BETA', 'REJECTED_BETA',
  'ACCEPTED_DIVERSIFICATION', 'REJECTED_DIVERSIFICATION',
] as const;
export type TerminalStatus = typeof TERMINAL_STATUSES[number];

const isAcceptedStatus = (status: TerminalStatus): boolean => status.startsWith('ACCEPTED');
const isTerminalState = (state: string): boolean => (TERMINAL_STATUSES as readonly string[]).includes(state);
const statusProductClass = (status: TerminalStatus): 'ALPHA' | 'BETA' | 'DIVERSIFICATION' => {
  if (status.endsWith('_DIVERSIFICATION')) return 'DIVERSIFICATION';
  return status.endsWith('_BETA') ? 'BETA' : 'ALPHA';
};

export type ExperimentState =
  | 'DRAFT'
  | 'SEALED'
  | 'CODIFIED'
  | 'QA_PASS'
  | 'FULL_CLAIMED'
  | TerminalStatus;

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
    status: TerminalStatus;
    reasonCodes: ExperimentRejectionReasonCode[];
    evidencePath?: string;
  };
  terminal: null | {
    status: TerminalStatus;
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
  status: TerminalStatus;
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
    && ['DRAFT', 'SEALED', 'CODIFIED', 'QA_PASS', 'FULL_CLAIMED', ...TERMINAL_STATUSES]
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

function isPlainObject(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * QDR-13 (G10): a sealed `validation` block that declares a BETA or DIVERSIFICATION gate — the two
 * classes `runLab.ts` actually reads through `RunLabOptions.gateConfig` at run time — is worthless
 * without a declared way to ever run under it: `assertFrozenCliConfig` (`scripts/backtest.ts`)
 * narrows its CLI-shape comparison to `config.runConfig`, so a gate-bearing manifest with no
 * `runConfig` can never pass it and can never reach `FULL_CLAIMED`. Refused HERE, at the seal, rather
 * than sealed into a manifest that can never terminate — QDR-9's "present-but-incomplete throws,
 * absent seals unchanged" grammar, applied one level up.
 *
 * Scoped to BETA/DIVERSIFICATION only, deliberately: a plain ALPHA DSR gate (`minimumOosDsr` etc,
 * declaring no `productClass`) never reads through `gateConfig` at all — `productClassFromConfig`
 * already resolves it `ALPHA` by the fail-closed default, and `assertFrozenCliConfig` already falls
 * back to the WHOLE sealed config when `runConfig` is absent, which is exactly today's (pre-G10)
 * behavior for a CLI-shaped ALPHA manifest. Demanding a `runConfig` from every DSR-gated ALPHA
 * manifest — including every one already sealed before this record — would be a new, retroactive
 * requirement this record does not make.
 */
export function assertRunConfigPairedWithGate(manifest: ExperimentManifest): void {
  const spec = gateSpecFromConfig(manifest.config);
  if (!spec || (spec.productClass !== 'BETA' && spec.productClass !== 'DIVERSIFICATION')) return;
  const root = isPlainObject(manifest.config) ? manifest.config : null;
  if (!root || !isPlainObject(root.runConfig)) {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: a ${spec.productClass} gate block `
      + '("config.validation") requires a paired config.runConfig (a plain object) — the CLI-shaped echo '
      + '`assertFrozenCliConfig` narrows to — or the seal is refused: a gate block with no declared way to '
      + 'ever run under it is refused at the door, not sealed into a manifest that can never terminate');
  }
  // A PRESENT runConfig is not a RUNNABLE one. `runConfig: {}` is a plain object and used to seal
  // cleanly, yet `stableConfigHash({})` can never equal the hash of any real CLI invocation — the
  // manifest was sealed unrunnable, which is the exact outcome the check above exists to prevent
  // (found at QA review). `setup` is the one field every invocation carries and which must name THIS
  // experiment, so it is checkable at seal without predicting the rest of the command line.
  const declaredSetup = root.runConfig.setup;
  if (typeof declaredSetup !== 'string' || declaredSetup !== manifest.setupId) {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: config.runConfig.setup must be `
      + `"${manifest.setupId}", found ${JSON.stringify(declaredSetup) ?? 'nothing'}. A runConfig that cannot `
      + 'match any real invocation is a gate block with no way to run under it — present, but not paired');
  }
  if (spec.productClass === 'DIVERSIFICATION') {
    const symbols = root.runConfig.symbols;
    if (!Array.isArray(symbols) || symbols.length === 0
      || symbols.some((symbol) => typeof symbol !== 'string' || symbol.trim().length === 0)) {
      throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: a DIVERSIFICATION runConfig `
        + 'requires an explicit non-empty config.runConfig.symbols array of symbol strings. This only '
        + 'proves the runnable universe was pinned; lifecycle eligibility must be evidenced separately');
    }
  }
}

/**
 * QDR-10: the terminal label must match the class sealed into the config. A BETA version can never
 * emit a bare 'ACCEPTED'/'REJECTED', and an ALPHA version can never borrow a BETA label to soften a
 * verdict. Class is read from the sealed config (absent ⇒ ALPHA), so this is hash-anchored.
 */
export function assertStatusMatchesSealedClass(manifest: ExperimentManifest, status: TerminalStatus): void {
  const sealed = productClassFromConfig(manifest.config);
  const labelled = statusProductClass(status);
  if (sealed !== labelled) {
    throw new Error(`${sealed}-class experiment cannot close as ${status}`);
  }
}

/** A prior sealed manifest, as the comparator resolver reports it. */
export interface ResolvedComparator {
  readonly versionId: string;
  /** False for a DRAFT or otherwise never-sealed manifest — which may not anchor a comparison. */
  readonly sealed: boolean;
  readonly config: JsonValue;
}

/** Resolves `comparatorVersionId` against the sealed-manifest inventory; null when none exists. */
export type ComparatorResolver = (versionId: string) => ResolvedComparator | null;

/**
 * Config blocks that MAY differ between the two arms of a DIVERSIFICATION A/B.
 *  - `universe` is THE one variable under test.
 *  - `validation` carries the class-specific gate block, which necessarily differs by class.
 *  - the rest are per-version lifecycle metadata and prose, not mechanism.
 * Everything else — `signal`, `portfolio`, `execution`, `plateau`, `seed` — must be byte-identical,
 * because a second changed variable turns an isolated A/B into an uncontrolled comparison.
 */
const DIVERSIFICATION_AB_VARIABLE_BLOCKS = new Set([
  'universe', 'validation', 'hypothesis', 'evidenceBoundary', 'historicalMode',
  'terminalEligible', 'setup', 'performanceInspection',
  // QDR-13 (G10): per-version operational metadata, not mechanism — same reasoning as `setup`/
  // `evidenceBoundary` above. A historical anchor reconstruction (QDR-12) was never authored with a
  // `runConfig` field at all; without this exclusion the diff would wrongly refuse every
  // DIVERSIFICATION seal against an anchor as "differing in more than the universe block".
  'runConfig',
]);

/**
 * QDR-11 A/B isolation, as a seal-time REFUSAL rather than a review note: exactly one variable,
 * against a NAMED prior SEALED version. A novel strategy therefore cannot enter as DIVERSIFICATION,
 * and a comparator cannot be a strawman constructed for the occasion.
 *
 * Fail-closed on the resolver itself: a caller that forgets to wire one cannot seal a
 * DIVERSIFICATION lane, because "no resolver" is indistinguishable from "no comparator exists".
 */
export function assertDiversificationComparator(
  manifest: ExperimentManifest,
  resolveComparator?: ComparatorResolver,
): void {
  if (productClassFromConfig(manifest.config) !== 'DIVERSIFICATION') return;
  // `gateSpecFromConfig` throws by itself on an incomplete block (`productClass` is a GATE_KEY, so
  // declaring the class IS declaring a gate), naming the missing field. This guard therefore only
  // fires if it and `productClassFromConfig` ever disagree about the class — a gatePower bug, not a
  // manifest one. Kept deliberately: the two must not be able to drift apart silently.
  const spec = gateSpecFromConfig(manifest.config);
  if (spec?.productClass !== 'DIVERSIFICATION') {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: productClass resolved `
      + 'DIVERSIFICATION but the gate block did not — gatePower disagrees with itself');
  }
  if (!resolveComparator) {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: a DIVERSIFICATION seal must `
      + `resolve comparatorVersionId "${spec.comparatorVersionId}" against the sealed-manifest inventory, `
      + 'and no resolver was supplied. Sealing without one would let a comparative claim name a '
      + 'comparator that does not exist');
  }
  const comparator = resolveComparator(spec.comparatorVersionId);
  if (!comparator || !comparator.sealed) {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: comparatorVersionId `
      + `"${spec.comparatorVersionId}" resolves to no SEALED manifest. QDR-11 requires the comparator to `
      + 'be a real prior sealed version, never a strawman constructed for the occasion. If the incumbent '
      + 'was never preregistered under this protocol, the comparator definition needs its own design '
      + 'record before any such seal — see QDR-11 Revisit-when');
  }

  const mine = manifest.config as Record<string, JsonValue> | null;
  const theirs = comparator.config as Record<string, JsonValue> | null;
  if (!mine || typeof mine !== 'object' || !theirs || typeof theirs !== 'object') {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: both arms need object configs to diff`);
  }
  const differing = Array.from(new Set([...Object.keys(mine), ...Object.keys(theirs)]))
    .filter((key) => !DIVERSIFICATION_AB_VARIABLE_BLOCKS.has(key))
    // The same canonicalizer `stableConfigHash` uses, so "identical" means identical in exactly the
    // sense the hash means it — key order and formatting cannot make two arms look different.
    .filter((key) => canonicalJson(mine[key] ?? null) !== canonicalJson(theirs[key] ?? null));
  if (differing.length > 0) {
    throw new Error(`Cannot seal ${manifest.setupId}@${manifest.version}: the two arms differ in more than `
      + `the universe block — ${differing.join(', ')}. An isolated A/B permits exactly one variable; a `
      + 'second one makes the measured difference unattributable to the universe rule');
  }
}

export function sealExperiment(
  manifest: ExperimentManifest,
  options?: { readonly resolveComparator?: ComparatorResolver },
): ExperimentManifest {
  assertState(manifest, 'DRAFT');
  assertGateFeasibleAtSeal(manifest);
  assertRunConfigPairedWithGate(manifest);
  assertDiversificationComparator(manifest, options?.resolveComparator);
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
    if (manifest.state === 'FULL_CLAIMED' || isTerminalState(manifest.state)) {
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
  if (result.outcome === 'FAILURE' && isAcceptedStatus(result.status)) {
    throw new Error('Failed FULL result must be REJECTED');
  }
  assertStatusMatchesSealedClass(manifest, result.status);
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
  if (isTerminalState(manifest.state)) {
    throw new Error('Terminal verdict already recorded');
  }
  assertStatusMatchesSealedClass(manifest, input.status);
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
  if ((input.runKind === 'FAILURE' || input.runKind === 'ABANDONED') && isAcceptedStatus(input.status)) {
    throw new Error(`${input.runKind} must close as REJECTED`);
  }
  if (input.runKind === 'FULL' && !input.evidencePath?.trim()) {
    throw new Error('FULL closure requires a terminal evidence path');
  }
  if (isAcceptedStatus(input.status) && input.reasonCodes.length) {
    throw new Error('ACCEPTED must not have rejection reason codes');
  }
  if (!isAcceptedStatus(input.status) && !input.reasonCodes.length) {
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
