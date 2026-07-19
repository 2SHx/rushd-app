// Bagholder-bounce v1 (R4-E4, QDR-6/QDR-7). Long-only, intraday, research only.
//
// PRE-REGISTERED THESIS — frozen before any diagnostic/FULL run:
//   • A liquid name opens at least 20% below the prior REAL daily close (discontinuous repricing).
//   • It then flushes at least another 5% below the regular-session opening print.
//   • The FIRST post-flush bar whose low is higher than the preceding bar's low and whose close
//     clears the preceding bar's high confirms seller exhaustion; the engine buys next-bar open.
//   • Entry confirmation is restricted to 09:45–11:00 ET. Stop = immutable flush low; target = 2R.
//   • Inverse-vol sizing is only a hint; the unchanged intraday risk/participation/cash envelope
//     remains authoritative. EOD liquidation is owned by the engine.
//
// This differs a-priori from the seven falsified intraday long-only parents: it requires BOTH an
// extreme overnight discontinuity and a sequential exhaustion pattern, not a generic OR/VWAP/level
// trigger. The fixed 11-name sleeve is Sharia-unscreened, so execution remains blocked regardless
// of performance. No LLM, randomness, parameter sweep, or DB read occurs inside the strategy.
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { z } from 'zod';
import { nasdaqDateKey } from '../data/snapshot';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { volScaledWeight } from './bollingerMrLongV2';
import { STOCKS_IN_PLAY_UNIVERSE_V1, type StocksInPlayAggregate } from './stocksInPlayOrb';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput } from './types';

const D = Prisma.Decimal;
const num = (value: Prisma.Decimal): number => Number(value.toString());

export const BagholderBounceParamsSchema = z.object({
  version: z.literal('v1'),
  minGapDownPct: z.number().positive().max(1),
  minFlushPct: z.number().positive().max(1),
  targetRMultiple: z.number().positive(),
  entryStartMinute: z.number().int().min(0).max(1439),
  entryEndMinute: z.number().int().min(0).max(1439),
  volLookback: z.number().int().positive(),
  targetVolBudget: z.number().positive(),
  maxNameFraction: z.number().positive().max(1),
});
export type BagholderBounceParams = z.infer<typeof BagholderBounceParamsSchema>;

export const BAGHOLDER_BOUNCE_V1: BagholderBounceParams = Object.freeze({
  version: 'v1',
  minGapDownPct: 0.20,
  minFlushPct: 0.05,
  targetRMultiple: 2,
  entryStartMinute: 9 * 60 + 45,
  entryEndMinute: 11 * 60,
  volLookback: 30,
  targetVolBudget: 0.0015,
  maxNameFraction: 0.25,
});

function paramsOrDefault(params?: BagholderBounceParams): BagholderBounceParams {
  return BagholderBounceParamsSchema.parse(params ?? BAGHOLDER_BOUNCE_V1);
}

export function buildPriorCloseIndex(
  book: ReadonlyMap<string, readonly StocksInPlayAggregate[]>,
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const [symbol, rows] of Array.from(book.entries())) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const close = sorted[i - 1].dailyClose;
      if (close != null && Number.isFinite(close) && close > 0) byDate.set(sorted[i].date, close);
    }
    if (byDate.size) index.set(symbol, byDate);
  }
  return index;
}

let PRIOR_CLOSE_INDEX: ReadonlyMap<string, ReadonlyMap<string, number>> | null = null;
export function configureBagholderPriorCloses(index: ReadonlyMap<string, ReadonlyMap<string, number>>): void {
  PRIOR_CLOSE_INDEX = index;
}
export function resetBagholderPriorCloses(): void { PRIOR_CLOSE_INDEX = null; }

function priorClose(symbol: string, date: string): Prisma.Decimal | null {
  const value = PRIOR_CLOSE_INDEX?.get(symbol)?.get(date);
  return value != null && Number.isFinite(value) && value > 0 ? new D(value.toFixed(6)) : null;
}

function sessionBars(ctx: StrategyPointInTimeContext): IntradayBar[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  const date = nasdaqDateKey(ctx.asOf);
  return ctx.bars.filter((bar) => nasdaqDateKey(bar.ts) === date && bar.session === 'REGULAR');
}

export interface BagholderBouncePattern {
  flushLow: Prisma.Decimal;
  flushIndex: number;
}

