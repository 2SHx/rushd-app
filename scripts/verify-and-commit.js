// scripts/verify-and-commit.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE_DIR = path.resolve(__dirname, '..');
const TASK_FILE_PATH = path.resolve(WORKSPACE_DIR, '.agents/task.md') || path.resolve(WORKSPACE_DIR, 'task.md'); // checks config path first

// Fallback search paths for task.md
let taskPath = path.resolve(WORKSPACE_DIR, 'task.md');
const conversationId = "4d0c0acb-97ac-4647-97f8-c2f8a614e953";
const artifactTaskPath = `/Users/mac/.gemini/antigravity-ide/brain/${conversationId}/task.md`;

if (fs.existsSync(artifactTaskPath)) {
  taskPath = artifactTaskPath;
}

console.log('=== RUSHD Autopilot System ===');
console.log('Target Task File:', taskPath);

function runCommand(cmd) {
  console.log(`Running: ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', cwd: WORKSPACE_DIR });
    return true;
  } catch (err) {
    console.error(`Execution failed for command: ${cmd}`);
    return false;
  }
}

// 1. Sharia Compliance Guard Check
console.log('\nChecking Sharia saving sweeps constraints...');
const enginesPath = path.resolve(WORKSPACE_DIR, 'src/services/engines.ts');
if (fs.existsSync(enginesPath)) {
  const content = fs.readFileSync(enginesPath, 'utf8');
  const forbidden = /APY|interest|riba|فائدة/i;
  if (forbidden.test(content)) {
    console.error('❌ COMPLIANCE GATE VIOLATED: Disallowed riba-associated terminology found in engines.ts!');
    process.exit(1);
  }
  console.log('✅ Sharia savings engines keywords audit passed.');
}

// 2. Run Verification Checks
console.log('\nRunning codebase checks...');
const checkLint = runCommand('npm run lint');
const checkTypes = runCommand('npx tsc --noEmit');
const checkTests = runCommand('npx vitest run');

if (!checkLint || !checkTypes || !checkTests) {
  console.error('\n❌ CODE QUALITY GATE FAILED: Resolve compile, lint, or test failures before proceeding.');
  process.exit(1);
}
console.log('✅ Code quality validation passed successfully.');

// 3. Update Checklist and Commit
if (fs.existsSync(taskPath)) {
  let tasksContent = fs.readFileSync(taskPath, 'utf8');
  // Find the first uncompleted or in-progress task: e.g. - [ ] Task description or - [/] Task description
  const taskRegex = /-\s+\[([\s/])\]\s+(.+)/;
  const match = tasksContent.match(taskRegex);

  if (match) {
    const status = match[1];
    const taskDesc = match[2].trim();
    console.log(`\nFound Active Task: "${taskDesc}"`);

    // Replace the checkbox with [x]
    const updatedContent = tasksContent.replace(
      new RegExp(`-\\s+\\[[\\s/]\\]\\s+${escapeRegExp(taskDesc)}`),
      `- [x] ${taskDesc}`
    );
    fs.writeFileSync(taskPath, updatedContent, 'utf8');
    console.log(`✅ Checked off task in task.md.`);

    // Git Commit
    console.log('\nCommitting progress...');
    const staged = runCommand('git add .');
    if (staged) {
      const commitMsg = `Autopilot: completed task: ${taskDesc}`;
      const committed = runCommand(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
      if (committed) {
        console.log('\n🚀 AUTOPILOT RUN SUCCESSFUL: Code verified and committed!');
        process.exit(0);
      }
    }
  } else {
    console.log('\nAll tasks in task.md are already marked as completed [x].');
  }
} else {
  console.log('\nNo active task.md checklist found to update.');
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
