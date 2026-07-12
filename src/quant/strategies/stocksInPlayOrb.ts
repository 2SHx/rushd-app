// Long-only Zarattini/Barbon/Aziz Stocks-in-Play 5-minute ORB. Research only: the
// instrument set is Sharia-unscreened and therefore execution-blocked.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { nasdaqDateKey } from '../data/snapshot';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { GAPPER_ORB_V1 } from './gapperOrb';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput } from './types';

const D = Prisma.Decimal;

export const STOCKS_IN_PLAY_UNIVERSE_V1 = Object.freeze([
  'AAPL', 'TSLA', 'AMZN', 'GOOGL', 'META', 'SBUX', 'QCOM', 'PEP', 'ADBE', 'NFLX', 'COST',
] as const);

export const StocksInPlayOrbParamsSchema = z.object({
  version: z.literal('v1'),
  rvLookbackDays: z.number().int().positive(),
  rvThreshold: z.number().positive(),
  topN: z.number().int().positive(),
  minPrice: z.number().positive(),
  minAvgDailyVolume: z.number().positive(),
  minAtr: z.number().positive(),
  requireAbovePriorClose: z.boolean(),
  regularOpenMinute: z.number().int().min(0).max(1439),
  openingRangeMinutes: z.number().int().positive().max(60),
  forceExitMinute: z.number().int().min(0).max(1439),
});
export type StocksInPlayOrbParams = z.infer<typeof StocksInPlayOrbParamsSchema>;

export const STOCKS_IN_PLAY_ORB_V1: StocksInPlayOrbParams = Object.freeze({
  version: 'v1', rvLookbackDays: 14, rvThreshold: 1, topN: 20,
  minPrice: 5, minAvgDailyVolume: 1_000_000, minAtr: 0.5,
  requireAbovePriorClose: true,
  regularOpenMinute: GAPPER_ORB_V1.regularOpenMinute,
  openingRangeMinutes: GAPPER_ORB_V1.openingRangeMinutes,
  forceExitMinute: GAPPER_ORB_V1.forceExitMinute,
});

export interface StocksInPlayAggregate {
  date: string;
  openingOpen: number;
  openingHigh: number;
  openingLow: number;
  openingClose: number;
  openingVolume: number;
  dailyHigh: number | null;
  dailyLow: number | null;
  dailyClose: number | null;
  dailyVolume: number | null;
}

export interface SourcedMinuteRow {
  symbol: string; ts: Date; open: number; high: number; low: number; close: number;
  volume: number; session: string; source: string;
}
export interface SourcedDailyRow {
  symbol: string; ts: Date; high: number; low: number; close: number; volume: number; source: string;
}

