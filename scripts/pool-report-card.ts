// scripts/pool-report-card.ts — assemble the POOLED QDR-6 report card for the full 20-symbol
// gapper-orb IEX run from the confirmed per-symbol evidence.
//
// WHY a separate pooler: the single-process 20-symbol engine loop is too heavy to finish in one
// pass on this box (each large-volume symbol is minutes of O(day²) work; the process was
// OOM/kill-prone past ~13 symbols). Every symbol was instead validated in isolation
// (results/full_run2-partial.log for 1–13, results/per-symbol/*.json for the rest) and ALL 20
// returned 0 trades. With 0 pooled trades the pooled card is fully DETERMINISTIC: the trade and
// daily-return populations are empty, so this reuses the EXACT tail library functions the CLI
// (scripts/backtest.ts) runs — no fabricated numbers, no engine re-run. It verifies the per-symbol
// evidence really is 0-trades before emitting, and refuses otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { Prisma } from '@prisma/client';
import { computeMetrics, type EquityPoint } from '../src/quant/backtest/metrics';
import { summarizeDailyReturns } from '../src/quant/backtest/distribution';
import { bootstrapTradeOutcomes, signFlipPermutationTest, kellySizedDecision } from '../src/quant/backtest/monteCarlo';
import { assembleReportCard, renderReportCard } from '../src/quant/backtest/reportCard';
import { DEFAULT_INTRADAY_LIMITS } from '../src/quant/backtest/intradayEngine';

const D = Prisma.Decimal;
const FROM = '2026-04-13';
const TO = '2026-07-10';
const SEED = 42;

function gitSha(): string {
  if (process.env.GIT_SHA) return process.env.GIT_SHA;
  try { return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); } catch { return 'unknown'; }
}

async function main() {
  const { prisma } = await import('../src/lib/prisma');
  // Canonical universe: every symbol with real IEX minute bars in the window.
  const distinct = await prisma.intradayBar.findMany({
    where: { ts: { gte: new Date(`${FROM}T00:00:00.000Z`), lte: new Date(`${TO}T23:59:59.999Z`) } },
    distinct: ['symbol'], select: { symbol: true }, orderBy: { symbol: 'asc' },
  });
  const symbols = distinct.map((d) => d.symbol);

  // ── Provenance check: re-confirm 0 trades for every symbol from the recorded evidence.
  const perSymbolDir = path.join(process.cwd(), 'results', 'per-symbol');
  const partialLog = fs.readFileSync(path.join(process.cwd(), 'results', 'full_run2-partial.log'), 'utf-8');
  const zeroTrade = new Set<string>();
  for (const line of partialLog.split('\n')) {
    const m = line.match(/\]\s+(\w+)\s+….*→\s+(\d+)\s+trades/);
    if (m && Number(m[2]) === 0) zeroTrade.add(m[1]);
  }
  if (fs.existsSync(perSymbolDir)) {
    for (const f of fs.readdirSync(perSymbolDir).filter((x) => x.endsWith('.json'))) {
      const j = JSON.parse(fs.readFileSync(path.join(perSymbolDir, f), 'utf-8')) as { symbols: string[]; full: { trades: number } };
      if (j.full.trades === 0) for (const s of j.symbols) zeroTrade.add(s);
    }
  }
  const missing = symbols.filter((s) => !zeroTrade.has(s));
  if (missing.length) {
    console.error(`\x1b[31mRefusing to pool: no 0-trade evidence for ${missing.join(', ')}. Re-run those symbols first.\x1b[0m`);
    process.exit(1);
  }

  // ── Pooled populations are provably EMPTY (0 trades across all 20 symbols). This is exactly the
  // state scripts/backtest.ts would reach at its tail; the following mirrors that tail verbatim.
  const pooledTradeReturns: number[] = [];
  const pooledDailyReturns: number[] = [];
  const startingCash = new D(100_000);
  const oosFraction = 0.3;

  const curve: EquityPoint[] = [{ ts: new Date(`${FROM}T00:00:00.000Z`), equity: Number(startingCash) }];
  const full = computeMetrics(curve, { trades: 0, turnover: 0 });
  const oosStart = Math.floor(curve.length * (1 - oosFraction));
  const oos = computeMetrics(curve.slice(oosStart), { trades: 0, turnover: 0 });
  const distribution = summarizeDailyReturns(pooledDailyReturns);
  const bootstrap = bootstrapTradeOutcomes(pooledTradeReturns, { resamples: 1000, seed: SEED, startEquity: Number(startingCash) });
  const permutation = signFlipPermutationTest(pooledTradeReturns, { permutations: 1000, seed: SEED });
  const price = new D(1);
  const kelly = kellySizedDecision(
    pooledTradeReturns,
    { equity: startingCash, cash: startingCash, positions: [], peakEquity: startingCash },
    { symbol: symbols[0] ?? 'NA', price, atr: price.mul(0.02), adv: new D(1_000_000), stopPrice: price.mul(0.95) },
    DEFAULT_INTRADAY_LIMITS,
  );

  const card = assembleReportCard({
    setup: 'gapper-orb', symbols, from: FROM, to: TO, dataFeed: 'alpaca-iex', seed: SEED, gitSha: gitSha(),
    full, oos, distribution, bootstrap, permutation,
    kellyFraction: kelly.kellyFraction, kellyClampedQty: Number(kelly.envelope.qty.toString()),
    oosFraction, drawdownBreakerPct: DEFAULT_INTRADAY_LIMITS.drawdownHaltPct,
  });

  console.log('\n' + renderReportCard(card));
  console.log(`\nparams=v1-iex (minCumVolume=350k; median IEX/consolidated volume ratio 3.28%)`);
  console.log(`pooled from ${symbols.length}/20 symbols × 62 trading days, all 0 trades (evidence: results/full_run2-partial.log + results/per-symbol/*.json)`);

  const outFile = path.join(process.cwd(), 'results', `gapper-orb-${FROM}-${TO}-pooled.json`);
  fs.writeFileSync(outFile, JSON.stringify({ ...card, paramsVersion: 'v1-iex', pooledFrom: symbols }, null, 2));
  console.log(`\nwrote ${outFile}`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
