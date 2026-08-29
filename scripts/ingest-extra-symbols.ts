// Ingest bars for symbols OUTSIDE the SPUS-derived roster, so they can at least be priced.
//
// WHY THIS EXISTS: the owner asked why RKLB and HIMS "have no bars" when they are real
// opportunities. They have no bars because `nasdaqIngestRoster()` is `buildVerifiedUniverse()` plus
// the benchmark ETFs, and `buildVerifiedUniverse()` is SPUS's published holdings. Nothing ingests a
// name SPUS does not hold. That is a PROXY for Shariah compliance, not a screen — a perfectly
// compliant company is invisible to this system purely because one ETF's manager did not buy it.
//
// This program's own compliance tool disagrees with the proxy: RKLB screens clean on AAOIFI ratios
// (debt/spot-cap 0.0%, cash/cap 3.8%, 2026Q2). The gate still refuses it, because the gate consults
// SPUS holdings + the Saudi list, and neither mentions RKLB — which folds to `compliant: false`.
//
// SO INGESTING BARS IS NECESSARY BUT NOT SUFFICIENT. It fixes "cannot be priced". It does NOT fix
// "the gate has no evidence", and it must not: the frames-derived screen behind compliance-early-
// warning is restated-value with an approximated filing date, deliberately advisory, and wiring it
// into `evaluateShariaGate` would be exactly the shortcut this repo's doctrine forbids. Clearing
// these names for trading needs a screening source that actually covers them — Awaed or Zoya.
//
// SAFETY: `ingestBars` now REFUSES to write synthetic candles (throws unless ALLOW_SYNTHETIC_BARS=1).
// That guard exists because this exact operation, run through `npx tsx -e` which does not load .env,
// silently wrote 61 fabricated MOCK bars on 2026-08-29. This script loads dotenv explicitly and
// asserts the resolved provider is real BEFORE writing anything.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Apply `.env` to process.env BEFORE the modules that read it are imported.
 *
 * No `dotenv` dependency: this repo already loads env this way in backfill-alpaca-sip.ts and
 * forward-lane-preflight.ts, and a new package for six lines fails the lazy-dev ladder at rung 1.
 * Existing values win, so an explicit shell override still takes precedence.
 */
function applyDotEnv(): void {
  try {
    for (const line of readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env is a valid state; the provider assertion below is the real gate */ }
}

async function main() {
  applyDotEnv();
  // Dynamic imports: `registry` resolves its provider from env, so it must not be loaded first.
  const { ingestBars } = await import('../src/quant/data/ingest');
  const { registry, MockProvider } = await import('../src/services/marketData');
  const { prisma } = await import('../src/lib/prisma');

  const symbols = (process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1] ?? 'RKLB,HIMS,INOD')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  // Belt and braces: the ingest guard would throw anyway, but failing here names the cause plainly
  // instead of surfacing it once per symbol.
  const provider = registry.getProvider('NASDAQ');
  console.log(`provider: ${provider.constructor.name}`);
  if (provider instanceof MockProvider) {
    console.error('Resolved provider is MockProvider — it FABRICATES candles. Refusing to run.');
    console.error('ALPACA_API_KEY/ALPACA_API_SECRET are not visible; check .env is being loaded.');
    process.exit(1);
  }

  for (const symbol of symbols) {
    try {
      const r = await ingestBars(symbol, 'NASDAQ', { days: 400 });
      const latest = await prisma.marketBar.findFirst({
        where: { symbol, market: 'NASDAQ', interval: 'DAY' }, orderBy: { ts: 'desc' },
        select: { ts: true, close: true, source: true },
      });
      console.log(`  ${symbol.padEnd(6)} upserted ${String(r.upserted).padStart(4)}  source=${r.source}`
        + `  latest ${latest?.ts.toISOString().slice(0, 10)} @ ${latest?.close.toString()}`);
    } catch (err) {
      console.log(`  ${symbol.padEnd(6)} FAILED: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
    }
  }

  const mock = await prisma.marketBar.count({ where: { source: 'MOCK' } });
  console.log(`\nMOCK bars in database: ${mock}${mock ? '  <-- PURGE THESE' : '  (clean)'}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
