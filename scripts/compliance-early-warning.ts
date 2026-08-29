// Compliance early-warning: which holdings are drifting toward a Shariah screen breach, and how
// many quarters of warning remain.
//
// WHY THIS EXISTS: ASTS ceased to be permissible while the owner held it, and the exit date was set
// by someone else's balance sheet. Reconstructing it showed the breach was legible four quarters
// early — debt against trailing average market cap ran 13.7%, 13.7%, 30.8%, 29.3% while debt itself
// went from $148M to $2,963M. A forced sale is a sale at a date you did not choose. The point of
// this file is to convert that into a date you do.
//
// THE MECHANISM THAT MAKES THIS NECESSARY: both standards in the owner's authority stack use a
// MARKET-CAP denominator, not total assets.
//
//   AAOIFI SS-21 (3/4)          debt / spot market cap                 < 30%
//                               (cash + interest-bearing securities)   < 30% of market cap
//   S&P Shariah / Ratings Intl  same ratios on a 36-MONTH AVERAGE cap  < 33%, receivables < 49%
//
// A market-cap denominator makes compliance PROCYCLICAL: identical leverage passes at a high price
// and fails at a low one. At beta 1.88 a bad year can push several holdings through the screen at
// once and force sales at the bottom. That correlated-forced-liquidation risk is not modelled in any
// backtest in this repo, and this tool does not model it either — it only makes it visible early.
//
// NOT AN ENFORCEMENT PATH. The frames data behind it is restated-value and fixed-lag (see
// backfill-balance-frames.ts), which is fine for "look at this name" and not fine for "sell this
// name". Enforcement stays with `evaluateShariaGate` against a live screener. Do not wire this in.
//
// Reads the local archive and frames caches. No network, no DB writes.
import { gunzipSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync as gunzip2 } from 'node:zlib';
import { existsSync } from 'node:fs';
import type { ArchivedBar, SymbolArchive } from './backfill-alpaca-sip';
import { anchor, declareBasis } from './lib/research-assertions';

/**
 * UNADJUSTED prices, read from a separate archive.
 *
 * Market capitalisation is `as-reported share count x price actually traded`. The main archive holds
 * `adjustment=all` bars, which retroactively rescale price for splits and dividends — correct for
 * total return, wrong here. Mixing the two put Apple's 2019Q4 market cap at $309B against a true
 * ~$1.27T and NVIDIA's at $3.6B, which flipped both from comfortably compliant to BREACH. A screen
 * that fails a company because of a stock split is not a screen.
 *
 * Populate with: BAR_ARCHIVE_DIR=data/bars-raw npx tsx scripts/backfill-alpaca-sip.ts \
 *   --adjustment raw --symbols <list>
 */
const RAW_DIR = path.join(process.cwd(), 'data', 'bars-raw');
function readRawArchive(symbol: string): SymbolArchive | null {
  const file = path.join(RAW_DIR, `${symbol.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}.json.gz`);
  if (!existsSync(file)) return null;
  return JSON.parse(gunzip2(readFileSync(file)).toString('utf8')) as SymbolArchive;
}

const AAOIFI_DEBT_LIMIT = 0.30;
const AAOIFI_LIQUID_LIMIT = 0.30;
const SP_DEBT_LIMIT = 0.33;
const SP_RECEIVABLES_LIMIT = 0.49;
/** Fraction of the limit at which a name becomes a WARN rather than a PASS. */
const WARN_BAND = 0.80;
const QUARTER_END: Record<string, string> = { Q1: '-03-31', Q2: '-06-30', Q3: '-09-30', Q4: '-12-31' };

type BalancePanel = Record<string, Record<string, Record<string, number>>>;

const balance: BalancePanel = JSON.parse(gunzipSync(readFileSync(
  path.join(process.cwd(), 'data', 'fundamentals', 'balance-frames.json.gz'))).toString('utf8'));
const tickerCik: Record<string, string> = JSON.parse(readFileSync(
  path.join(process.cwd(), 'data', 'fundamentals', 'ticker-cik.json'), 'utf8'));

function cikFor(symbol: string): string | null {
  const c = tickerCik[symbol.toUpperCase()];
  if (!c) return null;
  // Frames keys CIKs without leading zeros; the ticker map pads them.
  return String(Number(c));
}

