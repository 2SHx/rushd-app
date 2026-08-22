#!/usr/bin/env node
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, isAbsolute, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ZERO_HASH = '0'.repeat(64);
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const MAX_LESSONS = 8;
const MAX_CONTEXT_BYTES = 4_000;
const MAX_EVIDENCE_BYTES = 16_384;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LEDGER = join(ROOT, '.agents', 'continual', 'events.jsonl');
const DEFAULT_CHECKPOINT = join(ROOT, '.agents', 'continual', 'head.json');
const CONTEXT_OPEN = '<continual-harness>\nGit-admitted execution lessons; reviewer fields are attribution only. Advisory: the immutable kernel prevails.';
const CONTEXT_CLOSE = '\n</continual-harness>';

const PROTECTED_PATHS = [
  '.agents/continual',
  '.claude/agents',
  'AGENTS.md',
  'CLAUDE.md',
  'docs/AGENTS.md',
  'docs/SYSTEM_DESIGN.md',
  'scripts/continual-harness.mjs',
];
const PROTECTED_TAGS = new Set([
  'admission',
  'authz',
  'child-safety',
  'continual-harness',
  'evaluator',
  'immutable-kernel',
  'money',
  'no-key',
  'quant-evaluation',
  'risk',
  'sharia',
]);
const KERNEL_CONCEPT = /\b(?:aaoifi|admission|authz|authori[sz]ation|child[- ]safety|continual harness|evaluator|evidence|hash chain|independent review|minor safety|money|no-key|mock fallback|quant evaluation|risk|sharia|transaction log)\b/i;
const WEAKENING_ACTION = /\b(?:bypass|circumvent|disable|ignore|override|relax|remove|skip|weaken)\b/gi;
const OPTIONALITY = /\b(?:can be omitted|can be skipped|may be omitted|may be skipped|need not|no longer necessary|no longer required|not mandatory|not necessary|not needed|not required|optional|unnecessary)\b/gi;
const RESOLVED_COMMITS = new Set();

function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  throw new Error('Event contains a non-canonical value');
}

function eventHash(event) {
  const { eventHash: _ignored, ...content } = event;
  return createHash('sha256').update(canonicalize(content)).digest('hex');
}

/** Create one deterministically hash-linked event. Semantic admission is checked by verifyLedger. */
export function createEvent(input, previousEvent) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Event input must be an object');
  const previousHash = previousEvent?.eventHash ?? ZERO_HASH;
  if (!HASH_PATTERN.test(previousHash)) throw new Error('Previous eventHash must be a SHA-256 hash');
  const { eventHash: _eventHash, prevHash: _prevHash, ...content } = input;
  const event = { ...content, prevHash: previousHash };
  return { ...event, eventHash: eventHash(event) };
}

