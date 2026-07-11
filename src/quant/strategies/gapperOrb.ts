import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { nasdaqDateKey } from '../data/snapshot';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup } from './types';

const D = Prisma.Decimal;

export const GapperOrbParamsSchema = z.object({
  version: z.literal('v1'),
  mcapMin: z.number().positive(),
  mcapMax: z.number().positive(),
  premarketMovePctMin: z.number(),
  dayMovePctMin: z.number(),
  minCumVolume: z.number().positive(),
  regularOpenMinute: z.number().int().min(0).max(1439),
  openingRangeMinutes: z.number().int().positive().max(60),
  forceExitMinute: z.number().int().min(0).max(1439),
});
export type GapperOrbParams = z.infer<typeof GapperOrbParamsSchema>;

export const GAPPER_ORB_V1: GapperOrbParams = Object.freeze({
  version: 'v1',
  mcapMin: 10_000_000,
  mcapMax: 400_000_000,
  premarketMovePctMin: 5,
  dayMovePctMin: 5,
  minCumVolume: 10_000_000,
  regularOpenMinute: 9 * 60 + 30,
  openingRangeMinutes: 5,
  forceExitMinute: 15 * 60 + 55,
});

function paramsOrDefault(params?: GapperOrbParams): GapperOrbParams {
  return GapperOrbParamsSchema.parse(params ?? GAPPER_ORB_V1);
}

function dayBars(ctx: StrategyPointInTimeContext) {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  if (ctx.snapshot) assertNoLookahead([ctx.snapshot], ctx.asOf, 'asOf');
  const key = nasdaqDateKey(ctx.asOf);
  return ctx.bars.filter((bar) => nasdaqDateKey(bar.ts) === key);
}

function priorClose(ctx: StrategyPointInTimeContext): Prisma.Decimal | null {
  const move = ctx.snapshot?.premarketMovePct;
  const lastPre = dayBars(ctx).filter((bar) => bar.session === 'PRE').at(-1);
  if (!move || !lastPre) return null;
  const divisor = new D(1).plus(new D(move).div(100));
  return divisor.eq(0) ? null : new D(lastPre.close).div(divisor);
}

function openingRange(ctx: StrategyPointInTimeContext, p: GapperOrbParams) {
  const end = p.regularOpenMinute + p.openingRangeMinutes;
  const bars = dayBars(ctx).filter((bar) => {
    const minute = nasdaqMinuteOfDay(bar.ts);
    return bar.session === 'REGULAR' && minute > p.regularOpenMinute && minute <= end;
  });
  if (!bars.length) return null;
  return {
    high: bars.reduce((value, bar) => Prisma.Decimal.max(value, bar.high), new D(bars[0].high)),
    low: bars.reduce((value, bar) => Prisma.Decimal.min(value, bar.low), new D(bars[0].low)),
  };
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: evidenceItems };
}

export const gapperOrbSetup: StrategySetup<GapperOrbParams> = {
  id: 'gapper-orb',
  version: 'v1',
  defaultParams: GAPPER_ORB_V1,

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const snapshot = ctx.snapshot;
    const current = dayBars(ctx).at(-1);
    const previous = priorClose(ctx);
    if (ctx.market !== 'NASDAQ' || !snapshot || !current || !previous || !snapshot.mcap || !snapshot.premarketMovePct) {
      return check(false, ['missing_pit_screen_data'], []);
    }
    const mcap = new D(snapshot.mcap);
    const pmMove = new D(snapshot.premarketMovePct);
    const volume = new D(snapshot.cumVolume);
    const dayMove = new D(current.close).minus(previous).div(previous).mul(100);
    const evidenceItems = [
      evidence('market_cap', mcap), evidence('premarket_move_pct', pmMove),
      evidence('day_move_pct', dayMove), evidence('cumulative_volume', volume),
      evidence('params_version', p.version),
    ];
    const reasons: string[] = [];
    if (mcap.lt(p.mcapMin) || mcap.gt(p.mcapMax)) reasons.push('market_cap_out_of_range');
    if (pmMove.lt(p.premarketMovePctMin)) reasons.push('premarket_move_below_min');
    if (dayMove.lt(p.dayMovePctMin)) reasons.push('day_move_below_min');
    if (volume.lt(p.minCumVolume)) reasons.push('cumulative_volume_below_min');
    return check(reasons.length === 0, reasons, evidenceItems);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    const range = openingRange(ctx, p);
    const current = dayBars(ctx).at(-1);
    if (!screened.matched || !range || !current) return check(false, [...screened.reasons, 'opening_range_unavailable'], screened.evidence);
    const minute = nasdaqMinuteOfDay(current.ts);
    const matched = minute > p.regularOpenMinute + p.openingRangeMinutes
      && minute < p.forceExitMinute
      && new D(current.close).gt(range.high);
    return check(matched, matched ? [] : ['opening_range_not_broken'], [
      ...screened.evidence, evidence('opening_range_high', range.high), evidence('current_close', current.close),
    ]);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    const range = openingRange(ctx, p);
    const current = dayBars(ctx).at(-1);
    if (ctx.positionQty.lte(0) || !range || !current) return check(false, ['no_long_position_or_range'], []);
    const stopped = new D(current.low).lte(range.low);
    const timed = nasdaqMinuteOfDay(current.ts) >= p.forceExitMinute;
    return check(stopped || timed, stopped ? ['opening_range_stop'] : timed ? ['session_time_exit'] : ['exit_not_triggered'], [
      evidence('opening_range_low', range.low), evidence('current_low', current.low),
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; codified, not yet validated.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول تجريبي' : stance === 'BEARISH' ? 'خروج تجريبي' : 'انتظار'}؛ مُقنّن ولم يُعتمد بعد.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
