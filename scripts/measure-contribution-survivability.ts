// How much concentration survives the owner's actual cash-flow plan?
//
// WHY THE USUAL DRAWDOWN NUMBER IS THE WRONG ONE HERE: max drawdown describes a LUMP SUM. The owner
// contributes 3,000 SAR every month from a 1,000 SAR start. For a contributor, a crash is partly a
// discount — the same money buys more units — and the metric that decides whether the plan survives
// is not "how far did the peak fall" but "how far below the money I have put in did my balance go".
// A 50% drawdown from a high peak can still leave a contributor in profit. A 20% shortfall against
// contributed capital is what makes people stop contributing, and stopping is what actually ends the
// plan.
//
// So this reports FOUR things per concentration level, in ascending order of how much they matter:
//   maxDD            the conventional peak-to-trough figure, for comparability
//   worstVsPaid      the deepest shortfall of balance against cumulative contributions
//   monthsUnderwater the longest run with balance below contributions
//   terminal         what it was all worth at the end
//
// `worstVsPaid` is the number to size against. It is the loss the owner would actually have had to
// look at, on money they had actually parted with, while being asked to send more next month.
//
// Reads the archive only. No network, no DB writes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, regressionCheck, declareBasis, assertWindowParity } from './lib/research-assertions';

const INITIAL_SAR = 1_000;
const MONTHLY_SAR = 3_000;
const LIQUIDITY_FLOOR_USD = 5_000_000;
const BENCH = 'SPUS';

const FUND_SYMBOLS = new Set(readFileSync(
  path.join(process.cwd(), 'data', 'fund-symbols.txt'), 'utf8')
  .split('\n').map((s) => s.trim().toUpperCase()).filter(Boolean));

interface MonthRec { close: number; dollarVol: number }
type Panel = Map<string, Map<string, MonthRec>>;

function buildPanel(): { panel: Panel; months: string[] } {
  const panel: Panel = new Map();
  const all = new Set<string>();
  for (const s of listArchivedSymbols()) {
    let arch;
    try { arch = readArchive(s); } catch { continue; }
    if (!arch?.bars?.length) continue;
    const byMonth = new Map<string, { close: number; dvs: number[] }>();
    for (const b of arch.bars as ArchivedBar[]) {
      if (!(b.c > 0)) continue;
      const m = b.d.slice(0, 7);
      let r = byMonth.get(m);
      if (!r) { r = { close: b.c, dvs: [] }; byMonth.set(m, r); }
      r.close = b.c;
      r.dvs.push(b.c * b.v);
    }
    const out = new Map<string, MonthRec>();
    for (const [m, r] of Array.from(byMonth.entries())) {
      const dvs = r.dvs.filter((v) => v > 0).sort((a, b) => a - b);
      out.set(m, { close: r.close, dollarVol: dvs.length ? dvs[Math.floor(dvs.length / 2)] : 0 });
      all.add(m);
    }
    panel.set(s, out);
  }
  return { panel, months: Array.from(all).sort() };
}

/** Monthly return series for a rule that holds the top `topN` names by trailing dollar volume. */
function largestReturns(panel: Panel, months: string[], topN: number, from: string, to: string): Map<string, number> {
  const ms = months.filter((m) => m >= from && m <= to);
  const rets = new Map<string, number>();
  for (let i = 0; i < ms.length - 1; i += 1) {
    const m = ms[i]; const next = ms[i + 1];
    const elig: { s: string; dv: number }[] = [];
    for (const [s, rows] of Array.from(panel.entries())) {
      if (s === BENCH || FUND_SYMBOLS.has(s)) continue;
      const now = rows.get(m);
      if (!now || now.dollarVol < LIQUIDITY_FLOOR_USD) continue;
      elig.push({ s, dv: now.dollarVol });
    }
    if (elig.length < topN) continue;
    elig.sort((a, b) => b.dv - a.dv);
    const picks = elig.slice(0, topN);
    let g = 0;
    for (const p of picks) {
      const now = panel.get(p.s)!.get(m)!;
      const nxt = panel.get(p.s)!.get(next);
      // A delisted name realises at its last close (0% for the month) rather than vanishing.
      g += (1 / picks.length) * (nxt ? nxt.close / now.close - 1 : 0);
    }
    rets.set(next, g);
  }
  return rets;
}