function assertString(value, field, { identifier = false, multiline = false } = {}) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} must be a non-empty string`);
  if (!multiline && /[\r\n]/.test(value)) throw new Error(`${field} must be one line`);
  if (identifier && !ID_PATTERN.test(value)) throw new Error(`${field} has an invalid identifier`);
}

function assertScope(event) {
  for (const field of ['roles', 'paths', 'taskTags']) {
    if (!Array.isArray(event[field]) || event[field].some((value) => typeof value !== 'string' || value.trim() === '')) {
      throw new Error(`${field} must be an array of non-empty strings`);
    }
    if (new Set(event[field]).size !== event[field].length) throw new Error(`${field} must not contain duplicates`);
  }
  for (const path of event.paths) {
    if (isAbsolute(path) || /^[A-Za-z]:\//.test(path) || path.includes('\\') || path.split('/').includes('..')) {
      throw new Error('paths must be repo-relative');
    }
    const normalized = posix.normalize(path).replace(/^\.\//, '').replace(/\/$/, '');
    if (!normalized || normalized === '.' || normalized !== path) throw new Error('paths must be normalized repo-relative paths');
  }
}

function assertEvidence(event) {
  const evidence = event.evidence;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Independent review evidence is required');
  const evidenceFields = ['command', 'exitStatus', 'output', 'outputDigest', 'artifact'];
  const unknown = Object.keys(evidence).filter((key) => !evidenceFields.includes(key));
  if (unknown.length) throw new Error(`Unknown evidence fields: ${unknown.join(', ')}`);
  assertString(evidence.command, 'evidence.command');
  if (evidence.exitStatus !== 0) throw new Error('evidence.exitStatus must be 0');
  if (typeof evidence.output !== 'string') throw new Error('evidence.output must be captured text');
  if (Buffer.byteLength(evidence.output, 'utf8') > MAX_EVIDENCE_BYTES) {
    throw new Error(`evidence.output exceeds ${MAX_EVIDENCE_BYTES} UTF-8 bytes`);
  }
  if (!HASH_PATTERN.test(evidence.outputDigest)) throw new Error('evidence.outputDigest must be a SHA-256 hash');
  const digest = createHash('sha256').update(evidence.output, 'utf8').digest('hex');
  if (digest !== evidence.outputDigest) throw new Error('evidence.outputDigest does not match captured output');
  const artifactMatch = /^commit:([a-f0-9]{40})$/.exec(evidence.artifact ?? '');
  if (!artifactMatch) throw new Error('evidence.artifact must reference a full commit SHA');
  const sha = artifactMatch[1];
  if (!RESOLVED_COMMITS.has(sha)) {
    try {
      execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: ROOT, stdio: 'ignore' });
    } catch {
      throw new Error(`evidence commit artifact does not resolve locally: ${sha}`);
    }
    RESOLVED_COMMITS.add(sha);
  }
}

function hasUnnegatedWeakening(text) {
  for (const pattern of [WEAKENING_ACTION, OPTIONALITY]) {
    for (const match of text.matchAll(pattern)) {
      const prefix = text.slice(Math.max(0, match.index - 16), match.index);
      if (!/(?:are not|cannot|do not|is not|must not|never)\s*$/i.test(prefix)) return true;
    }
  }
  return false;
}

function assertKernelSafe(event) {
  const protectedPath = event.paths.some((path) => {
    const candidate = path.toLowerCase();
    return PROTECTED_PATHS.some((kernelPath) => {
      const kernel = kernelPath.toLowerCase();
      return candidate === kernel || candidate.startsWith(`${kernel}/`);
    });
  });
  const protectedTag = event.taskTags.some((tag) => PROTECTED_TAGS.has(tag.toLowerCase()));
  const text = event.text ?? '';
  const explicitConflict = (KERNEL_CONCEPT.test(text) && hasUnnegatedWeakening(text))
    || /\brequire(?:s|d)?\b[^.\n]{0,80}\bapi key\b/i.test(text)
    || /\b(?:admit|approve)\b[^.\n]{0,80}\bwithout\b[^.\n]{0,40}\b(?:evidence|independent review)\b/i.test(text);
  if (protectedPath || protectedTag || explicitConflict) {
    throw new Error('Lesson conflicts with the immutable kernel');
  }
  const delimiterNormalized = text.toLowerCase().replace(/\s+/g, '');
  if (delimiterNormalized.includes('<continual-harness>') || delimiterNormalized.includes('</continual-harness>')) {
    throw new Error('Lesson conflicts with the continual-harness kernel delimiter');
  }
}

function assertKnownFields(event) {
  const common = ['schemaVersion', 'eventId', 'action', 'lessonId', 'lessonVersion', 'roles', 'paths', 'taskTags', 'proposedBy', 'prevHash', 'eventHash'];
  const byAction = {
    PROPOSE: [...common, 'text'],
    ADMIT: [...common, 'text', 'proposalHash', 'reviewedBy', 'evidence'],
    REVOKE: [...common, 'reason', 'reviewedBy', 'evidence'],
  };
  const allowed = byAction[event.action];
  if (!allowed) throw new Error(`Unsupported action: ${String(event.action)}`);
  const unknown = Object.keys(event).filter((key) => !allowed.includes(key) && event[key] !== undefined);
  if (unknown.length) throw new Error(`Unknown event fields: ${unknown.join(', ')}`);
}

function assertEventShape(event, { allowOversizeProposal = false } = {}) {
  if (event.schemaVersion !== 1) throw new Error('schemaVersion must be 1');
  assertString(event.eventId, 'eventId', { identifier: true });
  assertString(event.lessonId, 'lessonId', { identifier: true });
  if (!Number.isInteger(event.lessonVersion) || event.lessonVersion < 1) throw new Error('lessonVersion must be a positive integer');
  assertString(event.proposedBy, 'proposedBy', { identifier: true });
  assertScope(event);
  assertKnownFields(event);
  if (event.action === 'PROPOSE' || event.action === 'ADMIT') {
    assertString(event.text, 'text', { multiline: true });
    if (!allowOversizeProposal && Buffer.byteLength(event.text, 'utf8') > MAX_CONTEXT_BYTES) {
      throw new Error('text exceeds the 4,000-byte lesson limit');
    }
  }
  if (event.action === 'ADMIT') {
    if (!HASH_PATTERN.test(event.proposalHash)) throw new Error('proposalHash must be a SHA-256 hash');
    assertString(event.reviewedBy, 'reviewedBy', { identifier: true });
    assertEvidence(event);
  }
  if (event.action === 'REVOKE') {
    assertString(event.reason, 'reason', { multiline: true });
    assertString(event.reviewedBy, 'reviewedBy', { identifier: true });
    assertEvidence(event);
  }
  if (event.reviewedBy && event.reviewedBy.toLowerCase() === event.proposedBy.toLowerCase()) {
    throw new Error('Independent reviewer must differ from proposedBy');
  }
  assertKernelSafe(event);
}

function sameScope(left, right) {
  return ['roles', 'paths', 'taskTags'].every((field) => {
    const a = [...left[field]].sort();
    const b = [...right[field]].sort();
    return a.length === b.length && a.every((value, index) => value === b[index]);
  });
}

function lessonKey(event) {
  return `${event.lessonId}\u0000${event.lessonVersion}`;
}

function evaluateLedger(events, { oversizedProposalHash = null } = {}) {
  if (!Array.isArray(events)) throw new Error('Ledger must be an array of events');
  const eventIds = new Set();
  const proposals = new Map();
  const proposalVersions = new Set();
  const admittedVersions = new Set();
  const active = new Map();
  let previousHash = ZERO_HASH;

  for (const [index, event] of events.entries()) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error(`Ledger event ${index + 1} must be an object`);
    if (event.prevHash !== previousHash) throw new Error(`Ledger hash link failed at event ${index + 1}`);
    if (!HASH_PATTERN.test(event.eventHash) || eventHash(event) !== event.eventHash) {
      throw new Error(`Ledger event hash failed at event ${index + 1}`);
    }
    assertEventShape(event, {
      allowOversizeProposal: event.action === 'PROPOSE' && event.eventHash === oversizedProposalHash,
    });
    if (eventIds.has(event.eventId)) throw new Error(`Duplicate eventId: ${event.eventId}`);
    eventIds.add(event.eventId);
    const key = lessonKey(event);

    if (event.action === 'PROPOSE') {
      if (proposalVersions.has(key)) throw new Error(`Duplicate proposed lesson version: ${event.lessonId}@${event.lessonVersion}`);
      proposalVersions.add(key);
      proposals.set(event.eventHash, event);
    } else if (event.action === 'ADMIT') {
      const proposal = proposals.get(event.proposalHash);
      if (!proposal) throw new Error('Admission references no earlier proposal');
      if (proposal.lessonId !== event.lessonId) throw new Error('Admission lesson id does not match proposal');
      if (proposal.lessonVersion !== event.lessonVersion) throw new Error('Admission lesson version does not match proposal');
      if (!sameScope(proposal, event)) throw new Error('Admission scope does not match proposal');
      if (proposal.text !== event.text) throw new Error('Admission text does not match proposal');
      if (proposal.proposedBy !== event.proposedBy) throw new Error('Admission proposer does not match proposal');
      if (admittedVersions.has(key)) throw new Error(`Duplicate admitted lesson version: ${event.lessonId}@${event.lessonVersion}`);
      admittedVersions.add(key);
      active.set(key, event);
    } else {
      const admission = active.get(key);
      if (!admission) throw new Error('Revocation must reference an active admitted lesson version');
      if (!sameScope(admission, event)) throw new Error('Revocation scope does not match admitted lesson version');
      if (admission.proposedBy !== event.proposedBy) throw new Error('Revocation proposer does not match admitted lesson version');
      active.delete(key);
    }
    previousHash = event.eventHash;
  }
  return active;
}

/** Verify the full hash chain, schema, admission evidence, and append-only lifecycle. */
export function verifyLedger(events) {
  evaluateLedger(events);
  return true;
}

/** Verify ledger validity and completeness against its committed head checkpoint. */
export function verifyCheckpoint(events, checkpoint) {
  verifyLedger(events);
  if (!checkpoint || typeof checkpoint !== 'object' || Array.isArray(checkpoint)) {
    throw new Error('Checkpoint must be an object');
  }
  const fields = Object.keys(checkpoint);
  if (fields.length !== 3 || !['schemaVersion', 'eventCount', 'headHash'].every((field) => fields.includes(field))) {
    throw new Error('Checkpoint fields are invalid');
  }
  if (checkpoint.schemaVersion !== 1) throw new Error('Checkpoint schemaVersion must be 1');
  if (!Number.isInteger(checkpoint.eventCount) || checkpoint.eventCount < 0) {
    throw new Error('Checkpoint eventCount must be a non-negative integer');
  }
  if (!HASH_PATTERN.test(checkpoint.headHash)) throw new Error('Checkpoint headHash must be a SHA-256 hash');
  if (checkpoint.eventCount !== events.length) throw new Error('Checkpoint event count does not match ledger');
  const expectedHead = events.at(-1)?.eventHash ?? ZERO_HASH;
  if (checkpoint.headHash !== expectedHead) throw new Error('Checkpoint head hash does not match ledger');
  return true;
}

function dimensionMatches(scope, query, match) {
  return scope.length === 0 || scope.some((value) => match(value, query));
}

function pathMatches(scopedPath, queryPath) {
  return scopedPath === queryPath || queryPath.startsWith(`${scopedPath.replace(/\/$/, '')}/`);
}

function normalizedQueryPath(path) {
  if (path === '' || isAbsolute(path) || /^[A-Za-z]:\//.test(path) || path.includes('\\') || path.split('/').includes('..')) return null;
  const normalized = posix.normalize(path).replace(/^\.\//, '').replace(/\/$/, '');
  return normalized === '.' || normalized.startsWith('/') ? null : normalized;
}

function targetsKernel(path) {
  const candidate = path.toLowerCase();
  return PROTECTED_PATHS.some((kernelPath) => {
    const kernel = kernelPath.toLowerCase();
    return candidate === kernel || candidate.startsWith(`${kernel}/`) || kernel.startsWith(`${candidate}/`);
  });
}

/** True when any query path is invalid or targets/contains an immutable-kernel path. */
export function hasProtectedQueryPath(paths) {
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string')) return true;
  return paths.some((path) => {
    const normalized = normalizedQueryPath(path);
    return normalized === null || targetsKernel(normalized);
  });
}

/** Extract every declared repo path plus deterministic task tags from a dispatch body. */
export function extractDispatchScope(task) {
  if (typeof task !== 'string') throw new Error('Dispatch task must be a string');
  const roots = 'src|scripts|docs|mcp|prisma|messages|\\.agents|\\.claude';
  const pathPattern = new RegExp(
    `(?:^|[^A-Za-z0-9._/\\\\-])((?:(?:${roots})(?:/[A-Za-z0-9._@/+*\\[\\]-]+)?|AGENTS\\.md|CLAUDE\\.md))(?=$|[^A-Za-z0-9._/\\\\-])`,
    'gi',
  );
  const paths = [...new Set([...task.matchAll(pathPattern)].map((match) => match[1]))].sort();
  const taskTags = [...task.matchAll(/taskTags?\s*:\s*([^\n<]+)/gi)]
    .flatMap((match) => match[1].split(/[\s,]+/))
    .map((tag) => tag.replace(/^[^A-Za-z0-9_-]+|[^A-Za-z0-9_-]+$/g, '').toLowerCase())
    .filter(Boolean);
  return { paths, path: paths[0] ?? '', taskTags: [...new Set(taskTags)].sort() };
}

function xmlEscape(value) {
  const escaped = String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  return JSON.stringify(escaped).slice(1, -1);
}

function specificity(event) {
  return event.roles.length + event.paths.length + event.taskTags.length;
}

function compareLessons(left, right) {
  return specificity(right) - specificity(left)
    || (left.lessonId < right.lessonId ? -1 : left.lessonId > right.lessonId ? 1 : 0)
    || left.lessonVersion - right.lessonVersion;
}

function scopedLessons(verifiedActive, role, queryPath, taskTags) {
  return [...verifiedActive.values()]
    .filter((event) => dimensionMatches(event.roles, role, (value, query) => value === query))
    .filter((event) => dimensionMatches(event.paths, queryPath, pathMatches))
    .filter((event) => dimensionMatches(event.taskTags, taskTags, (value, query) => query.includes(value)))
    .sort(compareLessons);
}

function renderLessons(active) {
  if (active.length === 0) return '';
  const blocks = [];
  for (const event of active) {
    if (blocks.length === MAX_LESSONS) break;
    const block = `[${xmlEscape(event.lessonId)}@${event.lessonVersion}]\nreviewer: ${xmlEscape(event.reviewedBy)}\nevidence: ${xmlEscape(event.evidence.artifact)}\nlesson: ${xmlEscape(event.text)}`;
    const candidate = `${CONTEXT_OPEN}\n${[...blocks, block].join('\n\n')}${CONTEXT_CLOSE}`;
    if (Buffer.byteLength(candidate, 'utf8') <= MAX_CONTEXT_BYTES) blocks.push(block);
  }
  return blocks.length ? `${CONTEXT_OPEN}\n${blocks.join('\n\n')}${CONTEXT_CLOSE}` : '';
}

/** Render the active, scoped, provenance-carrying projection, including its prompt delimiter. */
export function renderContext({ events, role, path, taskTags }) {
  assertString(role, 'role');
  if (typeof path !== 'string') throw new Error('path must be a string');
  if (!Array.isArray(taskTags) || taskTags.some((tag) => typeof tag !== 'string')) throw new Error('taskTags must be an array of strings');
  const verifiedActive = evaluateLedger(events);
  const queryPath = normalizedQueryPath(path);
  if (queryPath === null || targetsKernel(queryPath)) return '';
  return renderLessons(scopedLessons(verifiedActive, role, queryPath, taskTags));
}

/** Render one verified, scoped PROPOSE as an escaped evaluation-only overlay without changing the ledger. */
export function renderProposedContext({
  events,
  proposalHash,
  lessonId,
  lessonVersion,
  role,
  path,
  taskTags,
}) {
  assertString(role, 'role');
  if (typeof path !== 'string') throw new Error('path must be a string');
  if (!Array.isArray(taskTags) || taskTags.some((tag) => typeof tag !== 'string')) {
    throw new Error('taskTags must be an array of strings');
  }
  const verifiedActive = evaluateLedger(events, { oversizedProposalHash: proposalHash });
  const proposed = events.find((event) => event?.eventHash === proposalHash);
  if (!proposed) throw new Error('No exact proposal hash exists in the verified ledger');
  if (proposed.action !== 'PROPOSE') throw new Error('Candidate hash must reference the exact PROPOSE event action');
  if (proposed.lessonId !== lessonId || proposed.lessonVersion !== lessonVersion) {
    throw new Error('Candidate lesson id/version does not match the exact proposal');
  }
  // The overlay states "status: UNADMITTED" as fact. Once this exact lesson version carries an
  // ADMIT or a REVOKE it is no longer an inactive candidate, and rendering it would put a false
  // claim in the prompt — either understating an admitted lesson's authority, or resurrecting a
  // revoked one as if still under consideration.
  const terminal = events.find((event) => (event.action === 'ADMIT' || event.action === 'REVOKE')
    && event.lessonId === proposed.lessonId
    && event.lessonVersion === proposed.lessonVersion);
  if (terminal) {
    throw new Error(`Candidate is not unadmitted: a later ${terminal.action} event exists for ${proposed.lessonId}@${proposed.lessonVersion}`);
  }
  const queryPath = normalizedQueryPath(path);
  if (queryPath === null || targetsKernel(queryPath)) return '';
  if (!dimensionMatches(proposed.roles, role, (value, query) => value === query)
    || !dimensionMatches(proposed.paths, queryPath, pathMatches)
    || !dimensionMatches(proposed.taskTags, taskTags, (value, query) => query.includes(value))) return '';

  const active = scopedLessons(verifiedActive, role, queryPath, taskTags);
  if (active.length >= MAX_LESSONS) throw new Error('Proposed candidate exceeds the combined lesson bound');
  const baseline = renderLessons(active);
  const available = MAX_CONTEXT_BYTES - Buffer.byteLength(baseline, 'utf8') - (baseline ? 1 : 0);
  const open = '<continual-benchmark-candidate>\n';
  const prefix = `status: UNADMITTED\nproposal: ${xmlEscape(proposed.eventHash)}\nproposedBy: ${xmlEscape(proposed.proposedBy)}\nlesson: `;
  const close = '\n</continual-benchmark-candidate>';
  const fixedBytes = Buffer.byteLength(`${open}${prefix}${close}`, 'utf8');
  if (fixedBytes > available) throw new Error('Proposed candidate does not fit the combined context bound');
  // REJECT, never truncate. `evaluateLedger` was called with `oversizedProposalHash` so that an
  // oversized candidate does not invalidate the whole ledger — but that exemption must not become
  // a licence to silently shorten it here. A lesson is an instruction: cutting it at a byte
  // boundary can invert its meaning ("never do X unless Y" becomes "never do X"), and the result
  // would still be presented as the proposer's exact verified text.
  const escapedText = xmlEscape(proposed.text);
  const textBudget = available - fixedBytes;
  if (Buffer.byteLength(escapedText, 'utf8') > textBudget) {
    throw new Error(`Proposed candidate exceeds the ${MAX_CONTEXT_BYTES.toLocaleString('en-US')}-byte context bound by `
      + `${Buffer.byteLength(escapedText, 'utf8') - textBudget} bytes and is rejected rather than truncated`);
  }
  return `${open}${prefix}${escapedText}${close}`;
}

function readLedger(path, allowMissing = false) {
  if (!existsSync(path)) {
    if (allowMissing) return [];
    throw new Error(`Ledger not found: ${path}`);
  }
  return readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line, index) => {
    if (line.trim() === '') return [];
    try { return [JSON.parse(line)]; }
    catch { throw new Error(`Invalid JSON at ledger line ${index + 1}`); }
  });
}

function checkpointPathFor(path) {
  return path === DEFAULT_LEDGER ? DEFAULT_CHECKPOINT : `${path}.head.json`;
}

function checkpointFor(events) {
  return { schemaVersion: 1, eventCount: events.length, headHash: events.at(-1)?.eventHash ?? ZERO_HASH };
}

function readCheckpoint(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw new Error(`Invalid or missing checkpoint: ${path}`); }
}

function readState(path, allowCreate = false) {
  const checkpointPath = checkpointPathFor(path);
  const ledgerExists = existsSync(path);
  const checkpointExists = existsSync(checkpointPath);
  if (!ledgerExists && !checkpointExists && allowCreate) return { events: [], checkpointPath };
  if (!ledgerExists || !checkpointExists) throw new Error('Ledger/checkpoint pair is incomplete');
  const events = readLedger(path);
  verifyCheckpoint(events, readCheckpoint(checkpointPath));
  return { events, checkpointPath };
}

function writeCheckpoint(path, events) {
  const checkpoint = checkpointFor(events);
  verifyCheckpoint(events, checkpoint);
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(checkpoint)}\n`, 'utf8');
  renameSync(temporary, path);
}

