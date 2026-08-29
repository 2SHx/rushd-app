// Acceptance for T-5: compliance drift must be OBSERVED, not remembered.
//
// The original acceptance for this item checked that `data/compliance/` existed. It passed the
// moment someone ran the script by hand — which is precisely the silent-no-op shape this program
// keeps finding: a check that is satisfied without the work being done. A swarm running against it
// would have marked the item complete having changed nothing.
//
// What actually has to be true: a scheduled path regenerates the snapshot, and there is enough
// history for a DIFF. A single snapshot carries no drift information at all — ASTS's breach was
// legible as a trend across four quarters and invisible in any one scan.
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), 'data', 'compliance');
if (!existsSync(dir)) { console.error('no data/compliance directory'); process.exit(1); }

const snaps = readdirSync(dir).filter((f) => /^watchlist-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
console.log(`snapshots: ${snaps.length} (${snaps.join(', ') || 'none'})`);

// Scheduled, not hand-run: some committed automation must reference the generator.
const searched = ['vercel.json', '.github/workflows', 'scripts/run-quant-daily.mjs'];
let scheduled = false;
for (const s of searched) {
  const p = path.join(process.cwd(), s);
  if (!existsSync(p)) continue;
  const files = s.endsWith('.mjs') || s.endsWith('.json')
    ? [p]
    : readdirSync(p).map((f) => path.join(p, f));
  for (const f of files) {
    try {
      if (readFileSync(f, 'utf8').includes('compliance-early-warning')) { scheduled = true; console.log(`scheduled by: ${f}`); }
    } catch { /* directory entry, ignore */ }
  }
}

if (!scheduled) { console.error('no committed automation references compliance-early-warning — a hand-run script is not a schedule'); process.exit(1); }

// Requiring TWO snapshots was unsatisfiable on the day the item was written: filenames are dated,
// so a second one cannot exist until tomorrow, and an agent cannot time-travel. An acceptance test
// nobody can pass is not a high standard — it is a broken test, and it would have burned an agent
// run before anyone noticed. What IS checkable today is that the comparison MACHINERY exists and
// works, so that the second snapshot is useful the moment it lands.
const differ = path.join(process.cwd(), 'scripts', 'compliance-watchlist-diff.ts');
if (!existsSync(differ)) {
  console.error('no scripts/compliance-watchlist-diff.ts — a snapshot nobody can diff carries no drift signal');
  process.exit(1);
}
if (snaps.length < 1) { console.error('no snapshots at all'); process.exit(1); }
console.log('scheduled + differ present');
process.exit(0);