interface Snap {
  quarter: string; end: string; price: number;
  shares: number; debt: number; debtSource: string; mcapSpot: number; mcapAvg36: number | null;
  aaoifiDebt: number; spDebt: number | null; liquidRatio: number | null; receivablesRatio: number | null;
}

function quartersFor(cik: string): string[] {
  return Object.keys(balance[cik] ?? {}).sort();
}

function snapshots(symbol: string): Snap[] {
  const cik = cikFor(symbol);
  if (!cik || !balance[cik]) return [];
  const arch = readRawArchive(symbol);
  if (!arch?.bars?.length) return [];
  const bars = arch.bars as ArchivedBar[];

  const closeOn = (d: string): number | null => {
    let best: number | null = null;
    for (const b of bars) { if (b.d <= d) best = b.c; else break; }
    return best;
  };
  const avg36 = (d: string): number | null => {
    const from = new Date(new Date(d).getTime() - 36 * 30.44 * 86_400_000).toISOString().slice(0, 10);
    const w = bars.filter((b) => b.d > from && b.d <= d);
    return w.length >= 60 ? w.reduce((a, b) => a + b.c, 0) / w.length : null;
  };

  const out: Snap[] = [];
  for (const q of quartersFor(cik)) {
    const row = balance[cik][q];
    const end = `${q.slice(0, 4)}${QUARTER_END[q.slice(4)]}`;
    const price = closeOn(end);
    // 36-month average is required by the S&P/Ratings-Intelligence ratios only, not by AAOIFI's
    // spot-cap ratios. A newly-listed filer (e.g. a spinoff a few months old) cannot have 3 years of
    // price history by construction — that absence is real, not a fetchable gap, so refusing to
    // score AAOIFI's spot ratios over it would be over-conservative in the same direction the
    // liabilities bound below is careful never to be. When `a36` is null the S&P ratios below become
    // NO-DATA (never a silent pass); the AAOIFI ratios still compute from what is actually known.
    const a36 = avg36(end);
    // Dimensionless cover-page counts are absent for multi-class filers (the class dimension
    // excludes them from frames), so weighted-average diluted shares is the fallback. It sums the
    // classes and measures the economic claim, which is the right denominator for a market cap.
    const shares = row.shares ?? row.sharesGaap ?? row.sharesDiluted;
    if (!price || !shares) continue;

    // Never sum a TOTAL debt concept with a CURRENT one — `LongTermDebt` already includes current
    // maturities while `LongTermDebtNoncurrent` does not.
    // ABSENT DEBT IS NOT ZERO DEBT. An earlier version summed `?? 0` across the three concepts and
    // continued whenever ANY one was present, so a filer tagging only `debtCurrent: 0` produced
    // "total debt 0" and a clean PASS on the debt screen. SanDisk came back with $0 debt and a
    // 0.0% ratio on exactly that path. In a fail-closed compliance context, folding missing evidence
    // into the passing side asserts a screen that never ran — the precise defect this repo's
    // `sharia.ts` header already warns about for the live gate.
    //
    // A total concept is used alone; only a NONCURRENT concept may be summed with a current one, and
    // then only when both are actually present.
    let debt: number | null = null;
    let debtSource = '';
    if (row.debtTotal !== undefined) { debt = row.debtTotal; debtSource = 'total'; }
    else if (row.debtNoncurrent !== undefined) {
      debt = row.debtNoncurrent + (row.debtCurrent ?? 0);
      debtSource = row.debtCurrent !== undefined ? 'noncur+cur' : 'noncur';
    } else if (row.debtCurrent !== undefined) debt = null; // current-only is not a total; refuse it

    // No debt concept at all, but a filed balance sheet. Rather than inferring zero (the
    // absent-evidence error) or refusing to score (over-conservative for genuinely debt-free
    // companies like ANET, ISRG, VRTX), bound it: interest-bearing debt cannot exceed TOTAL
    // liabilities. If that bound already clears the limit, the verdict holds however the debt
    // splits — a proof rather than an assumption. If the bound does NOT clear, we still know
    // nothing, and the name stays unscored.
    //
    // `liabilities` itself is a subtotal some filers never tag (CDNS, MNST, GRMN, EXPD, DECK tag
    // zero quarters of it, confirmed against SEC companyfacts). When absent, derive it from the
    // balance-sheet identity — `LiabilitiesAndStockholdersEquity` minus `StockholdersEquity` IS total
    // liabilities, not an estimate, because both sides are the audited figures a sheet must foot to.
    const liabilities = row.liabilities
      ?? (row.liabEquityTotal !== undefined && row.stockholdersEquity !== undefined
        ? row.liabEquityTotal - row.stockholdersEquity : undefined);
    let bounded = false;
    if (debt === null && liabilities !== undefined && row.assets !== undefined) {
      const boundRatio = liabilities / (price * shares);
      if (boundRatio < AAOIFI_DEBT_LIMIT) {
        debt = liabilities;
        debtSource = row.liabilities !== undefined ? 'liab-bound' : 'liab-bound(derived)';
        bounded = true;
      }
    }
    if (debt === null) continue;

    // An exact zero is REPORTED, not inferred, and it is the value most likely to be an artefact of
    // querying the wrong concept: a filer carrying debt under a concept outside CONCEPTS.debt* comes
    // back as 0 and passes the screen cleanly. Zero debt is genuinely common among large technology
    // companies, so this is not treated as a failure — it is surfaced, with the concept that
    // produced it, so a reader can tell "no debt" from "no coverage".
    if (debt === 0 && !bounded) debtSource += '=0?';

    const mcapSpot = price * shares;
    // Null when the 36-month window isn't available yet (see above) — the S&P/avg36 ratios below
    // become NO-DATA rather than dividing by a fabricated average.
    const mcapAvg36 = a36 !== null ? a36 * shares : null;
    out.push({
      quarter: q, end, price, shares, debt, debtSource, mcapSpot, mcapAvg36,
      aaoifiDebt: debt / mcapSpot,
      spDebt: mcapAvg36 !== null ? debt / mcapAvg36 : null,
      // SAME DEFECT AS THE DEBT FIELD, LEFT IN BY ME AND FIXED HERE. `?? 0` on an absent cash or
      // receivables fact manufactures a 0.0% ratio, which is the most comfortable possible pass on
      // a test that never ran. GEHC displayed receivables of 0.0% on exactly this path. Cash is
      // summed only when at least one component is genuinely reported; a filer reporting cash but
      // not securities is a real (if incomplete) reading, whereas neither being present is no
      // reading at all.
      liquidRatio: (row.cash === undefined && row.securities === undefined)
        ? null
        : ((row.cash ?? 0) + (row.securities ?? 0)) / mcapSpot,
      receivablesRatio: (row.receivables === undefined || mcapAvg36 === null) ? null : row.receivables / mcapAvg36,
    });
  }
  return out;
}

