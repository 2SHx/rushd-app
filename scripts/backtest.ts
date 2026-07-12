// scripts/backtest.ts — QDR-6 user-runnable validation CLI.
//   npm run backtest -- --setup <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--symbols GME,SNDL]
//                       [--seed 42] [--feed fixtures-real|alpaca-iex]
//
// Runs a cataloged StrategySetup against stored historical minute bars with ZERO LLM calls,
// prints the QDR-6 report card, writes results/<setup>-<from>-<to>.json, and persists a
// BacktestRun (seed + gitSha) for reproducibility. Reads ONLY real fixtures / IntradayBar rows —
// no synthetic bars anywhere. Exits nonzero on any look-ahead detection.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { STRATEGY_SETUP_CATALOG } from '../src/quant/strategies/catalog';
import { GAPPER_ORB_V1_IEX } from '../src/quant/strategies/gapperOrb';
import { NASDAQ_HALAL_UNIVERSE } from '../src/quant/strategies/bollingerMrLong';
import type { StrategySetup } from '../src/quant/strategies/types';
import { loadAllFixtures } from '../src/quant/data/fixtureLoader';
import { nasdaqDateKey } from '../src/quant/data/snapshot';
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
import { summarizeDailyReturns, toDailyReturns } from '../src/quant/backtest/distribution';
import { bootstrapTradeOutcomes, signFlipPermutationTest, kellySizedDecision } from '../src/quant/backtest/monteCarlo';
import { assembleReportCard, renderReportCard, type DataFeed } from '../src/quant/backtest/reportCard';

const D = Prisma.Decimal;

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
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

interface SymbolSeries {
  symbol: string;
  bars: IntradayBarInput[];
  dayContext: Map<string, DayContext>;
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
async function loadDbSymbol(symbol: string, from: string, to: string): Promise<SymbolSeries> {
  const { prisma } = await import('../src/lib/prisma');
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T23:59:59.999Z`);
  const ibars = await prisma.intradayBar.findMany({
    where: { symbol, ts: { gte: fromDate, lte: toDate } }, orderBy: { ts: 'asc' },
  });
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const setupId = args.setup;
  const from = args.from;
  const to = args.to;
  const seed = Number(args.seed ?? '42');
  const oosFraction = Number(args.oos ?? '0.3');

  if (!setupId || !from || !to) {
    console.error('usage: npm run backtest -- --setup <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--symbols A,B] [--seed N]');
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
  const source = (args.source ?? 'fixtures') as 'fixtures' | 'db';

  const cadence = setup.cadence;
  const feed = (args.feed ?? (cadence === 'daily' ? 'yahoo-daily' : 'fixtures-real')) as DataFeed;

  // Versioned-config selection (QDR-6): gapper-orb on the IEX feed uses the MEASURED v1-iex
  // calibration (minCumVolume rescaled from the consolidated tape); every other case keeps v1.
  const params = setupId === 'gapper-orb' && feed === 'alpaca-iex' ? GAPPER_ORB_V1_IEX : undefined;

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
      symbols = source === 'db'
        ? await listDbSymbols(wantSymbols, from, to)
        : fixtureSeries!.map((s) => s.symbol);
      const fixtureByName = new Map((fixtureSeries ?? []).map((s) => [s.symbol, s] as const));
      const loadSeries = (symbol: string): Promise<SymbolSeries> =>
        source === 'db' ? loadDbSymbol(symbol, from, to) : Promise.resolve(fixtureByName.get(symbol)!);
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
          pooledDailyReturns.push(...toDailyReturns(sim.equityCurve, nasdaqDateKey));
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
  const oos = computeMetrics(curve.slice(oosStart), { trades: sortedTrades.length, turnover });

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

  const card = assembleReportCard({
    setup: setupId, symbols, from, to, dataFeed: feed, seed, gitSha: gitSha(),
    full, oos, distribution, bootstrap, permutation,
    kellyFraction: kelly.kellyFraction, kellyClampedQty: Number(kelly.envelope.qty.toString()),
    oosFraction, drawdownBreakerPct: DEFAULT_INTRADAY_LIMITS.drawdownHaltPct,
  });

  console.log('\n' + renderReportCard(card));

  // ── Persist results JSON.
  const resultsDir = path.join(process.cwd(), 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outFile = path.join(resultsDir, `${setupId}-${from}-${to}.json`);
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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
