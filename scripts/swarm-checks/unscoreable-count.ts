// Acceptance for T-3: the compliance watchlist must be able to score the universe.
//
// An acceptance test is the load-bearing part of an autonomous backlog — if it can be satisfied
// without the work happening, the swarm marks the item done and moves on. This one counts what it
// actually cares about (names the screen cannot reach) and fails loudly if the scan itself breaks,
// because a crashed scan producing zero INSUFFICIENT lines would otherwise look like success.
import { execFileSync } from 'node:child_process';
import { nasdaqIngestRoster } from '../../src/quant/universe/ingestRoster';

const THRESHOLD = 6;
const roster = nasdaqIngestRoster();
if (roster.length < 100) { console.error(`roster collapsed to ${roster.length} — refusing to pass`); process.exit(1); }

const out = execFileSync('npx', ['tsx', 'scripts/compliance-early-warning.ts', `--symbols=${roster.join(',')}`],
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

// A run that produced no scored rows at all is a broken run, not a clean one.
const scored = (out.match(/^[A-Z][A-Z0-9.\-]*\s+\d{4}Q\d/gm) ?? []).length;
// Count only PER-SYMBOL lines. The naive /INSUFFICIENT|STALE/g matched the tool's own summary
// sentence ("N name(s) returned INSUFFICIENT or STALE"), which contains both words and silently
// added 2 to every count. The error was fail-SAFE — it made the threshold stricter than intended —
// but a grader that miscounts is a grader nobody can reason about. Found by the agent working this
// item, which correctly reported it rather than editing its own acceptance test.
const unscoreable = (out.match(/^[A-Z][A-Z0-9.\-]*\s+(INSUFFICIENT|\d{4}Q\d\s+STALE)/gm) ?? []).length;
console.log(`scored ${scored}   unscoreable ${unscoreable}   threshold <= ${THRESHOLD}`);
if (scored < 100) { console.error('fewer than 100 scored rows — the scan did not work'); process.exit(1); }
process.exit(unscoreable <= THRESHOLD ? 0 : 1);
