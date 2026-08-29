// src/quant/universe/ingestRoster.ts — the single answer to "which symbols must have bars?".
//
// This exists because the roster had already drifted twice, both times silently:
//   1. the ingest cron shipped with a two-symbol stub (`['MSFT','NVDA']`) while the engine traded a
//      sleeve of 217, and
//   2. the charter incubation books require names the screen does not produce, so
//      `completeUniverseAsOf` returned null and every nightly pass no-opped with HTTP 200.
//
// Both were invisible because nothing compared the roster to its consumers. The preflight now does,
// and it must compare against THIS function rather than re-deriving its own copy — a check that
// builds the list a second way can agree with itself while both disagree with production.
import { buildVerifiedUniverse } from './buildVerifiedUniverse';

/**
 * Shariah ETFs the engine needs price series for but a stock screen can never produce.
 *
 * `buildVerifiedUniverse()` screens COMPANIES on accounting ratios, so a fund is structurally
 * absent from it — no such ratio applies to an ETF. `dual-momentum-rotation` rotates INTO these
 * two and they are compliant by construction (SPUS and HLAL are themselves Shariah funds), so
 * ingesting them adds no screening judgement of ours.
 */
export const BENCHMARK_SYMBOLS: readonly string[] = Object.freeze(['SPUS', 'HLAL']);

/**
 * The NASDAQ ingest roster: the screened investable universe plus the benchmark series.
 *
 * Deriving the screened part from `buildVerifiedUniverse()` — the same function `runLab` uses to
 * resolve the traded sleeve — is what keeps the roster from drifting away from what the strategy
 * actually consumes.
 */
export function nasdaqIngestRoster(): string[] {
  const screened = buildVerifiedUniverse().entries.map((entry) => entry.symbol);
  return Array.from(new Set([...screened, ...BENCHMARK_SYMBOLS]));
}
