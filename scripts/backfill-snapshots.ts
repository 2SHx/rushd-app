#!/usr/bin/env node
// scripts/backfill-snapshots.ts — QDR-6 (G1): builds PIT-correct historical `SymbolSnapshot`
// rows at fixed intraday checkpoints (see src/quant/data/checkpoints.ts), across the trading
// days already covered by the real `IntradayBar` spine, for the gapper screener's candidate
// universe. Real data only, at every layer:
//   - bars: existing IntradayBar rows (real Alpaca IEX minute bars)
//   - priorClose: MarketBar DAY rows, backfilled here via the existing ingestBars ingester
//   - mcap: SEC-XBRL shares outstanding (latest filing with `filed` <= the trading day) x
//     priorClose — never fabricated; left null (and reported) when SEC has no eligible filing.
// Idempotent: computeAndUpsertSnapshot upserts on (symbol, market, asOf); reruns are safe and
// report 0 new rows. Resumable per symbol (each symbol is independent end-to-end).
//
//   npx tsx scripts/backfill-snapshots.ts --symbols=GME,AMC --days=90
import { ingestBars } from '../src/quant/data/ingest';
import { computeAndUpsertSnapshot, nasdaqDateKey } from '../src/quant/data/snapshot';
import { tradingDayCheckpoints } from '../src/quant/data/checkpoints';
import { lookupSecMcap } from '../src/quant/data/secFundamentals';
import { prisma } from '../src/lib/prisma';

process.loadEnvFile?.('.env');

const DEFAULT_SYMBOLS = [
  'GME', 'AMC', 'SNDL', 'MARA', 'RIOT', 'CLSK', 'HUT', 'PLUG', 'FCEL', 'SOUN',
  'BBAI', 'IONQ', 'RGTI', 'LUNR', 'ACHR', 'JOBY', 'DNA', 'OPEN', 'CHPT', 'SMCI',
];
const MARKET = 'NASDAQ' as const;
const DEFAULT_DAYS = 90;
const DAILY_BACKFILL_MARGIN_DAYS = 30; // extra calendar days so the earliest checkpoint has a prior close
const GAPPER_PREMARKET_MOVE_MIN = 5;
const GAPPER_CUM_VOLUME_MIN = 10_000_000;

