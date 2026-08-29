#!/usr/bin/env node
// The agent swarm: pick work from the backlog, dispatch it, verify it, record it.
//
// WHY THIS EXISTS: this repo already had 15 agent definitions and `dispatch.mjs` to run any of them
// on any model. What it did not have was the thing that decides WHAT to work on — every dispatch
// needed a human to write the task string. That is the entire bottleneck: the owner should not have
// to describe the work each time.
//
// So the missing piece is not more agents. It is a standing objective (agents/objective.json), a
// queue with machine-checkable acceptance (agents/backlog.json), and this loop.
//
// WHAT THIS DELIBERATELY IS NOT: an alpha-discovery swarm. More agents searching for a signal means
// more hypotheses tested, which means more FALSE positives — not more discoveries. Six pre-registered
// signals have already been falsified on the full 6,786-name universe, and an unsupervised agent
// would have reported the leveraged-ETF result as a 12.18pp/yr win. The swarm is pointed at
// verification, operations and data quality, where more eyes genuinely help. See agents/GUARDRAILS.md.
//
// SAFETY POSTURE, in order:
//   • DRY RUN BY DEFAULT. Nothing dispatches without --execute.
//   • `owner` items are never dispatched — they are surfaced and skipped. An agent that "completes"
//     an owner item has done something wrong.
//   • acceptance is a COMMAND that must exit 0, run AFTER the agent reports. An agent's own claim of
//     success is not evidence, and this program has repeatedly found work that reported success
//     while doing nothing.
//   • one item at a time by default: concurrent agents share one database, and a single
//     `prisma migrate dev` once wiped 255k bars mid-session.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OBJECTIVE = join(root, 'agents/objective.json');
const BACKLOG = join(root, 'agents/backlog.json');
const RUNS_DIR = join(root, 'agents/runs');

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const only = args.find((a) => a.startsWith('--only='))?.split('=')[1];
const maxItems = Number.parseInt(args.find((a) => a.startsWith('--max='))?.split('=')[1] ?? '1', 10);

function loadJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

/**
 * The task string an agent receives. It is assembled from the objective and the item rather than
 * written by hand — that assembly IS the autonomy. The agent gets the standing goal, the hard
 * constraints, the guardrails, and one concrete item with its own acceptance test.
 */
function buildTask(objective, item, guardrails) {
  return [
    `STANDING OBJECTIVE — ${objective.mission}`,
    '',
    'ALREADY SETTLED (do NOT re-litigate; re-opening one requires NEW evidence named in your report):',
    ...Object.entries(objective.whatIsAlreadySettled)
      .filter(([k]) => k !== 'note')
      .map(([k, v]) => `  - ${k}: ${v}`),
    '',
    `HARD CONSTRAINTS: ${JSON.stringify(objective.hardConstraints)}`,
    '',
    'DEFINITION OF BETTER (ranked; improving a lower item at the cost of a higher one is a regression):',
    ...objective.definitionOfBetter.order.map((o) => `  ${o}`),
    '',
    'GUARDRAILS (verbatim, non-negotiable):',
    guardrails,
    '',
    '=== YOUR ITEM ===',
    `id:    ${item.id}`,
    `title: ${item.title}`,
    `why:   ${item.why}`,
    `objective: ${item.objective}`,
    '',
    `ACCEPTANCE — this exact command must exit 0, and it will be run independently after you report:`,
    `  ${item.accept}`,
    '',
    'Report what you changed, paste the acceptance output, and end with the LESSON line.',
    'If you conclude the item is blocked, say precisely what is missing and what you tried —',
    'prove the blocker is real before declaring it owner-only.',
  ].join('\n');
}

/**
 * Is there actually a runner on this machine?
 *
 * `dispatch.mjs` shells out to opencode/claude/gemini/codex. On 2026-08-29 NONE of the four were
 * installed, so every dispatch would have failed after the swarm had already reported itself ready
 * — a scheduler that looks configured and silently never runs, which is the exact failure this
 * program has now found five times.
 *
 * When no runner exists the swarm does not pretend. It EMITS the assembled task and tells the
 * orchestrator session to dispatch it through its own subagent tool, which matches CLAUDE.md's
 * "main session orchestrates; subagents implement" anyway. The external CLIs are the any-model
 * path, not the only path.
 */
function availableRunner() {
  const map = loadJson(join(root, 'scripts/models.map.json'));
  for (const [name, spec] of Object.entries(map.runners)) {
    const bin = spec.cmd[0];
    try {
      execSync(bin.includes('/') ? `test -x ${bin}` : `command -v ${bin}`, { stdio: 'ignore' });
      return name;
    } catch { /* not installed */ }
  }
  return null;
}

