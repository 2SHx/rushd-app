// Follow-up to measure-owner-basket.ts: WHERE did the 39%/yr come from?
//
// Three diagnostics, in increasing order of how much they threaten the "stock picking" reading:
//   1. leave-one-out — does the basket survive dropping its best name, or is it one position?
//   2. theme test — would owning the WHOLE sector, with no name selection at all, have done as well?
//      If yes, the decision that mattered was "semis + AI in 2020", not which semis.
//   3. entry-timing — the window starts at RKLB's first trade, which is also near a market low.
//      Re-run from later starts to see how much of the edge is the entry date.
//
// Reads ONLY the on-disk archive. No DB writes, no network.
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

const OWNER = ['AMD', 'GOOGL', 'RKLB', 'MU', 'HIMS', 'MRVL'];
/** Every semiconductor / semi-equipment name in the archive, chosen by industry not by outcome. */
const SEMIS = ['AMD', 'MU', 'MRVL', 'NVDA', 'INTC', 'AVGO', 'QCOM', 'TXN', 'ADI', 'AMAT',
  'LRCX', 'KLAC', 'MCHP', 'NXPI', 'SWKS', 'TER', 'MPWR', 'ON', 'QRVO', 'XLNX'];

type Series = Map<string, number>;
const series = new Map<string, Series>();
for (const s of listArchivedSymbols()) {
  const a = readArchive(s);
  if (!a?.bars.length) continue;
  const m: Series = new Map();
  for (const b of a.bars as ArchivedBar[]) m.set(b.d, b.c);
  series.set(s, m);
}

function lastBefore(s: Series, d: string): number {
  let best = 0;
  for (const [k, v] of Array.from(s.entries())) if (k < d) best = v;
  return best;
}

function nav(symbols: string[], dates: string[]): number[] {
  const shares = new Map<string, number>();
  const stranded = new Map<string, number>();
  for (const s of symbols) {
    const p0 = series.get(s)?.get(dates[0]);
    if (!p0) return [];
    shares.set(s, (1 / symbols.length) / p0);
  }
  return dates.map((d) => {
    let v = 0;
    for (const s of symbols) {
      const p = series.get(s)!.get(d);
      if (p !== undefined) v += shares.get(s)! * p;
      else if (stranded.has(s)) v += stranded.get(s)!;
      else { const f = shares.get(s)! * lastBefore(series.get(s)!, d); stranded.set(s, f); v += f; }
    }
    return v;
  });
}

function cagr(n: number[], years: number): number {
  return n.length ? (n[n.length - 1] / n[0]) ** (1 / years) - 1 : NaN;
}
function mdd(n: number[]): number {
  let peak = n[0]; let m = 0;
  for (const v of n) { if (v > peak) peak = v; m = Math.max(m, (peak - v) / peak); }
  return m;
}

function windowFrom(start: string) {
  const spus = series.get('SPUS')!;
  const end = Array.from(spus.keys()).reduce((a, b) => (a > b ? a : b));
  const dates = Array.from(spus.keys()).filter((d) => d >= start && d <= end);
  const years = (new Date(end).getTime() - new Date(dates[0]).getTime()) / (365.2425 * 86_400_000);
  return { dates, years, end };
}

const BASE = '2020-11-24';
const w = windowFrom(BASE);
const baseCagr = cagr(nav(OWNER, w.dates), w.years);
const baseSpus = cagr(nav(['SPUS'], w.dates), w.years);

console.log(`base window ${w.dates[0]} .. ${w.end}  (${w.years.toFixed(2)}y)`);
console.log(`owner ${(baseCagr * 100).toFixed(2)}%/yr   SPUS ${(baseSpus * 100).toFixed(2)}%/yr\n`);

declareBasis({
  prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
  universe: 'SEMIS list is chosen by INDUSTRY membership, fixed before this file ran, not by outcome',
});
// SPUS's own return over the base window is known independently of this attribution machinery — this
// program has repeatedly measured it at ~17.6%/yr (agents/objective.json). Every diagnostic below
// (leave-one-out, theme test, entry timing) reuses the same `nav`/`cagr` primitives; if this drifts,
// none of them can be trusted either.
anchor('SPUS CAGR over the base window', baseSpus, 0.176, 0.3);

console.log('1. LEAVE-ONE-OUT — is it a basket or is it one position?');
for (const drop of OWNER) {
  const rest = OWNER.filter((s) => s !== drop);
  const c = cagr(nav(rest, w.dates), w.years);
  const flag = c < baseSpus ? '  <-- falls below SPUS' : '';
  console.log(`  without ${drop.padEnd(6)} ${(c * 100).toFixed(2).padStart(6)}%/yr  `
    + `(${((c - baseCagr) * 100).toFixed(2).padStart(6)}pp)${flag}`);
}
// Drop the two best contributors together: the harshest version of the same question.
const ranked = OWNER.map((s) => ({ s, c: cagr(nav([s], w.dates), w.years) })).sort((a, b) => b.c - a.c);
const worstCase = OWNER.filter((s) => s !== ranked[0].s && s !== ranked[1].s);
console.log(`  without ${ranked[0].s}+${ranked[1].s}  `
  + `${(cagr(nav(worstCase, w.dates), w.years) * 100).toFixed(2)}%/yr  (4 names left)`);

console.log('\n2. THEME TEST — what if you owned the whole sector, picking nothing?');
const semisAvail = SEMIS.filter((s) => series.get(s)?.get(w.dates[0]) !== undefined);
const semiNav = nav(semisAvail, w.dates);
console.log(`  all ${semisAvail.length} archived semis, equal weight`);
console.log(`  ${(cagr(semiNav, w.years) * 100).toFixed(2)}%/yr   maxDD ${(mdd(semiNav) * 100).toFixed(1)}%`);
console.log(`  missing from archive: ${SEMIS.filter((s) => !semisAvail.includes(s)).join(', ') || 'none'}`);
const ownerSemis = OWNER.filter((s) => SEMIS.includes(s));
console.log(`  owner's semis only (${ownerSemis.join(',')}): `
  + `${(cagr(nav(ownerSemis, w.dates), w.years) * 100).toFixed(2)}%/yr`);
console.log(`  -> selection WITHIN the sector added `
  + `${((cagr(nav(ownerSemis, w.dates), w.years) - cagr(semiNav, w.years)) * 100).toFixed(2)}pp/yr`);

console.log('\n3. ENTRY TIMING — how much of it is the start date?');
for (const start of ['2020-11-24', '2021-06-01', '2022-01-03', '2022-06-01', '2023-01-03', '2024-01-02', '2025-01-02']) {
  const ww = windowFrom(start);
  if (ww.dates.length < 60) continue;
  const o = cagr(nav(OWNER, ww.dates), ww.years);
  const s = cagr(nav(['SPUS'], ww.dates), ww.years);
  const n = nav(OWNER, ww.dates);
  console.log(`  from ${ww.dates[0]}  owner ${(o * 100).toFixed(2).padStart(7)}%/yr   `
    + `SPUS ${(s * 100).toFixed(2).padStart(6)}%/yr   `
    + `edge ${((o - s) * 100).toFixed(2).padStart(7)}pp   maxDD ${(mdd(n) * 100).toFixed(1).padStart(5)}%`);
}