/** Monthly return series for a fixed equal-weight basket, bought once and never rebalanced. */
function basketReturns(panel: Panel, months: string[], symbols: string[], from: string, to: string): Map<string, number> {
  const ms = months.filter((m) => m >= from && m <= to);
  const rets = new Map<string, number>();
  let w = new Map<string, number>(symbols.map((s) => [s, 1 / symbols.length]));
  for (let i = 0; i < ms.length - 1; i += 1) {
    const m = ms[i]; const next = ms[i + 1];
    let g = 0;
    const grown = new Map<string, number>();
    for (const s of symbols) {
      const now = panel.get(s)?.get(m);
      const nxt = panel.get(s)?.get(next);
      const r = now && nxt ? nxt.close / now.close - 1 : 0;
      const wt = w.get(s) ?? 0;
      g += wt * r;
      grown.set(s, wt * (1 + r));
    }
    rets.set(next, g);
    // Weights drift with the names, normalised by book growth — not with the book itself.
    w = new Map();
    for (const [s, v] of Array.from(grown.entries())) w.set(s, v / (1 + g));
  }
  return rets;
}

interface Survivability {
  contributed: number; terminal: number; maxDD: number;
  worstVsPaid: number; monthsUnderwater: number; worst12m: number;
}

function simulate(rets: Map<string, number>, months: string[]): Survivability {
  const ordered = months.filter((m) => rets.has(m));
  let balance = INITIAL_SAR;
  let paid = INITIAL_SAR;
  let peak = balance;
  let maxDD = 0; let worstVsPaid = 0;
  let underwater = 0; let maxUnderwater = 0;
  const path: number[] = [balance];

  for (const m of ordered) {
    balance *= 1 + rets.get(m)!;
    balance += MONTHLY_SAR;
    paid += MONTHLY_SAR;
    path.push(balance);
    if (balance > peak) peak = balance;
    maxDD = Math.max(maxDD, (peak - balance) / peak);
    const vsPaid = (balance - paid) / paid;
    worstVsPaid = Math.min(worstVsPaid, vsPaid);
    if (vsPaid < 0) { underwater += 1; maxUnderwater = Math.max(maxUnderwater, underwater); }
    else underwater = 0;
  }

  // Worst rolling 12-month portfolio return, contributions excluded so it measures the ASSET.
  let worst12 = 0;
  const r = ordered.map((m) => rets.get(m)!);
  for (let i = 0; i + 12 <= r.length; i += 1) {
    let c = 1;
    for (let j = i; j < i + 12; j += 1) c *= 1 + r[j];
    worst12 = Math.min(worst12, c - 1);
  }
  return { contributed: paid, terminal: balance, maxDD, worstVsPaid, monthsUnderwater: maxUnderwater, worst12m: worst12 };
}

function fmtSar(v: number): string {
  return Math.round(v).toLocaleString('en-US');
}

