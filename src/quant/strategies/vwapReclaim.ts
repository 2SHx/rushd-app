// VWAP-reclaim absorption setup (QDR-6/QDR-7, skill backtesting-rigor). Long-only, intraday.
//
// THESIS (ledger `vwap-reclaim`): on a LIQUID name, a bar that probes down to session VWAP on
// heavy volume, prints a long lower wick, and yet CLOSES back above VWAP (no downside follow-
// through) marks passive absorption of sellers. When the very next bar CONFIRMS by closing above
// VWAP and above that absorption bar's high, price tends to continue up. We buy the confirmation.
//
// A-PRIORI DECISIONS (DECIDED, no sweeps — every rule is a crisp, falsifiable bar pattern):
//   • VWAP = cumulative Σ(typicalPrice·volume) / Σ(volume) from the FIRST bar of the session,
//     typicalPrice = (high+low+close)/3 (standard session VWAP).
//   • v1 SESSION = REGULAR only: VWAP resets at the 9:30 ET open and PREMARKET IS EXCLUDED. The
//     premarket-inclusive VWAP is a SEPARATE variant (v1.1) that is tested ONLY if v1 shows non-
//     negative expectancy — otherwise it is recorded untested (do not fold both into one run).
//   • TOUCH / absorption bar: low ≤ VWAP (probed VWAP) AND close > VWAP (reclaimed it — the
//     "no follow-through": the downward probe failed to hold below VWAP) AND lowerWick ≥ 1.5·body
//     (long wick; lowerWick = min(open,close) − low, body = |close − open|, wick strictly > 0) AND
//     volume ≥ 1.5× the trailing 20-bar average of THIS symbol's session volume.
//   • CONFIRM / entry bar (the NEXT bar): close > VWAP AND close > touch-bar high.
//   • STOP = touch-bar low. After the next-open fill, TARGET = actual fill + 2R, where
//     R = actual fill − touch-bar low. Stop/target crossings are exit SIGNALS executed at the next
//     bar open by the shared engine; the final bar is force-liquidated at end of day.
//   • ENTRY WINDOW = 10:00–15:00 ET on the confirm bar (skip open/close chaos).
//   • UNIVERSE = the deep-history LIQUID research names (STOCKS_IN_PLAY_UNIVERSE_V1). Sharia
//     screening is not persisted, so execution remains blocked independently of performance. Liquid
//     absorption is the thesis; micro-cap candidate days in the same DB are NOT this universe and
//     are screened out here regardless of what the CLI symbol lister returns.
//
// It emits an inverse-vol `sizeFraction` HINT (shared `volScaledWeight`, ∝1/σ), computed on the
// day's own minute closes (an intraday-σ proxy, not a daily-σ claim). The intraday engine applies
// the hint before the risk envelope, which remains authoritative and may only SHRINK it further.
import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { z } from 'zod';
import { nasdaqDateKey } from '../data/snapshot';
import { nasdaqMinuteOfDay } from '../data/intraday';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { STOCKS_IN_PLAY_UNIVERSE_V1 } from './stocksInPlayOrb';
import { volScaledWeight } from './bollingerMrLongV2';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup } from './types';

const D = Prisma.Decimal;
const num = (x: Prisma.Decimal): number => Number(x.toString());

export const VwapReclaimParamsSchema = z.object({
  version: z.literal('v1'),
  includePremarket: z.boolean(), // v1: false (regular-session VWAP). v1.1 variant would set true.
  wickBodyRatioMin: z.number().positive(),
  volumeAvgLookback: z.number().int().positive(),
  volumeRatioMin: z.number().positive(),
  targetRMultiple: z.number().positive(),
  regularOpenMinute: z.number().int().min(0).max(1439),
  entryStartMinute: z.number().int().min(0).max(1439),
  entryEndMinute: z.number().int().min(0).max(1439),
  volLookback: z.number().int().positive(),
  targetVolBudget: z.number().positive(),
  maxNameFraction: z.number().positive().max(1),
});
export type VwapReclaimParams = z.infer<typeof VwapReclaimParamsSchema>;

/** v1 — regular-session VWAP, premarket EXCLUDED. Reference calibration; do not edit (QDR-6). */
export const VWAP_RECLAIM_V1: VwapReclaimParams = Object.freeze({
  version: 'v1',
  includePremarket: false,
  wickBodyRatioMin: 1.5,
  volumeAvgLookback: 20,
  volumeRatioMin: 1.5,
  targetRMultiple: 2,
  regularOpenMinute: 9 * 60 + 30,
  entryStartMinute: 10 * 60, // 10:00 ET
  entryEndMinute: 15 * 60, // 15:00 ET
  volLookback: 30,
  targetVolBudget: 0.0015,
  maxNameFraction: 0.25,
});

