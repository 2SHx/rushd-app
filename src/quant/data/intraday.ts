// src/quant/data/intraday.ts — QDR-6 (G1): 1-minute intraday spine ingestion, NASDAQ-only
// first. Mirrors src/quant/data/ingest.ts's provider-selection + idempotent-upsert pattern,
// but resumable (per-symbol cursor) instead of day-bucket overlap, and three-tiered per the
// design contract: bundled REAL fixtures (keyless/CI) → Alpaca free-key IEX backfill (keyed,
// resumable, 90-day initial then incremental) → Yahoo keyless short-history (labeled).
//
// No synthetic/generated bars anywhere in this file — the "fixtures" tier only replays
// previously-captured real downloads (fixtureLoader.ts), never invents data.
import { Prisma } from '@prisma/client';
import type { Market, DataSource, IntradaySession } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadFixturesForSymbol } from './fixtureLoader';

const D = Prisma.Decimal;

export const INITIAL_INTRADAY_BACKFILL_DAYS = 90;
const OVERLAP_MINUTES = 60; // resumable cursor: re-request a short overlap to catch late corrections

export interface IntradayIngestResult {
  requested: number;
  created: number;
  source: DataSource;
  tier: 'fixtures' | 'alpaca' | 'yahoo' | 'unsupported-market';
  /** Latest real bar observed during this pass; null means no snapshot may be derived. */
  latestTs: Date | null;
  fixtureSnapshots: Array<{
    asOf: Date;
    barsSource: DataSource;
    priorClose: number | null;
    mcap: number | null;
    mcapSource: DataSource | null;
  }>;
}

