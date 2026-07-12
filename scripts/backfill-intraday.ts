#!/usr/bin/env node
// QDR-6 G1: explicit, resumable Alpaca-IEX minute-bar backfill.
//
// Two modes:
//   --symbols=A,B,C --days=N   (default) rolling window from "now", per symbol.
//   --candidates=path.json     candidate-list mode (QDR-6 gapper-universe discovery): reads
//     { candidates: [{ symbol, date }, ...] } (the shape scripts/discover-gapper-universe.ts
//     writes to results/gapper-candidates.json) and backfills ONLY those specific historical
//     (symbol, day) pairs via ingestIntradayBarsForDay — never a bulk multi-month backfill for
//     the whole candidate list's symbols.
import fs from 'node:fs';
import { ingestIntradayBars, ingestIntradayBarsForDay, INITIAL_INTRADAY_BACKFILL_DAYS } from '../src/quant/data/intraday';
import { compareCandidateDays, parsePositiveIntegerCap } from '../src/quant/data/gapperCandidates';

process.loadEnvFile?.('.env');

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

interface CandidateFile {
  candidates: Array<{ symbol: string; date: string }>;
}

const DEFAULT_MAX_CANDIDATE_BACKFILL = 1000;

async function runCandidatesMode(candidatesPath: string, maxCandidateBackfill: number) {
  const raw = JSON.parse(fs.readFileSync(candidatesPath, 'utf8')) as CandidateFile;
  const allCandidates = raw.candidates ?? [];
  const candidates = [...allCandidates].sort(compareCandidateDays).slice(0, maxCandidateBackfill);
  console.log(`Candidate-list minute-bar backfill: ${candidates.length}/${allCandidates.length} capped symbol-day(s) from ${candidatesPath}`);
  let requested = 0;
  let created = 0;
  let failed = 0;
  for (const { symbol, date } of candidates) {
    try {
      const result = await ingestIntradayBarsForDay(symbol, 'NASDAQ', date);
      requested += result.requested;
      created += result.created;
      console.log(`  ${symbol} ${date}: ${result.created}/${result.requested} new minute bars`);
    } catch (err) {
      failed += 1;
      console.warn(`  ${symbol} ${date}: FAILED — ${err instanceof Error ? err.message : err}`);
    }
  }
  console.log(`\nCandidate backfill summary: ${requested} bars requested, ${created} new rows created, ${failed} symbol-days failed`);
}

async function main() {
  if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
    throw new Error('ALPACA_API_KEY/ALPACA_API_SECRET are required for the real-data backfill');
  }
  process.env.MARKET_DATA_MODE = 'live'; // Running this script is the explicit live-data opt-in.

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

  const symbols = (arg('symbols') ?? 'AAPL,MSFT,NVDA')
    .split(',')
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z]{1,10}$/.test(symbol));
  const requestedDays = Number.parseInt(arg('days') ?? `${INITIAL_INTRADAY_BACKFILL_DAYS}`, 10);
  const days = Number.isFinite(requestedDays) && requestedDays > 0
    ? Math.min(requestedDays, INITIAL_INTRADAY_BACKFILL_DAYS)
    : INITIAL_INTRADAY_BACKFILL_DAYS;

  for (const symbol of symbols) {
    const result = await ingestIntradayBars(symbol, 'NASDAQ', { days });
    console.log(`${symbol}: ${result.created}/${result.requested} new minute bars (${result.tier})`);
  }
}

main().catch((error) => {
  console.error(`Intraday backfill failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exit(1);
});