function paramsOrDefault(params?: VwapReclaimParams): VwapReclaimParams {
  return VwapReclaimParamsSchema.parse(params ?? VWAP_RECLAIM_V1);
}

const isUniverse = (symbol: string): boolean =>
  (STOCKS_IN_PLAY_UNIVERSE_V1 as readonly string[]).includes(symbol);

/** Session bars of the current NASDAQ day (≤ asOf), in order. v1 = REGULAR only (premarket out). */
function sessionBars(ctx: StrategyPointInTimeContext, p: VwapReclaimParams): IntradayBar[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  const key = nasdaqDateKey(ctx.asOf);
  return ctx.bars.filter(
    (b) => nasdaqDateKey(b.ts) === key && (b.session === 'REGULAR' || (p.includePremarket && b.session === 'PRE')),
  );
}

/**
 * Cumulative session VWAP through each index (inclusive): Σ(typical·vol)/Σ(vol),
 * typical = (high+low+close)/3. Exported for direct unit testing of the VWAP math.
 */
export function cumulativeSessionVwap(bars: readonly IntradayBar[]): Prisma.Decimal[] {
  const out: Prisma.Decimal[] = [];
  let pv = new D(0);
  let vv = new D(0);
  for (const b of bars) {
    const typical = b.high.plus(b.low).plus(b.close).div(3);
    pv = pv.plus(typical.mul(b.volume));
    vv = vv.plus(b.volume);
    out.push(vv.gt(0) ? pv.div(vv) : b.close);
  }
  return out;
}

interface VwapPrefixCache {
  bars: IntradayBar[];
  values: Prisma.Decimal[];
  priceVolume: Prisma.Decimal;
  volume: Prisma.Decimal;
}

// Simulation hands the setup growing slices that share the same bar objects. Memoizing that exact
// prefix removes repeated Decimal work without changing the pure public calculation or any signal.
const VWAP_PREFIX_CACHE = new WeakMap<IntradayBar, VwapPrefixCache>();

function cachedSessionVwap(bars: IntradayBar[]): Prisma.Decimal[] {
  if (!bars.length) return [];
  const first = bars[0];
  const cached = VWAP_PREFIX_CACHE.get(first);
  const prefixLength = cached ? Math.min(cached.bars.length, bars.length) : 0;
  let samePrefix = cached !== undefined && prefixLength > 0;
  for (let i = 0; samePrefix && i < prefixLength; i++) samePrefix = cached!.bars[i] === bars[i];
  if (cached && samePrefix) {
    if (bars.length <= cached.bars.length) return cached.values.slice(0, bars.length);
    let pv = cached.priceVolume;
    let volume = cached.volume;
    for (let i = cached.bars.length; i < bars.length; i++) {
      const typical = bars[i].high.plus(bars[i].low).plus(bars[i].close).div(3);
      pv = pv.plus(typical.mul(bars[i].volume));
      volume = volume.plus(bars[i].volume);
      cached.bars.push(bars[i]);
      cached.values.push(volume.gt(0) ? pv.div(volume) : bars[i].close);
    }
    cached.priceVolume = pv;
    cached.volume = volume;
    return cached.values;
  }
  let pv = new D(0);
  let volume = new D(0);
  const values = bars.map((bar) => {
    const typical = bar.high.plus(bar.low).plus(bar.close).div(3);
    pv = pv.plus(typical.mul(bar.volume));
    volume = volume.plus(bar.volume);
    return volume.gt(0) ? pv.div(volume) : bar.close;
  });
  VWAP_PREFIX_CACHE.set(first, { bars: [...bars], values, priceVolume: pv, volume });
  return values;
}

const meanDecimal = (a: readonly Prisma.Decimal[]): Prisma.Decimal =>
  a.length ? a.reduce((sum, value) => sum.plus(value), new D(0)).div(a.length) : new D(0);

/** Is bar `bars[j]` a valid TOUCH/absorption bar given the session VWAP series? Pure + falsifiable. */
export function isTouchBar(bars: readonly IntradayBar[], vwap: readonly Prisma.Decimal[], j: number, p: VwapReclaimParams): boolean {
  if (j < p.volumeAvgLookback) return false; // need a full trailing-average window before it
  const b = bars[j];
  const open = b.open;
  const low = b.low;
  const close = b.close;
  const vw = vwap[j];
  const body = close.minus(open).abs();
  const lowerWick = Prisma.Decimal.min(open, close).minus(low);
  if (!low.lte(vw)) return false; // probed VWAP
  if (!close.gt(vw)) return false; // reclaimed it — no downside follow-through
  if (!lowerWick.gt(0) || !lowerWick.gte(body.mul(p.wickBodyRatioMin))) return false;
  const avgVol = meanDecimal(bars.slice(j - p.volumeAvgLookback, j).map((x) => x.volume));
  return avgVol.gt(0) && b.volume.gte(avgVol.mul(p.volumeRatioMin));
}

