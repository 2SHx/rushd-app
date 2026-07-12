// scripts/backtest.ts — QDR-6 user-runnable validation CLI.
//   npm run backtest -- --setup <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--symbols GME,SNDL]
//                       [--candidates=path.json] [--seed 42] [--feed fixtures-real|alpaca-iex]
//
// Runs a cataloged StrategySetup against stored historical minute bars with ZERO LLM calls,
// prints the QDR-6 report card, writes results/<setup>-<from>-<to>.json, and persists a
// BacktestRun (seed + gitSha) for reproducibility. Reads ONLY real fixtures / IntradayBar rows —
// no synthetic bars anywhere. Exits nonzero on any look-ahead detection.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { Prisma } from '@prisma/client';
import { STRATEGY_SETUP_CATALOG } from '../src/quant/strategies/catalog';
import { GAPPER_ORB_V1_IEX } from '../src/quant/strategies/gapperOrb';
import {
  buildStocksInPlayBook, STOCKS_IN_PLAY_UNIVERSE_V1,
  stocksInPlayPrehistoryStart,
  type SourcedDailyRow, type SourcedMinuteRow, type StocksInPlayAggregate,
} from '../src/quant/strategies/stocksInPlayOrb';
import { NASDAQ_HALAL_UNIVERSE } from '../src/quant/strategies/bollingerMrLong';
import type { StrategySetup } from '../src/quant/strategies/types';
import { loadAllFixtures } from '../src/quant/data/fixtureLoader';
import { nasdaqDateKey } from '../src/quant/data/snapshot';
import {
  parseCandidateArtifact,
  type ParsedCandidateArtifact,
  type SnapshotArtifactCandidate,
} from '../src/quant/data/gapperCandidates';
import { LookaheadError } from '../src/quant/data/pointInTime';
import {
  simulateIntraday, DEFAULT_INTRADAY_LIMITS,
  type DayContext, type IntradayBarInput, type TradeRecord,
} from '../src/quant/backtest/intradayEngine';
import {
  simulateSetupDaily, filterRealDailyBars, DEFAULT_BT_LIMITS,
  type BacktestBar, type DailyBarInput,
} from '../src/quant/backtest/engine';
import { computeMetrics, type EquityPoint } from '../src/quant/backtest/metrics';
import { summarizeDailyReturns, toDailyReturns, toIndependentPeriodReturns } from '../src/quant/backtest/distribution';
import { bootstrapTradeOutcomes, signFlipPermutationTest, kellySizedDecision } from '../src/quant/backtest/monteCarlo';
import { assembleReportCard, renderReportCard, type DataFeed, type ShariaValidationState } from '../src/quant/backtest/reportCard';

const D = Prisma.Decimal;

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const equalsAt = argv[i].indexOf('=');
      if (equalsAt > 2) {
        out[argv[i].slice(2, equalsAt)] = argv[i].slice(equalsAt + 1);
        continue;
      }
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      out[key] = val;
    }
  }
  return out;
}

function gitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

/** Strict candidate runs are reproducible only from a clean tracked/untracked, non-ignored tree. */
export function assertCandidateWorktreeClean(porcelainStatus: string): void {
  if (porcelainStatus.trim()) {
    throw new Error('Candidate-scoped backtest requires a clean Git worktree; commit or remove all non-ignored changes first');
  }
}

/** Candidate evidence is reproducible only with a valid deterministic seed and real OOS split. */
export function assertCandidateValidationConfig(seed: number, oosFraction: number): void {
  if (!Number.isSafeInteger(seed) || seed < 0) {
    throw new Error('--seed must be a finite non-negative safe integer for candidate-scoped backtests');
  }
  if (!Number.isFinite(oosFraction) || oosFraction <= 0 || oosFraction >= 1) {
    throw new Error('--oos must be finite and strictly between 0 and 1 for candidate-scoped backtests');
  }
}

function assertCurrentCandidateWorktreeClean(): void {
  const status = execSync('git status --porcelain=v1 --untracked-files=all', { encoding: 'utf-8' });
  assertCandidateWorktreeClean(status);
}