/** Quarters between `quarter` ('YYYYQn') and today. Staleness is a verdict, not a footnote. */
function quarterAge(quarter: string): number {
  const y = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(5));
  const now = new Date();
  const nowQ = Math.floor(now.getUTCMonth() / 3) + 1;
  return (now.getUTCFullYear() - y) * 4 + (nowQ - q);
}

function status(ratio: number | null, limit: number): 'BREACH' | 'WARN' | 'pass' | 'NO-DATA' {
  if (ratio === null || !Number.isFinite(ratio)) return 'NO-DATA';
  if (ratio >= limit) return 'BREACH';
  if (ratio >= limit * WARN_BAND) return 'WARN';
  return 'pass';
}

/**
 * Quarters until the binding ratio crosses its limit, extrapolating the trend of the last four
 * observations linearly. Deliberately crude: the value of this number is its SIGN and its rough
 * magnitude ("about a year" vs "next quarter"), not its precision. Returns null when not rising.
 */
function quartersToBreach(series: (number | null)[], limit: number): number | null {
  const w = series.slice(-4).filter((x): x is number => Number.isFinite(x));
  if (w.length < 3) return null;
  const n = w.length;
  const xm = (n - 1) / 2;
  const ym = w.reduce((a, b) => a + b, 0) / n;
  let num = 0; let den = 0;
  for (let i = 0; i < n; i += 1) { num += (i - xm) * (w[i] - ym); den += (i - xm) ** 2; }
  const slope = den ? num / den : 0;
  if (slope <= 0) return null;
  const current = w[n - 1];
  if (current >= limit) return 0;
  return (limit - current) / slope;
}

function fmtPct(v: number | null): string {
  return v !== null && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : 'n/d';
}
function fmtUsd(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}