/** Is bar `bars[j]` a CONFIRM bar of the touch bar `bars[j-1]`? (close > VWAP AND close > touch high). */
export function isConfirmBar(bars: readonly IntradayBar[], vwap: readonly Prisma.Decimal[], j: number, p: VwapReclaimParams): boolean {
  if (j < 1 || !isTouchBar(bars, vwap, j - 1, p)) return false;
  return bars[j].close.gt(vwap[j]) && bars[j].close.gt(bars[j - 1].high);
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], ev: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined ? { matched, reasons, evidence: ev } : { matched, reasons, evidence: ev, sizeFraction };
}

export const vwapReclaimSetup: StrategySetup<VwapReclaimParams> = {
  id: 'vwap-reclaim',
  version: 'v1',
  cadence: 'intraday',
  defaultParams: VWAP_RECLAIM_V1,

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (!isUniverse(ctx.symbol)) return check(false, ['symbol_not_in_liquid_universe'], []);
    const bars = sessionBars(ctx, p);
    if (!bars.length) return check(false, ['no_session_bars'], []);
    const vwap = cachedSessionVwap(bars);
    return check(true, [], [
      evidence('session_vwap', vwap.at(-1)!.toFixed(6)),
      evidence('session_bars', bars.length),
      evidence('params_version', p.version),
    ]);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const bars = sessionBars(ctx, p);
    const n = bars.length;
    if (n < 2) return check(false, ['insufficient_session_bars'], screened.evidence);
    const confirm = bars[n - 1];
    const touch = bars[n - 2];
    // The confirm bar MUST be the current decision bar (else a stale trailing regular bar on a
    // PRE/POST asOf could be mis-read as a confirmation).
    if (confirm.ts.getTime() !== ctx.asOf.getTime()) return check(false, ['confirm_bar_not_current'], screened.evidence);
    const minute = nasdaqMinuteOfDay(confirm.ts);
    if (minute < p.entryStartMinute || minute > p.entryEndMinute) return check(false, ['outside_entry_window'], screened.evidence);
    const vwap = cachedSessionVwap(bars);
    const matched = isConfirmBar(bars, vwap, n - 1, p);
    const closes = bars.map((b) => num(b.close));
    const sizeFraction = matched
      ? volScaledWeight(closes, p.volLookback, p.targetVolBudget, p.maxNameFraction) ?? undefined
      : undefined;
    return check(matched, matched ? [] : ['no_vwap_reclaim'], [
      ...screened.evidence,
      evidence('touch_low', touch.low),
      evidence('touch_high', touch.high),
      evidence('confirm_close', confirm.close),
      evidence('confirm_vwap', vwap[n - 1].toFixed(6)),
    ], sizeFraction);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const bars = sessionBars(ctx, p);
    if (!bars.length) return check(false, ['no_session_bars'], []);
    const vwap = cachedSessionVwap(bars);
    const j = ctx.entrySignalTs
      ? bars.findIndex((bar) => bar.ts.getTime() === ctx.entrySignalTs!.getTime())
      : -1;
    if (j < 1 || !isConfirmBar(bars, vwap, j, p) || !ctx.entryPrice) {
      return check(false, ['exit_anchor_unavailable'], []); // engine still EOD-flattens
    }
    const stopLevel = bars[j - 1].low; // original touch-bar low; never re-anchors
    const r = ctx.entryPrice.minus(stopLevel); // actual fill risk, including costs/slippage
    const targetLevel = ctx.entryPrice.plus(r.mul(p.targetRMultiple));
    const current = bars[bars.length - 1];
    const stopped = current.low.lte(stopLevel);
    const targetHit = r.gt(0) && current.high.gte(targetLevel);
    const matched = stopped || targetHit;
    // The shared engine executes matched exits at the next bar open, not at these trigger levels.
    return check(matched, stopped ? ['vwap_reclaim_stop_signal'] : targetHit ? ['target_2r_signal'] : ['exit_not_triggered'], [
      evidence('stop_level', stopLevel.toFixed(6)),
      evidence('target_level', targetLevel.toFixed(6)),
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; VWAP-reclaim absorption (long-only); codified, not yet validated.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول تجريبي' : stance === 'BEARISH' ? 'خروج تجريبي' : 'انتظار'}؛ ارتداد فوق VWAP بعد امتصاص البيع؛ مُقنّن ولم يُعتمد بعد.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
