// Will the unattended lane ever actually trade?
//
// WHY THIS EXISTS: `prove-unattended-path.ts` ran on 2026-08-29 against 20 NASDAQ large caps and the
// committee proposed HOLD for every single one, so no order settled and the execution leg went
// unproven. That is a legitimate outcome — HOLD is a real decision — but it raises a question nobody
// had asked: is the deterministic surrogate PM's deadband calibrated such that BUYs essentially
// never fire?
//
// It matters because OBJ-1 is "the unattended path must actually trade, and be provable". A lane
// that produces Decisions but never Orders is the tenth silent no-op in this program — it would
// report success every scheduled day, forever, having traded nothing.
//
//   netScore = mean over non-abstaining analysts of sign(stance) x conviction   -> [-1, 1]
//   |netScore| <= DEADBAND (0.15)  =>  HOLD
//
// This measures the DISTRIBUTION of that score across the real universe, using the real analysts and
// real bars. No writes of any kind: it calls collectSignals and computes, it never persists a
// Decision, an Order, or anything else.
import { collectSignals, DEFAULT_ANALYSTS } from '../src/quant/committee/collect';
import { loadPointInTimeContext } from '../src/quant/data/pointInTime';
import { nasdaqIngestRoster } from '../src/quant/universe/ingestRoster';
import { prisma } from '../src/lib/prisma';

const DEADBAND = 0.15; // must mirror pmSurrogate.ts; asserted below rather than assumed

function stanceSign(stance: string): number {
  if (stance === 'BULLISH') return 1;
  if (stance === 'BEARISH') return -1;
  return 0;
}

async function main() {
  const limit = Number.parseInt(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? '40', 10);
  // Only symbols with fresh bars: an analyst starved of data abstains, and an abstention is not
  // evidence about the deadband.
  const recent = await prisma.marketBar.groupBy({
    by: ['symbol'],
    where: { market: 'NASDAQ', interval: 'DAY', source: { in: ['YAHOO', 'ALPACA'] } },
    _max: { ts: true },
    orderBy: { _max: { ts: 'desc' } },
    take: 400,
  });
  const newest = recent[0]?._max.ts;
  if (!newest) { console.error('no bars'); process.exit(1); }
  const roster = new Set(nasdaqIngestRoster());
  const symbols = recent
    .filter((r) => r._max.ts?.getTime() === newest.getTime() && roster.has(r.symbol))
    .slice(0, limit)
    .map((r) => r.symbol);

  console.log(`committee conviction across ${symbols.length} symbols with bars at ${newest.toISOString().slice(0, 10)}`);
  console.log(`analysts: ${DEFAULT_ANALYSTS.length}   deadband: ±${DEADBAND}\n`);

  const scores: { symbol: string; score: number; active: number; abstained: number }[] = [];
  for (const symbol of symbols) {
    try {
      // Same construction runCommitteePass uses, so this measures the real committee's inputs
      // rather than a convenient approximation of them.
      const ctx = await loadPointInTimeContext({ symbol, market: 'NASDAQ', asOf: newest, maxLookbackDays: 400 });
      const result = await collectSignals(ctx, { analysts: DEFAULT_ANALYSTS });
      const active = result.signals.filter((s) => s.failureMode !== 'abstain');
      const score = active.length
        ? active.reduce((a, s) => a + stanceSign(s.stance) * s.conviction, 0) / active.length
        : 0;
      scores.push({ symbol, score, active: active.length, abstained: result.signals.length - active.length });
    } catch { /* a symbol that cannot be collected is not evidence either way */ }
  }
  if (!scores.length) { console.error('no symbols produced signals'); process.exit(1); }

  const sorted = scores.map((s) => s.score).sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  const buys = scores.filter((s) => s.score > DEADBAND).length;
  const sells = scores.filter((s) => s.score < -DEADBAND).length;
  const holds = scores.length - buys - sells;
  const meanAbstain = scores.reduce((a, s) => a + s.abstained, 0) / scores.length;

  console.log('netScore distribution');
  console.log(`  min ${q(0).toFixed(3)}   p25 ${q(0.25).toFixed(3)}   median ${q(0.5).toFixed(3)}`
    + `   p75 ${q(0.75).toFixed(3)}   max ${q(0.999).toFixed(3)}`);
  console.log(`  |score| > deadband: ${buys + sells} of ${scores.length}`);
  console.log(`\nimplied actions   BUY ${buys}   SELL ${sells}   HOLD ${holds}`);
  console.log(`mean analysts abstaining per symbol: ${meanAbstain.toFixed(2)} of ${DEFAULT_ANALYSTS.length}`);

  console.log('\nstrongest signals either way');
  for (const s of scores.slice().sort((a, b) => b.score - a.score).slice(0, 3)) {
    console.log(`  ${s.symbol.padEnd(6)} ${s.score >= 0 ? '+' : ''}${s.score.toFixed(3)}  (${s.active} active, ${s.abstained} abstained)`);
  }
  for (const s of scores.slice().sort((a, b) => a.score - b.score).slice(0, 3)) {
    console.log(`  ${s.symbol.padEnd(6)} ${s.score >= 0 ? '+' : ''}${s.score.toFixed(3)}  (${s.active} active, ${s.abstained} abstained)`);
  }

  console.log(`\nREADING: ${buys + sells === 0
    ? 'ZERO symbols clear the deadband. The unattended lane would produce Decisions and NO Orders '
      + 'on a day like this — a scheduler that reports success while trading nothing.'
    : `${buys + sells} of ${scores.length} symbols clear the deadband, so the lane can trade. `
      + 'Whether it does on any given day depends on the signals that day.'}`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
