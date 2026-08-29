// Does the owner's own basket beat the benchmark, and is that beat evidence of skill?
//
// WHY THIS EXISTS: the owner reports "50% and more" on AMD, GOOGL, RKLB, MU, HIMS, MRVL. That is a
// claim about position-level returns on named winners. This measures the portfolio-level number over
// a fixed window with no post-hoc selection inside the window, and then asks the only question that
// separates skill from selection: where does that basket sit in the distribution of ALL baskets the
// same size drawn from the same universe at the same time?
//
// A basket at the 99th percentile of random draws is not evidence of a repeatable process. A basket
// at the 55th percentile that the owner picked in ADVANCE would be. This script cannot observe
// "in advance" — the names were supplied today, after the outcome. It can only bound how much of
// the result is explained by the era.
//
// Reads ONLY the on-disk archive. No DB writes, no network.
import { readArchive, listArchivedSymbols, type ArchivedBar } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

/**
 * Overridable with `--symbols A,B,C`. The random-draw comparison always uses a basket of the SAME
 * SIZE as whatever is passed, because the percentile of a 6-name basket and an 8-name basket are not
 * comparable quantities — more names means lower variance means a compressed distribution.
 */
const OWNER_BASKET = (process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1]
  ?? 'AMD,GOOGL,RKLB,MU,HIMS,MRVL').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const BENCHMARKS = ['SPUS', 'QQQ', 'SPY'];
const TRADING_DAYS = 252;

type Series = Map<string, number>; // date -> close

function closes(symbol: string): Series | null {
  const a = readArchive(symbol);
  if (!a || a.bars.length === 0) return null;
  const m: Series = new Map();
  for (const b of a.bars as ArchivedBar[]) m.set(b.d, b.c);
  return m;
}

/**
 * Equal-weight, buy once at `dates[0]`, never rebalance. This is the owner's stated behaviour —
 * hold the winners — and it is also the most flattering assumption available, since it lets the
 * best name compound into a dominant weight with no turnover cost.
 *
 * A name whose series ENDS before the window does (delisting, or an acquisition) is liquidated at
 * its last observed close and held flat thereafter. Assuming zero would overstate the survivorship
 * penalty; assuming it kept compounding would understate it.
 */
function buyAndHold(symbols: string[], series: Map<string, Series>, dates: string[]): number[] {
  const shares = new Map<string, number>();
  const stranded = new Map<string, number>(); // cash from a name that stopped trading
  for (const s of symbols) {
    const p0 = series.get(s)!.get(dates[0]);
    if (!p0) return [];
    shares.set(s, (1 / symbols.length) / p0);
  }
  const nav: number[] = [];
  for (const d of dates) {
    let v = 0;
    for (const s of symbols) {
      const p = series.get(s)!.get(d);
      if (p !== undefined) v += shares.get(s)! * p;
      else if (stranded.has(s)) v += stranded.get(s)!;
      else {
        // First day missing: freeze at the last close we saw.
        const last = lastCloseBefore(series.get(s)!, d);
        const frozen = shares.get(s)! * last;
        stranded.set(s, frozen);
        v += frozen;
      }
    }
    nav.push(v);
  }
  return nav;
}

function lastCloseBefore(s: Series, d: string): number {
  let best = 0;
  for (const [k, v] of Array.from(s.entries())) if (k < d) best = v;
  return best;
}

function cagr(nav: number[], years: number): number {
  return (nav[nav.length - 1] / nav[0]) ** (1 / years) - 1;
}

function maxDrawdown(nav: number[]): number {
  let peak = nav[0];
  let mdd = 0;
  for (const v of nav) {
    if (v > peak) peak = v;
    mdd = Math.max(mdd, (peak - v) / peak);
  }
  return mdd;
}

function annualVol(nav: number[]): number {
  const r: number[] = [];
  for (let i = 1; i < nav.length; i += 1) r.push(nav[i] / nav[i - 1] - 1);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const varr = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(varr * TRADING_DAYS);
}

