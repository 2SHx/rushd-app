// bollinger-mr-long-v2 — a NEW ledger candidate (NOT a retune of v1) built to test the two
// STRUCTURAL flaws diagnosed in v1's round-1 rejection (docs/STRATEGY_LAB.md):
//   1. POOLED FULL-CASH-PER-NAME SIZING amplified drawdown — every trade swung the whole book by
//      its full price return regardless of the name's volatility. v2 sizes each name inverse to its
//      own realized volatility (position ∝ 1/σ), so a jumpy name (NVDA/TSLA) risks a smaller book
//      slice than a calm one, and the pooled book impact is the deployed weight × price return.
//   2. VR ≤ 1 REGIME GATE WAS TOO LOOSE — it admitted near-random-walk tape that unwound OOS. v2
//      tightens the stationarity gate to VR ≤ 0.85 AND adds Chan's regime lesson (Algorithmic
//      Trading ch.2): mean-reversion is only safe INSIDE an uptrend, so entries also require
//      close > the name's 200-day SMA. Dip-buying a downtrend is trend-fighting, not reversion.
//
// The ENTRY / EXIT rule FAMILY is v1's, unchanged (lower-Bollinger-band long; mid-band / ATR-stop /
// max-hold exits). Only the SIZING layer and the REGIME layer are new — the fixes under test.
//
// PER-NAME VOL-SCALED SIZING (documented math). For name i with trailing `volLookback` (60d) daily
// log-return population stdev σ_i, the target book weight is
//     w_i = clamp( targetVolBudget / σ_i , 0 , maxNameFraction ).
// `targetVolBudget` is the daily volatility contribution we allocate per name; with the reference
// mega-cap daily vol σ_ref ≈ 0.02 and maxNameFraction 0.20 we set targetVolBudget = σ_ref ·
// maxNameFraction = 0.004, so a reference-vol name receives exactly maxNameFraction of the book,
// higher-vol names get proportionally LESS (∝ 1/σ), lower-vol names are capped (never levered up
// past the cap). With ≈ 1/maxNameFraction ≈ 5 concurrent positions the book is ≈ fully invested —
// i.e. the SAME total single-name-full-cash risk budget v1 used, now spread inverse-to-vol. The
// emitted `sizeFraction` is a HINT: the risk envelope still CLAMPS it (name/gross/vol-target/ADV/
// cash) and it can only shrink exposure, never bypass the envelope (maxNameFraction ≤ envelope
// maxNameWeight so the envelope is a strict outer guard).
//
// Pure + versioned (QDR-6). No LLM, no DB, no randomness. PIT-safe: reads only bars ≤ asOf and
// re-asserts assertNoLookahead before touching the series. Reuses v1's band + variance-ratio math
// and the shared NASDAQ_HALAL_UNIVERSE (import-only; v1 is REJECTED and never modified).
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { NASDAQ_HALAL_UNIVERSE, bollinger, varianceRatio } from './bollingerMrLong';
import type { PlateauNeighborhood, StrategyCheck, StrategyPointInTimeContext, StrategySetup } from './types';

export { NASDAQ_HALAL_UNIVERSE };

const D = Prisma.Decimal;
const DAY_MS = 86_400_000;

export const BollingerMrLongV2ParamsSchema = z.object({
  version: z.literal('v2'),
  bandPeriod: z.number().int().positive(), // SMA + stdev window (v1 family)
  entryStdev: z.number().positive(), // buy at/below SMA − entryStdev·σ (v1 family)
  regimeLookback: z.number().int().positive(), // window for the variance-ratio gate
  varianceRatioQ: z.number().int().min(2), // aggregation horizon q
  varianceRatioMax: z.number().positive(), // require VR(q) ≤ this — STRICTER than v1 (0.85 vs 1.0)
  trendSmaPeriod: z.number().int().positive(), // NEW: require close > SMA(trendSmaPeriod) (uptrend)
  volLookback: z.number().int().positive(), // NEW: trailing window for realized vol (sizing basis)
  targetVolBudget: z.number().positive(), // NEW: per-name daily vol budget → weight = budget/σ
  maxNameFraction: z.number().positive(), // NEW: cap on per-name book weight (≤ envelope maxNameWeight)
  maxHoldingDays: z.number().int().positive(), // time stop (v1 family)
  atrPeriod: z.number().int().positive(),
  atrStopMult: z.number().positive(), // hard stop = entryPrice − mult·ATR (v1 family)
});
export type BollingerMrLongV2Params = z.infer<typeof BollingerMrLongV2ParamsSchema>;

