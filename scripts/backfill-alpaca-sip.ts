// Deep historical bar backfill from Alpaca's SIP feed, written to a compressed on-disk archive
// rather than to Postgres.
//
// WHY NOT THE DATABASE: measured on this repo's own rows, Postgres costs 382 bytes/bar including
// indexes while gzipped NDJSON costs 17.4. The 320-name survivorship panel is ~855k bars — 327MB
// in Postgres against a 500MB free tier already holding 213MB, versus ~15MB on disk. Bars are
// immutable append-only series; they are not OLTP data. This mirrors the decision already recorded
// in .github/workflows/membership-archive.yml ("this makes the DATABASE DISPOSABLE").
//
// WHY SIP: `feed=iex` (and Yahoo, the current ingest source) return nothing for delisted tickers —
// Yahoo answers "Not Found" for SIVB, TWTR, ATVI, FRC. SIP returns their complete history ending on
// the true delisting date. That difference IS the survivorship correction, and the entitlement was
// already on the account; it did not need to be bought.
//
// WHY adjustment=all: `split` alone omits dividends, which understates total return. The live
// AlpacaAdapter still uses `split` — deliberately untouched here, because changing the live quote
// path is a separate decision from building a research archive.
//
// Writes ONLY to data/bars/. Never touches Prisma. Safe to re-run: existing symbol files are
// skipped unless --force.
import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Overridable so a SECOND archive can hold UNADJUSTED prices alongside the adjusted one.
 *
 * Both are needed and they are not interchangeable. Total-return work needs `adjustment=all`.
 * MARKET CAP needs `adjustment=raw`: XBRL share counts are as-reported at the time, and multiplying
 * them by a retroactively split-adjusted price is a category error. It put Apple's 2019Q4 market cap
 * at $309B against a true ~$1.27T, and NVIDIA's at $3.6B — enough to fail a Shariah debt screen that
 * the company comfortably passed.
 */
export const BAR_ARCHIVE_DIR = process.env.BAR_ARCHIVE_DIR
  ? path.resolve(process.env.BAR_ARCHIVE_DIR)
  : path.join(process.cwd(), 'data', 'bars');
const ALPACA_BARS_URL = 'https://data.alpaca.markets/v2/stocks/bars';
/** Alpaca's per-request cap; pagination continues past it via next_page_token. */
const PAGE_LIMIT = 10_000;

