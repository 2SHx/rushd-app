// Compliance watchlist DIFF: what changed between two dated scans from
// scripts/compliance-early-warning.ts, not just where things stand today.
//
// WHY THIS EXISTS: the owner held ASTS through a compliance flip. Reconstructing it after the fact
// showed debt/avg-cap ran 13.7%, 13.7%, 30.8%, 29.3% across four consecutive quarters while the
// position was held — every one of those numbers looks unremarkable in isolation (13.7% clears every
// limit in this repo's authority stack with room to spare), and the breach was only legible as the
// TREND across scans. A snapshot nobody can diff carries none of that signal, however often it is
// regenerated. See agents/objective.json OBJ-3 and compliance-early-warning.ts's own header.
//
// ADVISORY ONLY — same posture as the generator it reads. This file makes NO network calls, NO DB
// writes, and must NEVER be wired into `evaluateShariaGate`: the frames data behind these ratios is
// restated-value with an approximated filing date (see backfill-balance-frames.ts), which is fine
// for "look at this name" and not fine for "sell this name". Enforcement stays with the live
// screener. This tool only tells a reader where to look next.
//
// Usage:
//   npx tsx scripts/compliance-watchlist-diff.ts                          # two most recent snapshots
//   npx tsx scripts/compliance-watchlist-diff.ts <fromFile> <toFile>      # explicit pair (bare
//                                                                         # filename or full path)
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'data', 'compliance');

interface Row {
  symbol: string;
  verdict?: string; // 'INSUFFICIENT' | 'STALE' — absent on a scored row
  aaoifi?: string;  // 'BREACH' | 'WARN' | 'PARTIAL' | 'pass'
  sp?: string;
  debtToCap?: number | null;
  debtToAvg36?: number | null;
  liquidRatio?: number | null;
  receivablesRatio?: number | null;
}
interface Snapshot {
  generatedAt: string;
  standards: {
    aaoifi: { debtLimit: number; liquidLimit: number };
    sp: { debtLimit: number; receivablesLimit: number };
  };
  warnBand: number;
  rows: Row[];
}

function twoMostRecent(): [string, string] {
  if (!existsSync(DIR)) {
    throw new Error(`no ${DIR} — run \`compliance-early-warning.ts --json=...\` at least twice first`);
  }
  const files = readdirSync(DIR).filter((f) => /^watchlist-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length < 2) {
    throw new Error(
      `only ${files.length} snapshot(s) in ${DIR} (${files.join(', ') || 'none'}) — need at least `
      + 'two to diff. One scan is a level; two scans are a signal.',
    );
  }
  return [files[files.length - 2], files[files.length - 1]];
}

function resolve(file: string): string {
  if (existsSync(file)) return file;
  const joined = path.join(DIR, file);
  if (existsSync(joined)) return joined;
  throw new Error(`snapshot not found: ${file}`);
}

function load(file: string): Snapshot {
  return JSON.parse(readFileSync(resolve(file), 'utf8')) as Snapshot;
}

function verdictOf(r: Row): string {
  return r.verdict ?? `AAOIFI:${r.aaoifi ?? '?'} S&P:${r.sp ?? '?'}`;
}

function fmtPct(v: number | null | undefined): string {
  return v !== null && v !== undefined && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/d';
}

const RATIO_FIELDS: { key: keyof Row; label: string; limit: (s: Snapshot) => number }[] = [
  { key: 'debtToCap', label: 'AAOIFI debt/spot-cap', limit: (s) => s.standards.aaoifi.debtLimit },
  { key: 'debtToAvg36', label: 'S&P debt/avg36-cap', limit: (s) => s.standards.sp.debtLimit },
  { key: 'liquidRatio', label: 'AAOIFI cash+sec/cap', limit: (s) => s.standards.aaoifi.liquidLimit },
  { key: 'receivablesRatio', label: 'S&P receivables/avg36', limit: (s) => s.standards.sp.receivablesLimit },
];

function main(): void {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const [fromFile, toFile] = positional.length >= 2 ? [positional[0], positional[1]] : twoMostRecent();

  const from = load(fromFile);
  const to = load(toFile);

  console.log('COMPLIANCE WATCHLIST DIFF  —  ADVISORY ONLY, never wired into evaluateShariaGate');
  console.log(`  from: ${fromFile}  (generated ${from.generatedAt})`);
  console.log(`  to:   ${toFile}  (generated ${to.generatedAt})\n`);

  const fromRows = new Map(from.rows.map((r) => [r.symbol, r]));
  const toRows = new Map(to.rows.map((r) => [r.symbol, r]));
  const symbols = Array.from(new Set(Array.from(fromRows.keys()).concat(Array.from(toRows.keys())))).sort();

  let changed = 0;
  for (const symbol of symbols) {
    const a = fromRows.get(symbol);
    const b = toRows.get(symbol);
    if (!a) { console.log(`+ ${symbol.padEnd(8)} newly tracked — ${verdictOf(b as Row)}`); changed += 1; continue; }
    if (!b) { console.log(`- ${symbol.padEnd(8)} dropped from the watchlist (was ${verdictOf(a)})`); changed += 1; continue; }

    const lines: string[] = [];
    const va = verdictOf(a);
    const vb = verdictOf(b);
    if (va !== vb) lines.push(`verdict  ${va}  ->  ${vb}`);

    for (const f of RATIO_FIELDS) {
      const av = a[f.key] as number | null | undefined;
      const bv = b[f.key] as number | null | undefined;
      if (av == null || bv == null || !Number.isFinite(av) || !Number.isFinite(bv)) continue;
      if (bv <= av) continue; // only ratios that WORSENED (moved toward the limit) are drift signal
      const limit = f.limit(to);
      const warnAt = limit * to.warnBand;
      const newlyWarn = av < warnAt && bv >= warnAt ? '  <-- NEWLY within warn band' : '';
      lines.push(`${f.label.padEnd(24)} ${fmtPct(av)} -> ${fmtPct(bv)}  (limit ${fmtPct(limit)})${newlyWarn}`);
    }

    if (lines.length) {
      console.log(`~ ${symbol.padEnd(8)} ${lines[0]}`);
      for (const l of lines.slice(1)) console.log(`  ${' '.repeat(8)} ${l}`);
      changed += 1;
    }
  }

  console.log(changed
    ? `\n${changed} name(s) changed between scans — worth a look, not an automatic action.`
    : '\nNo verdict or ratio moved between these two scans.');
}

main();
