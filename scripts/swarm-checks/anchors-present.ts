// Acceptance for T-4/T-9: every measurement script must carry a REAL external anchor.
//
// The original acceptance for T-4 was `grep -L 'research-assertions'` — it checked that the module
// was IMPORTED. An import is not a check. A script could import the helpers and call nothing, and
// that acceptance passed. This is the identical defect T-5 had (a directory existing "proved" the
// watchlist was scheduled), which is worth noticing: acceptance tests drift toward what is easy to
// grep for rather than what is true.
//
// A regressionCheck() does NOT satisfy this. It compares the pipeline to a number the pipeline made
// earlier, so a systematic error reproduces and passes. Every one of the three wrong results this
// program published was consistently wrong across runs.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'scripts');
const files = readdirSync(dir).filter((f) => /^measure-.*\.ts$/.test(f));
if (files.length < 10) { console.error(`only ${files.length} measure scripts found — refusing to pass`); process.exit(1); }

const missing: string[] = [];
for (const f of files) {
  const body = readFileSync(path.join(dir, f), 'utf8')
    .split('\n')
    // Strip imports and comment lines so a mention in prose never counts as a call.
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l) && !/^import\s/.test(l))
    .join('\n');
  // `anchor(` but not `regressionCheck(` — the latter is a different, weaker guarantee.
  const hasAnchor = /(?<!regression)\banchor\s*\(/.test(body);
  if (!hasAnchor) missing.push(f);
}

console.log(`${files.length} measurement scripts; ${files.length - missing.length} carry an external anchor`);
if (missing.length) {
  console.error(`NO EXTERNAL ANCHOR: ${missing.join(', ')}`);
  console.error('A regressionCheck() does not count — it cannot tell you the number was ever right.');
  process.exit(1);
}
process.exit(0);
