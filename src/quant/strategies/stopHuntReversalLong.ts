// Stop-hunt reversal setup (QDR-6/QDR-7, skill backtesting-rigor). Long-only, intraday.
//
// THESIS (ledger `stop-hunt-reversal-long`): on a LIQUID name, a fake break BELOW the prior day's
// low that is HARD-RECLAIMED (a bar closes back above the prior-day low within minutes) is a stop
// SWEEP — resting sell-stops under an obvious level are triggered, liquidity is absorbed, and the
// failed breakdown tends to continue UP. We buy the reclaim; the stop sits under the sweep low.
//
// A-PRIORI DECISIONS (DECIDED, no sweeps — every rule is a crisp, falsifiable bar pattern):
//   • PRIOR-DAY LOW is the prior TRADING DAY's regular-session low, taken from the REAL consolidated
//     DAY MarketBar spine (YAHOO/ALPACA), surfaced point-in-time via the shared stocks-in-play book
//     (`dailyLow` of the immediately preceding dated aggregate). It is known at today's open, so no
//     look-ahead: today's decisions never read today's daily low.
//   • SWEEP: an intraday REGULAR bar prints low ≤ priorDayLow·(1 − sweepDepthPct) — a real break
//     BELOW the level by ≥ sweepDepthPct (0.2%). The lowest low across the sweep episode is the
//     `sweepLow` (the stop).
//   • RECLAIM / entry bar (the current decision bar j): its CLOSE is strictly ABOVE priorDayLow
//     (the breakdown FAILED — a hard reclaim), it is the FIRST bar to close back above the level
//     since the break (the below-close run bars[s..j−1] all sat at/under priorDayLow), and the
//     reclaim lands WITHIN reclaimWindowMinutes (15) of the break bar. Entry = close of this bar;
//     the shared engine fills at the NEXT bar open.
//   • STOP = sweepLow (never re-anchors). After the actual next-open fill, R = fill − sweepLow and
//     TARGET = MAX(fill + targetRMultiple·R, session VWAP) — "2R OR VWAP, whichever is FURTHER"
//     above the fill. Stop/target crossings are exit SIGNALS the engine executes at the next bar
//     open; any position open at the day's last bar is force-liquidated (EOD flat).
//   • ENTRY WINDOW = 09:35–15:00 ET on the reclaim bar (skip the opening/closing auctions' chaos).
//   • UNIVERSE = the deep-history LIQUID research names (STOCKS_IN_PLAY_UNIVERSE_V1). Sharia
//     screening is not persisted, so execution stays blocked independently of performance.
//
// It emits an inverse-vol `sizeFraction` HINT (shared `volScaledWeight`, ∝1/σ) on the day's own
// minute closes; the intraday engine applies the hint BEFORE the risk envelope, which remains
// authoritative and may only SHRINK it further. No LLM, no randomness, no DB reads in this path.
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { z } from 'zod';
import { nasdaqDateKey } from '../data/snapshot';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { STOCKS_IN_PLAY_UNIVERSE_V1, type StocksInPlayAggregate } from './stocksInPlayOrb';
import { cumulativeSessionVwap } from './vwapReclaim';
import { volScaledWeight } from './bollingerMrLongV2';
import type {
  StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;
const MINUTE_MS = 60_000;
const num = (x: Prisma.Decimal): number => Number(x.toString());

export const StopHuntReversalParamsSchema = z.object({
  version: z.literal('v1'),
  sweepDepthPct: z.number().positive(), // break BELOW prior-day low by ≥ this fraction (0.002 = 0.2%)
  reclaimWindowMinutes: z.number().int().positive(), // hard reclaim must land within this many minutes
  targetRMultiple: z.number().positive(),
  entryStartMinute: z.number().int().min(0).max(1439),
  entryEndMinute: z.number().int().min(0).max(1439),
  volLookback: z.number().int().positive(),
  targetVolBudget: z.number().positive(),
  maxNameFraction: z.number().positive().max(1),
});
export type StopHuntReversalParams = z.infer<typeof StopHuntReversalParamsSchema>;

/** v1 — reference calibration; DECIDED, do not edit or sweep (QDR-6). */
export const STOP_HUNT_REVERSAL_V1: StopHuntReversalParams = Object.freeze({
  version: 'v1',
  sweepDepthPct: 0.002, // 0.2% break below prior-day low
  reclaimWindowMinutes: 15,
  targetRMultiple: 2,
  entryStartMinute: 9 * 60 + 35, // 09:35 ET
  entryEndMinute: 15 * 60, // 15:00 ET
  volLookback: 30,
  targetVolBudget: 0.0015,
  maxNameFraction: 0.25,
});

function paramsOrDefault(params?: StopHuntReversalParams): StopHuntReversalParams {
  return StopHuntReversalParamsSchema.parse(params ?? STOP_HUNT_REVERSAL_V1);
}

const isUniverse = (symbol: string): boolean =>
  (STOCKS_IN_PLAY_UNIVERSE_V1 as readonly string[]).includes(symbol);

// ── Point-in-time prior-day-low index, built ONCE from the shared stocks-in-play book (whose
// `dailyLow` values come from the REAL consolidated DAY spine). For each dated aggregate we record
// the IMMEDIATELY PRECEDING aggregate's dailyLow — i.e. the prior trading day's low, known at
// today's open. Pure; configured by the CLI before simulation, never read from the DB here.
export function buildPriorDayLowIndex(
  book: ReadonlyMap<string, readonly StocksInPlayAggregate[]>,
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const [symbol, rows] of Array.from(book.entries())) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const priorLow = sorted[i - 1].dailyLow;
      if (priorLow != null) byDate.set(sorted[i].date, priorLow);
    }
    if (byDate.size) index.set(symbol, byDate);
  }
  return index;
}

