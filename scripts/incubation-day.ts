// scripts/incubation-day.ts — local scheduler entrypoint for the QDR-8 incubation loop.
// Runs the daily book pass then the nightly evaluation directly (no HTTP server needed),
// mirroring the signed cron routes. Idempotent per (day, book) via AutoRunClaim, so extra
// invocations are no-ops. Run after US market close: npx tsx scripts/incubation-day.ts
process.loadEnvFile?.();

import { execFileSync } from 'node:child_process';
import { runDailyIncubationBooks, INCUBATION_BOOKS } from '../src/quant/automation/incubationBooks';
import { runNightlyIncubationEvaluation } from '../src/quant/automation/incubationEvaluation';

async function main() {
  // 1. Forward-ingest today's real daily bars for the books' union universe + the
  //    evaluation benchmarks (SPY/SPUS) via the existing script; idempotent.
  const symbols = Array.from(
    new Set([...INCUBATION_BOOKS.flatMap((book) => [...book.universe]), 'SPY', 'SPUS']),
  ).map((s) => `${s}:NASDAQ`);
  // Neon's serverless pooler intermittently drops connections mid-upsert; the ingest is
  // idempotent, so retry the whole step instead of failing the unattended cron day.
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync('npx', ['tsx', 'scripts/quant-ingest.ts', ...symbols], {
        stdio: 'inherit',
        // Real keyless data (Yahoo) unless the caller opted into a keyed provider —
        // without this the registry falls back to MOCK, which the incubation lane
        // structurally rejects (QDR-6 real-data-only; purge strays via purge-mock-bars.mjs).
        env: { ...process.env, MARKET_DATA_MODE: process.env.MARKET_DATA_MODE ?? 'keyless' },
      });
      break;
    } catch (e) {
      if (attempt >= 3) throw e;
      console.warn(`[incubation-day] ingest attempt ${attempt} failed; retrying in 30s`);
      await new Promise((resolve) => setTimeout(resolve, 30_000));
    }
  }

  // 2. Daily book pass, then nightly evaluation (both idempotent per (day, book)).
  const pass = await runDailyIncubationBooks(new Date());
  console.log(`[incubation-day] pass: ${JSON.stringify(pass)}`);
  const evaluation = await runNightlyIncubationEvaluation(new Date());
  console.log(`[incubation-day] eval: ${JSON.stringify(evaluation)}`);
}

main().catch((e) => {
  console.error(`[incubation-day] FAILED: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
