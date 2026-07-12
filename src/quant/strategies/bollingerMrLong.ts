// bollinger-mr-long — long-only lower-Bollinger-band mean reversion, gated by a stationarity
// regime filter (Chan, "Algorithmic Trading" ch.2–3). Chan's central point: naked band-reversion
// bleeds to costs in TRENDING regimes; it only survives when the series is actually mean-reverting.
// So entry requires BOTH (a) close at/below the lower band AND (b) a variance-ratio stationarity
// gate passing over a lookback window. Long-only cash (Sharia: no short leg, no margin).
//
// Regime filter — VARIANCE RATIO (Lo–MacKinlay style, our ADF-lite proxy):
//   VR(q) = Var(q-period overlapping log returns) / (q · Var(1-period log returns)).
//   Random walk ⇒ VR≈1; mean-reverting ⇒ VR<1; trending/momentum ⇒ VR>1. We require VR ≤
//   varianceRatioMax (default 1.0) over the last `regimeLookback` closes — i.e. only buy the dip
//   when recent price action is sub-random-walk (mean-reverting), never in a trend. This is the
//   documented reason the setup can survive costs; without it, mega-cap tech (which mostly trends)
//   would generate losing dip-buys.
//
// Exit (any, checked on close, filled next open by the engine — deliberately no intrabar peek):
//   • close ≥ mid band (SMA)                         → 'mid_band_reversion' (the reversion target)
//   • close ≤ entryPrice − atrStopMult·ATR           → 'atr_hard_stop'      (entry-relative, via ctx)
//   • holding days ≥ maxHoldingDays                  → 'max_holding_days'   (time stop)
//
// Pure + versioned (QDR-6). No LLM, no DB, no randomness. PIT-safe: reads only bars ≤ asOf, and
// re-asserts assertNoLookahead before touching the series.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup } from './types';

const D = Prisma.Decimal;
const DAY_MS = 86_400_000;

/** NASDAQ halal universe for this setup (NASDAQ-listed only; TASI excluded per DECIDED). */
export const NASDAQ_HALAL_UNIVERSE: readonly string[] = Object.freeze([
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AVGO', 'ADBE', 'CSCO',
  'QCOM', 'ADI', 'AMGN', 'BKNG', 'CMCSA', 'COST', 'HON', 'INTU', 'ISRG', 'NFLX',
  'PEP', 'REGN', 'SBUX', 'TXN', 'VRTX',
]);

export const BollingerMrLongParamsSchema = z.object({
  version: z.literal('v1'),
  bandPeriod: z.number().int().positive(), // SMA + stdev window
  entryStdev: z.number().positive(), // buy at/below SMA − entryStdev·σ
  regimeLookback: z.number().int().positive(), // window for the variance-ratio gate
  varianceRatioQ: z.number().int().min(2), // aggregation horizon q
  varianceRatioMax: z.number().positive(), // require VR(q) ≤ this (≤1 ⇒ mean-reverting)
  maxHoldingDays: z.number().int().positive(), // time stop
  atrPeriod: z.number().int().positive(),
  atrStopMult: z.number().positive(), // hard stop = entryPrice − mult·ATR
});
export type BollingerMrLongParams = z.infer<typeof BollingerMrLongParamsSchema>;

/** v1 — DECIDED calibration (20-day band, 2σ entry, VR<1 stationarity gate). Reference; do not tune. */
export const BOLLINGER_MR_LONG_V1: BollingerMrLongParams = Object.freeze({
  version: 'v1',
  bandPeriod: 20,
  entryStdev: 2,
  regimeLookback: 60,
  varianceRatioQ: 5,
  varianceRatioMax: 1.0,
  maxHoldingDays: 20,
  atrPeriod: 14,
  atrStopMult: 3,
});

function paramsOrDefault(params?: BollingerMrLongParams): BollingerMrLongParams {
  return BollingerMrLongParamsSchema.parse(params ?? BOLLINGER_MR_LONG_V1);
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: evidenceItems };
}

const meanN = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const popVar = (a: number[]): number => {
  if (a.length < 2) return 0;
  const m = meanN(a);
  return meanN(a.map((v) => (v - m) ** 2));
};

/** Chronological close series ≤ asOf (re-asserts no-look-ahead before use). */
function closes(ctx: StrategyPointInTimeContext): number[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  return ctx.bars.map((b) => Number(b.close));
}