let PRIOR_DAY_LOW_INDEX: ReadonlyMap<string, ReadonlyMap<string, number>> | null = null;
export function configureStopHuntPriorDayLows(index: ReadonlyMap<string, ReadonlyMap<string, number>>): void {
  PRIOR_DAY_LOW_INDEX = index;
}
export function resetStopHuntPriorDayLows(): void { PRIOR_DAY_LOW_INDEX = null; }

function priorDayLow(symbol: string, dateKey: string): Prisma.Decimal | null {
  const low = PRIOR_DAY_LOW_INDEX?.get(symbol)?.get(dateKey);
  return low != null && Number.isFinite(low) ? new D(low.toFixed(6)) : null;
}

/** Regular-session bars of the current NASDAQ day (≤ asOf), in order. Premarket is excluded. */
function sessionBars(ctx: StrategyPointInTimeContext): IntradayBar[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  const key = nasdaqDateKey(ctx.asOf);
  return ctx.bars.filter((b) => nasdaqDateKey(b.ts) === key && b.session === 'REGULAR');
}

export interface SweepReclaim {
  sweepLow: Prisma.Decimal; // lowest low across the sweep episode → the hard stop
  breakIndex: number; // first bar that broke ≥ sweepDepthPct below prior-day low
  episodeStart: number; // first bar of the contiguous below-close run ending at the reclaim
}

/**
 * Is `bars[j]` a hard-reclaim of a stop sweep of `priorDayLow`? Pure + falsifiable, PIT (reads only
 * bars ≤ j). Returns the sweep anchor (stop = sweepLow) or null. See A-PRIORI DECISIONS above.
 */
export function detectSweepReclaim(
  bars: readonly IntradayBar[],
  priorLow: Prisma.Decimal,
  j: number,
  p: StopHuntReversalParams,
): SweepReclaim | null {
  if (j < 0 || j >= bars.length) return null;
  const reclaim = bars[j];
  if (!reclaim.close.gt(priorLow)) return null; // must CLOSE back above the level (hard reclaim)
  // episodeStart: earliest index of the contiguous run of at/below-close bars ending at j−1.
  let s = j;
  while (s - 1 >= 0 && bars[s - 1].close.lte(priorLow)) s--;
  const threshold = priorLow.mul(new D(1).minus(new D(p.sweepDepthPct)));
  let breakIndex = -1;
  let sweepLow = reclaim.low;
  for (let i = s; i <= j; i++) {
    if (bars[i].low.lt(sweepLow)) sweepLow = bars[i].low;
    if (breakIndex < 0 && bars[i].low.lte(threshold)) breakIndex = i;
  }
  if (breakIndex < 0) return null; // never broke deep enough to be a sweep
  if (reclaim.ts.getTime() - bars[breakIndex].ts.getTime() > p.reclaimWindowMinutes * MINUTE_MS) {
    return null; // reclaim did not land within the window ⇒ not a hunt-and-reclaim
  }
  if (!reclaim.close.gt(sweepLow)) return null; // R must be strictly positive
  return { sweepLow, breakIndex, episodeStart: s };
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}
function check(matched: boolean, reasons: string[], ev: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined ? { matched, reasons, evidence: ev } : { matched, reasons, evidence: ev, sizeFraction };
}