/** A trade-sequenced curve has one initial point; only transitions fully inside the slice count. */
export function transitionCountInsideSlice(pointCount: number, sliceStart: number): number {
  return Math.max(0, pointCount - Math.max(0, sliceStart) - 1);
}

interface SymbolSeries {
  symbol: string;
  bars: IntradayBarInput[];
  dayContext: Map<string, DayContext>;
}

/** Fail closed even when a mocked or faulty DB ignores the execution query predicates. */
export function assertAlpacaNasdaqExecutionRows(rows: readonly { market: string; source: string }[]): void {
  if (rows.some((row) => row.market !== 'NASDAQ' || row.source !== 'ALPACA')) {
    throw new Error('Intraday DB execution rows must be NASDAQ/ALPACA only');
  }
}

/** Exact report-card state routing; noncandidate legacy setups retain their prior default. */
export function shariaStateForSetup(
  setupId: string,
  candidateState?: ShariaValidationState,
): ShariaValidationState {
  return candidateState ?? (setupId === 'stocks-in-play-orb' ? 'UNSCREENED_EXECUTION_BLOCKED' : 'UNVERIFIED');
}

interface CandidateArtifactEvidence {
  inputPath: string;
  absolutePath: string;
  relativePath: string;
  sha256Digest: string;
  candidateCount: number;
  symbolCount: number;
  generatedAt: string | null;
  corporateActionScreen: Record<string, unknown> | null;
  shariaStatus: ParsedCandidateArtifact['shariaStatus'];
}

export function backtestResultFilename(
  setup: string,
  from: string,
  to: string,
  candidateDigest?: string,
): string {
  const suffix = candidateDigest ? `-${candidateDigest.slice(0, 16)}` : '';
  return `${setup}-${from}-${to}${suffix}.json`;
}

function loadCandidateArtifactFile(inputPath: string): {
  artifact: ParsedCandidateArtifact;
  evidence: CandidateArtifactEvidence;
} {
  const absolutePath = path.resolve(inputPath);
  const bytes = fs.readFileSync(absolutePath);
  const artifact = parseCandidateArtifact(JSON.parse(bytes.toString('utf8')), {
    requireCompletedCorporateActionScreen: true,
  });
  return {
    artifact,
    evidence: {
      inputPath,
      absolutePath,
      relativePath: path.relative(process.cwd(), absolutePath) || '.',
      sha256Digest: crypto.createHash('sha256').update(bytes).digest('hex'),
      candidateCount: artifact.candidates.length,
      symbolCount: new Set(artifact.candidates.map((candidate) => candidate.symbol)).size,
      generatedAt: artifact.generatedAt,
      corporateActionScreen: artifact.corporateActionScreen,
      shariaStatus: artifact.shariaStatus,
    },
  };
}

/** Split chronological bars into per-NASDAQ-trading-day chunks (preserving order). */
function groupBarsByDay(bars: IntradayBarInput[]): IntradayBarInput[][] {
  const byDay = new Map<string, IntradayBarInput[]>();
  for (const b of bars) {
    const key = nasdaqDateKey(b.ts);
    const arr = byDay.get(key) ?? [];
    arr.push(b);
    byDay.set(key, arr);
  }
  return Array.from(byDay.values());
}

