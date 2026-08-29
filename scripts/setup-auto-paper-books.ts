// Create the two AUTO_PAPER books the owner authorised on 2026-08-29.
//
// OWNER AUTHORISATION (QDR-8 requires it by name, and agents may never self-authorise):
//   "lets try on auto paper account" — for the owner's own 8-symbol basket
//   "choose the best strategy which will beat all numbers mentioned with the new universe"
//
// BOOK 1 — owner-basket-v1. The owner's own picks: AMD GOOGL RKLB MU HIMS MRVL NVDA INOD.
//   This is THE open empirical question. Measured 45.80%/yr with alpha 17.90%/yr and IR 0.58, but
//   t(alpha)=1.41 and the names were supplied AFTER the outcome was known. No backtest can separate
//   skill from recall; only a pre-committed forward record can. The owner has stated it is "not
//   practical for long time" — it is an experiment, not the portfolio.
//
// BOOK 2 — halal-concentrated-core-v1. Top 20 by trailing dollar volume from the POINT-IN-TIME
//   Shariah-screened universe, equal weight, monthly.
//   Measured 2020-11..2026-08: 22.47%/yr, Sharpe 1.02, maxDD 31.9%, 33%/mo turnover, 0.18%/yr cost,
//   against SPUS 17.49%/yr. The only cell in this program that beat the benchmark on BOTH return and
//   Sharpe.
//
// PRE-REGISTERED HONESTY, recorded before a single forward day accrues:
//   • `largest-by-dollar-volume` was a DIAGNOSTIC CONTROL invented mid-analysis, not a hypothesis.
//     It is data-snooped. Running it forward IS the out-of-sample test, and that is its only claim.
//   • It cannot be tested before 2016 (Alpaca SIP starts there), so the eras that would falsify it
//     — 2000-02, 2008 — are unreachable. It is a bet that mega-cap leadership persists.
//   • An earlier version of the same measurement filtered by TODAY's halal roster and returned
//     70.18%/yr for momentum. That was survivorship bias worth ~50pp, caught only because the random
//     null control also beat the benchmark. The numbers above use point-in-time membership.
//
// FALSIFICATION, set now so it cannot be moved later:
//   F1  after 12 months, book 2 trailing SPUS on CAGR   -> the concentration lever did not transfer
//   F2  after 12 months, book 2 Sharpe < SPUS Sharpe    -> it was beta all along, as suspected
//   F3  book 1 alpha t-stat still < 1.96 after 12 months -> selection remains unproven, close it
//
// Paper only. `selectBroker` refuses ALPACA_PAPER outside the bounded runner and the live gate is
// asserted in the AlpacaPaperBroker constructor, so no live order is reachable from here.
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { nasdaqIngestRoster } from '../src/quant/universe/ingestRoster';

const D = Prisma.Decimal;
const OWNER_BASKET = ['AMD', 'GOOGL', 'RKLB', 'MU', 'HIMS', 'MRVL', 'NVDA', 'INOD'];

async function main() {
  const apply = process.argv.includes('--apply');
  const owner = await prisma.user.findFirst({ where: { email: 'test@rushd.dev' } });
  if (!owner) { console.error('owner user not found'); process.exit(1); }

  // A symbol with no bars in the DB cannot be priced, and executeDecision fails `no_market_data`.
  // Reporting that up front beats discovering it as a silent no-op after the window opens.
  const withBars = new Set((await prisma.marketBar.groupBy({
    by: ['symbol'], where: { market: 'NASDAQ', interval: 'DAY' },
  })).map((r) => r.symbol));

  const tradeableOwner = OWNER_BASKET.filter((s) => withBars.has(s));
  const missingOwner = OWNER_BASKET.filter((s) => !withBars.has(s));

  console.log('BOOK 1 — owner-basket-v1');
  console.log(`  requested : ${OWNER_BASKET.join(' ')}`);
  console.log(`  tradeable : ${tradeableOwner.join(' ') || '(none)'}`);
  if (missingOwner.length) {
    console.log(`  NOT TRADEABLE: ${missingOwner.join(' ')}`);
    console.log('    These have no bars in MarketBar because they are outside the screened universe,');
    console.log('    so nothing ingests them. They will also FAIL THE SHARIA GATE: the composite');
    console.log('    screener returns UNKNOWN for names SPUS does not hold, which folds to');
    console.log('    compliant:false, so every BUY on them becomes HOLD and any HOLDING is DIVESTED.');
    console.log('    Trading them requires a screening source that covers them — Awaed or Zoya.');
  }

  const roster = nasdaqIngestRoster();
  console.log(`\nBOOK 2 — halal-concentrated-core-v1`);
  console.log(`  universe  : ${roster.length} screened names; selects top 20 by trailing dollar volume, monthly`);

  if (!apply) {
    console.log('\nDRY RUN. Re-run with --apply to create both books.');
    await prisma.$disconnect();
    return;
  }

  for (const [id, name, config] of [
    ['owner-basket-v1', 'OWNER BASKET v1 (forward experiment, owner-authorised 2026-08-29)',
      { symbols: tradeableOwner, kind: 'owner-picks', preCommittedAt: '2026-08-29', excluded: missingOwner }],
    ['halal-concentrated-core-v1', 'HALAL CONCENTRATED CORE v1 (top-20 by dollar volume, owner-authorised 2026-08-29)',
      { symbols: roster, kind: 'largest-by-dollar-volume', topN: 20, rebalance: 'monthly', preCommittedAt: '2026-08-29' }],
  ] as const) {
    const existing = await prisma.strategy.findUnique({ where: { id } });
    if (existing) { console.log(`  ${id}: already exists (${existing.autonomyTier}) — left alone`); continue; }
    await prisma.strategy.create({
      data: {
        id, name, ownerUserId: owner.id, market: 'NASDAQ',
        enabled: true, autonomyTier: 'AUTO_PAPER', config: config as Prisma.InputJsonValue,
      },
    });
    console.log(`  created ${id}`);
  }

  const all = await prisma.strategy.findMany({ select: { id: true, autonomyTier: true, enabled: true } });
  console.log('\nstrategies now:', JSON.stringify(all));
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