/**
 * v2 — DECIDED calibration. Entry/exit inherit v1 (20d band, 2σ). The two structural fixes:
 * stricter regime gate (VR ≤ 0.85 AND close > 200d SMA) and inverse-vol per-name sizing
 * (60d realized vol; 0.4%/day budget; 20% per-name cap). Reference; do not tune on viewed OOS data.
 */
export const BOLLINGER_MR_LONG_V2: BollingerMrLongV2Params = Object.freeze({
  version: 'v2',
  bandPeriod: 20,
  entryStdev: 2,
  regimeLookback: 60,
  varianceRatioQ: 5,
  varianceRatioMax: 0.85,
  trendSmaPeriod: 200,
  volLookback: 60,
  targetVolBudget: 0.004,
  maxNameFraction: 0.2,
  maxHoldingDays: 20,
  atrPeriod: 14,
  atrStopMult: 3,
});

function paramsOrDefault(params?: BollingerMrLongV2Params): BollingerMrLongV2Params {
  return BollingerMrLongV2ParamsSchema.parse(params ?? BOLLINGER_MR_LONG_V2);
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined
    ? { matched, reasons, evidence: evidenceItems }
    : { matched, reasons, evidence: evidenceItems, sizeFraction };
}

const meanN = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const popStd = (a: number[]): number => {
  if (a.length < 2) return 0;
  const m = meanN(a);
  return Math.sqrt(meanN(a.map((v) => (v - m) ** 2)));
};

/** Chronological close series ≤ asOf (re-asserts no-look-ahead before use). */
function closes(ctx: StrategyPointInTimeContext): number[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  return ctx.bars.map((b) => Number(b.close));
}

/** Simple moving average of the last `period` closes; null if not enough history. */
export function sma(closeSeries: number[], period: number): number | null {
  if (closeSeries.length < period) return null;
  return meanN(closeSeries.slice(-period));
}

/** Trailing-`lookback` daily-log-return population volatility (per-day, not annualized). Null if short. */
export function realizedDailyVol(closeSeries: number[], lookback: number): number | null {
  if (closeSeries.length < lookback + 1) return null;
  const window = closeSeries.slice(-(lookback + 1));
  const r: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] <= 0 || window[i] <= 0) return null;
    r.push(Math.log(window[i] / window[i - 1]));
  }
  const sd = popStd(r);
  return sd > 0 ? sd : null;
}

/**
 * Vol-scaled per-name book weight w = clamp(targetVolBudget/σ, 0, maxNameFraction). Pure, exported
 * for tests. Returns null when σ is unavailable (insufficient history) — the caller then declines to
 * emit a hint and the engine falls back to the envelope's own sizing (no fabricated weight).
 */
export function volScaledWeight(
  closeSeries: number[],
  volLookback: number,
  targetVolBudget: number,
  maxNameFraction: number,
): number | null {
  const sigma = realizedDailyVol(closeSeries, volLookback);
  if (sigma === null) return null;
  return Math.min(maxNameFraction, targetVolBudget / sigma);
}

/** ATR (simple mean true range) over the last `period` bars (v1-family exit input). */
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

