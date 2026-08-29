// W2b — event study: do spinoffs beat the market in the 12 months after they become buyable?
//
// PRE-REGISTERED BEFORE LOOKING (parameters taken from the literature, not tuned here):
//   entry     first available close on/after MAX(10-12B filing date, first traded bar). A spinco
//             cannot be bought before it registers or before it trades, so this is the earliest
//             point-in-time-legal entry. No look-ahead is possible.
//   hold      252 trading days. Cusatis/Miles/Woolridge measure 12/24/36 months; 12 is the shortest
//             and the least favourable to the hypothesis, so it is the primary.
//   weight    equal, one position per event.
//   benchmark SPY over the IDENTICAL calendar window for each event. Not a fixed period return —
//             a spinoff in 2020 and one in 2022 faced different markets.
//   metric    excess return vs SPY, and the share of events that beat it. The MEDIAN is primary:
//             McConnell & Ovtchinnikov showed the mean is dominated by a few outliers, so a mean-only
//             result would be exactly the artefact this test is supposed to detect.
//
// FALSIFICATION, stated before the run: if the median excess return is <= 0, or the hit rate is not
// distinguishable from 50%, the spinoff premium is not present in this sample and D1 is dropped. A
// positive MEAN with a non-positive MEDIAN counts as FALSIFIED, not as support.
//
// Reads the archive and data/events/spinoffs.json. No network, no DB writes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readArchive, type ArchivedBar } from './backfill-alpaca-sip';

const HOLD_DAYS = 252;
const BENCH = 'SPY';
/** A registration whose stock never trades within a year was abandoned or restructured. */
const MAX_FILING_TO_TRADE_DAYS = 365;

interface Ev { cik: string; company: string; filed: string; ticker: string | null; exchange: string | null }

function series(symbol: string): ArchivedBar[] | null {
  const a = readArchive(symbol);
  return a?.bars?.length ? (a.bars as ArchivedBar[]) : null;
}

/** Index of the first bar on/after `date`, or -1. */
function idxOnOrAfter(bars: ArchivedBar[], date: string): number {
  for (let i = 0; i < bars.length; i += 1) if (bars[i].d >= date) return i;
  return -1;
}

