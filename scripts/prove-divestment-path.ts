// Prove that a HELD, NON-COMPLIANT position is actually SOLD by the unattended path.
//
// WHY THIS EXISTS AND WHY prove-unattended-path.ts IS NOT ENOUGH: the owner held ASTS through a
// Shariah compliance flip and had to sell on someone else's schedule. The engine could not have
// helped — `gateAllowsAction` permits HOLD on a non-compliant name and the portfolio manager only
// rewrote BUY decisions, so a holding that went non-compliant was never divested, merely never added
// to. `requiresDivestment()` + the pre-envelope rewrite in pm.ts fixed that, and six unit tests pin
// the LOGIC (full-position sell, UNKNOWN verdicts, kill-switch precedence).
//
// What no unit test can show is that the divestment SELL survives the whole unattended path:
// runAutomatedStrategies -> committee -> pm -> envelope -> executeDecision -> persisted Order.
// This program has found EIGHT silent no-ops that returned success while doing nothing; a green
// unit test asserting mocks is exactly the evidence that has repeatedly failed to catch them.
//
// prove-unattended-path.ts cannot cover this: it can only test what the committee happens to propose,
// and on 2026-08-29 the deterministic surrogate PM proposed HOLD for all 20 large caps offered
// (net conviction inside its deadband). A HOLD proves nothing about execution. Divestment is
// different — it does not ask the committee's opinion, so it is deterministically triggerable.
//
// HOW THE NON-COMPLIANT CONDITION IS CREATED, without faking a verdict: the composite screener
// derives compliance from SPUS's published holdings. A NASDAQ name that SPUS does not hold returns
// UNKNOWN, which `evaluateShariaGate` folds to `compliant: false` (fail-closed, deliberately). So a
// real, unmocked screener genuinely reports non-compliant for such a symbol — no stub, no fixture,
// no MockScreener. That is the same verdict the live gate would produce in production.
//
// SAFETY: creates its own `divest-proof-` user and strategy and deletes both. Paper/internal-sim
// only. Never touches `test-user-portfolio-id` or the real incubation strategy.
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { runAutomatedStrategies } from '../src/quant/automation/autoRun';
import { evaluateShariaGate } from '../src/quant/gates/sharia';

const D = Prisma.Decimal;
const TAG = 'divest-proof';
const USER_ID = `${TAG}-user`;
const STRATEGY_ID = `${TAG}-strategy`;

/** Two shapes live in this column: a bare array (committee runner) and `{adjustments:[...]}`
 *  (incubation books). Reading only one silently returns nothing for the other. */
function readAdjustments(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  const nested = (v as { adjustments?: unknown } | null)?.adjustments;
  return Array.isArray(nested) ? nested as string[] : [];
}