/** Pure pattern detector. `j` must be the candidate confirmation bar. */
export function detectBagholderBounce(
  bars: readonly IntradayBar[],
  prior: Prisma.Decimal,
  j: number,
  params: BagholderBounceParams,
): BagholderBouncePattern | null {
  if (j < 1 || j >= bars.length || prior.lte(0)) return null;
  const openingOpen = bars[0].open;
  if (openingOpen.gt(prior.mul(new D(1).minus(params.minGapDownPct)))) return null;
  const flushThreshold = openingOpen.mul(new D(1).minus(params.minFlushPct));
  let flushIndex = -1;
  let flushLow = openingOpen;
  for (let i = 0; i < j; i++) {
    if (bars[i].low.lt(flushLow)) {
      flushLow = bars[i].low;
      flushIndex = i;
    }
  }
  if (flushIndex < 0 || flushLow.gt(flushThreshold) || flushIndex >= j) return null;
  const current = bars[j];
  const previous = bars[j - 1];
  if (!current.low.gt(previous.low) || !current.close.gt(previous.high)) return null;
  // Enforce FIRST confirmation after the current flush anchor; a later matching bar cannot re-enter.
  for (let i = flushIndex + 1; i < j; i++) {
    if (bars[i].low.gt(bars[i - 1].low) && bars[i].close.gt(bars[i - 1].high)) return null;
  }
  return { flushLow, flushIndex };
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}
function check(matched: boolean, reasons: string[], items: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined ? { matched, reasons, evidence: items } : { matched, reasons, evidence: items, sizeFraction };
}

export const bagholderBounceSetup: StrategySetup<BagholderBounceParams> = {
  id: 'bagholder-bounce',
  version: 'v1',
  cadence: 'intraday',
  universeCompatibility: 'fixed',
  defaultParams: BAGHOLDER_BOUNCE_V1,

  prepareUniverse(input: UniversePrepareInput) {
    if (input.stocksInPlayBook) configureBagholderPriorCloses(buildPriorCloseIndex(input.stocksInPlayBook));
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (!(STOCKS_IN_PLAY_UNIVERSE_V1 as readonly string[]).includes(ctx.symbol)) {
      return check(false, ['symbol_not_in_liquid_universe'], []);
    }
    const bars = sessionBars(ctx);
    if (!bars.length) return check(false, ['no_session_bars'], []);
    const close = priorClose(ctx.symbol, nasdaqDateKey(ctx.asOf));
    if (!close) return check(false, ['prior_close_unavailable'], []);
    const gapDown = new D(1).minus(bars[0].open.div(close));
    if (gapDown.lt(p.minGapDownPct)) return check(false, ['gap_below_20pct_threshold'], [evidence('gap_down', gapDown.toFixed(6))]);
    return check(true, [], [evidence('prior_close', close.toFixed(6)), evidence('opening_open', bars[0].open.toFixed(6)), evidence('gap_down', gapDown.toFixed(6))]);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const bars = sessionBars(ctx);
    const j = bars.length - 1;
    const current = bars[j];
    if (current.ts.getTime() !== ctx.asOf.getTime()) return check(false, ['confirmation_bar_not_current'], screened.evidence);
    const minute = nasdaqMinuteOfDay(current.ts);
    if (minute < p.entryStartMinute || minute > p.entryEndMinute) return check(false, ['outside_entry_window'], screened.evidence);
    const pattern = detectBagholderBounce(bars, priorClose(ctx.symbol, nasdaqDateKey(ctx.asOf))!, j, p);
    const sizeFraction = pattern
      ? volScaledWeight(bars.map((bar) => num(bar.close)), p.volLookback, p.targetVolBudget, p.maxNameFraction) ?? undefined
      : undefined;
    return check(pattern !== null, pattern ? [] : ['no_flush_higher_low'], [
      ...screened.evidence,
      ...(pattern ? [evidence('flush_low', pattern.flushLow.toFixed(6)), evidence('flush_ts', bars[pattern.flushIndex].ts.toISOString())] : []),
    ], sizeFraction);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const bars = sessionBars(ctx);
    const j = ctx.entrySignalTs ? bars.findIndex((bar) => bar.ts.getTime() === ctx.entrySignalTs!.getTime()) : -1;
    const close = priorClose(ctx.symbol, nasdaqDateKey(ctx.asOf));
    const pattern = close && j >= 0 ? detectBagholderBounce(bars, close, j, p) : null;
    if (!pattern || !ctx.entryPrice) return check(false, ['exit_anchor_unavailable'], []);
    const risk = ctx.entryPrice.minus(pattern.flushLow);
    const target = ctx.entryPrice.plus(risk.mul(p.targetRMultiple));
    const current = bars.at(-1)!;
    const stopped = current.low.lte(pattern.flushLow);
    const targetHit = risk.gt(0) && current.high.gte(target);
    return check(stopped || targetHit, stopped ? ['flush_stop_signal'] : targetHit ? ['target_2r_signal'] : ['exit_not_triggered'], [
      evidence('stop_level', pattern.flushLow.toFixed(6)), evidence('target_level', target.toFixed(6)), evidence('r_per_share', risk.toFixed(6)),
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; extreme gap-down, flush, then first higher-low reclaim (long-only); unpromoted research, execution blocked.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول تجريبي' : stance === 'BEARISH' ? 'خروج تجريبي' : 'انتظار'}؛ فجوة هبوط حادة ثم اندفاع بيعي وأول قاع صاعد (شراء فقط)؛ بحث غير معتمد والتنفيذ محظور.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