/** Deterministic PRNG so the percentile is reproducible from the printed seed. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  const all = listArchivedSymbols();
  const series = new Map<string, Series>();
  for (const s of all) {
    const c = closes(s);
    if (c) series.set(s, c);
  }

  // Window: the latest first-bar across the owner's names. RKLB (2020-11-24) binds it — the basket
  // as stated could not have been held before then, so measuring from 2016 would be fiction.
  const firsts = OWNER_BASKET.map((s) => {
    const c = series.get(s);
    if (!c) throw new Error(`no archive for ${s}`);
    return Array.from(c.keys())[0];
  });
  const start = firsts.reduce((a, b) => (a > b ? a : b));
  const end = Array.from(series.get('SPUS')!.keys()).reduce((a, b) => (a > b ? a : b));

  // Trading calendar from SPUS, restricted to the window; every basket is valued on the same days.
  const dates = Array.from(series.get('SPUS')!.keys()).filter((d) => d >= start && d <= end);
  const years = (new Date(end).getTime() - new Date(start).getTime()) / (365.2425 * 86_400_000);

  console.log(`WINDOW  ${start} .. ${end}   (${years.toFixed(2)} years, ${dates.length} sessions)`);
  console.log(`bound by RKLB's first trade — the basket as stated did not exist before it\n`);

  console.log('PER NAME (buy at open of window, hold)');
  for (const s of OWNER_BASKET) {
    const c = series.get(s)!;
    const p0 = c.get(dates[0]);
    const p1 = c.get(dates[dates.length - 1]) ?? lastCloseBefore(c, dates[dates.length - 1]);
    if (!p0) { console.log(`  ${s.padEnd(6)} no bar at window start`); continue; }
    const total = p1 / p0 - 1;
    console.log(`  ${s.padEnd(6)} ${(total * 100).toFixed(1).padStart(8)}% total   `
      + `${((((p1 / p0) ** (1 / years)) - 1) * 100).toFixed(2).padStart(7)}%/yr`);
  }

  const nav = buyAndHold(OWNER_BASKET, series, dates);
  console.log(`\nOWNER BASKET (equal weight, never rebalanced)`);
  console.log(`  CAGR          ${(cagr(nav, years) * 100).toFixed(2)}%/yr`);
  console.log(`  total         ${((nav[nav.length - 1] / nav[0] - 1) * 100).toFixed(1)}%`);
  console.log(`  max drawdown  ${(maxDrawdown(nav) * 100).toFixed(1)}%`);
  console.log(`  volatility    ${(annualVol(nav) * 100).toFixed(1)}%/yr`);
  console.log(`  return/vol    ${(cagr(nav, years) / annualVol(nav)).toFixed(2)}`);

  console.log(`\nBENCHMARKS, same window, same days`);
  const benchCagr = new Map<string, number>();
  for (const b of BENCHMARKS) {
    if (!series.has(b)) { console.log(`  ${b.padEnd(6)} not archived`); continue; }
    const bn = buyAndHold([b], series, dates);
    if (!bn.length) { console.log(`  ${b.padEnd(6)} no bar at window start`); continue; }
    benchCagr.set(b, cagr(bn, years));
    console.log(`  ${b.padEnd(6)} ${(cagr(bn, years) * 100).toFixed(2).padStart(7)}%/yr   `
      + `maxDD ${(maxDrawdown(bn) * 100).toFixed(1).padStart(5)}%   vol ${(annualVol(bn) * 100).toFixed(1)}%`);
  }

  // --- THE ACTUAL QUESTION ---
  // Eligible = every archived name trading on day one of the window. This INCLUDES names that later
  // delisted, so the distribution is survivorship-free; using only today's survivors would shift the
  // whole distribution up and make the owner's basket look ordinary for the wrong reason.
  const eligible = all.filter((s) => {
    if (OWNER_BASKET.includes(s) || BENCHMARKS.includes(s)) return false;
    const c = series.get(s);
    return !!c && c.get(dates[0]) !== undefined;
  });

  const seed = 20260829;
  const rnd = mulberry32(seed);
  const DRAWS = 20_000;
  const sample: number[] = [];
  for (let i = 0; i < DRAWS; i += 1) {
    const pick: string[] = [];
    const used = new Set<number>();
    while (pick.length < OWNER_BASKET.length) {
      const j = Math.floor(rnd() * eligible.length);
      if (used.has(j)) continue;
      used.add(j);
      pick.push(eligible[j]);
    }
    const n = buyAndHold(pick, series, dates);
    if (n.length) sample.push(cagr(n, years));
  }
  sample.sort((a, b) => a - b);
  const q = (p: number) => sample[Math.min(sample.length - 1, Math.floor(p * sample.length))];
  const ownerCagr = cagr(nav, years);
  const pct = sample.filter((v) => v < ownerCagr).length / sample.length;

  console.log(`\nWHERE THE BASKET SITS AMONG ALL 6-NAME BASKETS`);
  console.log(`  universe      ${eligible.length} names trading on ${dates[0]} (delisted names included)`);
  console.log(`  draws         ${DRAWS.toLocaleString()} random equal-weight baskets, seed ${seed}`);
  console.log(`  p5            ${(q(0.05) * 100).toFixed(2)}%/yr`);
  console.log(`  median        ${(q(0.50) * 100).toFixed(2)}%/yr`);
  console.log(`  p95           ${(q(0.95) * 100).toFixed(2)}%/yr`);
  console.log(`  p99           ${(q(0.99) * 100).toFixed(2)}%/yr`);
  console.log(`  OWNER BASKET  ${(ownerCagr * 100).toFixed(2)}%/yr  ->  ${(pct * 100).toFixed(1)}th percentile`);
  const beatBench = (b: string) => sample.filter((v) => v > (benchCagr.get(b) ?? Infinity)).length / sample.length;
  for (const b of BENCHMARKS) {
    if (benchCagr.has(b)) {
      console.log(`  share of RANDOM baskets that beat ${b}: ${(beatBench(b) * 100).toFixed(1)}%`);
    }
  }

  // --- What it would have meant for the actual plan ---
  // 3,000 SAR/month into the basket vs into SPUS, from a 1,000 SAR start. Contributions land on the
  // first session of each month; this is the owner's real cash-flow schedule, and DCA into a
  // high-drawdown book behaves very differently from a lump sum.
  const dcaNav = (path: number[]) => {
    let units = 1000 / path[0];
    let contributed = 1000;
    let month = dates[0].slice(0, 7);
    for (let i = 1; i < dates.length; i += 1) {
      const m = dates[i].slice(0, 7);
      if (m !== month) {
        month = m;
        units += 3000 / path[i];
        contributed += 3000;
      }
    }
    return { value: units * path[path.length - 1], contributed };
  };
  console.log(`\n3,000 SAR/MONTH FROM A 1,000 SAR START, OVER THIS WINDOW`);
  const dOwner = dcaNav(nav);
  console.log(`  contributed   ${Math.round(dOwner.contributed).toLocaleString()} SAR`);
  console.log(`  owner basket  ${Math.round(dOwner.value).toLocaleString()} SAR`);
  for (const b of BENCHMARKS) {
    if (!benchCagr.has(b)) continue;
    const d = dcaNav(buyAndHold([b], series, dates));
    console.log(`  ${b.padEnd(13)} ${Math.round(d.value).toLocaleString()} SAR`);
  }
  console.log(`\n  NOTE: gross. No zakat (2.577%/yr), no spread, no tax on the contributions.`);

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted total-return bars)',
    universe: 'every archived name trading on day one of the window — survivorship-INCLUSIVE',
    costs: 'NONE modelled — this is a gross return comparison, not a tradeable book',
  });
  // SPUS's own multi-year return is public and well outside this pipeline: it is the halal ETF this
  // program has repeatedly measured at ~17.6%/yr (see agents/objective.json). If the benchmark row
  // above does not land near that, the archive or the buy-and-hold NAV loop has drifted, and the
  // basket's percentile against it means nothing.
  anchor('SPUS CAGR over the owner-basket window', benchCagr.get('SPUS') ?? NaN, 0.176, 0.3);
}

main();