function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith('--') || token.length === 2) throw new Error(`Unexpected argument: ${token}`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${token}`);
    const key = token.slice(2);
    options.set(key, [...(options.get(key) ?? []), value]);
    index += 1;
  }
  return options;
}

function option(options, name, { required = false } = {}) {
  const values = options.get(name) ?? [];
  if (values.length > 1) throw new Error(`--${name} may be provided only once`);
  if (required && values.length === 0) throw new Error(`Missing --${name}`);
  return values[0];
}

function assertOptions(options, allowed) {
  const unknown = [...options.keys()].filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.map((key) => `--${key}`).join(', ')}`);
}

function integerOption(options, name, required = true) {
  const value = option(options, name, { required });
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`--${name} must be a non-negative integer`);
  return Number(value);
}

function ledgerPath(options) {
  const supplied = option(options, 'ledger');
  return supplied ? resolve(process.cwd(), supplied) : DEFAULT_LEDGER;
}

function evidenceFrom(options) {
  const command = option(options, 'evidence-command', { required: true });
  const suppliedOutput = option(options, 'evidence-output');
  if (suppliedOutput !== undefined) {
    return {
      command,
      exitStatus: integerOption(options, 'evidence-exit-status'),
      output: suppliedOutput,
      outputDigest: option(options, 'evidence-output-digest', { required: true }),
      artifact: option(options, 'evidence-artifact', { required: true }),
    };
  }
  if (options.has('evidence-exit-status') || options.has('evidence-output-digest')) {
    throw new Error('--evidence-output is required with supplied exit status or digest');
  }
  const result = spawnSync(command, { cwd: ROOT, shell: true, encoding: 'utf8', maxBuffer: MAX_EVIDENCE_BYTES + 1 });
  if (result.error) throw new Error(`Evidence command failed: ${result.error.message}`);
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 0) throw new Error(`Evidence command exited ${result.status ?? 'without status'}`);
  if (Buffer.byteLength(output, 'utf8') > MAX_EVIDENCE_BYTES) throw new Error('Evidence command output exceeds the byte limit');
  return {
    command,
    exitStatus: 0,
    output,
    outputDigest: createHash('sha256').update(output, 'utf8').digest('hex'),
    artifact: option(options, 'evidence-artifact', { required: true }),
  };
}

