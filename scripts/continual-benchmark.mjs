#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCheckpoint } from './continual-harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_MANIFEST = join(ROOT, '.agents', 'continual', 'benchmarks', 'manifest.json');
const DEFAULT_LEDGER = join(ROOT, '.agents', 'continual', 'events.jsonl');
const DEFAULT_CHECKPOINT = join(ROOT, '.agents', 'continual', 'head.json');
const EVALUATOR_PATH = 'scripts/continual-benchmark.mjs';
const PINNED_SUITE_HASH = 'c9ba9d1cacdd37379dc7588d7f673ad8834cefb9ec330637d09a1d57e115b502';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const FAILURE_CODES = [
  'NONE',
  'DISPATCH_ERROR',
  'TIMEOUT',
  'NO_ARTIFACT',
  'SCOPE_VIOLATION',
  'ACCEPTANCE_FAIL',
  'SAFETY_FAIL',
  'EVIDENCE_INVALID',
];
const PROHIBITED_FIELDS = new Set([
  'prompt',
  'response',
  'rawcommandoutput',
  'transcript',
  'hiddenchainofthought',
  'credentials',
  'userdata',
  'productdata',
]);
const RESOLVED_COMMITS = new Set();

export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('Value contains a non-canonical JSON value');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function commandDigest(command) {
  if (typeof command !== 'string' || command.trim() === '') throw new Error('Command must be a non-empty string');
  return sha256(command);
}

export function hashCase(benchmarkCase) {
  assertObject(benchmarkCase, 'Benchmark case');
  const { caseHash: _caseHash, ...content } = benchmarkCase;
  return sha256(canonicalize(content));
}

export function hashSuite(cases) {
  if (!Array.isArray(cases)) throw new Error('Cases must be an array');
  const rows = cases.map((benchmarkCase) => {
    assertObject(benchmarkCase, 'Benchmark case');
    return `${benchmarkCase.caseId}@${benchmarkCase.caseVersion}:${benchmarkCase.caseHash}`;
  }).sort();
  return sha256(rows.join('\n'));
}

export function scoreEpisode(rubric, passedRubricIds) {
  if (!Array.isArray(rubric) || rubric.length === 0) throw new Error('Rubric must be a non-empty array');
  if (!Array.isArray(passedRubricIds)) throw new Error('passedRubricIds must be an array');
  const weights = new Map();
  for (const item of rubric) {
    assertObject(item, 'Rubric item');
    assertExactFields(item, ['rubricId', 'description', 'weight'], 'Rubric item');
    assertIdentifier(item.rubricId, 'rubricId');
    assertString(item.description, 'rubric description');
    if (!Number.isFinite(item.weight) || item.weight <= 0) throw new Error('Rubric weight must be positive');
    if (weights.has(item.rubricId)) throw new Error(`Duplicate rubricId: ${item.rubricId}`);
    weights.set(item.rubricId, item.weight);
  }
  if (new Set(passedRubricIds).size !== passedRubricIds.length) throw new Error('passedRubricIds must not contain duplicates');
  let passedWeight = 0;
  for (const rubricId of passedRubricIds) {
    if (!weights.has(rubricId)) throw new Error(`Unknown passed rubricId: ${rubricId}`);
    passedWeight += weights.get(rubricId);
  }
  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  return (100 * passedWeight) / totalWeight;
}

export function scorecardSubjectHash(scorecard) {
  assertObject(scorecard, 'Scorecard');
  const { reviewedBy: _reviewedBy, reviewArtifact: _reviewArtifact, ...subject } = scorecard;
  return sha256(canonicalize(subject));
}

