#!/usr/bin/env node
// scripts/capture-intraday-fixtures.ts — QDR-6 (G1): pulls REAL Alpaca IEX 1-minute bars for
// specific symbol/date pairs and snapshots them into src/quant/data/fixtures/intraday/*.json
// for keyless/CI determinism. Every number in the committed fixture (premarketMovePct,
// cumVolume, classification) is computed FROM THE DOWNLOADED DATA ITSELF — nothing is
// hand-typed or fabricated. Requires live ALPACA_API_KEY/SECRET (run this once, locally, with
// real keys; the committed JSON is what keeps the repo keyless-safe afterward).
//
//   npx tsx scripts/capture-intraday-fixtures.ts --symbols=GME,AAPL --dates=2024-05-13,2024-01-05
//   (symbols and dates are paired positionally; omit to use the built-in curated set)
import fs from 'node:fs';
import path from 'node:path';

process.loadEnvFile?.('.env');

const FIXTURES_DIR = path.join(__dirname, '..', 'src', 'quant', 'data', 'fixtures', 'intraday');

// Curated real event days: a mix of genuine gapper days (large real premarket moves + heavy
// real volume around well-documented market events) and ordinary control days, across 6
// distinct NASDAQ symbols. Classification is NOT asserted here — it is computed below from
// what Alpaca actually returns.
const DEFAULT_PAIRS: Array<[string, string]> = [
  ['SNDL', '2021-02-11'], // real high-volume gapper that clears the unchanged 10M-share screen
  ['GME', '2021-01-27'], // extreme move control under partial IEX volume
  ['GME', '2024-05-13'], // "Roaring Kitty" return rally — real premarket gap + volume spike
  ['SMCI', '2024-08-28'], // day after the Hindenburg/short-seller report — real gap down
  ['NVDA', '2024-05-23'], // day after Q1 FY25 earnings beat — real post-earnings gap up
  ['AAPL', '2024-01-05'], // ordinary trading day (control)
  ['AAPL', '2024-01-08'], // ordinary trading day (control)
  ['MSFT', '2024-01-05'], // ordinary trading day (control)
  ['KO', '2024-01-05'], // low-volatility consumer staple (control)
  ['GME', '2024-01-05'], // same symbol as row 1, ordinary day (control) — regime contrast
];

const SEC_CIK: Record<string, string> = {
  AAPL: '0000320193', AMC: '0001411579', GME: '0001326380', KO: '0000021344', KOSS: '0000056701',
  MSFT: '0000789019', NVDA: '0001045810', SMCI: '0001375365', SNDL: '0001766600',
};
const secFactsCache = new Map<string, Promise<any>>();