function pctl(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function main() {
  const raw = JSON.parse(readFileSync(path.join(process.cwd(), 'data', 'events', 'spinoffs.json'), 'utf8'));
  const filings = raw.filings as Ev[];

  // One event per registrant, dated by its FIRST 10-12B — amendments are not new events.
  const events = new Map<string, Ev>();
  for (const f of filings.slice().sort((a, b) => (a.filed < b.filed ? -1 : 1))) {
    if (f.ticker && !events.has(f.cik)) events.set(f.cik, f);
  }

  const bench = series(BENCH);
  if (!bench) { console.error('no SPY archive'); process.exit(1); }

  interface Row {
    ticker: string; company: string; filed: string; entry: string; exchange: string;
    ret: number; benchRet: number; excess: number; days: number;
  }
  const rows: Row[] = [];
  const skipped: Record<string, number> = { noBars: 0, neverTraded: 0, tooShort: 0, staleFiling: 0 };

  for (const e of Array.from(events.values())) {
    const bars = series(e.ticker!);
    if (!bars) { skipped.noBars += 1; continue; }
    const i = idxOnOrAfter(bars, e.filed);
    if (i < 0) { skipped.neverTraded += 1; continue; }
    const entryBar = bars[i];
    const gapDays = (new Date(entryBar.d).getTime() - new Date(e.filed).getTime()) / 86_400_000;
    if (gapDays > MAX_FILING_TO_TRADE_DAYS) { skipped.staleFiling += 1; continue; }

    const j = Math.min(i + HOLD_DAYS, bars.length - 1);
    const heldDays = j - i;
    // A truncated hold is fine when the stock DELISTED (acquired, or failed) — that is a real
    // outcome and excluding it would be survivorship bias. It is not fine when the window simply
    // has not elapsed yet, which is a look-ahead-free but incomplete observation.
    const stillOpen = heldDays < HOLD_DAYS && bars[bars.length - 1].d >= '2026-08-01';
    if (stillOpen) { skipped.tooShort += 1; continue; }
    if (heldDays < 20) { skipped.tooShort += 1; continue; }

    const ret = bars[j].c / entryBar.c - 1;
    const bi = idxOnOrAfter(bench, entryBar.d);
    const bj = Math.min(bi + heldDays, bench.length - 1);
    if (bi < 0) { skipped.noBars += 1; continue; }
    const benchRet = bench[bj].c / bench[bi].c - 1;

    rows.push({
      ticker: e.ticker!, company: e.company, filed: e.filed, entry: entryBar.d,
      exchange: e.exchange ?? '?', ret, benchRet, excess: ret - benchRet, days: heldDays,
    });
  }

  const report = (label: string, set: Row[]) => {
    if (set.length < 3) { console.log(`\n${label}: only ${set.length} events — not reportable`); return; }
    const ex = set.map((r) => r.excess).sort((a, b) => a - b);
    const rr = set.map((r) => r.ret).sort((a, b) => a - b);
    const mean = ex.reduce((a, b) => a + b, 0) / ex.length;
    const hit = set.filter((r) => r.excess > 0).length / set.length;
    // Binomial SE on the hit rate under H0 = 0.5.
    const seHit = Math.sqrt(0.25 / set.length);
    const zHit = (hit - 0.5) / seHit;
    const sd = Math.sqrt(ex.reduce((a, b) => a + (b - mean) ** 2, 0) / (ex.length - 1));
    const tMean = mean / (sd / Math.sqrt(ex.length));
    console.log(`\n${label}  (n=${set.length})`);
    console.log(`  raw return    median ${(pctl(rr, 0.5) * 100).toFixed(1)}%   mean ${(rr.reduce((a, b) => a + b, 0) / rr.length * 100).toFixed(1)}%`);
    console.log(`  excess vs SPY median ${(pctl(ex, 0.5) * 100).toFixed(1)}%   mean ${(mean * 100).toFixed(1)}%   t=${tMean.toFixed(2)}`);
    console.log(`  hit rate      ${(hit * 100).toFixed(1)}%   z=${zHit.toFixed(2)} vs 50%`);
    console.log(`  excess p10 ${(pctl(ex, 0.10) * 100).toFixed(0)}%  p25 ${(pctl(ex, 0.25) * 100).toFixed(0)}%  `
      + `p75 ${(pctl(ex, 0.75) * 100).toFixed(0)}%  p90 ${(pctl(ex, 0.90) * 100).toFixed(0)}%`);
    const verdict = pctl(ex, 0.5) > 0 && Math.abs(zHit) > 1.96
      ? 'PASSES the pre-registered test'
      : pctl(ex, 0.5) <= 0 ? 'FALSIFIED — median excess <= 0'
        : 'INCONCLUSIVE — median positive but hit rate not distinguishable from chance';
    console.log(`  -> ${verdict}`);
  };

  console.log(`events with a ticker   ${events.size}`);
  console.log(`usable (priced, closed) ${rows.length}`);
  console.log(`skipped                 ${JSON.stringify(skipped)}`);

  report('ALL US SPINOFFS, 12-month hold', rows);
  report('NASDAQ ONLY (the executable subset)', rows.filter((r) => r.exchange.toUpperCase().includes('NASDAQ')));

  // The test that matters most: does the result survive removing the names I already knew about?
  const KNOWN = new Set(['SNDK']);
  report('EXCLUDING names known to me before the test (SNDK)', rows.filter((r) => !KNOWN.has(r.ticker)));

  console.log('\nBEST AND WORST 10 BY EXCESS RETURN');
  const sorted = rows.slice().sort((a, b) => b.excess - a.excess);
  for (const r of sorted.slice(0, 10)) {
    console.log(`  +${(r.excess * 100).toFixed(0).padStart(5)}%  ${r.ticker.padEnd(6)} ${r.entry}  ${r.company.slice(0, 40)}`);
  }
  console.log('  ...');
  for (const r of sorted.slice(-10)) {
    console.log(`  ${(r.excess * 100).toFixed(0).padStart(6)}%  ${r.ticker.padEnd(6)} ${r.entry}  ${r.company.slice(0, 40)}`);
  }
}

main();