export const stopHuntReversalLongSetup: StrategySetup<StopHuntReversalParams> = {
  id: 'stop-hunt-reversal-long',
  version: 'v1',
  cadence: 'intraday',
  defaultParams: STOP_HUNT_REVERSAL_V1,

  // Reuses the shared stocks-in-play PIT book (real consolidated DAY spine) to derive prior-day
  // lows. Pure side effect into this setup's own reference state — never the LLM, DB, or randomness.
  prepareUniverse(input: UniversePrepareInput) {
    if (input.stocksInPlayBook) configureStopHuntPriorDayLows(buildPriorDayLowIndex(input.stocksInPlayBook));
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (!isUniverse(ctx.symbol)) return check(false, ['symbol_not_in_liquid_universe'], []);
    const bars = sessionBars(ctx);
    if (!bars.length) return check(false, ['no_session_bars'], []);
    const pdl = priorDayLow(ctx.symbol, nasdaqDateKey(ctx.asOf));
    if (!pdl) return check(false, ['prior_day_low_unavailable'], []);
    return check(true, [], [
      evidence('prior_day_low', pdl.toFixed(6)),
      evidence('session_bars', bars.length),
      evidence('params_version', p.version),
    ]);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const bars = sessionBars(ctx);
    const j = bars.length - 1;
    const reclaim = bars[j];
    // The reclaim bar MUST be the current decision bar (never a stale trailing regular bar).
    if (reclaim.ts.getTime() !== ctx.asOf.getTime()) return check(false, ['reclaim_bar_not_current'], screened.evidence);
    const minute = nasdaqMinuteOfDay(reclaim.ts);
    if (minute < p.entryStartMinute || minute > p.entryEndMinute) return check(false, ['outside_entry_window'], screened.evidence);
    const pdl = priorDayLow(ctx.symbol, nasdaqDateKey(ctx.asOf))!; // screen guaranteed non-null
    const sweep = detectSweepReclaim(bars, pdl, j, p);
    const matched = sweep !== null;
    const sizeFraction = matched
      ? volScaledWeight(bars.map((b) => num(b.close)), p.volLookback, p.targetVolBudget, p.maxNameFraction) ?? undefined
      : undefined;
    return check(matched, matched ? [] : ['no_stop_hunt_reclaim'], [
      ...screened.evidence,
      ...(sweep ? [
        evidence('sweep_low', sweep.sweepLow.toFixed(6)),
        evidence('break_ts', bars[sweep.breakIndex].ts.toISOString()),
        evidence('reclaim_close', reclaim.close.toFixed(6)),
      ] : []),
    ], sizeFraction);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const bars = sessionBars(ctx);
    if (!bars.length) return check(false, ['no_session_bars'], []);
    const pdl = priorDayLow(ctx.symbol, nasdaqDateKey(ctx.asOf));
    const j = ctx.entrySignalTs ? bars.findIndex((b) => b.ts.getTime() === ctx.entrySignalTs!.getTime()) : -1;
    const sweep = pdl && j >= 0 ? detectSweepReclaim(bars, pdl, j, p) : null;
    if (!sweep || !ctx.entryPrice) return check(false, ['exit_anchor_unavailable'], []); // engine still EOD-flattens
    const stopLevel = sweep.sweepLow; // original sweep low; never re-anchors
    const r = ctx.entryPrice.minus(stopLevel); // actual fill risk, including costs/slippage
    const target2R = ctx.entryPrice.plus(r.mul(p.targetRMultiple));
    const vwapNow = cumulativeSessionVwap(bars).at(-1)!;
    const targetLevel = Prisma.Decimal.max(target2R, vwapNow); // 2R OR VWAP, whichever is FURTHER up
    const current = bars[bars.length - 1];
    const stopped = current.low.lte(stopLevel);
    const targetHit = r.gt(0) && current.high.gte(targetLevel);
    const matched = stopped || targetHit;
    return check(matched, stopped ? ['stop_hunt_stop_signal'] : targetHit ? ['target_2r_or_vwap_signal'] : ['exit_not_triggered'], [
      evidence('stop_level', stopLevel.toFixed(6)),
      evidence('target_level', targetLevel.toFixed(6)),
      evidence('target_2r', target2R.toFixed(6)),
      evidence('session_vwap', vwapNow.toFixed(6)),
      evidence('r_per_share', r.toFixed(6)),
    ]);
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const exit = this.exit(ctx, p);
    const entry = exit.matched ? check(false, [], []) : this.entry(ctx, p);
    const stance: Stance = exit.matched ? 'BEARISH' : entry.matched ? 'BULLISH' : 'NEUTRAL';
    const active = exit.matched ? exit : entry;
    return {
      agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 1,
      rationaleEn: `${this.id} ${p.version}: ${stance}; fake break below prior-day low + hard reclaim (stop sweep, long-only); research validation completed: REJECTED, not eligible for AUTO_PAPER.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول تجريبي' : stance === 'BEARISH' ? 'خروج تجريبي' : 'انتظار'}؛ كسر وهمي أسفل قاع اليوم السابق ثم استرداد قوي (اصطياد وقف الخسارة، شراء فقط)؛ اكتمل التحقق البحثي: مرفوض وغير مؤهل لـ AUTO_PAPER.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