function appendValidated(path, checkpointPath, events, input) {
  const event = createEvent(input, events.at(-1));
  const nextEvents = [...events, event];
  verifyLedger(nextEvents);
  const ledger = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const prefix = ledger.length > 0 && !ledger.endsWith('\n') ? '\n' : '';
  appendFileSync(path, `${prefix}${JSON.stringify(event)}\n`, 'utf8');
  writeCheckpoint(checkpointPath, nextEvents);
  console.log(event.eventHash);
}

function defaultEventId(action, lessonId, lessonVersion, index) {
  return `${action.toLowerCase()}-${lessonId}-v${lessonVersion}-${index + 1}`;
}

function help() {
  console.log(`Usage:
  node scripts/continual-harness.mjs verify [--ledger PATH]
  node scripts/continual-harness.mjs context --role ROLE [--path PATH] [--task-tag TAG ...] [--ledger PATH]
  node scripts/continual-harness.mjs propose --lesson-id ID --lesson-version N --text TEXT --proposed-by ROLE [--role ROLE ...] [--path PATH ...] [--task-tag TAG ...] [--event-id ID] [--ledger PATH]
  node scripts/continual-harness.mjs admit (--proposal-hash HASH | --lesson-id ID --lesson-version N) --reviewed-by ROLE --evidence-command CMD [--evidence-output OUTPUT --evidence-exit-status 0 --evidence-output-digest HASH] --evidence-artifact commit:FULL_SHA [--event-id ID] [--ledger PATH]
  node scripts/continual-harness.mjs revoke --lesson-id ID --lesson-version N --reason TEXT --reviewed-by ROLE --evidence-command CMD [--evidence-output OUTPUT --evidence-exit-status 0 --evidence-output-digest HASH] --evidence-artifact commit:FULL_SHA [--event-id ID] [--ledger PATH]

Machine conflict checks reject explicit kernel-weakening text, but independent evidence review is the authoritative semantic safety gate.`);
}

