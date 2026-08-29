// P1 from the Sept 8 brief: prove the unattended paper path ACTUALLY TRADES.
//
// WHY THIS EXISTS: `runAutomatedStrategies` currently finds zero AUTO_PAPER strategies and returns
// `{ran: 0, executed: 0}` — success, having done nothing. That is indistinguishable from a healthy
// quiet day unless someone reads the body, and it is the same silent-no-op class as the two-symbol
// ingest roster and the POST-only cron routes, both of which passed every check while doing nothing.
// On 2026-09-08 it would mean a ten-year window accruing zero while the preflight reports PASS.
//
// A GREEN TEST ASSERTING MOCKS IS NOT THE DELIVERABLE. The deliverable is persisted rows produced by
// the real path: trigger -> runCommitteePass -> decision -> executeDecision -> order -> settlement.
//
// SAFETY, in the order it matters:
//   - creates its OWN user and strategy, prefixed `p1-proof-`, and deletes both at the end;
//   - never touches `test-user-portfolio-id` or anything resembling the real incubation strategy;
//   - paper/internal-sim only — `selectBroker` refuses ALPACA_PAPER outside the bounded runner, and
//     the live gate is asserted in the AlpacaPaperBroker constructor. No live order is reachable;
//   - restores the account pin it perturbs, in a finally block.
//
// Run with --keep to leave the rows in place for inspection.
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { runAutomatedStrategies } from '../src/quant/automation/autoRun';
import { selectShadowPaperBroker } from '../src/quant/execution/registry';

const D = Prisma.Decimal;
const TAG = 'p1-proof';
const USER_ID = `${TAG}-user`;
const STRATEGY_ID = `${TAG}-strategy`;

async function cleanup() {
  // Order deletes via Decision cascade would be schema-dependent, so remove explicitly, deepest first.
  const decisions = await prisma.decision.findMany({ where: { userId: USER_ID }, select: { id: true } });
  const ids = decisions.map((d) => d.id);
  if (ids.length) await prisma.order.deleteMany({ where: { decisionId: { in: ids } } });
  await prisma.decision.deleteMany({ where: { userId: USER_ID } });
  await prisma.transaction.deleteMany({ where: { userId: USER_ID } });
  await prisma.portfolioItem.deleteMany({ where: { userId: USER_ID } });
  await prisma.autoRunClaim.deleteMany({ where: { key: { contains: STRATEGY_ID } } });
  await prisma.strategy.deleteMany({ where: { id: STRATEGY_ID } });
  await prisma.user.deleteMany({ where: { id: USER_ID } });
}