/** Bounded CLI warm-up: 35 calendar days safely supplies at least 15 normal US sessions. */
export function stocksInPlayPrehistoryStart(from: string): Date {
  const start = new Date(`${from}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 35);
  return start;
}

/**
 * Compact split-feed book: OR facts are ALPACA IEX only; daily liquidity facts may come only from
 * real consolidated YAHOO or ALPACA daily bars. Only completed aggregates survive.
 */
export function buildStocksInPlayBook(
  minuteRows: readonly SourcedMinuteRow[], dailyRows: readonly SourcedDailyRow[],
): { book: Map<string, StocksInPlayAggregate[]>; excludedNonAlpacaMinute: number; excludedUnsupportedDaily: number } {
  const perDay = new Map<string, SourcedMinuteRow[]>();
  let excludedNonAlpacaMinute = 0;
  for (const row of minuteRows) {
    if (row.source !== 'ALPACA') { excludedNonAlpacaMinute++; continue; }
    const minute = nasdaqMinuteOfDay(row.ts);
    if (row.session !== 'REGULAR' || minute <= GAPPER_ORB_V1.regularOpenMinute ||
        minute > GAPPER_ORB_V1.regularOpenMinute + GAPPER_ORB_V1.openingRangeMinutes) continue;
    const key = `${row.symbol}|${nasdaqDateKey(row.ts)}`;
    (perDay.get(key) ?? perDay.set(key, []).get(key)!).push(row);
  }
  const daily = new Map<string, SourcedDailyRow>();
  let excludedUnsupportedDaily = 0;
  for (const row of dailyRows) {
    if (row.source !== 'YAHOO' && row.source !== 'ALPACA') { excludedUnsupportedDaily++; continue; }
    daily.set(`${row.symbol}|${row.ts.toISOString().slice(0, 10)}`, row);
  }
  const book = new Map<string, StocksInPlayAggregate[]>();
  for (const [key, rows] of Array.from(perDay.entries())) {
    rows.sort((a, b) => a.ts.getTime() - b.ts.getTime());
    if (rows.length !== GAPPER_ORB_V1.openingRangeMinutes) continue;
    const [symbol, date] = key.split('|');
    const d = daily.get(key);
    const aggregate: StocksInPlayAggregate = {
      date, openingOpen: rows[0].open,
      openingHigh: Math.max(...rows.map((r) => r.high)),
      openingLow: Math.min(...rows.map((r) => r.low)),
      openingClose: rows.at(-1)!.close,
      openingVolume: rows.reduce((sum, r) => sum + r.volume, 0),
      dailyHigh: d?.high ?? null, dailyLow: d?.low ?? null,
      dailyClose: d?.close ?? null, dailyVolume: d?.volume ?? null,
    };
    (book.get(symbol) ?? book.set(symbol, []).get(symbol)!).push(aggregate);
  }
  for (const rows of Array.from(book.values())) rows.sort((a, b) => a.date.localeCompare(b.date));
  return { book, excludedNonAlpacaMinute, excludedUnsupportedDaily };
}

let REFERENCE_BOOK: ReadonlyMap<string, readonly StocksInPlayAggregate[]> | null = null;
export function configureStocksInPlayBook(book: ReadonlyMap<string, readonly StocksInPlayAggregate[]>): void { REFERENCE_BOOK = book; }
export function resetStocksInPlayBook(): void { REFERENCE_BOOK = null; }

const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
export function relativeVolumeRatio(currentOpeningVolume: number, priorOpeningVolumes: readonly number[]): number | null {
  if (priorOpeningVolumes.length !== 14) return null;
  const baseline = mean([...priorOpeningVolumes]);
  return baseline > 0 ? currentOpeningVolume / baseline : null;
}

function trueRange(cur: StocksInPlayAggregate, priorClose: number): number {
  return Math.max(cur.dailyHigh! - cur.dailyLow!, Math.abs(cur.dailyHigh! - priorClose), Math.abs(cur.dailyLow! - priorClose));
}

export interface StockInPlayRef { rv: number; rank: number; peerCount: number; priorClose: number; avgDailyVolume: number; atr14: number; current: StocksInPlayAggregate; }
export function stockInPlayRefAsOf(symbol: string, asOf: Date, p = STOCKS_IN_PLAY_ORB_V1): StockInPlayRef | null {
  const date = nasdaqDateKey(asOf);
  if (nasdaqMinuteOfDay(asOf) < p.regularOpenMinute + p.openingRangeMinutes) return null;
  const refs: Array<{ symbol: string; rv: number; current: StocksInPlayAggregate }> = [];
  for (const peer of STOCKS_IN_PLAY_UNIVERSE_V1) {
    const rows = REFERENCE_BOOK?.get(peer) ?? [];
    const i = rows.findIndex((r) => r.date === date);
    if (i < p.rvLookbackDays) continue;
    const prior = rows.slice(i - p.rvLookbackDays, i);
    const rv = relativeVolumeRatio(rows[i].openingVolume, prior.map((r) => r.openingVolume));
    if (rv != null) refs.push({ symbol: peer, rv, current: rows[i] });
  }
  refs.sort((a, b) => b.rv - a.rv || a.symbol.localeCompare(b.symbol));
  const ranked = refs.find((r) => r.symbol === symbol);
  if (!ranked) return null;
  const own = REFERENCE_BOOK!.get(symbol)!;
  const i = own.findIndex((r) => r.date === date);
  const completed = own.slice(0, i);
  if (completed.length < 15) return null;
  const liquidity = completed.slice(-14);
  if (liquidity.some((r) => r.dailyHigh == null || r.dailyLow == null || r.dailyClose == null || r.dailyVolume == null)) return null;
  const trs = liquidity.map((r, n) => trueRange(r, completed[completed.length - 15 + n].dailyClose!));
  return {
    rv: ranked.rv, rank: refs.indexOf(ranked) + 1, peerCount: refs.length, current: ranked.current,
    priorClose: completed.at(-1)!.dailyClose!, avgDailyVolume: mean(liquidity.map((r) => r.dailyVolume!)), atr14: mean(trs),
  };
}

function paramsOrDefault(params?: StocksInPlayOrbParams) { return StocksInPlayOrbParamsSchema.parse(params ?? STOCKS_IN_PLAY_ORB_V1); }
function dayBars(ctx: StrategyPointInTimeContext) {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  const date = nasdaqDateKey(ctx.asOf);
  return ctx.bars.filter((b) => nasdaqDateKey(b.ts) === date);
}
function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence { return { kind: 'feature', ref, value: String(value) }; }
function check(matched: boolean, reasons: string[], ev: Evidence[]): StrategyCheck { return { matched, reasons, evidence: ev }; }

export const stocksInPlayOrbSetup: StrategySetup<StocksInPlayOrbParams> = {
  id: 'stocks-in-play-orb', version: 'v1', cadence: 'intraday', defaultParams: STOCKS_IN_PLAY_ORB_V1,
  prepareUniverse(input: UniversePrepareInput) { if (input.stocksInPlayBook) configureStocksInPlayBook(input.stocksInPlayBook); },
  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const currentBar = dayBars(ctx).at(-1);
    if (ctx.market !== 'NASDAQ' || !currentBar) return check(false, ['missing_pit_screen_data'], []);
    if (!STOCKS_IN_PLAY_UNIVERSE_V1.includes(ctx.symbol as typeof STOCKS_IN_PLAY_UNIVERSE_V1[number])) return check(false, ['symbol_not_in_v1_universe'], []);
    const ref = stockInPlayRefAsOf(ctx.symbol, ctx.asOf, p);
    if (!ref) return check(false, ['opening_range_or_reference_unavailable'], []);
    const reasons: string[] = [];
    if (ref.rv < p.rvThreshold) reasons.push('relative_volume_below_threshold');
    if (ref.rank > p.topN) reasons.push('outside_top_n');
    if (!(ref.current.openingClose > p.minPrice)) reasons.push('price_gate_failed');
    if (!(ref.avgDailyVolume > p.minAvgDailyVolume)) reasons.push('adv_gate_failed');
    if (!(ref.atr14 > p.minAtr)) reasons.push('atr_gate_failed');
    if (!(ref.current.openingClose > ref.current.openingOpen)) reasons.push('opening_range_not_bullish');
    if (p.requireAbovePriorClose && !(ref.current.openingClose > ref.priorClose)) reasons.push('below_prior_close');
    return check(!reasons.length, reasons, [evidence('relative_volume', ref.rv.toFixed(6)), evidence('same_day_rank', ref.rank), evidence('peer_count', ref.peerCount), evidence('top_n', p.topN), evidence('avg_daily_volume_14', ref.avgDailyVolume), evidence('atr_14', ref.atr14)]);
  },
  entry(ctx, params) {
    const p = paramsOrDefault(params); const screened = this.screen(ctx, p); const current = dayBars(ctx).at(-1);
    const ref = stockInPlayRefAsOf(ctx.symbol, ctx.asOf, p);
    if (!screened.matched || !current || !ref) return check(false, screened.reasons, screened.evidence);
    const minute = nasdaqMinuteOfDay(current.ts);
    const matched = minute > p.regularOpenMinute + p.openingRangeMinutes && minute < p.forceExitMinute && new D(current.close).gt(ref.current.openingHigh);
    return check(matched, matched ? [] : ['opening_range_not_broken'], [...screened.evidence, evidence('opening_range_high', ref.current.openingHigh)]);
  },
  exit(ctx, params) {
    const p = paramsOrDefault(params); const current = dayBars(ctx).at(-1); const ref = stockInPlayRefAsOf(ctx.symbol, ctx.asOf, p);
    if (ctx.positionQty.lte(0) || !current || !ref) return check(false, ['no_long_position_or_range'], []);
    const stopped = new D(current.low).lte(ref.current.openingLow); const timed = nasdaqMinuteOfDay(current.ts) >= p.forceExitMinute;
    return check(stopped || timed, stopped ? ['opening_range_stop'] : timed ? ['session_time_exit'] : ['exit_not_triggered'], [evidence('opening_range_low', ref.current.openingLow)]);
  },
  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params); const exit = this.exit(ctx, p); const entry = exit.matched ? check(false, [], []) : this.entry(ctx, p);
    const stance: Stance = exit.matched ? 'BEARISH' : entry.matched ? 'BULLISH' : 'NEUTRAL'; const active = exit.matched ? exit : entry;
    return { agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf, stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 1,
      rationaleEn: `${this.id} ${p.version}: ${stance}; long-only Stocks-in-Play ORB; Sharia-unscreened, execution blocked.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'إشارة شراء بحثية' : stance === 'BEARISH' ? 'إشارة خروج بحثية' : 'انتظار'}؛ اختراق نطاق افتتاحي للشراء فقط؛ غير مفحوص شرعياً والتنفيذ محظور.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)], determinism: 'deterministic', failureMode: 'ok', costCents: 0 };
  },
};
