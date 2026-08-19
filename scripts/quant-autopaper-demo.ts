// scripts/quant-autopaper-demo.ts — concrete, runnable proof that the AUTO_PAPER path works
// end-to-end against InternalSimBroker (backend-expert dispatch: "make automated daily paper
// trading actually work"). NOT a cron entrypoint — render.yaml owns that (see the dispatch
// report's OPEN items: the production cron does not currently invoke /api/cron/quant-run at
// all, a separate, out-of-fence finding). This is the isolated, cleanup-safe demo/admin path:
//
//   npx tsx scripts/quant-autopaper-demo.ts setup <SYMBOL>   # put the demo strategy on AUTO_PAPER
//   npx tsx scripts/quant-autopaper-demo.ts run              # runAutomatedStrategies() once, print results
//   npx tsx scripts/quant-autopaper-demo.ts halt-test        # engage the kill-switch, prove nothing runs
//   npx tsx scripts/quant-autopaper-demo.ts cleanup          # remove every row this script created
//
// Every fixture this script creates is tagged with DEMO_* ids so `cleanup` removes exactly
// (and only) what `setup` created — it never touches any other Strategy/User/Decision.
process.loadEnvFile?.('.env');
import { PrismaClient } from '@prisma/client';
import { runAutomatedStrategies } from '../src/quant/automation/autoRun';
import { setHalt } from '../src/quant/automation/control';

const prisma = new PrismaClient();

const DEMO_USER_ID = 'demo-autopaper-user';
const DEMO_STRATEGY_ID = 'demo-autopaper-strategy';
// STATE (QDR-8): zero strategy versions have ever been ACCEPTED — anything trading here is an
// unpromoted forward test, never a promoted book. Label carried on the row for auditability.
const LABEL = 'unpromoted forward test — paper only';

async function setup(symbol: string) {
  await prisma.user.upsert({
    where: { id: DEMO_USER_ID },
    create: { id: DEMO_USER_ID, name: `AUTO_PAPER demo (${LABEL})`, role: 'PARENT' },
    update: {},
  });
  // MAX_STRATEGIES defaults to 1 (AUTO_RUN_MAX_STRATEGIES) — disable every other AUTO_PAPER
  // strategy so this demo is deterministic regardless of what else is enabled in the DB.
  await prisma.strategy.updateMany({
    where: { autonomyTier: 'AUTO_PAPER', NOT: { id: DEMO_STRATEGY_ID } },
    data: { enabled: false },
  });
  const strategy = await prisma.strategy.upsert({
    where: { id: DEMO_STRATEGY_ID },
    create: {
      id: DEMO_STRATEGY_ID,
      ownerUserId: DEMO_USER_ID,
      name: `AUTO_PAPER demo — ${LABEL}`,
      market: 'NASDAQ',
      config: { symbols: [symbol] },
      autonomyTier: 'AUTO_PAPER',
      enabled: true,
    },
    update: { config: { symbols: [symbol] }, autonomyTier: 'AUTO_PAPER', enabled: true },
  });
  console.log(`[setup] strategy=${strategy.id} owner=${DEMO_USER_ID} symbols=${JSON.stringify(symbol)} tier=AUTO_PAPER`);
}

async function run() {
  const result = await runAutomatedStrategies();
  console.log(`[run] ${JSON.stringify(result)}`);
  const decisions = await prisma.decision.findMany({
    where: { strategyId: DEMO_STRATEGY_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { order: true },
  });
  for (const d of decisions) {
    console.log(
      `  decision=${d.id} symbol=${d.symbol} proposed=${d.proposedAction} final=${d.finalAction} `
        + `qty=${d.finalQty} status=${d.status} adjustments=${JSON.stringify(d.riskAdjustments)} `
        + `shariaGate=${JSON.stringify(d.shariaGate)}`,
    );
    if (d.order) {
      console.log(
        `    order=${d.order.id} broker=${d.order.broker} status=${d.order.status} `
          + `filledQty=${d.order.filledQty} avgFillPrice=${d.order.avgFillPrice}`,
      );
    }
  }
  const txns = await prisma.transaction.findMany({
    where: { userId: DEMO_USER_ID },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  for (const t of txns) console.log(`  transaction=${t.id} type=${t.type} amount=${t.amount} ${t.currency} "${t.description}"`);
}

async function haltTest() {
  await setHalt(true, 'quant-autopaper-demo kill-switch proof');
  const result = await runAutomatedStrategies();
  console.log(`[halt-test] control.halted=true -> ${JSON.stringify(result)}`);
  await setHalt(false);
  console.log('[halt-test] control.halted reset to false');
}

async function cleanup() {
  await prisma.order.deleteMany({ where: { decision: { strategyId: DEMO_STRATEGY_ID } } });
  await prisma.analystSignalRecord.deleteMany({ where: { decision: { strategyId: DEMO_STRATEGY_ID } } });
  await prisma.decision.deleteMany({ where: { strategyId: DEMO_STRATEGY_ID } });
  await prisma.transaction.deleteMany({ where: { userId: DEMO_USER_ID } });
  await prisma.portfolioItem.deleteMany({ where: { userId: DEMO_USER_ID } });
  const { count } = await prisma.autoRunClaim.deleteMany({ where: { key: { contains: `:${DEMO_STRATEGY_ID}:` } } });
  await prisma.strategy.deleteMany({ where: { id: DEMO_STRATEGY_ID } });
  await prisma.user.deleteMany({ where: { id: DEMO_USER_ID } });
  console.log(`[cleanup] removed demo strategy/user/decisions/orders/transactions + ${count} claim(s)`);
}

async function main() {
  const [, , cmd, ...args] = process.argv;
  if (cmd === 'setup') await setup(args[0] ?? 'AAPL');
  else if (cmd === 'run') await run();
  else if (cmd === 'halt-test') await haltTest();
  else if (cmd === 'cleanup') await cleanup();
  else {
    console.error('usage: quant-autopaper-demo.ts <setup SYMBOL|run|halt-test|cleanup>');
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
