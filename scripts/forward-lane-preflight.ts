// Forward-lane readiness preflight.
//
// The sealed confirmatory lane opens 2026-09-08 and its evidence is UNBACKFILLABLE. The dangerous
// failure is not a crash — it is the scheduler running on time and doing nothing while reporting
// success. That is the live state as of 2026-08-26: `runAutomatedStrategies` finds zero AUTO_PAPER
// strategies and returns `{ran: 0, executed: 0}`, which is indistinguishable from a healthy quiet
// day unless someone reads the response body.
//
// This script makes every precondition explicit and fails loudly on the ones that are not met.
// It is READ-ONLY: it places no order, writes no row, and runs no migration.
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { INCUBATION_SYMBOLS } from '../src/quant/automation/incubationBooks';
import { nasdaqIngestRoster } from '../src/quant/universe/ingestRoster';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /** What to do about it. Empty when ok. */
  remedy: string;
}

function loadEnv(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const i = line.indexOf('=');
          return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        }),
    );
  } catch {
    return {};
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
  // Apply the file's values to process.env before any check that resolves a provider or screener
  // from it. Those read `process.env` directly, so without this the preflight would evaluate a
  // DIFFERENT environment than the app — reporting a healthy gate while the app runs on mocks, or
  // the reverse. Real process.env still wins; this only fills gaps.
  for (const [key, value] of Object.entries(loadEnv())) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  const url = env.DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!url) {
    console.error('FATAL: no DATABASE_URL');
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const checks: Check[] = [];
  const now = new Date();

  // 1. Scheduler auth. Without it every scheduled call fails closed with 500.
  checks.push({
    name: 'CRON_SECRET configured',
    ok: Boolean(env.CRON_SECRET),
    detail: env.CRON_SECRET ? 'present' : 'MISSING',
    remedy: 'Set CRON_SECRET in the Vercel project environment. Routes fail closed without it.',
  });

  // 2. Global kill switch.
  const control = await prisma.quantControl.findFirst();
  checks.push({
    name: 'automation not halted',
    ok: control ? !control.halted : true,
    detail: control ? `halted=${control.halted}${control.reason ? ` (${control.reason})` : ''}` : 'no control row (defaults to active)',
    remedy: 'Clear the halt in QuantControl before the window opens.',
  });

  // 3. THE SILENT NO-OP. Zero AUTO_PAPER strategies means the cron runs, succeeds, and trades
  //    nothing — the failure mode this whole script exists to surface.
  const autoPaper = await prisma.strategy.findMany({
    where: { enabled: true, autonomyTier: 'AUTO_PAPER' },
    select: { id: true, name: true, ownerUserId: true, market: true },
  });
  checks.push({
    name: 'at least one enabled AUTO_PAPER strategy',
    ok: autoPaper.length > 0,
    detail: autoPaper.length > 0
      ? autoPaper.map((s) => `${s.name} (${s.id})`).join(', ')
      : 'NONE — the scheduled run will report success and trade nothing',
    remedy: 'Create the incubation strategy with autonomyTier=AUTO_PAPER, enabled=true. Per QDR-8 '
      + 'the owner must authorise the strategy VERSION by name before this is legitimate.',
  });

  // 4. The owner row. The test suite deleted it on 2026-08-22; without it the strategy has no
  //    owner and executeDecision has no account to act for.
  const ownerId = env.QUANT_INCUBATION_OWNER_USER_ID;
  const owner = ownerId
    ? await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, email: true } })
    : null;
  checks.push({
    name: 'incubation owner user exists',
    ok: Boolean(owner),
    detail: !ownerId ? 'QUANT_INCUBATION_OWNER_USER_ID unset'
      : owner ? `${owner.email}` : `id ${ownerId} NOT FOUND (deleted by the 2026-08-22 test wipe)`,
    // NOT a manual restore. `assertIncubationOwner` requires only PARENT + ULTRA, and the id is
    // referenced nowhere but .env — so any owner satisfying those two facts works. Checked before
    // asserting this: the previously "lost" id appeared in no source file.
    remedy: 'Run `node scripts/seed-dev.mjs` then `node scripts/set-incubation-owner.mjs`, and set '
      + 'QUANT_INCUBATION_OWNER_USER_ID to the id it prints. No point-in-time restore is needed: '
      + 'the owner is an identity, not history, and the forward lane starts flat.',
  });

  // 5. Forward membership capture — unbackfillable, so a stall is urgent.
  const latestCapture = await prisma.universeMembershipCapture.findFirst({
    orderBy: { captureDate: 'desc' },
    select: { captureDate: true, capturedAt: true },
  });
  const captureAgeDays = latestCapture
    ? (now.getTime() - latestCapture.captureDate.getTime()) / DAY_MS
    : Infinity;
  checks.push({
    name: 'membership capture is current',
    ok: captureAgeDays <= 4,
    detail: latestCapture
      ? `latest ${latestCapture.captureDate.toISOString().slice(0, 10)} (${captureAgeDays.toFixed(1)}d old)`
      : 'NO CAPTURES — forward evidence is not accruing',
    remedy: 'Run scripts/capture-membership-once.ts, and confirm quant-ingest is scheduled. '
      + 'A day not captured cannot be recovered.',
  });

  // 6. Bars. The engine consumes daily bars; stale bars mean stale decisions.
  //    Source filter is load-bearing: three MOCK rows dated 2026-08-22 were reporting the feed as
  //    fresh while real YAHOO coverage ended 2026-08-21. A fixture must never satisfy a liveness
  //    check — that is the same masking class as the two-symbol ingest roster.
  const latestBar = await prisma.marketBar.findFirst({
    where: { market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] } },
    orderBy: { ts: 'desc' },
    select: { ts: true, symbol: true },
  });
  const barAgeDays = latestBar ? (now.getTime() - latestBar.ts.getTime()) / DAY_MS : Infinity;
  checks.push({
    name: 'daily bars are fresh',
    ok: barAgeDays <= 5,
    detail: latestBar
      ? `latest ${latestBar.ts.toISOString().slice(0, 10)} (${barAgeDays.toFixed(1)}d old)`
      : 'NO BARS',
    remedy: 'Confirm the quant-ingest cron is scheduled and CRON_SECRET is set in Vercel.',
  });

  // 6b. THE SECOND SILENT NO-OP, and the one that is already firing every night.
  //
  //     `runDailyIncubationBooks` resolves its as-of date through `completeUniverseAsOf`, which
  //     returns null unless EVERY symbol in the charter books has a bar. Three of the four books
  //     use `NASDAQ_HALAL_UNIVERSE`, a hand-curated list that predates the SPUS-derived verified
  //     universe the ingest cron actually fetches. Nine of its names (AMZN, META, NFLX, COST,
  //     SBUX, AMGN, CMCSA, HON, INTU) are not in that roster, so ingest will never fetch them and
  //     they can never acquire a bar. The result is `{processed:false, reason:
  //     'no_incubation_market_day'}` returned with HTTP 200 — forever. AllocationDecision and
  //     BookEvaluation both hold zero rows, which is what a permanent structural no-op looks like.
  //
  //     This check is deliberately NOT "are the bars recent". It is "is the roster satisfiable at
  //     all", because a stale roster is a permanent defect and a stale feed is a transient one.
  const ingestable = new Set(nasdaqIngestRoster());
  const unreachable = INCUBATION_SYMBOLS.filter((symbol) => !ingestable.has(symbol));
  checks.push({
    name: 'incubation roster is ingestable',
    ok: unreachable.length === 0,
    detail: unreachable.length === 0
      ? `all ${INCUBATION_SYMBOLS.length} charter symbols are in the ${ingestable.size}-name ingest roster`
      : `${unreachable.length}/${INCUBATION_SYMBOLS.length} charter symbols are NOT ingestable (${unreachable.join(', ')})`
        + ' — latestAsOf returns null and every run is a silent no-op',
    remedy: 'Do NOT "fix" this by making latestAsOf tolerate missing symbols: silently shrinking a '
      + "book's universe to whatever happens to have data is a covert coverage bet, the exact defect "
      + 'that falsified halal-fundamental-momentum-core@v1 (QDR-17). The charter books\' universe '
      + 'and the ingest roster must be reconciled by an owner decision, because changing a book\'s '
      + 'universe changes the strategy and invalidates its frozen validation prior.',
  });

  // 6c. THE SHARIA GATE'S EVIDENCE SOURCE — the no-op that would have cost the whole window.
  //
  //     `registry.getScreener()` returns `CompositeShariaScreener` only when SHARIA_SOURCE is
  //     'composite' (or ZoyaAdapter with a live key); otherwise it returns `MockScreener`. A mock
  //     verdict carries `source: 'mock'`, which is not in the gate's VERIFIED_EXECUTION_SOURCES, so
  //     the strict gate fails closed with `unverified_source_fail_closed` and rewrites EVERY BUY to
  //     HOLD. Measured 2026-08-27: with the default env, 20 of 20 symbols returned HOLD while the
  //     committee had proposed a real 304-share BUY; with SHARIA_SOURCE=composite the same run
  //     executed and settled an order end to end.
  //
  //     This asserts the OUTCOME, not the variable. Checking `SHARIA_SOURCE` alone would still pass
  //     with a missing snapshot file, an empty holdings list, or evidence aged past the gate's 135-day
  //     limit — each of which produces the same silent all-HOLD behaviour.
  let gateDetail: string;
  let gateOk = false;
  try {
    const { registry } = await import('../src/services/marketData');
    const { evaluateShariaGate } = await import('../src/quant/gates/sharia');
    const screener = registry.getScreener();
    // A name the authorised ETF-holdings source should cover. If the largest constituent of the
    // Sharia index cannot clear the gate, nothing will.
    const gate = await evaluateShariaGate('AAPL', 'NASDAQ', screener, 'strict');
    gateOk = gate.compliant;
    gateDetail = `${screener.constructor.name} -> source=${gate.source} compliant=${gate.compliant}`
      + (gate.compliant ? '' : ` reason=${gate.reason}`);
  } catch (error) {
    gateDetail = `gate check threw: ${error instanceof Error ? error.message : String(error)}`;
  }
  checks.push({
    name: 'sharia gate can clear a trade',
    ok: gateOk,
    detail: gateOk ? gateDetail : `${gateDetail} — EVERY BUY WILL BECOME HOLD`,
    remedy: 'Set SHARIA_SOURCE=composite so registry.getScreener() returns CompositeShariaScreener '
      + '(free, keyless, cites SPUS published holdings) instead of MockScreener. If it is already set, '
      + 'the snapshot is stale or empty: refresh it with scripts/refresh-sharia-snapshots.ts — the gate '
      + 'rejects evidence older than 135 days.',
  });

  // 7. Broker credentials and the account pin. Paper only — the pin is what stops a live account
  //    being reached by a misconfigured deploy.
  checks.push({
    name: 'Alpaca paper credentials present',
    ok: Boolean(env.ALPACA_API_KEY && env.ALPACA_API_SECRET),
    detail: env.ALPACA_API_KEY ? 'key + secret present' : 'MISSING',
    remedy: 'Set ALPACA_API_KEY and ALPACA_API_SECRET.',
  });
  checks.push({
    name: 'shadow-paper account pinned',
    ok: Boolean(env.QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID),
    detail: env.QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID ? 'pinned' : 'UNPINNED',
    remedy: 'Set QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID. Without the pin a misconfigured '
      + 'deployment can reach an unintended account.',
  });

  await prisma.$disconnect();

  const failed = checks.filter((c) => !c.ok);
  const width = Math.max(...checks.map((c) => c.name.length));
  console.log('\nForward-lane readiness — sealed window opens 2026-09-08\n');
  for (const check of checks) {
    console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.name.padEnd(width)}  ${check.detail}`);
  }
  if (failed.length > 0) {
    console.log('\nBlocking:\n');
    for (const check of failed) console.log(`  - ${check.name}\n      ${check.remedy}`);
  }
  const days = Math.ceil((Date.UTC(2026, 8, 8) - now.getTime()) / DAY_MS);
  console.log(`\n${failed.length} of ${checks.length} checks failing. ${days} days to the window.\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('preflight failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