function arg(name: string): string | undefined {
  return process.argv.find((v) => v.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

/** Trading days (Eastern date keys) that actually have IntradayBar rows within the window. */
async function tradingDaysForSymbol(symbol: string, sinceDays: number): Promise<string[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const bars = await prisma.intradayBar.findMany({
    where: { symbol, market: MARKET, ts: { gte: since } },
    select: { ts: true },
    orderBy: { ts: 'asc' },
  });
  const days = new Set<string>();
  for (const bar of bars) days.add(nasdaqDateKey(bar.ts));
  return Array.from(days).sort();
}

async function priorCloseFor(symbol: string, dateKey: string): Promise<number | null> {
  const prev = await prisma.marketBar.findFirst({
    where: { symbol, market: MARKET, interval: 'DAY', ts: { lt: new Date(`${dateKey}T00:00:00.000Z`) } },
    orderBy: { ts: 'desc' },
  });
  return prev ? Number(prev.close) : null;
}

interface SymbolReport {
  symbol: string;
  daysProcessed: number;
  daysWithMcap: number;
  daysWithoutMcap: number;
  snapshotsWritten: number;
  snapshotsNew: number;
  gapperDays: string[];
}

async function main() {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    throw new Error('ALPACA_API_KEY/ALPACA_API_SECRET are required (daily-close backfill needs real Alpaca data)');
  }
  const symbols = (arg('symbols') ?? DEFAULT_SYMBOLS.join(','))
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-Z]{1,10}$/.test(s));
  const requestedDays = Number.parseInt(arg('days') ?? `${DEFAULT_DAYS}`, 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : DEFAULT_DAYS;

  process.env.MARKET_DATA_MODE = 'live'; // explicit live-data opt-in, mirrors backfill-intraday.ts

  console.log(`Backfilling snapshots for ${symbols.length} symbol(s), ${days}-day window...\n`);

  const reports: SymbolReport[] = [];

  for (const symbol of symbols) {
    // 1) Ensure a daily MarketBar spine exists so real prior closes are available for every
    // trading day this run will checkpoint.
    const dailyResult = await ingestBars(symbol, MARKET, { days: days + DAILY_BACKFILL_MARGIN_DAYS });
    console.log(`${symbol}: daily bars upserted=${dailyResult.upserted} (source=${dailyResult.source})`);

    const tradingDays = await tradingDaysForSymbol(symbol, days);
    const report: SymbolReport = {
      symbol, daysProcessed: 0, daysWithMcap: 0, daysWithoutMcap: 0,
      snapshotsWritten: 0, snapshotsNew: 0, gapperDays: [],
    };

    for (const dateKey of tradingDays) {
      report.daysProcessed += 1;
      const priorClose = await priorCloseFor(symbol, dateKey);
      const sec = await lookupSecMcap(symbol, dateKey, priorClose);
      const mcap = sec?.mcap ?? null;
      const mcapSource = mcap != null ? 'FUNDAMENTALS' : null;
      if (mcap != null) report.daysWithMcap += 1;
      else report.daysWithoutMcap += 1;

      let dayHasGapper = false;
      for (const asOf of tradingDayCheckpoints(dateKey)) {
        const existing = await prisma.symbolSnapshot.findUnique({
          where: { symbol_market_asOf: { symbol, market: MARKET, asOf } },
        });
        const result = await computeAndUpsertSnapshot(symbol, MARKET, asOf, 'ALPACA', {
          priorClose,
          mcap,
          mcapSource,
        });
        if (!result) continue;
        report.snapshotsWritten += 1;
        if (!existing) report.snapshotsNew += 1;
        const move = result.premarketMovePct != null ? Number(result.premarketMovePct) : null;
        const cumVol = Number(result.cumVolume);
        if (move != null && move >= GAPPER_PREMARKET_MOVE_MIN && cumVol >= GAPPER_CUM_VOLUME_MIN) {
          dayHasGapper = true;
        }
      }
      if (dayHasGapper) report.gapperDays.push(dateKey);
    }

    reports.push(report);
    console.log(
      `${symbol}: ${report.daysProcessed} trading days, mcap ${report.daysWithMcap}/${report.daysProcessed}, ` +
        `${report.snapshotsWritten} snapshots (${report.snapshotsNew} new)` +
        `${report.gapperDays.length ? `, gapper days: ${report.gapperDays.join(', ')}` : ''}`,
    );
  }

  const totalSnapshots = reports.reduce((sum, r) => sum + r.snapshotsWritten, 0);
  const totalNew = reports.reduce((sum, r) => sum + r.snapshotsNew, 0);

  console.log(`\n=== Summary ===`);
  console.log(`Total snapshots written (upserted) this run: ${totalSnapshots} (${totalNew} new rows)`);
  console.log(`\nPer-symbol mcap coverage (days with real SEC-XBRL mcap / total trading days):`);
  for (const r of reports) console.log(`  ${r.symbol}: ${r.daysWithMcap}/${r.daysProcessed} (${r.daysWithoutMcap} null)`);

  console.log(
    `\nReal historical gapper candidates ` +
      `(premarketMovePct >= ${GAPPER_PREMARKET_MOVE_MIN}% AND cumVolume >= ${GAPPER_CUM_VOLUME_MIN.toLocaleString()} at some checkpoint):`,
  );
  const candidates = reports.flatMap((r) => r.gapperDays.map((d) => `${r.symbol} ${d}`));
  if (candidates.length === 0) console.log('  (none found)');
  else for (const c of candidates) console.log(`  ${c}`);
}

main().catch((err) => {
  console.error(`backfill-snapshots failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
