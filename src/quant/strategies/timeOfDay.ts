// Time-of-day v1 (R4-E5, QDR-6/QDR-7). Long-only intraday A/B overlay; research only.
//
// PRE-REGISTERED BEFORE EVIDENCE:
//   A — 09:45 REVERSAL: after price has traded ≥1% below the regular open, the first 09:45–10:00
//       bar with a higher low and a close above the preceding bar's high is eligible.
//   B — FIRST-HOUR TREND LOCK: freeze 09:30–10:29; if its close is ≥1% above the open, the first
//       10:30–11:00 close above both the frozen first-hour high and current session VWAP is eligible.
//   Both branches buy next-bar open, stop at their immutable structural low, target 2R, and remain
//   subject to the unchanged participation/risk/cash envelope plus engine-owned EOD liquidation.
//
// These are timing CONSTRAINTS on two falsifiable price-action parents, not an optimized clock-time
// sweep. They directly test whether the prior intraday lane's broad entry timing diluted fills. The
// fixed 11-name sleeve is Sharia-unscreened, so execution remains blocked regardless of performance.
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { z } from 'zod';
import { nasdaqDateKey } from '../data/snapshot';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { volScaledWeight } from './bollingerMrLongV2';
import { cumulativeSessionVwap } from './vwapReclaim';
import { STOCKS_IN_PLAY_UNIVERSE_V1 } from './stocksInPlayOrb';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup } from './types';

const D = Prisma.Decimal;
const num = (value: Prisma.Decimal): number => Number(value.toString());
// One immutable Date instance is revisited many times during PIT replay. Memoizing the existing
// timezone conversion is outcome-neutral and avoids repeatedly constructing Intl formatters.
const MINUTE_CACHE = new WeakMap<Date, number>();
function minuteOfDay(ts: Date): number {
  const cached = MINUTE_CACHE.get(ts);
  if (cached !== undefined) return cached;
  const minute = nasdaqMinuteOfDay(ts);
  MINUTE_CACHE.set(ts, minute);
  return minute;
}

export const TimeOfDayParamsSchema = z.object({
  version: z.literal('v1'),
  reversalMinDropPct: z.number().positive(),
  reversalStartMinute: z.number().int().min(0).max(1439),
  reversalEndMinute: z.number().int().min(0).max(1439),
  trendMinReturnPct: z.number().positive(),
  firstHourEndMinute: z.number().int().min(0).max(1439),
  trendStartMinute: z.number().int().min(0).max(1439),
  trendEndMinute: z.number().int().min(0).max(1439),
  targetRMultiple: z.number().positive(),
  volLookback: z.number().int().positive(),
  targetVolBudget: z.number().positive(),
  maxNameFraction: z.number().positive().max(1),
});
export type TimeOfDayParams = z.infer<typeof TimeOfDayParamsSchema>;

export const TIME_OF_DAY_V1: TimeOfDayParams = Object.freeze({
  version: 'v1',
  reversalMinDropPct: 0.01,
  reversalStartMinute: 9 * 60 + 45,
  reversalEndMinute: 10 * 60,
  trendMinReturnPct: 0.01,
  firstHourEndMinute: 10 * 60 + 30,
  trendStartMinute: 10 * 60 + 30,
  trendEndMinute: 11 * 60,
  targetRMultiple: 2,
  volLookback: 30,
  targetVolBudget: 0.0015,
  maxNameFraction: 0.25,
});

function paramsOrDefault(params?: TimeOfDayParams): TimeOfDayParams {
  return TimeOfDayParamsSchema.parse(params ?? TIME_OF_DAY_V1);
}

function sessionBars(ctx: StrategyPointInTimeContext): IntradayBar[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  const date = nasdaqDateKey(ctx.asOf);
  return ctx.bars.filter((bar) => nasdaqDateKey(bar.ts) === date && bar.session === 'REGULAR');
}

export interface TimeOfDayPattern {
  branch: 'REVERSAL_0945' | 'FIRST_HOUR_TREND_LOCK';
  stopLow: Prisma.Decimal;
}

function isHigherLowReclaim(bars: readonly IntradayBar[], index: number): boolean {
  return index > 0 && bars[index].low.gt(bars[index - 1].low) && bars[index].close.gt(bars[index - 1].high);
}