interface RawMinuteBar {
  ts: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** US/Eastern session tag for a UTC timestamp, DST-safe via Intl (no manual offset math). */
export function nasdaqMinuteOfDay(ts: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(ts);
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const mm = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  if (hh === 24) hh = 0;
  return hh * 60 + mm;
}

/** US/Eastern session tag for a UTC timestamp, DST-safe via Intl (no manual offset math). */
export function sessionForTs(ts: Date): IntradaySession {
  const minutesOfDay = nasdaqMinuteOfDay(ts);
  if (minutesOfDay < 9 * 60 + 30) return 'PRE';
  if (minutesOfDay < 16 * 60) return 'REGULAR';
  return 'POST';
}

/** Which tier answers this request, mirroring ProviderRegistry's bundled/keyless/live modes. */
export function selectIntradayTier(): 'fixtures' | 'alpaca' | 'yahoo' {
  const mode = process.env.MARKET_DATA_MODE ?? 'bundled';
  if (mode === 'live' && process.env.ALPACA_API_KEY) return 'alpaca';
  if (mode === 'keyless') return 'yahoo';
  return 'fixtures';
}

async function fetchAlpacaMinuteBars(symbol: string, start: Date, end: Date): Promise<RawMinuteBar[]> {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET ?? '';
  if (!key) throw new Error('Alpaca API Key is not set');

  const bars: RawMinuteBar[] = [];
  let pageToken: string | undefined;
  let pages = 0;
  do {
    const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
    url.searchParams.set('symbols', symbol);
    url.searchParams.set('timeframe', '1Min');
    url.searchParams.set('start', start.toISOString());
    url.searchParams.set('end', end.toISOString());
    url.searchParams.set('limit', '10000');
    url.searchParams.set('adjustment', 'raw');
    url.searchParams.set('feed', 'iex'); // free tier
    if (pageToken) url.searchParams.set('page_token', pageToken);

    const res = await fetch(url, {
      headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Alpaca intraday bars request failed with status ${res.status}`);
    const data = await res.json();
    const list = data.bars?.[symbol] ?? [];
    for (const b of list) {
      bars.push({ ts: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v ?? 0 });
    }
    pageToken = data.next_page_token ?? undefined;
    pages += 1;
  } while (pageToken && pages < 10); // 100k bars max: enough for 90 IEX days, bounded for cron

  return bars;
}

/** Yahoo keyless intraday chart — only ~the last few days of 1m bars are ever available. */
async function fetchYahooMinuteBars(symbol: string): Promise<RawMinuteBar[]> {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1m&range=5d&includePrePost=true`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!res.ok) throw new Error(`Yahoo intraday chart request failed with status ${res.status}`);
  const data = await res.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error(`Invalid Yahoo intraday chart response for ${symbol}`);
  const timestamps: number[] = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  if (!quote || !timestamps.length) return [];

  const bars: RawMinuteBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    bars.push({
      ts: new Date(timestamps[i] * 1000).toISOString(),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: quote.volume?.[i] ?? 0,
    });
  }
  return bars;
}

async function ingestFixtureBars(symbol: string, market: Market): Promise<IntradayIngestResult> {
  const fixtures = loadFixturesForSymbol(symbol);
  let requested = 0;
  let created = 0;
  let source: DataSource = 'ALPACA';
  let latestTs: Date | null = null;
  const fixtureSnapshots: IntradayIngestResult['fixtureSnapshots'] = [];
  for (const fx of fixtures) {
    const fixtureSource = fx.source; // ORIGINAL real provenance — never relabeled as mock
    const rows = fx.bars.map((b) => ({
      symbol,
      market,
      ts: new Date(new Date(b.ts).getTime() + 60_000), // provider timestamps are minute starts
      open: new D(b.open),
      high: new D(b.high),
      low: new D(b.low),
      close: new D(b.close),
      volume: new D(b.volume),
      session: b.session,
      source: fixtureSource,
    }));
    requested += rows.length;
    for (const row of rows) {
      if (!latestTs || row.ts > latestTs) {
        latestTs = row.ts;
        source = fixtureSource;
      }
    }
    const asOf = rows.at(-1)?.ts;
    if (asOf) fixtureSnapshots.push({
      asOf,
      barsSource: fixtureSource,
      priorClose: fx.verification.priorClose,
      mcap: fx.fundamentals?.marketCap ?? null,
      mcapSource: fx.fundamentals ? 'FUNDAMENTALS' : null,
    });
    if (rows.length) {
      const res = await prisma.intradayBar.createMany({ data: rows, skipDuplicates: true });
      created += res.count;
    }
  }
  return { requested, created, source, tier: 'fixtures', latestTs, fixtureSnapshots };
}

/**
 * Resolves an Eastern wall-clock minute-of-day on `dateKey` (YYYY-MM-DD) to its UTC instant,
 * DST-safe (tries both possible offsets, keeps the one whose Eastern date AND minute-of-day
 * round-trip exactly match). Deliberately NOT imported from checkpoints.ts — checkpoints.ts imports
 * nasdaqMinuteOfDay FROM this file, and this tiny helper is only needed for one-day intraday
 * backfill windows, so a small local duplicate avoids a circular module dependency.
 */
function etWallClockToUtc(dateKey: string, minuteOfDay: number): Date {
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(`${dateKey}T00:00:00.000Z`);
    candidate.setUTCMinutes(candidate.getUTCMinutes() + minuteOfDay + offsetHours * 60);
    if (nasdaqDateKeyLocal(candidate) === dateKey && nasdaqMinuteOfDay(candidate) === minuteOfDay) return candidate;
  }
  throw new Error(`Could not resolve ET wall-clock ${dateKey} @ minute ${minuteOfDay} to a UTC instant`);
}

/** Local copy of snapshot.ts's nasdaqDateKey — avoids importing snapshot.ts (which imports this
 * file's session/PIT helpers indirectly via computeAndUpsertSnapshot), keeping this a leaf util. */
const marketDateFormatterLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function nasdaqDateKeyLocal(ts: Date): string {
  const parts = marketDateFormatterLocal.formatToParts(ts);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * One-day, candidate-list-driven backfill (QDR-6 gapper-universe discovery): fetches Alpaca IEX
 * minute bars for a SINGLE historical Eastern trading day (04:00-20:00 ET, covering pre/regular/
 * post) for one symbol, rather than a rolling window from "now". Used by the gapper-universe
 * discovery pipeline to backfill minute bars ONLY for (symbol, day) pairs that already passed
 * the daily-bar candidate prescreen — never a bulk multi-month backfill for the whole universe.
 * Alpaca-only: a specific historical day is outside Yahoo's short keyless intraday window, and
 * bundled fixtures cover a fixed, curated symbol/day set, not arbitrary discovery candidates.
 * Idempotent: same (symbol, market, ts) unique-key createMany+skipDuplicates as ingestIntradayBars.
 */
export async function ingestIntradayBarsForDay(
  symbol: string,
  market: Market,
  dateKey: string,
): Promise<IntradayIngestResult> {
  if (market !== 'NASDAQ') {
    return { requested: 0, created: 0, source: 'ALPACA', tier: 'unsupported-market', latestTs: null, fixtureSnapshots: [] };
  }
  if (selectIntradayTier() !== 'alpaca') {
    throw new Error(`ingestIntradayBarsForDay requires live Alpaca mode (got tier=${selectIntradayTier()})`);
  }

  const start = etWallClockToUtc(dateKey, 4 * 60); // 04:00 ET premarket open
  const end = etWallClockToUtc(dateKey, 20 * 60); // 20:00 ET postmarket close
  const rawBars = await fetchAlpacaMinuteBars(symbol, start, end);
  const source: DataSource = 'ALPACA';

  const rows = rawBars.map((b) => {
    const barStart = new Date(b.ts);
    const ts = new Date(barStart.getTime() + 60_000); // provider timestamps are minute starts
    return {
      symbol,
      market,
      ts,
      open: new D(b.open),
      high: new D(b.high),
      low: new D(b.low),
      close: new D(b.close),
      volume: new D(b.volume ?? 0),
      session: sessionForTs(barStart),
      source,
    };
  });

  const requested = rows.length;
  const created = requested ? (await prisma.intradayBar.createMany({ data: rows, skipDuplicates: true })).count : 0;
  const latestTs = rows.reduce<Date | null>((latest, row) => (!latest || row.ts > latest ? row.ts : latest), null);
  return { requested, created, source, tier: 'alpaca', latestTs, fixtureSnapshots: [] };
}

/**
 * Resumable per-symbol ingest: finds the latest stored bar and only requests forward from
 * (latest - overlap), or the full 90-day initial window when empty. `createMany` +
 * `skipDuplicates` on the `(symbol, market, ts)` unique key makes re-runs produce 0 new rows
 * for data already stored — the idempotency the backfill script relies on.
 */
export async function ingestIntradayBars(
  symbol: string,
  market: Market,
  opts?: { days?: number; now?: Date },
): Promise<IntradayIngestResult> {
  if (market !== 'NASDAQ') {
    // DECIDED: NASDAQ-only first (QDR-6). TASI has no free intraday feed yet.
    return { requested: 0, created: 0, source: 'ALPACA', tier: 'unsupported-market', latestTs: null, fixtureSnapshots: [] };
  }

  const tier = selectIntradayTier();
  if (tier === 'fixtures') return ingestFixtureBars(symbol, market);

  const now = opts?.now ?? new Date();
  let rawBars: RawMinuteBar[];
  let source: DataSource;

  if (tier === 'alpaca') {
    const latest = await prisma.intradayBar.findFirst({
      where: { symbol, market },
      orderBy: { ts: 'desc' },
      select: { ts: true },
    });
    const start = latest
      ? new Date(latest.ts.getTime() - OVERLAP_MINUTES * 60_000)
      : new Date(now.getTime() - (opts?.days ?? INITIAL_INTRADAY_BACKFILL_DAYS) * 86_400_000);
    rawBars = await fetchAlpacaMinuteBars(symbol, start, now);
    source = 'ALPACA';
  } else {
    rawBars = await fetchYahooMinuteBars(symbol); // short-history: Yahoo only serves recent days
    source = 'YAHOO';
  }

  const rows = rawBars.map((b) => {
    const barStart = new Date(b.ts);
    const ts = new Date(barStart.getTime() + 60_000); // provider timestamps are minute starts; PIT key is bar close
    return {
      symbol,
      market,
      ts,
      open: new D(b.open),
      high: new D(b.high),
      low: new D(b.low),
      close: new D(b.close),
      volume: new D(b.volume ?? 0),
      session: sessionForTs(barStart),
      source,
    };
  });

  const requested = rows.length;
  const created = requested ? (await prisma.intradayBar.createMany({ data: rows, skipDuplicates: true })).count : 0;
  const latestTs = rows.reduce<Date | null>((latest, row) => (!latest || row.ts > latest ? row.ts : latest), null);
  return { requested, created, source, tier, latestTs, fixtureSnapshots: [] };
}