function runAcceptance(item) {
  if (!item.accept || item.accept.startsWith('manual:')) {
    return { ran: false, pass: false, output: 'no automatable acceptance command' };
  }
  try {
    const output = execSync(item.accept, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900_000 });
    return { ran: true, pass: true, output: output.slice(-4000) };
  } catch (err) {
    return { ran: true, pass: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}`.slice(-4000) };
  }
}

function main() {
  const objective = loadJson(OBJECTIVE);
  const backlog = loadJson(BACKLOG);
  const guardrails = readFileSync(join(root, 'agents/GUARDRAILS.md'), 'utf8');

  const owner = backlog.items.filter((i) => i.state === 'owner');
  const blocked = backlog.items.filter((i) => i.state === 'blocked');
  let ready = backlog.items
    .filter((i) => i.state === 'ready' && i.agent)
    .sort((a, b) => a.priority - b.priority);
  if (only) ready = ready.filter((i) => i.id === only);

  console.log(`SWARM — ${objective.mission}\n`);
  console.log(`ready ${ready.length}   blocked ${blocked.length}   owner-only ${owner.length}   ${execute ? 'EXECUTE' : 'DRY RUN (pass --execute to dispatch)'}\n`);

  if (owner.length) {
    // Surfaced FIRST and every run. These are the items that actually gate the mission, and burying
    // them under agent chatter is how a program stalls for ten days while looking busy.
    console.log('OWNER-ONLY — the swarm cannot do these, and will not pretend to:');
    for (const i of owner) console.log(`  [${i.id}] ${i.title}\n        ${i.blockedBy}`);
    console.log('');
  }
  if (blocked.length) {
    console.log('BLOCKED:');
    for (const i of blocked) console.log(`  [${i.id}] ${i.title}\n        blockedBy: ${i.blockedBy}`);
    console.log('');
  }
  if (!ready.length) {
    console.log('Nothing dispatchable. Either everything is done, or every remaining item needs the owner.');
    return;
  }

  const runner = availableRunner();
  if (!runner) {
    console.log('NO RUNNER INSTALLED (opencode / claude / gemini / codex all absent).');
    console.log('Not pretending to dispatch. Emitting the assembled task instead — hand it to a');
    console.log('subagent from the orchestrator session, or install a runner for the any-model path.\n');
  } else {
    console.log(`runner: ${runner}\n`);
  }

  mkdirSync(RUNS_DIR, { recursive: true });
  for (const item of ready.slice(0, maxItems)) {
    const task = buildTask(objective, item, guardrails);
    console.log(`── [${item.id}] ${item.title}`);
    console.log(`   agent: ${item.agent}   objective: ${item.objective}   priority: ${item.priority}`);

    if (!execute) {
      console.log(`   would dispatch: node scripts/dispatch.mjs ${item.agent} "<${task.length} char task>"`);
      console.log(`   would then verify: ${item.accept}\n`);
      continue;
    }

    // No runner: write the task out rather than failing halfway through, so the orchestrator can
    // dispatch it. Acceptance still runs afterwards either way — the verification is the same.
    if (!runner) {
      const taskPath = join(RUNS_DIR, `${item.id}.task.txt`);
      writeFileSync(taskPath, task);
      console.log(`   task written -> agents/runs/${item.id}.task.txt  (dispatch via subagent: ${item.agent})`);
      console.log(`   verify after with: ${item.accept}\n`);
      continue;
    }

    // Acceptance is checked BEFORE dispatch too: if it already passes, the work is done and running
    // an agent would be pure cost. This is not hypothetical — backlog items go stale.
    const pre = runAcceptance(item);
    if (pre.pass) {
      console.log('   acceptance ALREADY passes — skipping dispatch, marking done.\n');
      item.state = 'done';
      continue;
    }

    let agentOut = '';
    try {
      agentOut = execFileSync('node', [join(root, 'scripts/dispatch.mjs'), item.agent, task],
        { cwd: root, encoding: 'utf8', timeout: 3_600_000, maxBuffer: 64 * 1024 * 1024 });
    } catch (err) {
      agentOut = `DISPATCH FAILED: ${err.message}\n${err.stdout ?? ''}${err.stderr ?? ''}`;
    }

    const post = runAcceptance(item);
    console.log(`   acceptance: ${post.ran ? (post.pass ? 'PASS' : 'FAIL') : 'not automatable'}`);
    if (post.pass) item.state = 'done';

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    writeFileSync(join(RUNS_DIR, `${item.id}-${stamp}.json`), JSON.stringify({
      item, dispatchedAt: new Date().toISOString(),
      acceptancePassed: post.pass, acceptanceOutput: post.output,
      agentOutput: agentOut.slice(-20000),
    }, null, 2));
    console.log(`   log: agents/runs/${item.id}-${stamp}.json\n`);
  }

  if (execute) {
    backlog.updatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(BACKLOG, `${JSON.stringify(backlog, null, 2)}\n`);
  }
}

main();