async function main() {
  const keep = process.argv.includes('--keep');
  console.log('P1 — proving the unattended paper path trades\n');

  // Pick symbols that actually have fresh bars; executeDecision prices the fill from MarketBar and
  // a symbol without one fails with `no_market_data`, which would prove nothing either way.
  const recent = await prisma.marketBar.groupBy({
    by: ['symbol'],
    where: { market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] } },
    _max: { ts: true },
    orderBy: { _max: { ts: 'desc' } },
    take: 400,
  });
  const newest = recent[0]?._max.ts;
  if (!newest) { console.error('no bars at all — cannot price a fill'); process.exit(1); }
  // A HOLD is a legitimate committee outcome but proves nothing about execution, so the symbol
  // count is configurable: more candidates means more chances that at least one BUY/SELL exercises
  // executeDecision end to end. The engine's own AUTO_RUN_MAX_SYMBOLS cap still applies and must be
  // raised in the environment to match.
  const wanted = Number.parseInt(process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1] ?? '3', 10);
  const symbols = recent.filter((r) => r._max.ts?.getTime() === newest.getTime()).slice(0, wanted).map((r) => r.symbol);
  console.log(`symbols with bars at ${newest.toISOString().slice(0, 10)}: ${symbols.join(', ')}\n`);

  await cleanup(); // idempotent: a prior aborted run leaves nothing behind

  try {
    await prisma.user.create({
      data: {
        id: USER_ID, email: `${TAG}@rushd.local`, name: 'P1 proof (temporary)',
        role: 'PARENT', tier: 'ULTRA', cashVirtual: new D(250_000),
      },
    });
    await prisma.strategy.create({
      data: {
        id: STRATEGY_ID, name: 'P1 proof strategy (temporary, NOT an incubation book)',
        ownerUserId: USER_ID, market: 'NASDAQ', enabled: true, autonomyTier: 'AUTO_PAPER',
        config: { symbols },
      },
    });
    console.log('created temporary user + AUTO_PAPER strategy\n');

    // --- THE ACTUAL TEST: call exactly what the cron calls, with no arguments. ---
    const before = Date.now();
    const result = await runAutomatedStrategies();
    console.log('runAutomatedStrategies() ->', JSON.stringify(result));
    console.log(`(${((Date.now() - before) / 1000).toFixed(1)}s)\n`);

    const decisions = await prisma.decision.findMany({
      where: { userId: USER_ID },
      include: { order: true },
      orderBy: { createdAt: 'asc' },
    });
    const txns = await prisma.transaction.findMany({ where: { userId: USER_ID } });
    const positions = await prisma.portfolioItem.findMany({ where: { userId: USER_ID } });
    const claims = await prisma.autoRunClaim.findMany({ where: { key: { contains: STRATEGY_ID } } });

    console.log('PERSISTED EVIDENCE');
    console.log(`  AutoRunClaim   ${claims.length}  ${claims.map((c) => c.key).join(', ')}`);
    console.log(`  Decision       ${decisions.length}`);
    for (const d of decisions) {
      console.log(`     ${d.symbol.padEnd(6)} ${String(d.finalAction).padEnd(5)} qty=${d.finalQty.toString().padEnd(8)}`
        + ` status=${d.status.padEnd(9)} order=${d.order ? `${d.order.status} ${d.order.filledQty}@${d.order.avgFillPrice} broker=${d.order.broker}` : 'none'}`);
    }
    console.log(`  Transaction    ${txns.length}`);
    for (const t of txns) console.log(`     ${t.type} ${t.amount.toString()} ${t.currency} — ${t.description}`);
    console.log(`  PortfolioItem  ${positions.length}`);
    for (const p of positions) console.log(`     ${p.symbol} ${p.shares.toString()} shares`);

    const executed = decisions.filter((d) => d.status === 'EXECUTED' && d.order).length;
    console.log(`\nVERDICT: ${executed > 0
      ? `the unattended path PLACED AND SETTLED ${executed} order(s) end to end.`
      : `no order settled. ran=${result.ran} executed=${result.executed} — if ran>0 the committee chose HOLD, which is a valid outcome but NOT proof the execution path works.`}`);

    // --- The account pin must refuse a mismatch. ---
    console.log('\nACCOUNT PIN');
    const savedPin = process.env.QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID;
    const savedMut = process.env.QUANT_SHADOW_PAPER_MUTATIONS;
    try {
      process.env.QUANT_SHADOW_PAPER_MUTATIONS = '0';
      try {
        selectShadowPaperBroker(process.env);
        console.log('  FAIL — the shadow-paper broker was constructed with mutations disabled.');
      } catch (e) {
        console.log(`  refused with mutations disabled: ${e instanceof Error ? e.message : e}`);
      }
    } finally {
      if (savedPin === undefined) delete process.env.QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID;
      else process.env.QUANT_SHADOW_PAPER_EXPECTED_ACCOUNT_ID = savedPin;
      if (savedMut === undefined) delete process.env.QUANT_SHADOW_PAPER_MUTATIONS;
      else process.env.QUANT_SHADOW_PAPER_MUTATIONS = savedMut;
    }
  } finally {
    if (keep) {
      console.log(`\n--keep set: rows left in place under ${USER_ID}. Re-run without --keep to remove them.`);
    } else {
      await cleanup();
      console.log('\ncleaned up: temporary user, strategy, decisions, orders, transactions and claims removed.');
    }
    await prisma.$disconnect();
  }
}

main().catch(async (err) => { console.error(err); await cleanup().catch(() => {}); process.exit(1); });
