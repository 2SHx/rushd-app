#!/usr/bin/env node
// scripts/discover-gapper-universe.ts — QDR-6 (G1): builds the REAL micro-cap gapper universe.
//
// Pipeline (all real, keyless-unsafe by design — this script requires ALPACA_API_KEY/SECRET):
//   1. NASDAQ common-stock-shaped universe: Alpaca /v2/assets, heuristically filtered to exclude
//      ETFs/warrants/rights/units/SPAC shells/preferreds (src/quant/data/gapperCandidates.ts).
//   2. ~150-day daily bars for that whole universe, via BATCHED Alpaca multi-symbol requests
//      (not one call per symbol) — persisted into MarketBar like any other symbol (idempotent
//      upsert, reused from the same shape as src/quant/data/ingest.ts).
//   3. Daily-bar CANDIDATE GENERATOR (src/quant/data/gapperCandidates.ts): a symbol-day is a
//      candidate if open-gap >= 3% OR (high vs prior close) range-move >= 5%, AND daily volume
//      >= the v1-iex 350k-share floor (GAPPER_ORB_V1_IEX.minCumVolume). This is a DELIBERATE
//      SUPERSET of the real strategy screen (premarket move >= 5%, v1-iex cumVolume >= 350k,
//      mcap band) — the real PIT screen re-applies at the minute-bar level in the backtest
//      (src/quant/strategies/gapperOrb.ts). A pass here only means "worth a minute-bar
//      backfill", never "this symbol-day traded the strategy."
//   4. PIT mcap gate: SEC-XBRL shares filed before the candidate day x that day's raw prior close.
//      Raw prices/volume stay consistent with unadjusted historical SEC shares. No latest
//      or current mcap prefilter may censor a historically eligible symbol-day. SEC requests are
//      transparently disk-cached + rate-limited (~9 req/s, 429/503 backoff).
//   5. Corporate-action integrity gate: all Alpaca split history exposed from a fixed 1900
//      process-date start through the run date; effective dates reject split-day/post-split
//      candidates until a newer SEC fact measurement restores unit-basis continuity.
//   6. Minute-bar backfill (src/quant/data/intraday.ts's ingestIntradayBarsForDay) — ONLY for
//      the (symbol, day) pairs that passed steps 3-5, never a bulk backfill for the universe.
//   7. SymbolSnapshot build at fixed checkpoints (src/quant/data/checkpoints.ts +
//      src/quant/data/snapshot.ts's computeAndUpsertSnapshot) for those same candidate days,
//      with per-day PIT mcap (SEC shares filed before day x that day's real raw prior close).
//
// Cost/DoS caps: --max-universe (default 6000; NASDAQ common-stock-shaped universe is ~2.7-3k)
// and --max-candidate-backfill (default 1000; only the sparse candidate set reaches steps 5-6).
//
// SHARIA: this universe is UNSCREENED (no AAOIFI data for micro-caps yet) — fine for simulated
// strategy validation; EXECUTION-blocked per DR-5 until a real screen is wired.
//
//   npx tsx scripts/discover-gapper-universe.ts [--max-universe=6000] [--max-candidate-backfill=1000]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { lookupSecMcap } from '../src/quant/data/secFundamentals';
import {
  filterCommonStockAssets,
  computeGapMetrics,
  isGapCandidate,
  isPitEligibleCandidateDay,
  isCandidateSplitSafe,
  assertSplitQueryCoversFacts,
  parsePositiveIntegerCap,
  compareCandidateDays,
  GAPPER_CANDIDATE_PARAMS_V1,
  type UniverseAsset,
  type SplitCorporateAction,
} from '../src/quant/data/gapperCandidates';
import { ingestIntradayBarsForDay } from '../src/quant/data/intraday';
import { computeAndUpsertSnapshot } from '../src/quant/data/snapshot';
import { tradingDayCheckpoints } from '../src/quant/data/checkpoints';
import { GAPPER_ORB_V1_IEX } from '../src/quant/strategies/gapperOrb';

process.loadEnvFile?.('.env');