/** SMA + population stdev of the last `period` closes; null if not enough history. */
export function bollinger(closeSeries: number[], period: number, k: number): { sma: number; lower: number; upper: number } | null {
  if (closeSeries.length < period) return null;
  const window = closeSeries.slice(-period);
  const sma = meanN(window);
  const sd = Math.sqrt(popVar(window));
  return { sma, lower: sma - k * sd, upper: sma + k * sd };
}

/**
 * Lo–MacKinlay variance ratio over the last `lookback+1` closes with aggregation horizon q.
 * Returns null if there is not enough history to form q-period returns. VR<1 ⇒ mean-reverting.
 */
export function varianceRatio(closeSeries: number[], lookback: number, q: number): number | null {
  if (closeSeries.length < lookback + 1) return null;
  const window = closeSeries.slice(-(lookback + 1));
  const r: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] <= 0 || window[i] <= 0) return null;
    r.push(Math.log(window[i] / window[i - 1]));
  }
  if (r.length < q + 1) return null;
  const var1 = popVar(r);
  if (var1 === 0) return null;
  const agg: number[] = [];
  for (let i = 0; i + q <= r.length; i++) {
    let s = 0;
    for (let j = 0; j < q; j++) s += r[i + j];
    agg.push(s);
  }
  const varQ = popVar(agg);
  return varQ / (q * var1);
}

/** ATR (Wilder-style simple mean of true range) over the last `period` bars. */
function atr(ctx: StrategyPointInTimeContext, period: number): number {
  const bars = ctx.bars;
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = Number(bars[i].high);
    const l = Number(bars[i].low);
    const pc = Number(bars[i - 1].close);
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  return meanN(trs.slice(-period));
}

export const bollingerMrLongSetup: StrategySetup<BollingerMrLongParams> = {
  id: 'bollinger-mr-long',
  version: 'v1',
  cadence: 'daily',
  defaultParams: BOLLINGER_MR_LONG_V1,

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const cs = closes(ctx);
    const needed = Math.max(p.bandPeriod, p.regimeLookback + 1, p.atrPeriod + 1);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (cs.length < needed) return check(false, ['insufficient_history'], [evidence('bars', cs.length)]);
    const vr = varianceRatio(cs, p.regimeLookback, p.varianceRatioQ);
    if (vr === null) return check(false, ['variance_ratio_unavailable'], []);
    const evidenceItems = [evidence('variance_ratio', vr.toFixed(4)), evidence('params_version', p.version)];
    const stationary = vr <= p.varianceRatioMax;
    return check(stationary, stationary ? [] : ['regime_not_mean_reverting'], evidenceItems);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const cs = closes(ctx);
    const band = bollinger(cs, p.bandPeriod, p.entryStdev);
    const close = cs.at(-1);
    if (!band || close === undefined) return check(false, ['band_unavailable'], screened.evidence);
    const matched = close <= band.lower;
    return check(matched, matched ? [] : ['above_lower_band'], [
      ...screened.evidence,
      evidence('close', close.toFixed(4)),
      evidence('lower_band', band.lower.toFixed(4)),
      evidence('sma', band.sma.toFixed(4)),
    ]);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const cs = closes(ctx);
    const band = bollinger(cs, p.bandPeriod, p.entryStdev);
    const close = cs.at(-1);
    if (!band || close === undefined) return check(false, ['band_unavailable'], []);

    const reasons: string[] = [];
    if (close >= band.sma) reasons.push('mid_band_reversion');

    if (ctx.entryPrice && ctx.entryPrice.gt(0)) {
      const stop = Number(ctx.entryPrice) - p.atrStopMult * atr(ctx, p.atrPeriod);
      if (close <= stop) reasons.push('atr_hard_stop');
    }
    if (ctx.entryTs) {
      const heldDays = (ctx.asOf.getTime() - ctx.entryTs.getTime()) / DAY_MS;
      if (heldDays >= p.maxHoldingDays) reasons.push('max_holding_days');
    }

    return check(reasons.length > 0, reasons.length ? reasons : ['hold'], [
      evidence('close', close.toFixed(4)), evidence('sma', band.sma.toFixed(4)),
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
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: p.maxHoldingDays,
      rationaleEn: `${this.id} ${p.version}: ${stance}; lower-band mean reversion in a stationary regime.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول عند النطاق السفلي' : stance === 'BEARISH' ? 'خروج عند المتوسط' : 'انتظار'}؛ ارتداد للوسط في نظام مستقر.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
