// ts-momentum-halal-basket — long-only TIME-SERIES (absolute) momentum on the halal NASDAQ
// mega-cap tech basket: the Sharia-compliant NQ trend-following proxy (Chan, "Algorithmic
// Trading" ch.6). Time-series momentum is the best-documented anomaly class; realistic figures
// are teens-to-20s% annual at Sharpe ~1 — a result far above that is SUSPECT, not success.
//
// Signal (absolute, per-name — the basket is 25 independent trend followers, not a cross-section):
//   entry: 12-month (252d) return > 0 AND 3-month (63d) return > 0  → the trend is up on both
//          horizons (dual-timeframe confirmation, Moskowitz–Ooi–Pedersen style).
//   exit : 3-month (63d) return turns ≤ 0  OR  close breaks below the 100-day EMA  (OR, "either").
//          Chosen over a single trigger because trend-following's edge is loss-avoidance (Klarman):
//          exit on the FIRST sign of weakness on either the slow-trend (EMA100) or the medium
//          horizon. Tests confirm the OR exits earlier and caps per-trade drawdown vs. EMA-only.
//
// Position sizing / VOLATILITY TARGETING is delivered by the risk envelope (src/quant/risk), NOT
// this pure setup — identical to bollinger-mr-long's path. The engine proposes a full-cash long and
// applyEnvelope() clamps it by a daily vol target (volTargetPct·equity/ATR), name/gross/ADV/cash
// caps. It can only scale DOWN to cash, never above 1× (Sharia: no margin, no leverage). We surface
// the trailing-60d annualized realized vol as EVIDENCE so the sizing basis is auditable, and expose
// targetAnnualVol in params for provenance; the envelope owns the arithmetic.
//
// Pure + versioned (QDR-6). No LLM, no DB, no randomness. PIT-safe: reads only bars ≤ asOf and
// re-asserts assertNoLookahead before touching the series. Reuses NASDAQ_HALAL_UNIVERSE unchanged.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { NASDAQ_HALAL_UNIVERSE } from './bollingerMrLong';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup } from './types';

export { NASDAQ_HALAL_UNIVERSE };

const D = Prisma.Decimal;
const TRADING_DAYS = 252;

export const TsMomentumHalalBasketParamsSchema = z.object({
  version: z.literal('v1'),
  longMomLookback: z.number().int().positive(), // slow horizon (252d ≈ 12 months)
  shortMomLookback: z.number().int().positive(), // fast horizon (63d ≈ 3 months) — also the exit horizon
  emaExitPeriod: z.number().int().positive(), // trend-break exit: close < EMA(period)
  realizedVolLookback: z.number().int().positive(), // trailing window for annualized realized vol (evidence)
  targetAnnualVol: z.number().positive(), // vol-target basis (provenance; envelope owns the sizing)
});
export type TsMomentumHalalBasketParams = z.infer<typeof TsMomentumHalalBasketParamsSchema>;

/** v1 — DECIDED calibration (252d & 63d dual momentum, 100-EMA break exit, 60d vol, 20% target). Reference; do not tune. */
export const TS_MOMENTUM_HALAL_BASKET_V1: TsMomentumHalalBasketParams = Object.freeze({
  version: 'v1',
  longMomLookback: 252,
  shortMomLookback: 63,
  emaExitPeriod: 100,
  realizedVolLookback: 60,
  targetAnnualVol: 0.2,
});

function paramsOrDefault(params?: TsMomentumHalalBasketParams): TsMomentumHalalBasketParams {
  return TsMomentumHalalBasketParamsSchema.parse(params ?? TS_MOMENTUM_HALAL_BASKET_V1);
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: evidenceItems };
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

/** Simple total return over the last `lookback` bars: close[-1]/close[-1-lookback] − 1. Null if short. */
export function momentum(closeSeries: number[], lookback: number): number | null {
  if (closeSeries.length < lookback + 1) return null;
  const last = closeSeries[closeSeries.length - 1];
  const past = closeSeries[closeSeries.length - 1 - lookback];
  if (past <= 0) return null;
  return last / past - 1;
}

/** EMA over the last available closes, seeded with the SMA of the first `period`. Null if short. */
export function ema(closeSeries: number[], period: number): number | null {
  if (closeSeries.length < period) return null;
  const k = 2 / (period + 1);
  let e = meanN(closeSeries.slice(0, period));
  for (let i = period; i < closeSeries.length; i++) e = closeSeries[i] * k + e * (1 - k);
  return e;
}

/** Annualized realized vol from trailing-`lookback` daily log returns (evidence only). Null if short. */
export function annualizedRealizedVol(closeSeries: number[], lookback: number): number | null {
  if (closeSeries.length < lookback + 1) return null;
  const window = closeSeries.slice(-(lookback + 1));
  const r: number[] = [];
  for (let i = 1; i < window.length; i++) {
    if (window[i - 1] <= 0 || window[i] <= 0) return null;
    r.push(Math.log(window[i] / window[i - 1]));
  }
  return popStd(r) * Math.sqrt(TRADING_DAYS);
}

export const tsMomentumHalalBasketSetup: StrategySetup<TsMomentumHalalBasketParams> = {
  id: 'ts-momentum-halal-basket',
  version: 'v1',
  cadence: 'daily',
  defaultParams: TS_MOMENTUM_HALAL_BASKET_V1,

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const cs = closes(ctx);
    const needed = Math.max(p.longMomLookback + 1, p.emaExitPeriod, p.realizedVolLookback + 1);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (cs.length < needed) return check(false, ['insufficient_history'], [evidence('bars', cs.length)]);
    return check(true, [], [evidence('params_version', p.version)]);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const cs = closes(ctx);
    const longMom = momentum(cs, p.longMomLookback);
    const shortMom = momentum(cs, p.shortMomLookback);
    const rvol = annualizedRealizedVol(cs, p.realizedVolLookback);
    if (longMom === null || shortMom === null) return check(false, ['momentum_unavailable'], screened.evidence);
    const matched = longMom > 0 && shortMom > 0;
    const reasons = matched ? [] : longMom <= 0 ? ['long_momentum_not_positive'] : ['short_momentum_not_positive'];
    return check(matched, reasons, [
      ...screened.evidence,
      evidence('mom_252d', longMom.toFixed(4)),
      evidence('mom_63d', shortMom.toFixed(4)),
      evidence('realized_vol_ann', rvol === null ? 'na' : rvol.toFixed(4)),
    ]);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const cs = closes(ctx);
    const shortMom = momentum(cs, p.shortMomLookback);
    const emaVal = ema(cs, p.emaExitPeriod);
    const close = cs.at(-1);
    if (shortMom === null || emaVal === null || close === undefined) return check(false, ['exit_signal_unavailable'], []);

    const reasons: string[] = [];
    if (shortMom <= 0) reasons.push('short_momentum_turned_negative');
    if (close < emaVal) reasons.push('ema_trend_break');

    return check(reasons.length > 0, reasons.length ? reasons : ['hold'], [
      evidence('mom_63d', shortMom.toFixed(4)),
      evidence('ema_100', emaVal.toFixed(4)),
      evidence('close', close.toFixed(4)),
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
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: p.shortMomLookback,
      rationaleEn: `${this.id} ${p.version}: ${stance}; long-only time-series momentum (252d & 63d) on the halal NASDAQ basket.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول عند زخم إيجابي' : stance === 'BEARISH' ? 'خروج عند كسر الاتجاه' : 'انتظار'}؛ زخم زمني طويل فقط على سلة ناسداك المتوافقة.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
