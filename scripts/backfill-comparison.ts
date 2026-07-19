#!/usr/bin/env node
// scripts/backfill-comparison.ts — backfills `metrics.comparison` on terminal league
// BacktestRun rows that persisted `comparison: null` because they ran before the SPY/SPUS
// benchmark bars were ingested (2026-07-19). Reconstructs the exact curve runLab used:
//   - shared engine route: metrics.sharedBook.daily (ts, nav) — persisted verbatim
//   - legacy route: cumulative (1 + trade.netReturn) from $100k over the untruncated
//     tradeEvidence ledger, sorted by exitTs — the same trade-sequenced formula
// then calls the same buildHistoricalComparisonEvidence. Runs whose evidence cannot
// reproduce the curve (truncated ledger, <2 points) are left null — honestly unavailable.
// Idempotent: only touches rows where comparison is null. Dry run by default:
//
//   npx tsx scripts/backfill-comparison.ts          # report only
//   npx tsx scripts/backfill-comparison.ts --write  # persist
import { prisma } from '../src/lib/prisma';
import { buildHistoricalComparisonEvidence, type ComparisonBenchmarkBar } from '../src/quant/backtest/historicalComparison';
import type { EquityPoint } from '../src/quant/backtest/metrics';

const OOS_FRACTION_DEFAULT = 0.3;

function reconstructCurve(metrics: Record<string, unknown>): EquityPoint[] | null {
  const sharedBook = metrics.sharedBook as { daily?: Array<{ ts: string; nav: string | number }> } | null | undefined;
  if (sharedBook?.daily?.length) {
    return sharedBook.daily.map((point) => ({ ts: new Date(point.ts), equity: Number(point.nav) }));
  }
  const evidence = metrics.tradeEvidence as {
    truncated?: boolean;
    trades?: Array<{ exitTs: string; netReturn: number }>;
  } | null | undefined;
  if (!evidence || evidence.truncated || !Array.isArray(evidence.trades)) return null;
  const from = metrics.from as string | undefined;
  if (!from) return null;
  const curve: EquityPoint[] = [{ ts: new Date(`${from}T00:00:00.000Z`), equity: 100_000 }];
  let running = 100_000;
  for (const trade of [...evidence.trades].sort((a, b) => Date.parse(a.exitTs) - Date.parse(b.exitTs))) {
    running *= 1 + trade.netReturn;
    curve.push({ ts: new Date(trade.exitTs), equity: running });
  }
  return curve;
}

async function main() {
  const write = process.argv.includes('--write');
  const rows = await prisma.backtestRun.findMany({
    where: { strategyId: null },
    select: { id: true, metrics: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  for (const row of rows) {
    const metrics = row.metrics as Record<string, unknown> | null;
    if (!metrics || metrics.comparison !== null || typeof metrics.from !== 'string' || typeof metrics.to !== 'string') continue;
    const label = `${metrics.setup} ${row.id.slice(0, 8)} (${row.createdAt.toISOString().slice(0, 10)})`;

    const curve = reconstructCurve(metrics);
    if (!curve || curve.length < 2) {
      console.log(`skip  ${label}: curve not reconstructible from persisted evidence`);
      continue;
    }
    const holdout = Number((metrics.checklist as { oosHoldoutPct?: unknown } | undefined)?.oosHoldoutPct ?? OOS_FRACTION_DEFAULT);
    const oosStart = curve[Math.floor(curve.length * (1 - holdout))]?.ts ?? curve.at(-1)!.ts;

    const benchmarkRows = await prisma.marketBar.findMany({
      where: {
        symbol: { in: ['SPY', 'SPUS'] }, market: 'NASDAQ', interval: 'DAY',
        source: { in: ['YAHOO', 'ALPACA'] },
        ts: { gte: new Date(`${metrics.from}T00:00:00.000Z`), lte: new Date(`${metrics.to}T23:59:59.999Z`) },
      },
      select: { symbol: true, ts: true, close: true, source: true },
      orderBy: { ts: 'asc' },
    });
    const comparison = buildHistoricalComparisonEvidence({
      strategyCurve: curve,
      oosStart,
      benchmarkBars: benchmarkRows.flatMap((bar): ComparisonBenchmarkBar[] => (
        (bar.symbol === 'SPY' || bar.symbol === 'SPUS') && (bar.source === 'YAHOO' || bar.source === 'ALPACA')
          ? [{ symbol: bar.symbol, ts: bar.ts, close: Number(bar.close), source: bar.source }]
          : []
      )),
    });
    if (!comparison) {
      console.log(`skip  ${label}: comparison still unavailable (no common benchmark interval)`);
      continue;
    }
    if (write) {
      await prisma.backtestRun.update({
        where: { id: row.id },
        data: { metrics: { ...metrics, comparison } as object },
      });
    }
    console.log(`${write ? 'wrote' : 'would'} ${label}: ${comparison.start.slice(0, 10)} → ${comparison.end.slice(0, 10)} (${comparison.series.model.length} pts)`);
  }
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