function parseArgList(flag: string): string[] | null {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (!arg) return null;
  return arg
    .slice(flag.length + 3)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildPairs(): Array<[string, string]> {
  const symbols = parseArgList('symbols');
  const dates = parseArgList('dates');
  if (!symbols || !dates) return DEFAULT_PAIRS;
  if (symbols.length !== dates.length) {
    throw new Error(`--symbols (${symbols.length}) and --dates (${dates.length}) must be the same length`);
  }
  return symbols.map((s, i) => [s, dates[i]] as [string, string]);
}

interface RawBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function fetchDayBars(symbol: string, date: string): Promise<RawBar[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) {
    throw new Error('ALPACA_API_KEY/ALPACA_API_SECRET must be set — this script only captures REAL data, never mock.');
  }
  // Wide UTC window covers both EST and EDT; filter to the requested Eastern date below.
  const start = new Date(`${date}T04:00:00.000Z`).toISOString();
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const end = new Date(`${nextDate.toISOString().slice(0, 10)}T05:00:00.000Z`).toISOString();

  const bars: RawBar[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', '1Min');
    url.searchParams.set('start', start);
    url.searchParams.set('end', end);
    url.searchParams.set('limit', '10000');
    url.searchParams.set('adjustment', 'raw');
    url.searchParams.set('feed', 'iex');
    if (pageToken) url.searchParams.set('page_token', pageToken);
    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
    });
    if (!res.ok) throw new Error(`Alpaca bars request failed for ${symbol} ${date}: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    const list = data.bars?.[symbol] ?? [];
    bars.push(...list);
    pageToken = data.next_page_token ?? undefined;
    pages += 1;
  } while (pageToken && pages < 20);

  return bars.filter((bar) => easternDateKey(new Date(bar.t)) === date);
}

async function fetchPriorClose(symbol: string, date: string): Promise<{ price: number; ts: string } | null> {
  const key = process.env.ALPACA_API_KEY!;
  const secret = process.env.ALPACA_API_SECRET!;
  const endDate = new Date(`${date}T12:00:00.000Z`);
  const startDate = new Date(endDate.getTime() - 10 * 86_400_000);
  const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
  url.searchParams.set('symbols', symbol);
  url.searchParams.set('timeframe', '1Day');
  url.searchParams.set('start', startDate.toISOString());
  url.searchParams.set('end', endDate.toISOString());
  url.searchParams.set('limit', '10');
  url.searchParams.set('adjustment', 'raw');
  url.searchParams.set('feed', 'iex');
  const res = await fetch(url, { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } });
  if (!res.ok) return null;
  const data = await res.json();
  const list = (data.bars?.[symbol] ?? []).filter((bar: RawBar) => easternDateKey(new Date(bar.t)) < date);
  const last = list[list.length - 1];
  return last ? { price: last.c, ts: new Date(last.t).toISOString() } : null;
}

async function fetchHistoricalFundamentals(symbol: string, date: string, priorClose: number | null) {
  const cik = SEC_CIK[symbol];
  if (!cik || priorClose == null) return null;
  let request = secFactsCache.get(symbol);
  if (!request) {
    request = fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' },
      signal: AbortSignal.timeout(20_000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`SEC company facts failed for ${symbol}: HTTP ${res.status}`);
      return res.json();
    });
    secFactsCache.set(symbol, request);
  }
  const data = await request;
  const facts = data.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  const eligible = facts
    .filter((fact: any) => fact.val > 0 && fact.filed <= date && fact.end <= date)
    .sort((a: any, b: any) => b.filed.localeCompare(a.filed) || b.end.localeCompare(a.end));
  const fact = eligible[0];
  if (!fact) return null;
  return {
    marketCap: fact.val * priorClose,
    sharesOutstanding: fact.val,
    asOf: new Date(`${fact.end}T00:00:00.000Z`).toISOString(),
    releasedAt: new Date(`${fact.filed}T23:59:59.999Z`).toISOString(),
    source: 'SEC_XBRL' as const,
  };
}

function sessionForIso(iso: string): 'PRE' | 'REGULAR' | 'POST' {
  const ts = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ts);
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (hh === 24) hh = 0;
  const minutesOfDay = hh * 60 + mm;
  if (minutesOfDay < 9 * 60 + 30) return 'PRE';
  if (minutesOfDay < 16 * 60) return 'REGULAR';
  return 'POST';
}

function easternDateKey(ts: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(ts);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

async function main() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const pairs = buildPairs();
  console.log(`Capturing ${pairs.length} real symbol-day fixture(s) from live Alpaca IEX data...`);

  let totalRows = 0;
  for (const [symbol, date] of pairs) {
    const [rawBars, priorCloseRecord] = await Promise.all([fetchDayBars(symbol, date), fetchPriorClose(symbol, date)]);
    const priorClose = priorCloseRecord?.price ?? null;
    const fundamentals = await fetchHistoricalFundamentals(symbol, date, priorClose);
    if (!rawBars.length) {
      console.warn(`⚠ ${symbol} ${date}: 0 bars returned (holiday/no data?) — skipping, nothing fabricated.`);
      continue;
    }

    const bars = rawBars.map((b) => ({
      ts: new Date(b.t).toISOString(), // raw provider minute-start; ingestion normalizes to bar-close PIT time
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
      session: sessionForIso(b.t),
    }));

    const preBars = bars.filter((b) => b.session === 'PRE');
    const cumVolume = bars.reduce((sum, b) => sum + b.volume, 0);
    const premarketMovePct =
      preBars.length && priorClose ? ((preBars[preBars.length - 1].close - priorClose) / priorClose) * 100 : null;
    const classification: 'gapper' | 'control' =
      premarketMovePct != null && Math.abs(premarketMovePct) >= 5 && cumVolume >= 10_000_000 ? 'gapper' : 'control';

    const fixture = {
      symbol,
      market: 'NASDAQ' as const,
      date,
      source: 'ALPACA' as const,
      capturedAt: new Date().toISOString(),
      bars,
      verification: { premarketMovePct, cumVolume, classification, priorClose, priorCloseTs: priorCloseRecord?.ts ?? null },
      fundamentals,
    };

    const file = path.join(FIXTURES_DIR, `${symbol}_${date}.json`);
    fs.writeFileSync(file, JSON.stringify(fixture, null, 2));
    totalRows += bars.length;

    const moveStr = premarketMovePct != null ? `${premarketMovePct.toFixed(2)}%` : 'n/a (no premarket bars)';
    console.log(
      `✓ ${symbol} ${date}: ${bars.length} bars (pre=${preBars.length}) → premarketMove=${moveStr}, cumVolume=${cumVolume.toLocaleString()}, classification=${classification.toUpperCase()}`,
    );
  }

  const sizeBytes = fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .reduce((sum, f) => sum + fs.statSync(path.join(FIXTURES_DIR, f)).size, 0);
  console.log(`\nDone. ${pairs.length} fixture(s), ${totalRows} total bars, ${(sizeBytes / 1024).toFixed(1)} KB on disk.`);
}

main().catch((e) => {
  const cause = e?.cause instanceof Error ? ` (${e.cause.message})` : '';
  console.error(`✗ capture failed: ${e.message}${cause}`);
  process.exit(1);
});