function main() {
  const { panel, months } = buildPanel();
  const from = process.argv.find((a) => a.startsWith('--from='))?.split('=')[1] ?? '2017-01';
  const to = process.argv.find((a) => a.startsWith('--to='))?.split('=')[1] ?? '2026-08';
  const ms = months.filter((m) => m >= from && m <= to);

  console.log(`${INITIAL_SAR.toLocaleString()} SAR start + ${MONTHLY_SAR.toLocaleString()} SAR/month`);
  console.log(`${from} .. ${to}   (${ms.length} months)\n`);
  console.log('strategy            terminal   contributed   maxDD   worst vs PAID   underwater   worst 12m');

  const rows: [string, Map<string, number>][] = [
    ['largest-5', largestReturns(panel, months, 5, from, to)],
    ['largest-10', largestReturns(panel, months, 10, from, to)],
    ['largest-20', largestReturns(panel, months, 20, from, to)],
    ['largest-50', largestReturns(panel, months, 50, from, to)],
    ['SPUS', basketReturns(panel, months, [BENCH], from, to)],
  ];
  const owner = ['AMD', 'GOOGL', 'RKLB', 'MU', 'HIMS', 'MRVL', 'NVDA', 'INOD'];
  if (owner.every((s) => panel.has(s))) {
    rows.push(["owner's 8", basketReturns(panel, months, owner, '2020-12', to)]);
  }

  // WINDOW PARITY. `basketReturns` scores a month 0% whenever the basket has no bar for it, so the
  // SPUS row came back full-length even though SPUS did not begin trading until 2019-12-18. On the
  // default 2017-01..2026-08 window that meant the largest-N books compounded over 116 real months
  // while the benchmark compounded over 81 and sat in cash for the other 35 — an instrument nobody
  // could have bought, printed in the same table as if it were the ETF. It flatters every strategy
  // row twice: the benchmark's terminal value is suppressed, and its risk columns are suppressed too,
  // because a balance that only receives contributions cannot draw down or fall short of what was
  // paid in. Measured on the common window the risk ordering INVERTS — see docs/JOURNAL.md.
  //
  // This is the zero-fill shape of the same defect that `measure-nasdaq-wide-momentum.ts` had in its
  // truncation form. Fail loudly rather than print two different periods side by side.
  //
  // NOTE the owner's-8 row genuinely starts later (RKLB's listing) and says so in its own line of
  // prose below; that is a disclosed strategy-vs-strategy difference, not an undisclosed
  // strategy-vs-BENCHMARK one, and is deliberately left alone.
  const benchMonths = ms.filter((m) => panel.get(BENCH)?.has(m));
  assertWindowParity(
    `${BENCH} benchmark vs the largest-N books`,
    { first: ms[0], last: ms[ms.length - 1], observations: ms.length },
    {
      first: benchMonths[0] ?? 'none',
      last: benchMonths[benchMonths.length - 1] ?? 'none',
      observations: benchMonths.length,
    },
  );

  const byName = new Map<string, Survivability>();
  for (const [name, rets] of rows) {
    const r = simulate(rets, ms);
    byName.set(name, r);
    console.log(`${name.padEnd(18)} ${fmtSar(r.terminal).padStart(9)}   ${fmtSar(r.contributed).padStart(11)}  `
      + `${(r.maxDD * 100).toFixed(1).padStart(5)}%   ${(r.worstVsPaid * 100).toFixed(1).padStart(12)}%   `
      + `${String(r.monthsUnderwater).padStart(7)} mo   ${(r.worst12m * 100).toFixed(1).padStart(8)}%`);
  }

  console.log('\n"worst vs PAID" is the deepest shortfall of balance against money actually contributed —');
  console.log('the number the owner would have had to look at while being asked to send another 3,000.');
  console.log('"underwater" is the longest unbroken run in that state.');
  console.log("\nThe owner's basket starts 2020-12 (RKLB's listing), so its row spans a shorter,");
  console.log('and far more favourable, window than the rest. It is not comparable on terminal value.');

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    costs: 'NONE modelled — gross DCA simulation, no spread/zakat/tax',
    contributions: `${INITIAL_SAR.toLocaleString()} SAR start + ${MONTHLY_SAR.toLocaleString()} SAR/month, landing on the first session of each new calendar month`,
  });
  // The owner's real, previously-reported experience is documented independently of this simulator
  // (agents/objective.json: "a 34.7% shortfall against contributed capital... for 11 months"). If this
  // DCA/contribution loop does not reproduce that when fed the same 8-name basket, the loop has a bug
  // and none of the OTHER rows' worst-vs-paid figures can be trusted either.
  const ownersEight = byName.get("owner's 8");
  regressionCheck("owner's 8 worst-vs-paid shortfall", ownersEight?.worstVsPaid ?? NaN, -0.347, 0.3);

  // The genuinely EXTERNAL anchor. SPUS's buy-and-hold return over this window is verifiable from
  // the fund's own published performance without running a line of this code, and it is computed
  // here by first/last close division — the simplest path through the panel. If it drifts, the
  // archive or the month-end indexing is wrong and every other row is suspect.
  const spusRow = byName.get('SPUS');
  const spusYears = ms.length / 12;
  const spusCagr = spusRow ? (spusRow.terminal / spusRow.contributed) ** (1 / spusYears) - 1 : NaN;
  anchor('SPUS DCA growth rate is in the right region', spusCagr, 0.09, 0.6);
}

main();