export function verifyReviewArtifact(scorecard, artifactBytes) {
  if (typeof artifactBytes !== 'string' && !Buffer.isBuffer(artifactBytes)) {
    throw new Error('Review artifact bytes must be a string or Buffer');
  }
  const text = Buffer.isBuffer(artifactBytes) ? artifactBytes.toString('utf8') : artifactBytes;
  let artifact;
  try { artifact = JSON.parse(text); }
  catch { throw new Error('Review artifact must contain valid canonical JSON'); }
  assertObject(artifact, 'Review artifact');
  assertExactFields(
    artifact,
    ['schemaVersion', 'runId', 'scorecardSubjectHash', 'verdict', 'reviewedBy'],
    'Review artifact',
  );
  if (canonicalize(artifact) !== text) throw new Error('Review artifact bytes must be canonical JSON');
  if (artifact.schemaVersion !== 1) throw new Error('Review artifact schemaVersion must be 1');
  if (artifact.runId !== scorecard.runId) throw new Error('Review artifact runId does not match the scorecard');
  assertHash(artifact.scorecardSubjectHash, 'Review artifact subject hash');
  if (artifact.scorecardSubjectHash !== scorecardSubjectHash(scorecard)) {
    throw new Error('Review artifact subject hash does not match the scorecard');
  }
  if (artifact.verdict !== 'PASS') throw new Error('Review artifact verdict must be PASS');
  if (artifact.reviewedBy !== scorecard.reviewedBy) throw new Error('Review artifact reviewer does not match the scorecard');
  assertIdentifier(artifact.reviewedBy, 'Review artifact reviewer');
  return true;
}

function assertObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${field} must be an object`);
}

function assertExactFields(value, expected, field) {
  const actual = Object.keys(value);
  const missing = expected.filter((key) => !actual.includes(key));
  const unknown = actual.filter((key) => !expected.includes(key));
  if (missing.length || unknown.length) {
    throw new Error(`${field} fields are invalid; missing: ${missing.join(', ') || 'none'}; unknown: ${unknown.join(', ') || 'none'}`);
  }
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} must be a non-empty string`);
}

function assertIdentifier(value, field) {
  assertString(value, field);
  if (!ID_PATTERN.test(value)) throw new Error(`${field} must be a one-line identifier without control characters`);
}

function assertStringArray(value, field, { nonEmpty = true } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)
    || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${field} must be ${nonEmpty ? 'a non-empty ' : 'an '}array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${field} must not contain duplicates`);
}

function assertHash(value, field) {
  if (!HASH_PATTERN.test(value ?? '')) throw new Error(`${field} must be a SHA-256 digest`);
}

function assertCommit(value, field) {
  if (!COMMIT_PATTERN.test(value ?? '')) throw new Error(`${field} must be a full 40-character commit SHA`);
  if (RESOLVED_COMMITS.has(value)) return;
  try {
    execFileSync('git', ['cat-file', '-e', `${value}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
  } catch {
    throw new Error(`${field} does not resolve to a local commit: ${value}`);
  }
  RESOLVED_COMMITS.add(value);
}