const MARKET = 'NASDAQ' as const;
const PRESCREEN_DAYS = 120;
const DAILY_MARGIN_DAYS = 30; // extra calendar days so day 1 of the prescreen window has a real prior close
const DEFAULT_MAX_UNIVERSE = 6000; // cost/DoS cap; NASDAQ common-stock-shaped universe is ~2.7-3k
const DEFAULT_MAX_CANDIDATE_BACKFILL = 1000; // cost/DoS cap on the expensive minute-bar+snapshot stage
const DAILY_BATCH_SIZE = 100; // symbols per Alpaca multi-symbol bars request
const SEC_MIN_INTERVAL_MS = 110; // ~9 req/s, under SEC's ~10 req/s fair-use guidance
const ALPACA_MIN_INTERVAL_MS = 350; // ~2.85 req/s, under Alpaca free tier's 200 req/min
const CORPORATE_ACTION_TYPES = ['forward_split', 'reverse_split', 'unit_split'] as const;
const CORPORATE_ACTION_PROCESS_START = '1900-01-01';

const RESULTS_DIR = path.join(process.cwd(), 'results');
const CANDIDATES_PATH = path.join(RESULTS_DIR, 'gapper-candidates.json');
const SEC_CACHE_DIR = path.join(process.cwd(), '.cache', 'sec');

function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Transparent disk cache + rate limiter for SEC requests, installed as a global-fetch wrapper
 * scoped to sec.gov URLs only. This is how src/quant/data/secFundamentals.ts is reused AS-IS
 * (no modification) while still getting disk caching (instant, keyless-safe reruns) and
 * ~9 req/s pacing with 429/503 backoff — required because this script fans out SEC lookups
 * across the whole heuristic-filtered universe (thousands of symbols), unlike the existing
 * per-symbol backfill-snapshots.ts callers.
 */
function installSecFetchCache(): void {
  fs.mkdirSync(SEC_CACHE_DIR, { recursive: true });
  const realFetch = globalThis.fetch;
  let lastRequestAt = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.includes('sec.gov')) return realFetch(input, init);

    const cacheKey = crypto.createHash('sha1').update(url).digest('hex');
    const cachePath = path.join(SEC_CACHE_DIR, `${cacheKey}.json`);
    if (fs.existsSync(cachePath)) {
      return new Response(fs.readFileSync(cachePath, 'utf8'), { status: 200 });
    }

    const now = Date.now();
    const wait = Math.max(0, lastRequestAt + SEC_MIN_INTERVAL_MS - now);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();

    for (let attempt = 0; ; attempt += 1) {
      const res = await realFetch(input, init);
      if ((res.status === 429 || res.status === 503) && attempt < 5) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      if (res.ok) {
        const text = await res.text();
        fs.writeFileSync(cachePath, text);
        return new Response(text, { status: res.status, headers: res.headers });
      }
      return res;
    }
  }) as typeof fetch;
}

interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchNasdaqCommonStockUniverse(): Promise<UniverseAsset[]> {
  const key = process.env.ALPACA_API_KEY as string;
  const secret = process.env.ALPACA_API_SECRET ?? '';
  const res = await fetch('https://paper-api.alpaca.markets/v2/assets?status=active&asset_class=us_equity', {
    headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
  });
  if (!res.ok) throw new Error(`Alpaca assets request failed: HTTP ${res.status}`);
  const data = (await res.json()) as Array<{ symbol: string; name: string; exchange: string; tradable: boolean }>;
  const nasdaq: UniverseAsset[] = data
    .filter((a) => a.exchange === 'NASDAQ' && a.tradable === true)
    .map((a) => ({ symbol: a.symbol, name: a.name }));
  return filterCommonStockAssets(nasdaq);
}

