// What does it cost when a holding STOPS being compliant mid-hold?
//
// WHY THIS EXISTS: the owner reports earning "a lot" from ASTS and then ASTS ceasing to be halal.
// That single fact invalidates an assumption buried in every return number this repo has produced,
// including the 45.80%/yr owner-basket figure: all of them assume the permissibility of a name is
// CONSTANT over the holding period. It is not. A compliance flip is a FORCED SALE at a date chosen
// by someone else's balance sheet, not by the investor.
//
// This is the same defect class as survivorship bias, one layer up. Survivorship bias came from
// using TODAY's index roster to decide what was investable in 2020. "Awaed says all of them are
// halal" is TODAY's screen used to decide what was permissible in 2020. Both read a current
// snapshot backwards. The first cost 13.55pp/yr when measured; this one is unmeasured.
//
// Two outputs:
//   1. COVERAGE — what the repo's own composite screener can and cannot say about these names.
//      A name it cannot see is not a compliant name; it is an unscreened one.
//   2. FORCED-EXIT COST — for ASTS, what an exit on each plausible flip date would have realised,
//      against holding on. This does not need the true flip date: it brackets it.
//
// Reads the on-disk archive and the bundled screener snapshots. No DB writes, no network.
import { readArchive, type ArchivedBar } from './backfill-alpaca-sip';
import {
  CompositeShariaScreener,
  isCompositeSourceUsable,
  etfHoldingsSnapshot,
  saudiShariaListSnapshot,
} from '../src/quant/gates/etfHoldingsScreener';
import { anchor, declareBasis } from './lib/research-assertions';

const NAMES = ['AMD', 'GOOGL', 'RKLB', 'MU', 'HIMS', 'MRVL', 'NVDA', 'INOD', 'ASTS'];

async function coverage() {
  console.log('1. WHAT THIS REPO CAN ACTUALLY VERIFY\n');
  console.log(`   composite source usable: ${isCompositeSourceUsable()}`);
  console.log(`   etf-holdings snapshot:   asOf ${etfHoldingsSnapshot.asOf ?? 'n/a'}, `
    + `${(etfHoldingsSnapshot as any).holdings?.length ?? Object.keys((etfHoldingsSnapshot as any).symbols ?? {}).length} names`);
  console.log(`   saudi-sharia-list:       asOf ${saudiShariaListSnapshot.asOf ?? 'n/a'}\n`);

  const screener = new CompositeShariaScreener();
  for (const s of NAMES) {
    try {
      const v: any = await screener.screen(s, 'NASDAQ' as any);
      const verdict = v?.compliant === true ? 'COMPLIANT'
        : v?.compliant === false ? 'NON-COMPLIANT'
          : 'UNKNOWN (not covered)';
      console.log(`   ${s.padEnd(6)} ${verdict.padEnd(22)} source=${v?.source ?? 'none'} `
        + `${v?.reason ? `— ${String(v.reason).slice(0, 70)}` : ''}`);
    } catch (err) {
      console.log(`   ${s.padEnd(6)} SCREENER THREW -> fails closed (${err instanceof Error ? err.message.slice(0, 50) : err})`);
    }
  }
}

function forcedExit() {
  console.log('\n\n2. ASTS — WHAT A FORCED EXIT COSTS, BY EXIT DATE\n');
  const a = readArchive('ASTS');
  if (!a) { console.log('   no ASTS archive'); return; }
  const bars = a.bars as ArchivedBar[];
  const byDate = new Map(bars.map((b) => [b.d, b.c]));
  const first = bars[0];
  const last = bars[bars.length - 1];

  // The run-up the owner is describing. Anchor at the start of the AI/space rally rather than the
  // SPAC listing, because a 2021 entry and a 2024 entry are different investments.
  const anchors = ['2023-01-03', '2024-01-02', '2024-07-01', '2025-01-02'];
  console.log(`   ASTS ${first.d} .. ${last.d}   `
    + `low ${Math.min(...bars.map((b) => b.l)).toFixed(2)}  high ${Math.max(...bars.map((b) => b.h)).toFixed(2)}  `
    + `last ${last.c.toFixed(2)}`);

  // Yearly high/low so the owner can locate the flip against the price path they remember.
  console.log('\n   year   low      high     close    return');
  const years = Array.from(new Set(bars.map((b) => b.d.slice(0, 4)))).sort();
  for (const y of years) {
    const yb = bars.filter((b) => b.d.startsWith(y));
    const r = yb[yb.length - 1].c / yb[0].o - 1;
    console.log(`   ${y}   ${Math.min(...yb.map((b) => b.l)).toFixed(2).padStart(7)}  `
      + `${Math.max(...yb.map((b) => b.h)).toFixed(2).padStart(7)}  `
      + `${yb[yb.length - 1].c.toFixed(2).padStart(7)}  ${(r * 100).toFixed(1).padStart(8)}%`);
  }

  console.log('\n   entry -> forced exit, vs holding to today:');
  for (const entry of anchors) {
    const pe = byDate.get(entry);
    if (!pe) continue;
    console.log(`\n   entry ${entry} @ ${pe.toFixed(2)}   hold-to-today = ${((last.c / pe - 1) * 100).toFixed(0)}%`);
    // Quarterly rescreen dates: the cadence AAOIFI-aligned providers actually use, so these are the
    // dates a flip could realistically have been ACTED on, not the dates a ratio crossed.
    for (const exit of ['2024-06-28', '2024-09-30', '2024-12-31', '2025-03-31', '2025-06-30',
      '2025-09-30', '2025-12-31', '2026-03-31', '2026-06-30']) {
      if (exit <= entry) continue;
      const px = byDate.get(exit) ?? nearest(bars, exit);
      if (!px) continue;
      const realised = px / pe - 1;
      const foregone = last.c / px - 1;
      console.log(`      exit ${exit} @ ${px.toFixed(2).padStart(7)}  `
        + `realised ${(realised * 100).toFixed(0).padStart(6)}%   `
        + `left on the table ${(foregone * 100).toFixed(0).padStart(6)}%`);
    }
  }

  console.log('\n   NOTE: "left on the table" is not a loss you can complain about — a forced exit on a');
  console.log('   non-compliant name is not optional, and the foregone return was never permissibly');
  console.log('   yours. It is quoted because it is the SIZE OF THE INCENTIVE to get the screen wrong,');
  console.log('   and that is what the automation exists to remove from the decision.');

  declareBasis({
    prices: 'Alpaca SIP adjustment=all (split/dividend-adjusted) — fine for a price/return narrative',
    screener: 'bundled etf-holdings + saudi-sharia-list SNAPSHOTS, point-in-time, NOT a live re-screen',
    enforcement: 'none — this is a retrospective cost illustration, not a divestment trigger',
  });
  // ASTS's 2024-2025 run is public, widely reported market history (the AT&T/Verizon satellite
  // partnership rally), independent of this archive: it went from single digits to well into the
  // tens of dollars. If the archive's last close is not in that range, prices are stale, wrongly
  // scaled, or unadjusted for a split, and every "left on the table" figure above is fiction.
  anchor('ASTS last close (archive)', last.c, 50, 0.7);
}

function nearest(bars: ArchivedBar[], d: string): number | undefined {
  let best: ArchivedBar | undefined;
  for (const b of bars) if (b.d <= d) best = b; else break;
  return best?.c;
}

async function main() {
  await coverage();
  forcedExit();
}

main();