export interface ArchivedBar {
  /** YYYY-MM-DD (UTC session date). */
  d: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface SymbolArchive {
  symbol: string;
  feed: string;
  adjustment: string;
  start: string;
  end: string;
  fetchedAt: string;
  bars: ArchivedBar[];
  /** Content hash over the bar series only, so a re-fetch that changes nothing is detectable. */
  seriesSha256: string;
}

function loadEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(path.join(process.cwd(), '.env'), 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

export function seriesHash(bars: readonly ArchivedBar[]): string {
  const h = createHash('sha256');
  for (const b of bars) h.update(`${b.d}|${b.o}|${b.h}|${b.l}|${b.c}|${b.v}\n`);
  return h.digest('hex');
}

export function archivePath(symbol: string): string {
  // Symbols are uppercase alphanumerics plus '.' and '-'; normalise the separators so a ticker can
  // never escape the archive directory.
  return path.join(BAR_ARCHIVE_DIR, `${symbol.replace(/[^A-Z0-9]/gi, '_').toUpperCase()}.json.gz`);
}

export function writeArchive(archive: SymbolArchive): number {
  mkdirSync(BAR_ARCHIVE_DIR, { recursive: true });
  // Stable key order + a trailing newline so re-runs produce byte-identical files and the archive
  // does not generate spurious diffs.
  const payload = JSON.stringify(archive, null, 0) + '\n';
  const gz = gzipSync(Buffer.from(payload, 'utf8'), { level: 9 });
  writeFileSync(archivePath(archive.symbol), gz);
  return gz.byteLength;
}

export function readArchive(symbol: string): SymbolArchive | null {
  const file = archivePath(symbol);
  if (!existsSync(file)) return null;
  return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as SymbolArchive;
}

export function listArchivedSymbols(): string[] {
  if (!existsSync(BAR_ARCHIVE_DIR)) return [];
  return readdirSync(BAR_ARCHIVE_DIR)
    .filter((f) => f.endsWith('.json.gz'))
    .map((f) => f.replace(/\.json\.gz$/, ''))
    .sort();
}

interface FetchOptions {
  start: string;
  end: string;
  feed: string;
  adjustment: string;
  headers: Record<string, string>;
}

/** One symbol, following pagination to exhaustion. Returns [] when the symbol has no data. */
async function fetchSymbol(symbol: string, opts: FetchOptions): Promise<ArchivedBar[]> {
  const bars: ArchivedBar[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL(`${ALPACA_BARS_URL}/../${symbol}/bars`.replace('/../', '/'));
    url.pathname = `/v2/stocks/${encodeURIComponent(symbol)}/bars`;
    url.searchParams.set('start', opts.start);
    url.searchParams.set('end', opts.end);
    url.searchParams.set('timeframe', '1Day');
    url.searchParams.set('limit', String(PAGE_LIMIT));
    url.searchParams.set('adjustment', opts.adjustment);
    url.searchParams.set('feed', opts.feed);
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const res = await fetch(url, { headers: opts.headers, signal: AbortSignal.timeout(60_000) });
    if (res.status === 429) {
      // Rate limited: Alpaca's window is per minute, so waiting it out is correct and cheap.
      await new Promise((r) => setTimeout(r, 20_000));
      continue;
    }
    if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const body = await res.json() as { bars?: any[]; next_page_token?: string | null };
    for (const b of body.bars ?? []) {
      bars.push({ d: String(b.t).slice(0, 10), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });
    }
    pageToken = body.next_page_token ?? undefined;
  } while (pageToken);
  return bars;
}

function parseArgs(argv: string[]) {
  const get = (flag: string, fallback: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  return {
    start: get('--start', '2016-01-04'),
    end: get('--end', new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)),
    feed: get('--feed', 'sip'),
    adjustment: get('--adjustment', 'all'),
    symbolsArg: get('--symbols', ''),
    // A roster of thousands cannot go on a command line; --symbols-file takes one ticker per line.
    symbolsFile: get('--symbols-file', ''),
    force: argv.includes('--force'),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
  const key = env.ALPACA_API_KEY;
  const secret = env.ALPACA_API_SECRET;
  if (!key || !secret) {
    console.error('FATAL: ALPACA_API_KEY / ALPACA_API_SECRET required.');
    process.exit(1);
  }

  let symbols: string[];
  if (args.symbolsFile) {
    symbols = readFileSync(args.symbolsFile, 'utf8').split('\n')
      .map((s) => s.trim().toUpperCase()).filter(Boolean);
  } else if (args.symbolsArg) {
    symbols = args.symbolsArg.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  } else {
    // Default: every name SPUS has EVER disclosed holding, not today's roster. Using today's
    // roster is precisely the survivorship error this archive exists to remove.
    const { loadCapturedSpusNportSnapshots } = await import('../src/quant/universe/spusNport');
    const { nasdaqIngestRoster } = await import('../src/quant/universe/ingestRoster');
    const ever = new Set<string>(nasdaqIngestRoster());
    for (const snap of loadCapturedSpusNportSnapshots() as any[]) {
      for (const h of snap.holdings ?? []) if (h.symbol) ever.add(h.symbol);
    }
    symbols = Array.from(ever).sort();
  }

  const headers = { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret };
  const opts: FetchOptions = { start: args.start, end: args.end, feed: args.feed, adjustment: args.adjustment, headers };

  console.log(`Alpaca ${args.feed.toUpperCase()} backfill -> ${BAR_ARCHIVE_DIR}`);
  console.log(`${symbols.length} symbols  ${args.start} .. ${args.end}  adjustment=${args.adjustment}\n`);

  let fetched = 0; let skipped = 0; let empty = 0; let bytes = 0; let barCount = 0;
  const failures: string[] = [];
  const startedAt = Date.now();

  for (let i = 0; i < symbols.length; i += 1) {
    const symbol = symbols[i];
    if (!args.force && existsSync(archivePath(symbol))) {
      skipped += 1;
      continue;
    }
    try {
      const bars = await fetchSymbol(symbol, opts);
      if (bars.length === 0) {
        empty += 1;
        console.log(`  ${String(i + 1).padStart(3)}/${symbols.length} ${symbol.padEnd(7)} no data`);
        continue;
      }
      const size = writeArchive({
        symbol, feed: args.feed, adjustment: args.adjustment,
        start: args.start, end: args.end, fetchedAt: new Date().toISOString(),
        bars, seriesSha256: seriesHash(bars),
      });
      fetched += 1; bytes += size; barCount += bars.length;
      console.log(
        `  ${String(i + 1).padStart(3)}/${symbols.length} ${symbol.padEnd(7)}`
        + ` ${String(bars.length).padStart(5)} bars  ${bars[0].d} -> ${bars[bars.length - 1].d}`
        + `  ${(size / 1024).toFixed(0)}KB`,
      );
    } catch (err) {
      failures.push(`${symbol}: ${err instanceof Error ? err.message : String(err)}`);
      console.log(`  ${String(i + 1).padStart(3)}/${symbols.length} ${symbol.padEnd(7)} FAILED`);
    }
  }

  const secs = (Date.now() - startedAt) / 1000;
  console.log(`\nfetched ${fetched}  skipped(existing) ${skipped}  empty ${empty}  failed ${failures.length}`);
  console.log(`${barCount.toLocaleString()} bars  ${(bytes / 1024 / 1024).toFixed(1)}MB on disk`
    + (barCount ? `  (${(bytes / barCount).toFixed(1)} bytes/bar)` : ''));
  console.log(`${secs.toFixed(0)}s elapsed`);
  if (failures.length) {
    console.log('\nfailures:');
    for (const f of failures) console.log(`  ${f}`);
  }
  // A failed symbol is a hole in the panel, and a hole in the panel silently reintroduces exactly
  // the bias this archive removes. Exit non-zero so a caller cannot treat it as success.
  process.exit(failures.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
