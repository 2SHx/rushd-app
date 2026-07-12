#!/usr/bin/env node
// scripts/backfill-snapshots.ts — QDR-6 (G1): builds PIT-correct historical `SymbolSnapshot`
// rows at fixed intraday checkpoints (see src/quant/data/checkpoints.ts), across the trading
// days already covered by the real `IntradayBar` spine, for the gapper screener's candidate
// universe. Real data only, at every layer:
//   - bars: existing IntradayBar rows (real Alpaca IEX minute bars)
//   - priorClose: normal mode uses MarketBar DAY rows; candidate mode requires the artifact's
//     authoritative Alpaca-IEX raw prior close and never re-ingests an adjustment-incompatible row
//   - mcap: SEC-XBRL shares outstanding (latest filing with `filed` < the trading day) x
//     priorClose — never fabricated; left null (and reported) when SEC has no eligible filing.
// Idempotent: computeAndUpsertSnapshot upserts on (symbol, market, asOf); reruns are safe and
// report 0 new rows. Resumable per symbol (each symbol is independent end-to-end).
//
//   npx tsx scripts/backfill-snapshots.ts --symbols=GME,AMC --days=90
//
// Candidate-list mode (QDR-6 gapper-universe discovery):
//   npx tsx scripts/backfill-snapshots.ts --candidates=results/gapper-candidates.json
// reads the discovery artifact's candidates (including raw-price PIT mcap provenance) and builds
// snapshots ONLY at those checkpoints — not every trading day with stored IntradayBar rows.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ingestBars } from '../src/quant/data/ingest';
import { computeAndUpsertSnapshot, nasdaqDateKey } from '../src/quant/data/snapshot';
import { tradingDayCheckpoints } from '../src/quant/data/checkpoints';
import { lookupSecMcap } from '../src/quant/data/secFundamentals';
import {
  compareCandidateDays,
  parsePositiveIntegerCap,
  parseSnapshotArtifactCandidate,
  type SnapshotArtifactCandidate,
} from '../src/quant/data/gapperCandidates';
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
const DEFAULT_MAX_CANDIDATE_BACKFILL = 1000;

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

interface CandidateFile {
  candidates: unknown[];
}

export async function runCandidatesMode(candidatesPath: string, maxCandidateBackfill: number) {
  const raw = JSON.parse(fs.readFileSync(candidatesPath, 'utf8')) as CandidateFile;
  const allCandidates = (raw.candidates ?? []).map(parseSnapshotArtifactCandidate);
  const candidates = [...allCandidates].sort(compareCandidateDays).slice(0, maxCandidateBackfill);
  const bySymbol = new Map<string, SnapshotArtifactCandidate[]>();
  for (const candidate of candidates) {
    const entries = bySymbol.get(candidate.symbol) ?? [];
    entries.push(candidate);
    bySymbol.set(candidate.symbol, entries);
  }
  console.log(`Candidate-list snapshot build: ${candidates.length}/${allCandidates.length} capped symbol-day(s) across ${bySymbol.size} symbol(s) from ${candidatesPath}\n`);

  let written = 0, newRows = 0;
  for (const [symbol, entries] of Array.from(bySymbol.entries())) {
    for (const candidate of entries.sort(compareCandidateDays)) {
      for (const asOf of tradingDayCheckpoints(candidate.date)) {
        const existing = await prisma.symbolSnapshot.findUnique({
          where: { symbol_market_asOf: { symbol, market: MARKET, asOf } },
        });
        const result = await computeAndUpsertSnapshot(symbol, MARKET, asOf, 'ALPACA', {
          priorClose: candidate.mcapPrice,
          mcap: candidate.mcap,
          mcapSource: 'FUNDAMENTALS',
        });
        if (!result) continue;
        written += 1;
        if (!existing) newRows += 1;
      }
    }
  }
  console.log(`Snapshots written (upserted): ${written} (${newRows} new)`);
  console.log(`Mcap coverage: ${candidates.length}/${candidates.length} candidate symbol-days (artifact-authoritative)`);
}

async function main() {
  const candidatesPath = arg('candidates');
  if (candidatesPath) {
    const maxCandidateBackfill = parsePositiveIntegerCap(
      arg('max-candidate-backfill'),
      DEFAULT_MAX_CANDIDATE_BACKFILL,
      'max-candidate-backfill',
    );
    await runCandidatesMode(candidatesPath, maxCandidateBackfill);
    return;
  }

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`backfill-snapshots failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