/** Distinct symbols with IntradayBar rows in [from,to] (optionally filtered by --symbols). */
async function listDbSymbols(want: string[] | null, from: string, to: string): Promise<string[]> {
  const { prisma } = await import('../src/lib/prisma');
  const distinct = await prisma.intradayBar.findMany({
    where: {
      symbol: want ? { in: want } : undefined,
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    distinct: ['symbol'], select: { symbol: true }, orderBy: { symbol: 'asc' },
  });
  return distinct.map((d) => d.symbol);
}

/**
 * DB source (`--source db`): loads ONE symbol's REAL IntradayBar spine (Alpaca IEX) with per-day
 * priorClose from the DAY MarketBar spine and mcap from the SEC-XBRL-backed SymbolSnapshot.
 * Called per symbol so only one symbol's minute bars are ever resident (memory-bounded; the
 * previous whole-range load OOM-killed the run). Reads only; never fabricates a bar. DAY bars are
 * stored at 00:00 UTC labeled with their trading date, so their UTC calendar date equals the
 * Eastern trading date used by intraday nasdaqDateKey — that alignment lands priorClose correctly.
 */
export async function loadDbSymbol(symbol: string, from: string, to: string): Promise<SymbolSeries> {
  const { prisma } = await import('../src/lib/prisma');
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const ibars = await prisma.intradayBar.findMany({
    where: { symbol, market: 'NASDAQ', source: 'ALPACA', ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
  });
  assertAlpacaNasdaqExecutionRows(ibars);
  const bars: IntradayBarInput[] = ibars.map((b) => ({
    ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume,
    session: b.session, source: b.source,
  }));
  const dayRows = await prisma.marketBar.findMany({
    where: { symbol, market: 'NASDAQ', interval: 'DAY' }, orderBy: { ts: 'asc' },
    select: { ts: true, close: true },
  });
  const priorByDay = new Map<string, number>();
  for (let i = 1; i < dayRows.length; i++) {
    priorByDay.set(dayRows[i].ts.toISOString().slice(0, 10), Number(dayRows[i - 1].close));
  }
  const snaps = await prisma.symbolSnapshot.findMany({
    where: { symbol, mcap: { not: null } }, select: { asOf: true, mcap: true, mcapSource: true },
    orderBy: { asOf: 'asc' },
  });
  const mcapByDay = new Map<string, { mcap: number; src: DayContext['mcapSource'] }>();
  for (const s of snaps) mcapByDay.set(nasdaqDateKey(s.asOf), { mcap: Number(s.mcap), src: s.mcapSource });
  const dayContext = new Map<string, DayContext>();
  for (const key of Array.from(new Set(bars.map((b) => nasdaqDateKey(b.ts))))) {
    const mc = mcapByDay.get(key);
    dayContext.set(key, { priorClose: priorByDay.get(key) ?? null, mcap: mc?.mcap ?? null, mcapSource: mc?.src ?? null });
  }
  return { symbol, bars, dayContext };
}

/** Candidate mode: artifact pairs and PIT facts are authoritative; unrelated DB days are dropped. */
export async function loadDbCandidateSymbol(
  symbol: string,
  candidates: readonly SnapshotArtifactCandidate[],
): Promise<SymbolSeries> {
  if (!candidates.length || candidates.some((candidate) => candidate.symbol !== symbol)) {
    throw new Error(`Candidate artifact has no consistent entries for ${symbol}`);
  }
  const { prisma } = await import('../src/lib/prisma');
  const dates = new Set(candidates.map((candidate) => candidate.date));
  const orderedDates = Array.from(dates).sort();
  // NASDAQ POST bars can land after 00:00 UTC on the following calendar day. Query a safe
  // timezone margin, then make nasdaqDateKey + the artifact set the authoritative filter.
  const queryStart = new Date(`${orderedDates[0]}T00:00:00.000Z`);
  queryStart.setUTCHours(queryStart.getUTCHours() - 12);
  const queryEnd = new Date(`${orderedDates.at(-1)!}T00:00:00.000Z`);
  queryEnd.setUTCHours(queryEnd.getUTCHours() + 36);
  const rows = await prisma.intradayBar.findMany({
    where: {
      symbol,
      market: 'NASDAQ',
      source: 'ALPACA',
      ts: {
        gte: queryStart,
        lte: queryEnd,
      },
    },
    orderBy: { ts: 'asc' },
  });
  const selected = rows.filter((bar) => dates.has(nasdaqDateKey(bar.ts)));
  if (selected.some((bar) => bar.market !== 'NASDAQ' || bar.source !== 'ALPACA')) {
    throw new Error(`Non-NASDAQ/Alpaca bar leaked into candidate series for ${symbol}`);
  }
  const foundDates = new Set(selected.map((bar) => nasdaqDateKey(bar.ts)));
  const missing = orderedDates.filter((date) => !foundDates.has(date));
  if (missing.length) {
    throw new Error(`Candidate pair(s) have no minute bars: ${missing.map((date) => `${symbol} ${date}`).join(', ')}`);
  }

  const bars: IntradayBarInput[] = selected.map((bar) => ({
    ts: bar.ts,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
    session: bar.session,
    source: bar.source,
  }));
  const dayContext = new Map<string, DayContext>();
  for (const candidate of candidates) {
    dayContext.set(candidate.date, {
      priorClose: candidate.mcapPrice,
      mcap: candidate.mcap,
      mcapSource: 'FUNDAMENTALS',
    });
  }
  return { symbol, bars, dayContext };
}

/** Fixtures source: builds all (small) per-symbol series up-front from committed real fixtures. */
function buildFixtureSeries(want: string[] | null, from: string, to: string): SymbolSeries[] {
  const fixtures = loadAllFixtures().filter((f) => {
    if (want && !want.includes(f.symbol)) return false;
    return f.date >= from && f.date <= to;
  });
  const fxSymbols = Array.from(new Set(fixtures.map((f) => f.symbol))).sort();
  return fxSymbols.map((symbol) => {
    const symFixtures = fixtures.filter((f) => f.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date));
    const bars: IntradayBarInput[] = [];
    const dayContext = new Map<string, DayContext>();
    for (const fx of symFixtures) {
      for (const b of fx.bars) {
        bars.push({
          ts: new Date(new Date(b.ts).getTime() + 60_000), // minute-start → bar-close (DB convention)
          open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume, session: b.session,
          source: fx.source,
        });
      }
      const key = nasdaqDateKey(new Date(new Date(fx.bars.at(-1)!.ts).getTime() + 60_000));
      dayContext.set(key, {
        priorClose: fx.verification.priorClose,
        mcap: fx.fundamentals?.marketCap ?? null,
        mcapSource: fx.fundamentals ? 'FUNDAMENTALS' : null,
      });
    }
    bars.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    return { symbol, bars, dayContext };
  });
}

/**
 * DAILY source: real MarketBar spine (interval=DAY, market=NASDAQ) for one symbol. Loads ALL
 * rows (incl. MOCK) then hands them through `filterRealDailyBars`, so the excluded-MOCK count is
 * observed and asserted in-path (user no-mock directive). Returns {} when the symbol has no real
 * daily bars.
 */
async function loadDailySymbol(
  symbol: string, from: string, to: string,
): Promise<{ bars: BacktestBar[]; excludedMock: number }> {
  const { prisma } = await import('../src/lib/prisma');
  const rows = await prisma.marketBar.findMany({
    where: {
      symbol, market: 'NASDAQ', interval: 'DAY',
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    orderBy: { ts: 'asc' },
  });
  const withSource: DailyBarInput[] = rows.map((r) => ({
    ts: r.ts, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume, source: r.source,
  }));
  const { real, excludedMock } = filterRealDailyBars(withSource);
  // Assertion (no-mock guard): no MOCK bar may reach the simulator.
  if (real.some((b) => b.source === 'MOCK')) throw new Error(`MOCK bar leaked into ${symbol} daily series`);
  const bars: BacktestBar[] = real.map((b) => ({ ts: b.ts, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  return { bars, excludedMock };
}

/** Distinct NASDAQ-halal symbols with REAL daily bars in [from,to] (MOCK excluded at source). */
async function listDailySymbols(want: string[] | null, from: string, to: string): Promise<string[]> {
  const { prisma } = await import('../src/lib/prisma');
  const universe = want ?? [...NASDAQ_HALAL_UNIVERSE];
  const distinct = await prisma.marketBar.findMany({
    where: {
      symbol: { in: universe }, market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] },
      ts: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T23:59:59.999Z`) },
    },
    distinct: ['symbol'], select: { symbol: true }, orderBy: { symbol: 'asc' },
  });
  return distinct.map((d) => d.symbol);
}

/** Read only the bounded OR prehistory plus daily liquidity facts; return compact aggregates. */
export async function loadStocksInPlayReferenceBook(from: string, to: string) {
  const { prisma } = await import('../src/lib/prisma');
  const fromDate = stocksInPlayPrehistoryStart(from);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const symbols = [...STOCKS_IN_PLAY_UNIVERSE_V1];
  const book = new Map<string, StocksInPlayAggregate[]>();
  let excludedNonAlpacaMinute = 0;
  let excludedUnsupportedDaily = 0;
  // Bound peak memory to one symbol's raw bars; only compact aggregates survive each iteration.
  for (const symbol of symbols) {
    const [minuteRows, dailyRows] = await Promise.all([
      prisma.intradayBar.findMany({
        where: { symbol, market: 'NASDAQ', source: 'ALPACA', ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
        select: { symbol: true, market: true, ts: true, open: true, high: true, low: true, close: true, volume: true, session: true, source: true },
      }),
      prisma.marketBar.findMany({
        where: { symbol, market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] }, ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
        select: { symbol: true, ts: true, high: true, low: true, close: true, volume: true, source: true },
      }),
    ]);
    assertAlpacaNasdaqExecutionRows(minuteRows);
    const built = buildStocksInPlayBook(
      minuteRows.map((r): SourcedMinuteRow => ({ symbol: r.symbol, ts: r.ts, open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume), session: r.session, source: r.source })),
      dailyRows.map((r): SourcedDailyRow => ({ symbol: r.symbol, ts: r.ts, high: Number(r.high), low: Number(r.low), close: Number(r.close), volume: Number(r.volume), source: r.source })),
    );
    if (dailyRows.some((row) => row.source !== 'YAHOO' && row.source !== 'ALPACA')) {
      throw new Error(`Stocks-in-play daily liquidity rows must be YAHOO/ALPACA only (${symbol})`);
    }
    const aggregate = built.book.get(symbol);
    if (aggregate) book.set(symbol, aggregate);
    excludedNonAlpacaMinute += built.excludedNonAlpacaMinute;
    excludedUnsupportedDaily += built.excludedUnsupportedDaily;
  }
  return { book, excludedNonAlpacaMinute, excludedUnsupportedDaily };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const setupId = args.setup;
  const from = args.from;
  const to = args.to;
  const seed = Number(args.seed ?? '42');
  const oosFraction = Number(args.oos ?? '0.3');

  if (!setupId || !from || !to) {
    console.error('usage: npm run backtest -- --setup <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--symbols A,B] [--candidates=path.json] [--seed N]');
    process.exit(2);
  }
  const setup = (STRATEGY_SETUP_CATALOG as Record<string, StrategySetup<unknown>>)[setupId] as
    | StrategySetup<unknown>
    | undefined;
  if (!setup) {
    console.error(`unknown setup "${setupId}". known: ${Object.keys(STRATEGY_SETUP_CATALOG).join(', ')}`);
    process.exit(2);
  }

  const wantSymbols = args.symbols ? args.symbols.split(',').map((s) => s.trim()) : null;
  const startingCash = new D(100_000);
  // stocks-in-play-orb validates on the REAL Alpaca-IEX minute spine (DB), not the small committed
  // fixture set — so it defaults to --source db unless overridden.
  const source = (args.source ?? (setupId === 'stocks-in-play-orb' ? 'db' : 'fixtures')) as 'fixtures' | 'db';

  const cadence = setup.cadence;
  const feed = (args.feed ?? (cadence === 'daily' ? 'yahoo-daily' : (args.candidates || source === 'db') ? 'alpaca-iex' : 'fixtures-real')) as DataFeed;

  // Versioned-config selection (QDR-6): gapper-orb on the IEX feed uses the MEASURED v1-iex
  // calibration (minCumVolume rescaled from the consolidated tape); every other case keeps v1.
  const params = setupId === 'gapper-orb' && feed === 'alpaca-iex' ? GAPPER_ORB_V1_IEX : undefined;

  let candidateArtifact: ParsedCandidateArtifact | null = null;
  let candidateEvidence: CandidateArtifactEvidence | null = null;
  if (args.candidates) {
    if (source !== 'db' || cadence !== 'intraday') {
      throw new Error('--candidates is valid only for intraday --source db backtests');
    }
    if (feed !== 'alpaca-iex') throw new Error('--candidates requires --feed alpaca-iex');
    if (wantSymbols) throw new Error('--symbols cannot be combined with --candidates; the artifact is the exact universe');
    assertCandidateValidationConfig(seed, oosFraction);
    assertCurrentCandidateWorktreeClean();
    const loaded = loadCandidateArtifactFile(args.candidates);
    candidateArtifact = loaded.artifact;
    candidateEvidence = loaded.evidence;
    const outsideRange = candidateArtifact.candidates.find((candidate) => candidate.date < from || candidate.date > to);
    if (outsideRange) {
      throw new Error(`Candidate ${outsideRange.symbol} ${outsideRange.date} is outside --from/--to; the artifact cannot be partially simulated`);
    }
  }

  const pooledTradeReturns: number[] = [];
  const pooledTradeRecords: TradeRecord[] = [];
  const pooledDailyReturns: number[] = [];
  let lastPrice = 0;
  let symbols: string[] = [];
  let excludedMock = 0;

  try {
    if (cadence === 'daily') {
      // ── DAILY path: real MarketBar spine, one symbol streamed at a time, positions held across
      // days by the setup engine. MOCK rows are excluded at load and the count is asserted+printed.
      symbols = await listDailySymbols(wantSymbols, from, to);
      // Cross-name preload (pairs/cross-sectional setups): hand the setup every symbol's REAL daily
      // closes once, before the per-symbol loop, so a setup whose ctx is single-symbol (the engine
      // is single-symbol) can still reason across names. MOCK is already excluded by loadDailySymbol;
      // the setup PIT-filters ≤ asOf on read. Single-name setups omit prepareUniverse (no-op here).
      if (setup.prepareUniverse) {
        const closesBySymbol = new Map<string, { ts: Date; close: number }[]>();
        for (const s of symbols) {
          const { bars: sb } = await loadDailySymbol(s, from, to);
          closesBySymbol.set(s, sb.map((b) => ({ ts: b.ts, close: Number(b.close) })));
        }
        setup.prepareUniverse({ symbols, closesBySymbol });
        console.log(`prepared cross-name book for ${closesBySymbol.size} symbol(s) [pairs/cross-sectional]`);
      }
      console.log(`\nprocessing ${symbols.length} symbol(s) [source=daily MarketBar, YAHOO/ALPACA only] …`);
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        const t0 = Date.now();
        process.stdout.write(`  [${i + 1}/${symbols.length}] ${symbol} … `);
        const { bars, excludedMock: dropped } = await loadDailySymbol(symbol, from, to);
        excludedMock += dropped;
        if (bars.length) lastPrice = Number(bars.at(-1)!.close);
        const sim = simulateSetupDaily({ setup, params, symbol, market: 'NASDAQ', bars, startingCash, limits: DEFAULT_BT_LIMITS });
        pooledTradeReturns.push(...sim.tradeReturns);
        pooledTradeRecords.push(...sim.tradeRecords);
        pooledDailyReturns.push(...toDailyReturns(sim.equityCurve, nasdaqDateKey));
        console.log(`${bars.length} real bars (${dropped} MOCK excl.) → ${sim.trades} trades  (${((Date.now() - t0) / 1000).toFixed(1)}s; pooled ${pooledTradeRecords.length})`);
      }
    } else {
      // ── INTRADAY path (unchanged). DB is STREAMED one symbol at a time (bounded memory); fixtures
      // are tiny, built up-front and served from a lookup. Per-day batching applies to DB source.
      const fixtureSeries = source === 'db' ? null : buildFixtureSeries(wantSymbols, from, to);
      const candidatesBySymbol = new Map<string, SnapshotArtifactCandidate[]>();
      for (const candidate of candidateArtifact?.candidates ?? []) {
        const entries = candidatesBySymbol.get(candidate.symbol) ?? [];
        entries.push(candidate);
        candidatesBySymbol.set(candidate.symbol, entries);
      }
      symbols = candidateArtifact
        ? Array.from(candidatesBySymbol.keys()).sort()
        : setupId === 'stocks-in-play-orb'
          ? [...STOCKS_IN_PLAY_UNIVERSE_V1]
        : source === 'db'
          ? await listDbSymbols(wantSymbols, from, to)
        : fixtureSeries!.map((s) => s.symbol);
      if (setupId === 'stocks-in-play-orb') {
        const requested = wantSymbols?.slice().sort().join(',');
        const v1 = [...STOCKS_IN_PLAY_UNIVERSE_V1].sort().join(',');
        if (requested && requested !== v1) throw new Error('stocks-in-play-orb@v1 requires its exact 11-symbol deep-minute universe');
        symbols = [...STOCKS_IN_PLAY_UNIVERSE_V1];
        if (source !== 'db' || feed !== 'alpaca-iex') throw new Error('stocks-in-play-orb@v1 requires --source db --feed alpaca-iex');
        const prepared = await loadStocksInPlayReferenceBook(from, to);
        excludedMock += prepared.excludedUnsupportedDaily + prepared.excludedNonAlpacaMinute;
        setup.prepareUniverse?.({ symbols, closesBySymbol: new Map(), stocksInPlayBook: prepared.book });
        console.log(`prepared stocks-in-play PIT book for ${prepared.book.size}/11 symbols [OR=ALPACA-IEX; daily liquidity=YAHOO/ALPACA consolidated; ${prepared.excludedNonAlpacaMinute} non-ALPACA minute + ${prepared.excludedUnsupportedDaily} unsupported daily rows excluded; ${from}..${to}; 35d prehistory]`);
      }
      const fixtureByName = new Map((fixtureSeries ?? []).map((s) => [s.symbol, s] as const));
      const loadSeries = (symbol: string): Promise<SymbolSeries> =>
        candidateArtifact
          ? loadDbCandidateSymbol(symbol, candidatesBySymbol.get(symbol)!)
          : source === 'db'
            ? loadDbSymbol(symbol, from, to)
            : Promise.resolve(fixtureByName.get(symbol)!);
      const batchPerDay = source === 'db';
      console.log(`\nprocessing ${symbols.length} symbol(s) [source=${source}${batchPerDay ? ', per-day batched' : ''}] …`);
      for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        const t0 = Date.now();
        process.stdout.write(`  [${i + 1}/${symbols.length}] ${symbol} … `);
        const { bars, dayContext } = await loadSeries(symbol); // one symbol resident; released next loop
        if (bars.length) lastPrice = Number(bars.at(-1)!.close);
        const chunks: IntradayBarInput[][] = batchPerDay ? groupBarsByDay(bars) : [bars];
        let symTrades = 0;
        for (const chunk of chunks) {
          const sim = simulateIntraday({
            setup, params, symbol, market: 'NASDAQ', bars: chunk, dayContext, startingCash,
            limits: DEFAULT_INTRADAY_LIMITS,
          });
          pooledTradeReturns.push(...sim.tradeReturns);
          pooledTradeRecords.push(...sim.tradeRecords);
          pooledDailyReturns.push(...(
            batchPerDay
              ? toIndependentPeriodReturns([sim.equityCurve], Number(startingCash))
              : toDailyReturns(sim.equityCurve, nasdaqDateKey)
          ));
          symTrades += sim.trades;
        }
        console.log(`${bars.length} bars, ${chunks.length} days → ${symTrades} trades  (${((Date.now() - t0) / 1000).toFixed(1)}s; pooled ${pooledTradeRecords.length})`);
      }
    }
  } catch (err) {
    if (err instanceof LookaheadError) {
      console.error(`\n\x1b[31mLOOK-AHEAD DETECTED — run aborted: ${err.message}\x1b[0m`);
      process.exit(1);
    }
    throw err;
  }
  if (cadence === 'daily') console.log(`\nexcluded ${excludedMock} MOCK bar(s) across the universe (no-mock directive)`);

  // ── Single trade-sequenced equity curve for headline metrics (chronological by exit).
  const sortedTrades = [...pooledTradeRecords].sort((a, b) => a.exitTs.getTime() - b.exitTs.getTime());
  const curve: EquityPoint[] = [{ ts: new Date(`${from}T00:00:00.000Z`), equity: Number(startingCash) }];
  let running = Number(startingCash);
  for (const tr of sortedTrades) {
    running *= 1 + tr.ret;
    curve.push({ ts: tr.exitTs, equity: running });
  }
  const turnover = pooledTradeRecords.length; // count proxy; per-symbol notional pooled below is noisy
  const full = computeMetrics(curve, { trades: sortedTrades.length, turnover });
  const oosStart = Math.floor(curve.length * (1 - oosFraction));
  const oosTrades = transitionCountInsideSlice(curve.length, oosStart);
  const oos = computeMetrics(curve.slice(oosStart), { trades: oosTrades, turnover: oosTrades });

  const distribution = summarizeDailyReturns(pooledDailyReturns);
  const bootstrap = bootstrapTradeOutcomes(pooledTradeReturns, {
    resamples: 1000, seed, startEquity: Number(startingCash),
  });
  const permutation = signFlipPermutationTest(pooledTradeReturns, { permutations: 1000, seed });

  // Fractional-Kelly sizing, clamped by the envelope (never bypassed).
  const price = new D((lastPrice || 1).toFixed(4));
  const kelly = kellySizedDecision(
    pooledTradeReturns,
    { equity: startingCash, cash: startingCash, positions: [], peakEquity: startingCash },
    { symbol: symbols[0] ?? 'NA', price, atr: price.mul(0.02), adv: new D(1_000_000), stopPrice: price.mul(0.95) },
    DEFAULT_INTRADAY_LIMITS,
  );

  const resultsDir = path.join(process.cwd(), 'results');
  const outFile = path.join(
    resultsDir,
    backtestResultFilename(setupId, from, to, candidateEvidence?.sha256Digest),
  );
  const card = {
    ...assembleReportCard({
      setup: setupId, symbols, from, to, dataFeed: feed, seed, gitSha: gitSha(),
      full, oos, distribution, bootstrap, permutation,
      kellyFraction: kelly.kellyFraction, kellyClampedQty: Number(kelly.envelope.qty.toString()),
      oosFraction, drawdownBreakerPct: DEFAULT_INTRADAY_LIMITS.drawdownHaltPct,
      shariaState: shariaStateForSetup(setupId, candidateArtifact?.shariaStatus),
      ...(candidateArtifact ? { dataQualityPitOk: true, reproducible: true } : {}),
    }),
    ...(candidateEvidence ? {
      candidateArtifact: {
        ...candidateEvidence,
        resultPath: outFile,
        resultRelativePath: path.relative(process.cwd(), outFile),
      },
    } : {}),
  };

  console.log('\n' + renderReportCard(card));

  // ── Persist results JSON.
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(card, null, 2));
  console.log(`\nwrote ${outFile}`);

  // ── Persist a BacktestRun (reproducibility). DB-optional: warn, never fail the run.
  try {
    const { prisma } = await import('../src/lib/prisma');
    const run = await prisma.backtestRun.create({
      data: {
        strategyId: null,
        symbol: symbols.join(',') || 'NONE',
        market: 'NASDAQ',
        fromDate: new Date(`${from}T00:00:00.000Z`),
        toDate: new Date(`${to}T23:59:59.999Z`),
        oosFraction: new D(oosFraction),
        metrics: card as unknown as Prisma.InputJsonValue,
        implausible: card.implausible,
        pmSurrogateId: 'intraday-deterministic-no-llm',
        seed,
        gitSha: card.gitSha,
      },
    });
    console.log(`persisted BacktestRun ${run.id}`);
    await prisma.$disconnect();
  } catch (err) {
    console.warn(`\x1b[33mBacktestRun not persisted (DB unavailable): ${(err as Error).message}\x1b[0m`);
  }

  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