/**
 * Machine-readable snapshot, so DRIFT is observable rather than only the current level.
 *
 * A single scan says "ORCL is at 30.7%". Two scans a quarter apart say "ORCL went from 27.1% to
 * 30.7%", which is the actual early warning — the ASTS breach was legible a year out precisely as a
 * trend, and would have looked unremarkable in any single snapshot. Writing a dated file makes the
 * comparison a diff instead of a memory.
 */
function writeSnapshot(rows: Record<string, unknown>[], outPath: string): void {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    standards: {
      aaoifi: { debtLimit: AAOIFI_DEBT_LIMIT, liquidLimit: AAOIFI_LIQUID_LIMIT, denominator: 'spot market cap' },
      sp: { debtLimit: SP_DEBT_LIMIT, receivablesLimit: SP_RECEIVABLES_LIMIT, denominator: '36-month average market cap' },
    },
    warnBand: WARN_BAND,
    basis: 'Alpaca SIP adjustment=raw prices; SEC XBRL frames (latest-reported, not as-filed)',
    enforcement: 'none — advisory only; evaluateShariaGate remains authoritative',
    rows,
  }, null, 2)}\n`);
  console.log(`\nsnapshot -> ${outPath}  (${rows.length} rows; diff against a prior run to see drift)`);
}

function main() {
  const symbols = (process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1]
    ?? 'AMD,GOOGL,RKLB,MU,HIMS,MRVL,NVDA,INOD,ASTS,SNDK,AAPL,MSFT,TSLA,MSTR')
    .split(',').map((s) => s.trim().toUpperCase());
  const detail = process.argv.find((a) => a.startsWith('--detail='))?.split('=')[1]?.toUpperCase();

  console.log('COMPLIANCE EARLY-WARNING  —  AAOIFI SS-21 (spot cap) and S&P/Ratings Intelligence (36-mo avg cap)');
  console.log(`WARN band = ${(WARN_BAND * 100).toFixed(0)}% of the limit\n`);
  console.log('symbol   qtr      mktcap   debt  src         debt/cap  debt/avg36  cash/cap  recv/av36  AAOIFI  S&P     driver');

  const insufficient: string[] = [];
  const jsonRows: Record<string, unknown>[] = [];
  for (const s of symbols) {
    const snaps = snapshots(s);
    if (!snaps.length) {
      insufficient.push(s);
      jsonRows.push({ symbol: s, verdict: 'INSUFFICIENT', reason: 'no debt+shares+price evidence' });
      console.log(`${s.padEnd(8)} ${'INSUFFICIENT'.padEnd(56)} no debt+shares+price evidence — NOT a pass`);
      continue;
    }
    const last = snaps[snaps.length - 1];
    // Staleness is itself a verdict. A name whose newest usable quarter is years old has not been
    // screened recently, and reporting its old ratio as a current status is the same error in a
    // different coat.
    const ageQ = quarterAge(last.quarter);
    if (ageQ > 3) {
      insufficient.push(s);
      jsonRows.push({ symbol: s, verdict: 'STALE', quarter: last.quarter, ageQuarters: ageQ });
      console.log(`${s.padEnd(8)} ${last.quarter}  STALE — newest usable quarter is ${ageQ} quarters old; NOT a current pass`);
      continue;
    }
    const aa = status(last.aaoifiDebt, AAOIFI_DEBT_LIMIT);
    const liq = status(last.liquidRatio, AAOIFI_LIQUID_LIMIT);
    const sp = status(last.spDebt, SP_DEBT_LIMIT);
    const rec = status(last.receivablesRatio, SP_RECEIVABLES_LIMIT);
    // Ordering matters: BREACH beats WARN beats NO-DATA beats pass. A standard is only "pass" when
    // every one of its component tests actually ran — otherwise the verdict is partial and says so.
    const roll = (...parts: ReturnType<typeof status>[]) =>
      parts.includes('BREACH') ? 'BREACH'
        : parts.includes('WARN') ? 'WARN'
          : parts.includes('NO-DATA') ? 'PARTIAL' : 'pass';
    const aaWorst = roll(aa, liq);
    const spWorst = roll(sp, rec);

    const qtb = quartersToBreach(snaps.map((x) => x.spDebt), SP_DEBT_LIMIT);
    const warn = qtb === null ? '—'
      : qtb === 0 ? 'ALREADY OVER'
        : qtb <= 8 ? `~${qtb.toFixed(1)}q to S&P limit` : '>8q';

    // WHICH ratio tripped, not merely that one did. Four different tests feed these two verdicts and
    // three of them share a column layout; without this a reader cannot tell a leverage breach from
    // a receivables one, and the remedies are completely different.
    const drivers: string[] = [];
    if (aa !== 'pass') drivers.push(`debt/cap ${aa}`);
    if (liq !== 'pass') drivers.push(`cash/cap ${liq}`);
    if (sp !== 'pass') drivers.push(`debt/avg36 ${sp}`);
    if (rec !== 'pass') drivers.push(`receivables ${rec}`);
    const driver = drivers.length ? `${drivers.join(', ')}${warn === '—' ? '' : ` | ${warn}`}` : warn;

    jsonRows.push({
      symbol: s, quarter: last.quarter, aaoifi: aaWorst, sp: spWorst,
      marketCap: last.mcapSpot, debt: last.debt, debtSource: last.debtSource,
      debtToCap: last.aaoifiDebt, debtToAvg36: last.spDebt,
      liquidRatio: last.liquidRatio, receivablesRatio: last.receivablesRatio,
      quartersToSpLimit: qtb, drivers,
    });
    console.log(`${s.padEnd(8)} ${last.quarter}  ${fmtUsd(last.mcapSpot).padStart(7)}  `
      + `${fmtUsd(last.debt).padStart(6)}  ${last.debtSource.padEnd(11)} ${fmtPct(last.aaoifiDebt).padStart(8)}  `
      + `${fmtPct(last.spDebt).padStart(10)}  ${fmtPct(last.liquidRatio).padStart(8)}  `
      + `${fmtPct(last.receivablesRatio).padStart(9)}  ${aaWorst.padEnd(6)}  ${spWorst.padEnd(6)} ${driver}`);
  }

  const outPath = process.argv.find((a) => a.startsWith('--json='))?.split('=')[1];
  if (outPath) writeSnapshot(jsonRows, outPath);

  if (insufficient.length) {
    console.log(`\n${insufficient.length} name(s) returned INSUFFICIENT or STALE: ${insufficient.join(', ')}`);
    console.log('These are NOT compliant and NOT non-compliant — they are unscreened. Under a');
    console.log('fail-closed mandate an unscreened name is not buyable, which is the same outcome as');
    console.log('a failure, and the distinction only survives if it is printed.');
  }

  // Anchors run LAST and throw, so a scale or basis error kills the report rather than decorating
  // it. Every value here is knowable without this code: these are trillion-dollar companies.
  console.log('\nANCHORS — a failure here means the run is not reportable');
  declareBasis({
    'prices': 'Alpaca SIP, adjustment=raw (UNADJUSTED — required for market cap)',
    'share counts': 'SEC XBRL dei:EntityCommonStockSharesOutstanding, as-reported',
    'balance sheet': 'SEC XBRL frames, LATEST-reported (restatements overwrite originals)',
    'enforcement': 'NONE — this is a warning tool; the live gate remains authoritative',
  });
  for (const [sym, expected] of [['AAPL', 3.5e12], ['MSFT', 3.0e12], ['NVDA', 4.0e12]] as const) {
    const snaps = snapshots(sym);
    const last = snaps[snaps.length - 1];
    anchor(`${sym} market cap`, last?.mcapSpot ?? NaN, expected, 0.6);
  }

  if (detail) {
    console.log(`\n\nTRAJECTORY — ${detail}`);
    console.log('quarter   price    shares    mktcap     debt   debt/cap  debt/avg36  cash/cap');
    for (const x of snapshots(detail).slice(-14)) {
      console.log(`${x.quarter}  ${x.price.toFixed(2).padStart(7)}  ${(x.shares / 1e6).toFixed(0).padStart(7)}M  `
        + `${fmtUsd(x.mcapSpot).padStart(8)}  ${fmtUsd(x.debt).padStart(7)}  ${fmtPct(x.aaoifiDebt).padStart(8)}  `
        + `${fmtPct(x.spDebt).padStart(10)}  ${fmtPct(x.liquidRatio).padStart(8)}`);
    }
  }
}

main();