function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help') return help();
  const options = parseOptions(rest);
  const commonEvidence = ['reviewed-by', 'evidence-command', 'evidence-exit-status', 'evidence-output', 'evidence-output-digest', 'evidence-artifact', 'event-id', 'ledger'];

  if (command === 'verify') {
    assertOptions(options, ['ledger']);
    const { events } = readState(ledgerPath(options));
    console.log(`verified ${events.length} event(s) and checkpoint`);
    return;
  }
  if (command === 'context') {
    assertOptions(options, ['role', 'path', 'task-tag', 'ledger']);
    const { events } = readState(ledgerPath(options));
    const rendered = renderContext({
      events,
      role: option(options, 'role', { required: true }),
      path: option(options, 'path') ?? '',
      taskTags: options.get('task-tag') ?? [],
    });
    if (rendered) console.log(rendered);
    return;
  }
  if (command === 'propose') {
    assertOptions(options, ['lesson-id', 'lesson-version', 'text', 'proposed-by', 'role', 'path', 'task-tag', 'event-id', 'ledger']);
    const path = ledgerPath(options);
    const { events, checkpointPath } = readState(path, true);
    const lessonId = option(options, 'lesson-id', { required: true });
    const lessonVersion = integerOption(options, 'lesson-version');
    appendValidated(path, checkpointPath, events, {
      schemaVersion: 1,
      eventId: option(options, 'event-id') ?? defaultEventId('PROPOSE', lessonId, lessonVersion, events.length),
      action: 'PROPOSE', lessonId, lessonVersion,
      roles: options.get('role') ?? [], paths: options.get('path') ?? [], taskTags: options.get('task-tag') ?? [],
      text: option(options, 'text', { required: true }), proposedBy: option(options, 'proposed-by', { required: true }),
    });
    return;
  }
  if (command === 'admit') {
    assertOptions(options, ['proposal-hash', 'lesson-id', 'lesson-version', ...commonEvidence]);
    const path = ledgerPath(options);
    const { events, checkpointPath } = readState(path);
    const proposalHash = option(options, 'proposal-hash');
    const lessonId = option(options, 'lesson-id');
    const lessonVersion = integerOption(options, 'lesson-version', false);
    const matches = events.filter((event) => event.action === 'PROPOSE'
      && (proposalHash ? event.eventHash === proposalHash : event.lessonId === lessonId && event.lessonVersion === lessonVersion));
    if (!proposalHash && (!lessonId || lessonVersion === undefined)) throw new Error('Provide --proposal-hash or both --lesson-id and --lesson-version');
    if (matches.length !== 1) throw new Error(`Expected one matching proposal, found ${matches.length}`);
    const proposal = matches[0];
    appendValidated(path, checkpointPath, events, {
      schemaVersion: 1,
      eventId: option(options, 'event-id') ?? defaultEventId('ADMIT', proposal.lessonId, proposal.lessonVersion, events.length),
      action: 'ADMIT', lessonId: proposal.lessonId, lessonVersion: proposal.lessonVersion,
      roles: proposal.roles, paths: proposal.paths, taskTags: proposal.taskTags, text: proposal.text,
      proposedBy: proposal.proposedBy, proposalHash: proposal.eventHash,
      reviewedBy: option(options, 'reviewed-by', { required: true }), evidence: evidenceFrom(options),
    });
    return;
  }
  if (command === 'revoke') {
    assertOptions(options, ['lesson-id', 'lesson-version', 'reason', ...commonEvidence]);
    const path = ledgerPath(options);
    const { events, checkpointPath } = readState(path);
    const active = evaluateLedger(events);
    const selector = { lessonId: option(options, 'lesson-id', { required: true }), lessonVersion: integerOption(options, 'lesson-version') };
    const admission = active.get(lessonKey(selector));
    if (!admission) throw new Error('No active admitted lesson version matches the revocation');
    appendValidated(path, checkpointPath, events, {
      schemaVersion: 1,
      eventId: option(options, 'event-id') ?? defaultEventId('REVOKE', selector.lessonId, selector.lessonVersion, events.length),
      action: 'REVOKE', ...selector,
      roles: admission.roles, paths: admission.paths, taskTags: admission.taskTags,
      reason: option(options, 'reason', { required: true }), proposedBy: admission.proposedBy,
      reviewedBy: option(options, 'reviewed-by', { required: true }), evidence: evidenceFrom(options),
    });
    return;
  }
  throw new Error(`Unknown command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); }
  catch (error) {
    console.error(`continual-harness: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