export const bollingerMrLongV2Setup: StrategySetup<BollingerMrLongV2Params> = {
  id: 'bollinger-mr-long-v2',
  version: 'v2',
  cadence: 'daily',
  defaultParams: BOLLINGER_MR_LONG_V2,

  // QDR-6 profit-plateau neighborhood. The 1–2 MOST sensitive params are the two v2 layers under
  // test: the band entry threshold (`entryStdev`, ±0.25σ) and the stricter regime gate
  // (`varianceRatioMax`, ±0.05). These are ROBUSTNESS probes only — `center` is the frozen chosen
  // calibration and is NEVER updated from a neighbor's OOS result (that would be optimization, not a
  // plateau proof). The harness re-runs each neighbor on the same real bars and checks OOS
  // expectancy stays same-sign and within the degradation bound (see backtest/profitPlateau.ts).
  plateauNeighborhood(params): PlateauNeighborhood<BollingerMrLongV2Params> {
    const p = paramsOrDefault(params);
    return {
      axes: ['entryStdev', 'varianceRatioMax'],
      center: p,
      neighbors: [
        { label: 'entryStdev-0.25', params: { ...p, entryStdev: p.entryStdev - 0.25 } },
        { label: 'entryStdev+0.25', params: { ...p, entryStdev: p.entryStdev + 0.25 } },
        { label: 'varianceRatioMax-0.05', params: { ...p, varianceRatioMax: p.varianceRatioMax - 0.05 } },
        { label: 'varianceRatioMax+0.05', params: { ...p, varianceRatioMax: p.varianceRatioMax + 0.05 } },
      ],
    };
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const cs = closes(ctx);
    const needed = Math.max(p.bandPeriod, p.regimeLookback + 1, p.atrPeriod + 1, p.trendSmaPeriod, p.volLookback + 1);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (cs.length < needed) return check(false, ['insufficient_history'], [evidence('bars', cs.length)]);
    const vr = varianceRatio(cs, p.regimeLookback, p.varianceRatioQ);
    if (vr === null) return check(false, ['variance_ratio_unavailable'], []);
    const trendSma = sma(cs, p.trendSmaPeriod);
    const close = cs.at(-1);
    if (trendSma === null || close === undefined) return check(false, ['insufficient_history'], []);
    const stationary = vr <= p.varianceRatioMax; // STRICTER: 0.85
    const uptrend = close > trendSma; // NEW: mean-revert only inside an uptrend (Chan ch.2)
    const evidenceItems = [
      evidence('variance_ratio', vr.toFixed(4)),
      evidence('sma_200', trendSma.toFixed(4)),
      evidence('close', close.toFixed(4)),
      evidence('params_version', p.version),
    ];
    const reasons: string[] = [];
    if (!stationary) reasons.push('regime_not_mean_reverting');
    if (!uptrend) reasons.push('below_trend_sma');
    return check(stationary && uptrend, reasons, evidenceItems);
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
    if (!matched) return check(false, ['above_lower_band'], screened.evidence);
    // Vol-scaled book weight (the sizing FIX). Hint clamped further by the envelope downstream.
    const weight = volScaledWeight(cs, p.volLookback, p.targetVolBudget, p.maxNameFraction);
    const sigma = realizedDailyVol(cs, p.volLookback);
    const ev = [
      ...screened.evidence,
      evidence('lower_band', band.lower.toFixed(4)),
      evidence('realized_vol_daily', sigma === null ? 'na' : sigma.toFixed(5)),
      evidence('size_fraction', weight === null ? 'na' : weight.toFixed(4)),
    ];
    return check(true, [], ev, weight ?? undefined);
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; vol-scaled lower-band mean reversion, stationary (VR≤${p.varianceRatioMax}) uptrend only.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول عند النطاق السفلي بحجم معدّل حسب التقلب' : stance === 'BEARISH' ? 'خروج عند المتوسط' : 'انتظار'}؛ ارتداد للوسط في نظام مستقر واتجاه صاعد.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
