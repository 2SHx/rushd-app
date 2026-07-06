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

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const map = JSON.parse(readFileSync(join(root, 'scripts/models.map.json'), 'utf8'));
const args = process.argv.slice(2);

if (args[0] === '--list' || args.length === 0) {
  console.log('agent'.padEnd(22) + 'runner'.padEnd(10) + 'model');
  for (const [name, r] of Object.entries(map.agents))
    console.log(name.padEnd(22) + r.runner.padEnd(10) + r.model);
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
const runner = map.runners[runnerName];
if (!runner) {
  console.error(`Unknown runner "${runnerName}". Known: ${Object.keys(map.runners).join(', ')}`);
  process.exit(1);
}

// Agent body = everything after the closing frontmatter fence.
const md = readFileSync(join(root, '.claude/agents', `${agent}.md`), 'utf8');
const body = md.replace(/^---[\s\S]*?\n---\n/, '').trim();

const houseRules = runnerName === 'claude' ? ''
  : '\n\nHOUSE RULES: you are a guest agent in this repo — read ./AGENTS.md and obey it; never touch prisma/migrations/** or .env*; verify with `npm run lint && npx tsc --noEmit` before reporting.';
const prompt = `${body}${houseRules}\n\n=== DISPATCH ===\n${task}`;

const cmd = runner.cmd.map(p => p.replace('{model}', model).replace('{prompt}', prompt));
console.error(`[dispatch] agent=${agent} runner=${runnerName} model=${model} prompt=${prompt.length} chars`);
if (dryRun) {
  console.log(cmd.map(c => (c.length > 120 ? c.slice(0, 120) + `…(+${c.length - 120} chars)` : c))
    .map(c => (/\s/.test(c) ? JSON.stringify(c) : c)).join(' '));
  process.exit(0);
}
const res = spawnSync(cmd[0], cmd.slice(1), { cwd: root, stdio: 'inherit' });
if (res.error?.code === 'ENOENT') {
  console.error(`Runner binary "${cmd[0]}" not found on PATH. Install it or pick another runner (docs/MODELS.md).`);
  process.exit(127);
}
process.exit(res.status ?? 1);