async function fetchAlpacaDailyBarsBatch(symbols: string[], startDate: string): Promise<Map<string, DailyBar[]>> {
  const key = process.env.ALPACA_API_KEY as string;
  const secret = process.env.ALPACA_API_SECRET ?? '';
  const out = new Map<string, DailyBar[]>();
  for (let i = 0; i < symbols.length; i += DAILY_BATCH_SIZE) {
    const chunk = symbols.slice(i, i + DAILY_BATCH_SIZE);
    let pageToken: string | undefined;
    do {
      const url = new URL('https://data.alpaca.markets/v2/stocks/bars');
      url.searchParams.set('symbols', chunk.join(','));
      url.searchParams.set('timeframe', '1Day');
      url.searchParams.set('start', startDate);
      url.searchParams.set('limit', '10000');
      url.searchParams.set('adjustment', 'raw');
      url.searchParams.set('feed', 'iex');
      if (pageToken) url.searchParams.set('page_token', pageToken);
      const res = await fetch(url, {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`Alpaca batch daily bars failed: HTTP ${res.status} (chunk starting ${chunk[0]})`);
      const data = (await res.json()) as { bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v?: number }>>; next_page_token?: string | null };
      for (const symbol of Object.keys(data.bars ?? {})) {
        const list = out.get(symbol) ?? [];
        for (const b of data.bars![symbol]) {
          list.push({ date: b.t.split('T')[0], open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v ?? 0 });
        }
        out.set(symbol, list);
      }
      pageToken = data.next_page_token ?? undefined;
    } while (pageToken);
    await sleep(150); // gentle pacing between batch chunks
  }
  for (const list of Array.from(out.values())) list.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

function parseCorporateActionGroup(
  group: unknown,
  type: (typeof CORPORATE_ACTION_TYPES)[number],
): SplitCorporateAction[] {
  if (group === undefined) return [];
  if (!Array.isArray(group)) throw new Error(`Alpaca corporate-actions ${type} group is not an array`);
  return group.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`Alpaca ${type}[${index}] is not an object`);
    const record = value as Record<string, unknown>;
    const effectiveDate = type === 'unit_split' ? record.effective_date : record.ex_date;
    const symbols = type === 'unit_split'
      ? [record.old_symbol, record.new_symbol, record.alternate_symbol].filter(
          (symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0,
        )
      : typeof record.symbol === 'string' && record.symbol.length > 0 ? [record.symbol] : [];
    if (!isDateKey(effectiveDate) || symbols.length === 0) {
      throw new Error(`Alpaca ${type}[${index}] lacks a valid effective/ex-date or symbol`);
    }
    return { type, symbols: Array.from(new Set(symbols.map((symbol) => symbol.toUpperCase()))), effectiveDate };
  });
}

