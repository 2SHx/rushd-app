#!/usr/bin/env node
// Any-model agent dispatcher: runs a RUSHD expert agent on whichever AI runner/model
// scripts/models.map.json routes it to. Canonical agent definitions stay in
// .claude/agents/*.md — this script injects them, so there is nothing to sync.
//
//   node scripts/dispatch.mjs <agent> "<task>"            # route from models.map.json
//   DISPATCH_RUNNER=gemini DISPATCH_MODEL=gemini-2.5-pro \
//   node scripts/dispatch.mjs backend-expert "<task>"     # one-off override
//   node scripts/dispatch.mjs --list                      # show routing table
//   node scripts/dispatch.mjs <agent> "<task>" --dry-run  # print command, don't run
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { extractDispatchScope, hasProtectedQueryPath, renderContext, verifyCheckpoint } from './continual-harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(root, 'scripts/models.map.json'), 'utf8'));

function loadContinualEvents() {
  const ledger = readFileSync(join(root, '.agents/continual/events.jsonl'), 'utf8');
  const events = ledger.split(/\r?\n/).flatMap((line, index) => {
    if (line.trim() === '') return [];
    try { return [JSON.parse(line)]; }
    catch { throw new Error(`Invalid continual-harness JSON at line ${index + 1}`); }
  });
  let checkpoint;
  try { checkpoint = JSON.parse(readFileSync(join(root, '.agents/continual/head.json'), 'utf8')); }
  catch { throw new Error('Invalid or missing continual-harness checkpoint'); }
  verifyCheckpoint(events, checkpoint);
  return events;
}

// OpenRouter credential-file fallback (~/.config/rushd/openrouter.key, chmod 600):
// spawned runners inherit env, so loading here covers opencode's openrouter/* models
// without persisting the secret in shell profiles or the repo.
if (!process.env.OPENROUTER_API_KEY) {
  try {
    const k = readFileSync(join(homedir(), '.config', 'rushd', 'openrouter.key'), 'utf8').trim();
    if (k) process.env.OPENROUTER_API_KEY = k;
  } catch { /* no key file — openrouter-routed runners will fail with their own auth error */ }
}
const args = process.argv.slice(2);

if (args[0] === '--list' || args.length === 0) {
  console.log('agent'.padEnd(22) + 'runner'.padEnd(10) + 'model'.padEnd(20) + 'effort');
  for (const [name, r] of Object.entries(map.agents))
    console.log(name.padEnd(22) + r.runner.padEnd(10) + r.model.padEnd(20) + (r.effort || 'medium'));
  console.log('\nUsage: node scripts/dispatch.mjs <agent> "<task>" [--dry-run]');
  process.exit(0);
}

const [agent, task] = args;
const dryRun = args.includes('--dry-run');
const route = map.agents[agent];
if (!route) {
  console.error(`Unknown agent "${agent}". Known: ${Object.keys(map.agents).join(', ')}`);
  process.exit(1);
}
if (!task) { console.error('Missing task. Usage: dispatch.mjs <agent> "<task>"'); process.exit(1); }

const runnerName = process.env.DISPATCH_RUNNER || route.runner;
const model = process.env.DISPATCH_MODEL || route.model;
const effort = process.env.DISPATCH_EFFORT || route.effort || 'medium';
const runner = map.runners[runnerName];
if (!runner) {
  console.error(`Unknown runner "${runnerName}". Known: ${Object.keys(map.runners).join(', ')}`);
  process.exit(1);
}

// Agent body = everything after the closing frontmatter fence.
const md = readFileSync(join(root, '.claude/agents', `${agent}.md`), 'utf8');
const body = md.replace(/^---[\s\S]*?\n---\n/, '').trim();

let continualContext;
try {
  const { paths, ...scope } = extractDispatchScope(task);
  const events = loadContinualEvents();
  continualContext = hasProtectedQueryPath(paths) ? '' : renderContext({ events, role: agent, ...scope });
} catch (error) {
  console.error(`[dispatch] continual harness rejected dispatch: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const houseRules = runnerName === 'claude' ? ''
  : '\n\nHOUSE RULES: you are a guest agent in this repo — read ./AGENTS.md and obey it; never touch prisma/migrations/** or .env*; verify with `npm run lint && npx tsc --noEmit` before reporting.';
const sharedReport = '\n\nSHARED REPORT CONTRACT: include exactly one final `LESSON: NONE | PROPOSE <distilled lesson + evidence>` line; proposing never admits a lesson.';
const prompt = `${body}${houseRules}${sharedReport}\n\n=== DISPATCH ===\n${task}${continualContext ? `\n\n${continualContext}` : ''}`;

// A run attempt on one runner/model. Returns the spawn result (or {missing:true} if the binary isn't on PATH).
function runOn(rName, m, e, label) {
  const r = map.runners[rName];
  if (!r) { console.error(`Unknown runner "${rName}". Known: ${Object.keys(map.runners).join(', ')}`); return { missing: true }; }
  const cmd = r.cmd.map(p => p.replace('{model}', m).replace('{effort}', e).replace('{prompt}', prompt));
  console.error(`[dispatch]${label} agent=${agent} runner=${rName} model=${m} effort=${e} prompt=${prompt.length} chars`);
  if (dryRun) {
    console.log(cmd.map(c => (c.length > 120 ? c.slice(0, 120) + `…(+${c.length - 120} chars)` : c))
      .map(c => (/\s/.test(c) ? JSON.stringify(c) : c)).join(' '));
    return { status: 0 };
  }
  const res = spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit' });
  if (res.error?.code === 'ENOENT') { console.error(`Runner binary "${cmd[0]}" not found on PATH.`); return { missing: true }; }
  return res;
}

// Primary → lower-cost fallback (unless an env override or DISPATCH_NO_FALLBACK is set).
const overridden = process.env.DISPATCH_RUNNER || process.env.DISPATCH_MODEL || process.env.DISPATCH_EFFORT;
let res = runOn(runnerName, model, effort, '');
const primaryFailed = res.missing || (res.status ?? 1) !== 0;
if (primaryFailed && !dryRun && !overridden && route.fallback && process.env.DISPATCH_NO_FALLBACK !== '1') {
  const fb = route.fallback;
  console.error(`[dispatch] primary failed (${res.missing ? 'binary missing' : 'exit ' + res.status}) — falling back to ${fb.runner}/${fb.model}`);
  res = runOn(fb.runner, fb.model, fb.effort || 'low', ' [fallback]');
}
if (res.missing) {
  console.error(`No usable runner (primary + fallback binaries absent). Install one or pick another runner (docs/MODELS.md).`);
  process.exit(127);
}
process.exit(res.status ?? 1);