async function cleanup() {
  const ids = (await prisma.decision.findMany({ where: { userId: USER_ID }, select: { id: true } })).map((d) => d.id);
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
  console.log('DIVESTMENT PROOF — does the unattended path SELL a held non-compliant position?\n');

  // A symbol needs BOTH a non-compliant verdict AND priceable bars: executeDecision prices the fill
  // from MarketBar, and a symbol without one fails `no_market_data`, which would prove nothing.
  const candidates = await prisma.marketBar.groupBy({
    by: ['symbol'],
    where: { market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] } },
    _max: { ts: true },
    orderBy: { _max: { ts: 'desc' } },
    take: 400,
  });
  const newest = candidates[0]?._max.ts;
  if (!newest) { console.error('no bars at all'); process.exit(1); }
  const fresh = candidates.filter((c) => c._max.ts?.getTime() === newest.getTime()).map((c) => c.symbol);

  let target: string | null = null;
  for (const s of fresh) {
    const gate = await evaluateShariaGate(s, 'NASDAQ', undefined, 'strict');
    if (!gate.compliant) {
      target = s;
      console.log(`non-compliant + priceable: ${s}`);
      console.log(`  verdict: compliant=${gate.compliant} source=${gate.source} reason=${gate.reason}\n`);
      break;
    }
  }
  if (!target) {
    // Not a failure of the fix — a failure to construct the CONDITION. Say which, precisely.
    console.error('INCONCLUSIVE: every priceable symbol is currently compliant under the live screener,');
    console.error('so a divestment cannot be triggered without faking a verdict — which this proof refuses');
    console.error('to do. Re-run when a held name is genuinely non-compliant, or ingest bars for a symbol');
    console.error('outside SPUS holdings (e.g. INOD) so the composite screener returns UNKNOWN for it.');
    process.exit(2);
  }

  await cleanup();
  try {
    const price = (await prisma.marketBar.findFirst({
      where: { symbol: target, market: 'NASDAQ', interval: 'DAY' }, orderBy: { ts: 'desc' },
    }))!.close;

    await prisma.user.create({
      data: {
        id: USER_ID, email: `${TAG}@rushd.local`, name: 'Divestment proof (temporary)',
        role: 'PARENT', tier: 'ULTRA', cashVirtual: new D(100_000),
      },
    });
    await prisma.strategy.create({
      data: {
        id: STRATEGY_ID, name: 'Divestment proof (temporary, NOT an incubation book)',
        ownerUserId: USER_ID, market: 'NASDAQ', enabled: true, autonomyTier: 'AUTO_PAPER',
        config: { symbols: [target] },
      },
    });
    // THE HOLDING. This is the whole point: before the fix, this position would sit here forever.
    await prisma.portfolioItem.create({
      data: {
        userId: USER_ID, symbol: target, market: 'NASDAQ', currency: 'USD',
        shares: new D(25), costBasis: new D(price).mul(25),
      },
    });
    console.log(`created temporary user holding 25 ${target} @ ${price}\n`);

    const result = await runAutomatedStrategies();
    console.log('runAutomatedStrategies() ->', JSON.stringify(result), '\n');

    const decisions = await prisma.decision.findMany({
      where: { userId: USER_ID }, include: { order: true }, orderBy: { createdAt: 'asc' },
    });
    const positions = await prisma.portfolioItem.findMany({ where: { userId: USER_ID } });

    console.log('PERSISTED EVIDENCE');
    for (const d of decisions) {
      // `runner.ts:143` stores `pm.adjustments` as a RAW ARRAY. An earlier version of this reader
      // looked for a `.adjustments` property on it, found undefined, and printed `[]` — which made a
      // WORKING fix look broken and nearly got reported as a defect in pm.ts. The test was wrong,
      // not the code. `incubationBooks.ts` really does wrap it in an object, so both shapes exist in
      // this schema and a reader must handle each.
      const adj = readAdjustments(d.riskAdjustments);
      console.log(`  ${d.symbol} proposed=${d.proposedAction} final=${d.finalAction} qty=${d.finalQty} `
        + `status=${d.status} adjustments=${JSON.stringify(adj)}`);
      console.log(`     order: ${d.order ? `${d.order.status} ${d.order.filledQty}@${d.order.avgFillPrice}` : 'none'}`);
    }
    console.log(`  remaining position: ${positions.length ? positions.map((p) => `${p.symbol} ${p.shares}`).join(', ') : 'NONE (fully divested)'}`);

    const sold = decisions.find((d) => d.finalAction === 'SELL');
    const flagged = decisions.some((d) => readAdjustments(d.riskAdjustments)
      .some((a) => a.startsWith('sharia_divestment_required')));

    console.log(`\nVERDICT: ${sold && flagged
      ? `PASS — the unattended path issued a SELL of ${sold.finalQty} ${sold.symbol} and tagged it as a Sharia divestment.`
      : sold ? 'PARTIAL — a SELL was issued but not tagged as a divestment; check the adjustment marker.'
        : 'FAIL — the non-compliant holding was NOT sold. This is the ASTS scenario, unfixed.'}`);
    if (!sold) process.exitCode = 1;
  } finally {
    if (keep) console.log(`\n--keep set: rows left under ${USER_ID}.`);
    else { await cleanup(); console.log('\ncleaned up.'); }
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); process.exit(1); });