async function fetchAlpacaSplitActions(startDate: string, endDate: string): Promise<SplitCorporateAction[]> {
  const key = process.env.ALPACA_API_KEY as string;
  const secret = process.env.ALPACA_API_SECRET ?? '';
  const actions: SplitCorporateAction[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken: string | undefined;
  do {
    const url = new URL('https://data.alpaca.markets/v1/corporate-actions');
    url.searchParams.set('types', CORPORATE_ACTION_TYPES.join(','));
    url.searchParams.set('start', startDate);
    url.searchParams.set('end', endDate);
    url.searchParams.set('limit', '1000');
    if (pageToken) url.searchParams.set('page_token', pageToken);

    let res: Response | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      res = await fetch(url, {
        headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status !== 429 && res.status !== 503) break;
      await sleep(500 * (attempt + 1));
    }
    if (!res?.ok) throw new Error(`Alpaca corporate-actions request failed: HTTP ${res?.status ?? 'unknown'}`);

    const payload = await res.json() as unknown;
    if (!payload || typeof payload !== 'object') throw new Error('Alpaca corporate-actions response is not an object');
    const body = payload as Record<string, unknown>;
    if (!body.corporate_actions || typeof body.corporate_actions !== 'object') {
      throw new Error('Alpaca corporate-actions response lacks corporate_actions');
    }
    const groups = body.corporate_actions as Record<string, unknown>;
    const unexpected = Object.keys(groups).filter(
      (name) => !['forward_splits', 'reverse_splits', 'unit_splits'].includes(name),
    );
    if (unexpected.length) throw new Error(`Alpaca corporate-actions returned unexpected groups: ${unexpected.join(',')}`);
    actions.push(
      ...parseCorporateActionGroup(groups.forward_splits, 'forward_split'),
      ...parseCorporateActionGroup(groups.reverse_splits, 'reverse_split'),
      ...parseCorporateActionGroup(groups.unit_splits, 'unit_split'),
    );

    const next = body.next_page_token;
    if (next != null && typeof next !== 'string') throw new Error('Alpaca corporate-actions next_page_token is invalid');
    pageToken = next || undefined;
    if (pageToken && seenPageTokens.has(pageToken)) throw new Error('Alpaca corporate-actions repeated a page token');
    if (pageToken) seenPageTokens.add(pageToken);
    await sleep(ALPACA_MIN_INTERVAL_MS);
  } while (pageToken);

  return actions.sort(
    (a, b) =>
      a.effectiveDate.localeCompare(b.effectiveDate) ||
      a.type.localeCompare(b.type) ||
      a.symbols.join(',').localeCompare(b.symbols.join(',')),
  );
}

async function upsertDailyBars(symbol: string, bars: DailyBar[]): Promise<number> {
  if (!bars.length) return 0;
  await prisma.$transaction(
    bars.map((b) => {
      const ts = new Date(`${b.date}T00:00:00.000Z`);
      const fields = {
        open: new Prisma.Decimal(b.open),
        high: new Prisma.Decimal(b.high),
        low: new Prisma.Decimal(b.low),
        close: new Prisma.Decimal(b.close),
        volume: new Prisma.Decimal(b.volume),
        source: 'ALPACA' as const,
      };
      return prisma.marketBar.upsert({
        where: { symbol_market_interval_ts: { symbol, market: MARKET, interval: 'DAY', ts } },
        create: { symbol, market: MARKET, interval: 'DAY', ts, ...fields },
        update: fields,
      });
    }),
  );
  return bars.length;
}

interface Candidate {
  symbol: string;
  date: string;
  openGapPct: number;
  rangeMovePct: number;
  volume: number;
  mcap: number;
  sharesOutstanding: number;
  endDate: string;
  secFiledDate: string;
  mcapPrice: number;
  mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE';
  mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE';
}


interface RawCandidate {
  symbol: string;
  date: string;
  openGapPct: number;
  rangeMovePct: number;
  volume: number;
  priorClose: number;
}

async function main() {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    throw new Error('ALPACA_API_KEY/ALPACA_API_SECRET are required for real-data gapper-universe discovery');
  }
  installSecFetchCache();
  process.env.MARKET_DATA_MODE = 'live'; // explicit live-data opt-in, mirrors backfill-intraday.ts/backfill-snapshots.ts

  const maxUniverse = parsePositiveIntegerCap(arg('max-universe'), DEFAULT_MAX_UNIVERSE, 'max-universe');
  const maxCandidateBackfill = parsePositiveIntegerCap(
    arg('max-candidate-backfill'),
    DEFAULT_MAX_CANDIDATE_BACKFILL,
    'max-candidate-backfill',
  );

  console.log('=== Step 1: NASDAQ common-stock universe (Alpaca assets, heuristic-filtered) ===');
  let universe = await fetchNasdaqCommonStockUniverse();
  universe.sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (universe.length > maxUniverse) {
    console.log(`Universe ${universe.length} exceeds --max-universe=${maxUniverse}; capping (cost/DoS guard).`);
    universe = universe.slice(0, maxUniverse);
  }
  console.log(`NASDAQ common-stock-shaped universe: ${universe.length} symbols`);

  console.log(`\n=== Step 2: daily bars, ${PRESCREEN_DAYS + DAILY_MARGIN_DAYS}-day window (Alpaca batch) ===`);
  const startDate = new Date(Date.now() - (PRESCREEN_DAYS + DAILY_MARGIN_DAYS) * 86_400_000).toISOString().split('T')[0];
  const dailyBarsBySymbol = await fetchAlpacaDailyBarsBatch(universe.map((u) => u.symbol), startDate);
  let barsUpserted = 0;
  for (const entry of Array.from(dailyBarsBySymbol.entries())) {
    barsUpserted += await upsertDailyBars(entry[0], entry[1]);
  }
  console.log(`Daily bars: ${dailyBarsBySymbol.size} symbols returned real data, ${barsUpserted} MarketBar rows upserted`);

  console.log(`\n=== Step 3: daily-bar candidate prescreen (SUPERSET filter — not the real strategy screen) ===`);
  const rawCandidates: RawCandidate[] = [];
  for (const [symbol, bars] of Array.from(dailyBarsBySymbol.entries())) {
    for (let i = 1; i < bars.length; i += 1) {
      const bar = bars[i];
      const prevClose = bars[i - 1].close;
      const metrics = computeGapMetrics(bar, prevClose);
      if (!metrics) continue;
      if (isGapCandidate(metrics, bar.volume)) {
        rawCandidates.push({
          symbol,
          date: bar.date,
          openGapPct: metrics.openGapPct,
          rangeMovePct: metrics.rangeMovePct,
          volume: bar.volume,
          priorClose: prevClose,
        });
      }
    }
  }
  console.log(`Daily prescreen candidate symbol-days: ${rawCandidates.length}`);

  const mcapBand = { mcapMin: GAPPER_ORB_V1_IEX.mcapMin, mcapMax: GAPPER_ORB_V1_IEX.mcapMax };
  console.log(
    `\n=== Step 4: per-candidate-day PIT mcap gate (band $${(mcapBand.mcapMin / 1e6).toFixed(0)}M-` +
      `$${(mcapBand.mcapMax / 1e6).toFixed(0)}M) ===`,
  );
  const candidates: Candidate[] = [];
  let secChecked = 0;
  let secMissing = 0;
  for (const raw of rawCandidates) {
    const sec = await lookupSecMcap(raw.symbol, raw.date, raw.priorClose);
    secChecked += 1;
    if (!sec) {
      secMissing += 1;
      continue;
    }
    const metrics = { openGapPct: raw.openGapPct, rangeMovePct: raw.rangeMovePct };
    if (!isPitEligibleCandidateDay({ metrics, volume: raw.volume, pitMcap: sec.mcap }, mcapBand)) continue;
    candidates.push({
      symbol: raw.symbol,
      date: raw.date,
      ...metrics,
      volume: raw.volume,
      mcap: sec.mcap,
      sharesOutstanding: sec.sharesOutstanding,
      endDate: sec.endDate,
      secFiledDate: sec.filedDate,
      mcapPrice: raw.priorClose,
      mcapSource: 'SEC_XBRL_SHARES_X_PRIOR_CLOSE',
      mcapPriceSource: 'ALPACA_IEX_RAW_PRIOR_CLOSE',
    });
    if (secChecked % 250 === 0) {
      console.log(`  ... PIT mcap checked ${secChecked}/${rawCandidates.length}, ${candidates.length} in-band so far`);
    }
  }
  candidates.sort(
    (a, b) =>
      Math.max(b.openGapPct, b.rangeMovePct) - Math.max(a.openGapPct, a.rangeMovePct) || compareCandidateDays(a, b),
  );

  const earliestFactEnd = candidates.length
    ? candidates.reduce((earliest, candidate) => candidate.endDate < earliest ? candidate.endDate : earliest, candidates[0].endDate)
    : null;
  const latestCandidateDate = candidates.length
    ? candidates.reduce((latest, candidate) => candidate.date > latest ? candidate.date : latest, candidates[0].date)
    : null;
  const corporateActionProcessEnd = new Date().toISOString().slice(0, 10);
  console.log(`\n=== Step 5: fail-closed Alpaca split-integrity screen ===`);
  assertSplitQueryCoversFacts(candidates, CORPORATE_ACTION_PROCESS_START);
  const splitActions = candidates.length
    ? await fetchAlpacaSplitActions(CORPORATE_ACTION_PROCESS_START, corporateActionProcessEnd)
    : [];
  const splitPassedCandidates = candidates.filter((candidate) => isCandidateSplitSafe(candidate, splitActions));
  const splitRejectedCandidateCount = candidates.length - splitPassedCandidates.length;
  console.log(
    `Corporate actions: ${splitActions.length} parsed; ${splitRejectedCandidateCount}/${candidates.length} ` +
      'PIT candidates rejected for stale share units',
  );

  const totalDiscoveredCandidateCount = splitPassedCandidates.length;
  const forBackfill = splitPassedCandidates.slice(0, maxCandidateBackfill);
  console.log(`PIT in-band, split-safe candidate symbol-days: ${totalDiscoveredCandidateCount}; SEC data unavailable: ${secMissing}/${secChecked}`);
  console.log(`\nTop 50 by gap size (symbol, date, openGap%, rangeMove%, volume, mcap):`);
  for (const c of splitPassedCandidates.slice(0, 50)) {
    console.log(
      `  ${c.symbol}\t${c.date}\t${c.openGapPct.toFixed(2)}%\t${c.rangeMovePct.toFixed(2)}%\t` +
        `${c.volume.toLocaleString()}\t$${Math.round(c.mcap).toLocaleString()}`,
    );
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(
    CANDIDATES_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        params: GAPPER_CANDIDATE_PARAMS_V1,
        mcapBand,
        universeSize: universe.length,
        dailyPrescreenCandidateCount: rawCandidates.length,
        secMissingCandidateCount: secMissing,
        totalDiscoveredCandidateCount,
        candidateCount: forBackfill.length,
        corporateActionScreen: {
          status: candidates.length ? 'COMPLETE' : 'NOT_REQUIRED_NO_CANDIDATES',
          provider: 'ALPACA',
          endpoint: '/v1/corporate-actions',
          types: CORPORATE_ACTION_TYPES,
          queryFilterDateField: 'process_date',
          dateFields: { forward_split: 'ex_date', reverse_split: 'ex_date', unit_split: 'effective_date' },
          processDateQueryRange: {
            startDate: CORPORATE_ACTION_PROCESS_START,
            endDate: corporateActionProcessEnd,
            coverageComplete: candidates.length > 0,
            coverageBasis: 'All pages returned by Alpaca for the declared process_date range.',
          },
          effectiveDateEligibilityRange: {
            strictlyAfterFactEnd: earliestFactEnd,
            throughCandidateDate: latestCandidateDate,
            predicate: 'effectiveDate > candidate.endDate && effectiveDate <= candidate.date',
          },
          actionsFetched: splitActions.length,
          candidatesScreened: candidates.length,
          candidatesRejected: splitRejectedCandidateCount,
          candidatesPassed: splitPassedCandidates.length,
          limitation: 'Alpaca corporate-action history may be operationally delayed; unavailable, malformed, or insufficient coverage fails the run.',
        },
        shariaStatus: 'UNSCREENED_EXECUTION_BLOCKED',
        survivorshipBias: 'Alpaca active-assets endpoint omits delisted and suspended historical names.',
        candidates: forBackfill,
      },
      null,
      2,
    ),
  );
  console.log(`\nWrote ${forBackfill.length}/${totalDiscoveredCandidateCount} capped candidates to ${CANDIDATES_PATH}`);

  console.log(`\n=== Step 5: minute-bar backfill for ${forBackfill.length} candidate symbol-days only ===`);
  let minuteBarsRequested = 0;
  let minuteBarsCreated = 0;
  let minuteBarFailures = 0;
  for (const c of forBackfill) {
    try {
      const result = await ingestIntradayBarsForDay(c.symbol, MARKET, c.date);
      minuteBarsRequested += result.requested;
      minuteBarsCreated += result.created;
    } catch (err) {
      minuteBarFailures += 1;
      console.warn(`  minute-bar backfill failed for ${c.symbol} ${c.date}: ${err instanceof Error ? err.message : err}`);
    }
    await sleep(ALPACA_MIN_INTERVAL_MS);
  }
  console.log(
    `Minute bars: ${minuteBarsRequested} bars requested, ${minuteBarsCreated} new rows created, ` +
      `${minuteBarFailures} symbol-days failed`,
  );

  console.log(`\n=== Step 6: SymbolSnapshot build at fixed checkpoints for candidate symbol-days ===`);
  let snapshotsWritten = 0;
  let snapshotsNew = 0;
  let snapshotsWithMcap = 0;
  for (const c of forBackfill) {
    snapshotsWithMcap += 1;
    for (const asOf of tradingDayCheckpoints(c.date)) {
      const existing = await prisma.symbolSnapshot.findUnique({
        where: { symbol_market_asOf: { symbol: c.symbol, market: MARKET, asOf } },
      });
      const result = await computeAndUpsertSnapshot(c.symbol, MARKET, asOf, 'ALPACA', {
        priorClose: c.mcapPrice,
        mcap: c.mcap,
        mcapSource: 'FUNDAMENTALS',
      });
      if (!result) continue;
      snapshotsWritten += 1;
      if (!existing) snapshotsNew += 1;
    }
  }
  const mcapTotal = forBackfill.length;
  const mcapCoveragePct = mcapTotal > 0 ? ((snapshotsWithMcap / mcapTotal) * 100).toFixed(1) : '0.0';
  console.log(
    `Snapshots: ${snapshotsWritten} written (${snapshotsNew} new rows), ` +
      `mcap coverage ${snapshotsWithMcap}/${mcapTotal} candidate-days (${mcapCoveragePct}%)`,
  );

  console.log(`\n=== SHARIA STATUS ===`);
  console.log('Micro-cap gapper universe is UNSCREENED for Sharia compliance (no AAOIFI data yet).');
  console.log('Fine for SIMULATED strategy validation; EXECUTION-blocked per DR-5 until a real screen is wired.');
}

main()
  .catch((err) => {
    console.error(`discover-gapper-universe failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