function readGitBlob(commit, path, field) {
  try {
    const object = `${commit}:${path}`;
    const type = execFileSync('git', ['cat-file', '-t', object], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (type !== 'blob') throw new Error('not a blob');
    return execFileSync('git', ['show', object], { cwd: ROOT });
  } catch {
    throw new Error(`${field} path does not resolve to a Git blob`);
  }
}

function assertRelativeFile(value, field) {
  assertString(value, field);
  if (isAbsolute(value) || /^[A-Za-z]:\//.test(value) || value.includes('\\') || value.split('/').includes('..')) {
    throw new Error(`${field} must be a normalized relative path`);
  }
  if (posix.normalize(value).replace(/^\.\//, '') !== value) throw new Error(`${field} must be a normalized relative path`);
}

function assertCase(benchmarkCase) {
  assertObject(benchmarkCase, 'Benchmark case');
  assertExactFields(benchmarkCase, [
    'caseId', 'caseVersion', 'role', 'task', 'primaryPath', 'taskTags', 'startCommit',
    'acceptanceCommands', 'rubric', 'safetyCommands', 'caseHash',
  ], 'Benchmark case');
  assertIdentifier(benchmarkCase.caseId, 'caseId');
  if (!Number.isInteger(benchmarkCase.caseVersion) || benchmarkCase.caseVersion <= 0) {
    throw new Error('caseVersion must be a positive integer');
  }
  assertIdentifier(benchmarkCase.role, 'role');
  assertString(benchmarkCase.task, 'task');
  assertRelativeFile(benchmarkCase.primaryPath, 'primaryPath');
  assertStringArray(benchmarkCase.taskTags, 'taskTags');
  for (const taskTag of benchmarkCase.taskTags) assertIdentifier(taskTag, 'taskTag');
  assertCommit(benchmarkCase.startCommit, 'startCommit');
  assertStringArray(benchmarkCase.acceptanceCommands, 'acceptanceCommands');
  assertStringArray(benchmarkCase.safetyCommands, 'safetyCommands');
  scoreEpisode(benchmarkCase.rubric, []);
  assertHash(benchmarkCase.caseHash, 'caseHash');
  if (hashCase(benchmarkCase) !== benchmarkCase.caseHash) throw new Error(`caseHash mismatch for ${benchmarkCase.caseId}`);
}

function assertManifestShape(manifest) {
  assertObject(manifest, 'Manifest');
  assertExactFields(manifest, [
    'schemaVersion', 'episodesPerArm', 'candidateThreshold', 'failureCodes', 'caseFiles', 'suiteHash',
  ], 'Manifest');
  if (manifest.schemaVersion !== 1) throw new Error('Manifest schemaVersion must be 1');
  if (manifest.episodesPerArm !== 3) throw new Error('Manifest episodesPerArm must be 3');
  if (manifest.candidateThreshold !== 10) throw new Error('Manifest candidateThreshold must be 10');
  if (canonicalize(manifest.failureCodes) !== canonicalize(FAILURE_CODES)) {
    throw new Error('Manifest failure code taxonomy is invalid');
  }
  assertStringArray(manifest.caseFiles, 'caseFiles');
  for (const caseFile of manifest.caseFiles) assertRelativeFile(caseFile, 'caseFiles entry');
  assertHash(manifest.suiteHash, 'suiteHash');
}

export function verifyManifest(manifest, cases) {
  assertManifestShape(manifest);
  if (!Array.isArray(cases) || cases.length !== 2 || manifest.caseFiles.length !== 2 || cases.length !== manifest.caseFiles.length) {
    throw new Error('Frozen manifest must contain exactly two benchmark cases');
  }
  const identities = new Set();
  for (const benchmarkCase of cases) {
    assertCase(benchmarkCase);
    const identity = `${benchmarkCase.caseId}@${benchmarkCase.caseVersion}`;
    if (identities.has(identity)) throw new Error(`Duplicate benchmark case: ${identity}`);
    identities.add(identity);
  }
  if (hashSuite(cases) !== manifest.suiteHash) throw new Error('suiteHash does not match the frozen cases');
  if (manifest.suiteHash !== PINNED_SUITE_HASH) throw new Error('suiteHash does not match the evaluator-pinned frozen suite');
  return true;
}

function assertNoProhibitedFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (PROHIBITED_FIELDS.has(normalized)) throw new Error(`Prohibited raw field stored in scorecard: ${key}`);
    assertNoProhibitedFields(nested);
  }
}

function assertCommandResults(results, commands, field) {
  if (!Array.isArray(results) || results.length !== commands.length) {
    throw new Error(`${field} command results do not match the benchmark case`);
  }
  results.forEach((result, index) => {
    assertObject(result, `${field} command result`);
    assertExactFields(result, ['command', 'commandDigest', 'exitStatus', 'outputDigest'], `${field} command result`);
    if (result.command !== commands[index]) throw new Error(`${field} command does not match the benchmark case`);
    if (result.commandDigest !== commandDigest(result.command)) throw new Error(`${field} command digest is invalid`);
    if (!Number.isInteger(result.exitStatus) || result.exitStatus < 0) throw new Error(`${field} exitStatus must be a non-negative integer`);
    assertHash(result.outputDigest, `${field} output digest`);
  });
}

function assertDispatch(dispatch, scorecard, benchmarkCase, arm) {
  assertObject(dispatch, 'Episode dispatch');
  assertExactFields(dispatch, ['runner', 'model', 'effort', 'task', 'environment', 'projectionHash'], 'Episode dispatch');
  for (const field of ['runner', 'model', 'effort', 'task']) assertString(dispatch[field], `dispatch.${field}`);
  assertObject(dispatch.environment, 'dispatch.environment');
  assertExactFields(dispatch.environment, ['apiKeys', 'locale'], 'dispatch.environment');
  assertString(dispatch.environment.apiKeys, 'dispatch.environment.apiKeys');
  assertString(dispatch.environment.locale, 'dispatch.environment.locale');
  if (dispatch.runner !== scorecard.runner) throw new Error('Episode dispatch runner must be identical');
  if (dispatch.model !== scorecard.model) throw new Error('Episode dispatch model must be identical');
  if (dispatch.effort !== scorecard.effort) throw new Error('Episode dispatch effort must be identical');
  if (dispatch.task !== benchmarkCase.task) throw new Error('Episode dispatch task must be identical to the benchmark case');
  const expectedProjection = arm === 'baseline'
    ? scorecard.baselineProjectionHash
    : scorecard.candidateProjectionHash;
  if (dispatch.projectionHash !== expectedProjection) throw new Error(`Episode projection does not match the ${arm} arm`);
}

function assertEpisode(episode, scorecard, benchmarkCase) {
  assertObject(episode, 'Episode');
  assertExactFields(episode, [
    'caseId', 'caseVersion', 'caseHash', 'arm', 'index', 'startCommit', 'endCommit', 'patchHash',
    'dispatch', 'acceptanceCommands', 'safetyCommands', 'passedRubricIds', 'score', 'failureCode',
  ], 'Episode');
  if (episode.caseVersion !== benchmarkCase.caseVersion || episode.caseHash !== benchmarkCase.caseHash) {
    throw new Error('Episode case identity/hash does not match the frozen case');
  }
  if (!['baseline', 'candidate'].includes(episode.arm)) throw new Error('Episode arm is invalid');
  if (!Number.isInteger(episode.index) || episode.index <= 0) throw new Error('Episode index must be a positive integer');
  if (episode.startCommit !== benchmarkCase.startCommit) throw new Error('Episode start commit does not match the benchmark case');
  assertCommit(episode.endCommit, 'Episode endCommit');
  assertHash(episode.patchHash, 'Episode patchHash');
  assertDispatch(episode.dispatch, scorecard, benchmarkCase, episode.arm);
  assertCommandResults(episode.acceptanceCommands, benchmarkCase.acceptanceCommands, 'Acceptance');
  assertCommandResults(episode.safetyCommands, benchmarkCase.safetyCommands, 'Safety');
  const computedScore = scoreEpisode(benchmarkCase.rubric, episode.passedRubricIds);
  if (!numbersEqual(episode.score, computedScore)) throw new Error('Episode score does not match its passed rubric weights');
  if (!FAILURE_CODES.includes(episode.failureCode)) throw new Error('Episode failure code is outside the closed taxonomy');
}

function numbersEqual(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) < 1e-9;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function assertComparison(comparison, scorecard, manifest, cases, episodes) {
  assertObject(comparison, 'Comparison');
  assertExactFields(comparison, [
    'baselineMean', 'candidateMean', 'delta', 'perCaseMeans', 'threshold', 'safetyVeto', 'result',
  ], 'Comparison');
  assertObject(comparison.perCaseMeans, 'comparison.perCaseMeans');
  const expectedCaseIds = cases.map(({ caseId }) => caseId).sort();
  if (canonicalize(Object.keys(comparison.perCaseMeans).sort()) !== canonicalize(expectedCaseIds)) {
    throw new Error('Comparison per-case means do not match the frozen cases');
  }

  const baselineMean = mean(episodes.filter(({ arm }) => arm === 'baseline').map(({ score }) => score));
  const candidateMean = mean(episodes.filter(({ arm }) => arm === 'candidate').map(({ score }) => score));
  if (!numbersEqual(comparison.baselineMean, baselineMean)
    || !numbersEqual(comparison.candidateMean, candidateMean)
    || !numbersEqual(comparison.delta, candidateMean - baselineMean)) {
    throw new Error('Comparison mean arithmetic is invalid');
  }
  if (comparison.threshold !== manifest.candidateThreshold) throw new Error('Comparison threshold does not match the manifest');

  let perCaseRegression = false;
  for (const benchmarkCase of cases) {
    const item = comparison.perCaseMeans[benchmarkCase.caseId];
    assertObject(item, `Per-case mean ${benchmarkCase.caseId}`);
    assertExactFields(item, ['baseline', 'candidate'], `Per-case mean ${benchmarkCase.caseId}`);
    const baseline = mean(episodes.filter(({ caseId, arm }) => (
      caseId === benchmarkCase.caseId && arm === 'baseline'
    )).map(({ score }) => score));
    const candidate = mean(episodes.filter(({ caseId, arm }) => (
      caseId === benchmarkCase.caseId && arm === 'candidate'
    )).map(({ score }) => score));
    if (!numbersEqual(item.baseline, baseline) || !numbersEqual(item.candidate, candidate)) {
      throw new Error('Comparison per-case mean arithmetic is invalid');
    }
    if (candidate < baseline) perCaseRegression = true;
  }

  const safetyVeto = episodes.some(({ safetyCommands }) => (
    safetyCommands.some(({ exitStatus }) => exitStatus !== 0)
  ));
  if (comparison.safetyVeto !== safetyVeto) throw new Error('Comparison safety veto arithmetic is invalid');
  const hasFailure = episodes.some(({ failureCode }) => failureCode !== 'NONE');
  const acceptanceFailure = episodes.some(({ acceptanceCommands }) => (
    acceptanceCommands.some(({ exitStatus }) => exitStatus !== 0)
  ));
  const thresholdPassed = candidateMean - baselineMean >= manifest.candidateThreshold;
  const shouldPass = thresholdPassed && !perCaseRegression && !safetyVeto && !hasFailure && !acceptanceFailure;
  if (!['PASS', 'FAIL'].includes(comparison.result)) throw new Error('Comparison result must be PASS or FAIL');
  if (comparison.result !== (shouldPass ? 'PASS' : 'FAIL')) {
    if (safetyVeto) throw new Error('Safety veto prevents a PASS result');
    if (hasFailure) throw new Error('An episode failure prevents a PASS result');
    if (perCaseRegression) throw new Error('A per-case regression prevents a PASS result');
    if (!thresholdPassed) throw new Error(`Candidate delta does not meet the ${manifest.candidateThreshold}-point threshold`);
    throw new Error('Acceptance failure prevents a PASS result');
  }
}

export function verifyScorecard(scorecard, manifest, cases, context) {
  verifyManifest(manifest, cases);
  assertNoProhibitedFields(scorecard);
  assertObject(scorecard, 'Scorecard');
  assertExactFields(scorecard, [
    'schemaVersion', 'runId', 'createdAt', 'evaluatorCommit', 'suiteHash', 'proposal',
    'baselineProjectionHash', 'candidateProjectionHash', 'runner', 'model', 'effort', 'generatedBy',
    'episodes', 'comparison', 'reviewedBy', 'reviewArtifact',
  ], 'Scorecard');
  if (scorecard.schemaVersion !== 1) throw new Error('Scorecard schemaVersion must be 1');
  for (const field of ['runId', 'runner', 'model', 'effort', 'generatedBy', 'reviewedBy']) {
    assertIdentifier(scorecard[field], field);
  }
  assertString(scorecard.createdAt, 'createdAt');
  if (new Date(scorecard.createdAt).toISOString() !== scorecard.createdAt) throw new Error('createdAt must be an ISO timestamp');
  assertCommit(scorecard.evaluatorCommit, 'evaluatorCommit');
  const committedEvaluator = readGitBlob(scorecard.evaluatorCommit, EVALUATOR_PATH, 'Evaluator source');
  const currentEvaluator = readFileSync(fileURLToPath(import.meta.url));
  if (!committedEvaluator.equals(currentEvaluator)) {
    throw new Error('Evaluator commit source blob is not byte-identical to the current verifier');
  }
  if (scorecard.suiteHash !== manifest.suiteHash) throw new Error('Scorecard suiteHash does not match the manifest');
  assertObject(scorecard.proposal, 'Proposal');
  assertExactFields(scorecard.proposal, ['proposalHash', 'lessonId', 'lessonVersion'], 'Proposal');
  assertHash(scorecard.proposal.proposalHash, 'proposalHash');
  assertIdentifier(scorecard.proposal.lessonId, 'lessonId');
  if (!Number.isInteger(scorecard.proposal.lessonVersion) || scorecard.proposal.lessonVersion <= 0) {
    throw new Error('lessonVersion must be a positive integer');
  }
  assertObject(context, 'Verification context');
  assertExactFields(context, ['ledger', 'checkpoint'], 'Verification context');
  verifyCheckpoint(context.ledger, context.checkpoint);
  const proposalMatches = context.ledger.filter((event) => (
    event.action === 'PROPOSE'
      && event.eventHash === scorecard.proposal.proposalHash
      && event.lessonId === scorecard.proposal.lessonId
      && event.lessonVersion === scorecard.proposal.lessonVersion
  ));
  if (proposalMatches.length !== 1) {
    throw new Error('Scorecard proposal must match one exact verified PROPOSE ledger event');
  }
  assertHash(scorecard.baselineProjectionHash, 'baselineProjectionHash');
  assertHash(scorecard.candidateProjectionHash, 'candidateProjectionHash');
  if (scorecard.baselineProjectionHash === scorecard.candidateProjectionHash) {
    throw new Error('Baseline and candidate projection hashes must differ');
  }
  if (scorecard.generatedBy.toLowerCase() === scorecard.reviewedBy.toLowerCase()) {
    throw new Error('Generator and reviewer identities must be distinct case-insensitively');
  }
  assertObject(scorecard.reviewArtifact, 'reviewArtifact');
  assertExactFields(scorecard.reviewArtifact, ['path', 'digest', 'commit'], 'reviewArtifact');
  assertRelativeFile(scorecard.reviewArtifact.path, 'reviewArtifact path');
  assertHash(scorecard.reviewArtifact.digest, 'reviewArtifact digest');
  assertCommit(scorecard.reviewArtifact.commit, 'reviewArtifact commit');
  const reviewBytes = readGitBlob(
    scorecard.reviewArtifact.commit,
    scorecard.reviewArtifact.path,
    'reviewArtifact',
  );
  if (sha256(reviewBytes) !== scorecard.reviewArtifact.digest) {
    throw new Error('reviewArtifact digest does not match its Git blob');
  }

  if (!Array.isArray(scorecard.episodes)) throw new Error('Scorecard episodes must be an array');
  const caseById = new Map(cases.map((benchmarkCase) => [benchmarkCase.caseId, benchmarkCase]));
  const identities = new Set();
  for (const episode of scorecard.episodes) {
    const benchmarkCase = caseById.get(episode?.caseId);
    if (!benchmarkCase) throw new Error('Episode references an unknown benchmark case');
    assertEpisode(episode, scorecard, benchmarkCase);
    const identity = `${episode.caseId}:${episode.arm}:${episode.index}`;
    if (identities.has(identity)) throw new Error(`Duplicate episode pair identity: ${identity}`);
    identities.add(identity);
  }
  const expectedEpisodes = cases.length * 2 * manifest.episodesPerArm;
  if (scorecard.episodes.length !== expectedEpisodes) throw new Error('Scorecard episode arms are not equally paired');
  for (const benchmarkCase of cases) {
    for (const arm of ['baseline', 'candidate']) {
      for (let index = 1; index <= manifest.episodesPerArm; index += 1) {
        if (!identities.has(`${benchmarkCase.caseId}:${arm}:${index}`)) {
          throw new Error('Scorecard is missing an episode pair/arm/index');
        }
      }
    }
  }
  const environment = canonicalize(scorecard.episodes[0]?.dispatch.environment);
  if (scorecard.episodes.some((episode) => canonicalize(episode.dispatch.environment) !== environment)) {
    throw new Error('Episode dispatch environment must be identical');
  }
  assertComparison(scorecard.comparison, scorecard, manifest, cases, scorecard.episodes);
  verifyReviewArtifact(scorecard, reviewBytes);
  return true;
}

function readJson(path, field) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Invalid or missing ${field}: ${path}`);
  }
}

function readBenchmark(manifestPath) {
  const manifest = readJson(manifestPath, 'manifest');
  assertManifestShape(manifest);
  const cases = manifest.caseFiles.map((caseFile) => readJson(join(dirname(manifestPath), caseFile), 'benchmark case'));
  verifyManifest(manifest, cases);
  return { manifest, cases };
}

function readVerificationContext() {
  let ledger;
  try {
    ledger = readFileSync(DEFAULT_LEDGER, 'utf8').split(/\r?\n/).flatMap((line, index) => {
      if (line.trim() === '') return [];
      try { return [JSON.parse(line)]; }
      catch { throw new Error(`Invalid JSON at ledger line ${index + 1}`); }
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Invalid JSON at ledger line')) throw error;
    throw new Error(`Invalid or missing ledger: ${DEFAULT_LEDGER}`);
  }
  const checkpoint = readJson(DEFAULT_CHECKPOINT, 'checkpoint');
  verifyCheckpoint(ledger, checkpoint);
  return { ledger, checkpoint };
}

function manifestOption(args) {
  if (args.length === 0) return DEFAULT_MANIFEST;
  if (args.length !== 2 || args[0] !== '--manifest') throw new Error(`Unexpected arguments: ${args.join(' ')}`);
  return resolve(args[1]);
}

function main(args) {
  const [command, ...rest] = args;
  if (command === 'verify') {
    const { manifest, cases } = readBenchmark(manifestOption(rest));
    readVerificationContext();
    for (const benchmarkCase of cases) console.log(`${benchmarkCase.caseId} ${benchmarkCase.caseHash}`);
    console.log(`suite ${manifest.suiteHash}`);
    return;
  }
  if (command === 'verify-scorecard') {
    if (!rest[0] || rest[0].startsWith('--')) throw new Error('verify-scorecard requires a scorecard path');
    const scorecardPath = resolve(rest[0]);
    const { manifest, cases } = readBenchmark(manifestOption(rest.slice(1)));
    const scorecard = readJson(scorecardPath, 'scorecard');
    verifyScorecard(scorecard, manifest, cases, readVerificationContext());
    console.log(`scorecard ${sha256(canonicalize(scorecard))}`);
    return;
  }
  throw new Error('Usage: continual-benchmark.mjs verify [--manifest PATH] | verify-scorecard SCORECARD [--manifest PATH]');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
