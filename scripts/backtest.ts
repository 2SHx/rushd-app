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
import { loadAllFixtures } from '../src/quant/data/fixtureLoader';
import { nasdaqDateKey } from '../src/quant/data/snapshot';
import { LookaheadError } from '../src/quant/data/pointInTime';
import {
  simulateIntraday, DEFAULT_INTRADAY_LIMITS,
  type DayContext, type IntradayBarInput, type TradeRecord,
} from '../src/quant/backtest/intradayEngine';
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const setupId = args.setup;
  const from = args.from;
  const to = args.to;
  const seed = Number(args.seed ?? '42');
  const feed = (args.feed ?? 'fixtures-real') as DataFeed;
  const oosFraction = Number(args.oos ?? '0.3');

  if (!setupId || !from || !to) {
    console.error('usage: npm run backtest -- --setup <id> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--symbols A,B] [--seed N]');
    process.exit(2);
  }
  const setup = (STRATEGY_SETUP_CATALOG as Record<string, unknown>)[setupId] as
    | (typeof STRATEGY_SETUP_CATALOG)[keyof typeof STRATEGY_SETUP_CATALOG]
    | undefined;
  if (!setup) {
    console.error(`unknown setup "${setupId}". known: ${Object.keys(STRATEGY_SETUP_CATALOG).join(', ')}`);
    process.exit(2);
  }

  const wantSymbols = args.symbols ? args.symbols.split(',').map((s) => s.trim()) : null;
  const startingCash = new D(100_000);

  // ── Load REAL fixtures only, filtered by [from,to] and optional --symbols. No synthetic bars.
  const fixtures = loadAllFixtures().filter((f) => {
    if (wantSymbols && !wantSymbols.includes(f.symbol)) return false;
    return f.date >= from && f.date <= to;
  });

  const symbols = Array.from(new Set(fixtures.map((f) => f.symbol))).sort();

  const pooledTradeReturns: number[] = [];
  const pooledTradeRecords: TradeRecord[] = [];
  const pooledDailyReturns: number[] = [];
  let lastPrice = 0;

  try {
    for (const symbol of symbols) {
      const symFixtures = fixtures.filter((f) => f.symbol === symbol)
        .sort((a, b) => a.date.localeCompare(b.date));
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
      if (bars.length) lastPrice = Number(bars.at(-1)!.close);

      const sim = simulateIntraday({
        setup, symbol, market: 'NASDAQ', bars, dayContext, startingCash,
        limits: DEFAULT_INTRADAY_LIMITS,
      });
      pooledTradeReturns.push(...sim.tradeReturns);
      pooledTradeRecords.push(...sim.tradeRecords);
      pooledDailyReturns.push(...toDailyReturns(sim.equityCurve, nasdaqDateKey));
    }
  } catch (err) {
    if (err instanceof LookaheadError) {
      console.error(`\n\x1b[31mLOOK-AHEAD DETECTED — run aborted: ${err.message}\x1b[0m`);
      process.exit(1);
    }
    throw err;
  }

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