/** Pure A/B detector. The windows and thresholds are constraints, never selected from outcomes. */
export function detectTimeOfDayPattern(
  bars: readonly IntradayBar[],
  j: number,
  params: TimeOfDayParams,
): TimeOfDayPattern | null {
  if (j < 1 || j >= bars.length || bars[0].open.lte(0)) return null;
  const minute = minuteOfDay(bars[j].ts);
  const openingOpen = bars[0].open;

  if (minute >= params.reversalStartMinute && minute <= params.reversalEndMinute) {
    let stopLow = openingOpen;
    for (let i = 0; i <= j; i++) if (bars[i].low.lt(stopLow)) stopLow = bars[i].low;
    const droppedEnough = stopLow.lte(openingOpen.mul(new D(1).minus(params.reversalMinDropPct)));
    if (!droppedEnough || !isHigherLowReclaim(bars, j)) return null;
    for (let i = 1; i < j; i++) {
      const candidateMinute = minuteOfDay(bars[i].ts);
      if (candidateMinute >= params.reversalStartMinute && isHigherLowReclaim(bars, i)) return null;
    }
    return { branch: 'REVERSAL_0945', stopLow };
  }

  if (minute >= params.trendStartMinute && minute <= params.trendEndMinute) {
    const firstHour = bars.filter((bar) => minuteOfDay(bar.ts) < params.firstHourEndMinute);
    if (!firstHour.length) return null;
    const firstHourReturn = firstHour.at(-1)!.close.div(openingOpen).minus(1);
    if (firstHourReturn.lt(params.trendMinReturnPct)) return null;
    let firstHourHigh = firstHour[0].high;
    let firstHourLow = firstHour[0].low;
    for (const bar of firstHour) {
      if (bar.high.gt(firstHourHigh)) firstHourHigh = bar.high;
      if (bar.low.lt(firstHourLow)) firstHourLow = bar.low;
    }
    const vwap = cumulativeSessionVwap(bars.slice(0, j + 1)).at(-1)!;
    if (!bars[j].close.gt(firstHourHigh) || !bars[j].close.gt(vwap)) return null;
    for (let i = firstHour.length; i < j; i++) {
      if (bars[i].close.gt(firstHourHigh)) return null;
    }
    return { branch: 'FIRST_HOUR_TREND_LOCK', stopLow: firstHourLow };
  }
  return null;
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}
function check(matched: boolean, reasons: string[], items: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined ? { matched, reasons, evidence: items } : { matched, reasons, evidence: items, sizeFraction };
}

export const timeOfDaySetup: StrategySetup<TimeOfDayParams> = {
  id: 'time-of-day',
  version: 'v1',
  cadence: 'intraday',
  universeCompatibility: 'fixed',
  defaultParams: TIME_OF_DAY_V1,

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (!(STOCKS_IN_PLAY_UNIVERSE_V1 as readonly string[]).includes(ctx.symbol)) return check(false, ['symbol_not_in_liquid_universe'], []);
    const bars = sessionBars(ctx);
    if (!bars.length) return check(false, ['no_session_bars'], []);
    const minute = minuteOfDay(bars.at(-1)!.ts);
    const inReversal = minute >= p.reversalStartMinute && minute <= p.reversalEndMinute;
    const inTrend = minute >= p.trendStartMinute && minute <= p.trendEndMinute;
    return check(inReversal || inTrend, inReversal || inTrend ? [] : ['outside_ab_windows'], [evidence('minute_et', minute), evidence('params_version', p.version)]);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const bars = sessionBars(ctx);
    const j = bars.length - 1;
    if (bars[j].ts.getTime() !== ctx.asOf.getTime()) return check(false, ['entry_bar_not_current'], screened.evidence);
    const pattern = detectTimeOfDayPattern(bars, j, p);
    const sizeFraction = pattern
      ? volScaledWeight(bars.map((bar) => num(bar.close)), p.volLookback, p.targetVolBudget, p.maxNameFraction) ?? undefined
      : undefined;
    return check(pattern !== null, pattern ? [] : ['no_time_of_day_pattern'], [
      ...screened.evidence,
      ...(pattern ? [evidence('ab_branch', pattern.branch), evidence('stop_low', pattern.stopLow.toFixed(6))] : []),
    ], sizeFraction);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const bars = sessionBars(ctx);
    const j = ctx.entrySignalTs ? bars.findIndex((bar) => bar.ts.getTime() === ctx.entrySignalTs!.getTime()) : -1;
    const pattern = j >= 0 ? detectTimeOfDayPattern(bars, j, p) : null;
    if (!pattern || !ctx.entryPrice) return check(false, ['exit_anchor_unavailable'], []);
    const risk = ctx.entryPrice.minus(pattern.stopLow);
    const target = ctx.entryPrice.plus(risk.mul(p.targetRMultiple));
    const current = bars.at(-1)!;
    const stopped = current.low.lte(pattern.stopLow);
    const targetHit = risk.gt(0) && current.high.gte(target);
    return check(stopped || targetHit, stopped ? ['structural_stop_signal'] : targetHit ? ['target_2r_signal'] : ['exit_not_triggered'], [
      evidence('ab_branch', pattern.branch), evidence('stop_level', pattern.stopLow.toFixed(6)), evidence('target_level', target.toFixed(6)),
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; pre-registered 09:45 reversal / first-hour trend-lock A-B timing overlay (long-only); unpromoted research, execution blocked.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول تجريبي' : stance === 'BEARISH' ? 'خروج تجريبي' : 'انتظار'}؛ قيد توقيت مسجل مسبقاً لانعكاس 09:45 أو تثبيت اتجاه الساعة الأولى (شراء فقط)؛ بحث غير معتمد والتنفيذ محظور.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
