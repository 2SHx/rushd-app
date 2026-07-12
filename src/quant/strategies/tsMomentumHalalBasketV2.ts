// ts-momentum-halal-basket-v2 — a NEW ledger candidate (NOT a retune of v1) built to test the two
// STRUCTURAL flaws diagnosed in v1's round-1 rejection (docs/STRATEGY_LAB.md):
//   1. POOLED FULL-CASH-PER-NAME SIZING amplified drawdown — every trade swung the whole book by
//      its full price return regardless of the name's volatility, and a mega-cap-tech basket is
//      highly correlated so the pooled book took the full brunt of a synchronized unwind. v2 sizes
//      each name inverse to its own realized volatility (position ∝ 1/σ) via the SAME proven
//      `sizeFraction` path bollinger-mr-long-v2 uses, so a jumpy name (TSLA/NVDA-class) risks a
//      smaller book slice than a calm one and the pooled book impact is deployed-weight × return.
//   2. NO MARKET-REGIME AWARENESS — v1 entered names on their own trend even while the whole basket
//      was rolling over (it bought into the 2022 bear and unwound OOS). v2 adds a basket-level
//      kill-switch: NEW entries are admitted ONLY when the equal-weight basket index is above ITS
//      OWN 200-day SMA (Faber-style absolute-trend regime filter). Existing positions are UNAFFECTED
//      by the gate — they exit purely by v1's rules (loss-avoidance owns the downside, Klarman).
//
// The dual-momentum ENTRY / EXIT rule FAMILY is v1's, byte-for-byte unchanged (252d & 63d both-
// positive entry; 63d≤0 OR close<EMA100 OR-exit). Only the SIZING layer and the REGIME layer are
// new — exactly the two fixes the diagnosis blamed. Params below are DECIDED a priori (the sizing
// form/budget/cap are identical to bollinger-mr-long-v2's proven calibration; the regime SMA is the
// textbook 200d) and are NOT swept on viewed OOS data.
//
// PER-NAME VOL-SCALED SIZING: reuses bollinger-mr-long-v2's exact helper (import-only; v2 is never
// modified) — w_i = clamp(targetVolBudget/σ_i, 0, maxNameFraction) on trailing-`volLookback` daily
// log-return population stdev. Emitted as a `sizeFraction` HINT; the risk envelope still CLAMPS it
// (name/gross/vol-target/ADV/cash) and can only shrink exposure, never bypass the envelope.
//
// MARKET-REGIME INDEX: an equal-weight, daily-rebalanced index of the basket built ONCE from real
// closes via `prepareUniverse` (the CLI cross-name hook, same mechanism coint-statarb uses) and read
// PIT-filtered to ≤ asOf on every call. Level(d) depends only on closes ≤ d, so slicing ≤ asOf is
// look-ahead-safe. The gate needs ≥ regimeSmaPeriod index points before it can rule.
//
// Pure + versioned (QDR-6). No LLM, no DB, no randomness. PIT-safe: reads only bars ≤ asOf and
// re-asserts assertNoLookahead before touching the series. Reuses the shared NASDAQ_HALAL_UNIVERSE
// and v1's momentum/ema math and v2's sizing helper (all import-only; v1 is REJECTED, never modified).
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { NASDAQ_HALAL_UNIVERSE } from './bollingerMrLong';
import { momentum, ema, annualizedRealizedVol } from './tsMomentumHalalBasket';
import { sma, realizedDailyVol, volScaledWeight } from './bollingerMrLongV2';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput } from './types';

export { NASDAQ_HALAL_UNIVERSE };

const D = Prisma.Decimal;

export const TsMomentumHalalBasketV2ParamsSchema = z.object({
  version: z.literal('v2'),
  longMomLookback: z.number().int().positive(), // slow horizon (252d ≈ 12 months) — v1 family, unchanged
  shortMomLookback: z.number().int().positive(), // fast horizon (63d ≈ 3 months) — also the exit horizon
  emaExitPeriod: z.number().int().positive(), // trend-break exit: close < EMA(period) — v1 family
  volLookback: z.number().int().positive(), // NEW: trailing window for realized vol (sizing basis)
  targetVolBudget: z.number().positive(), // NEW: per-name daily vol budget → weight = budget/σ
  maxNameFraction: z.number().positive(), // NEW: cap on per-name book weight (≤ envelope maxNameWeight)
  regimeSmaPeriod: z.number().int().positive(), // NEW: basket index must be > SMA(regimeSmaPeriod) to enter
});
export type TsMomentumHalalBasketV2Params = z.infer<typeof TsMomentumHalalBasketV2ParamsSchema>;

/**
 * v2 — DECIDED calibration. Entry/exit inherit v1 (252d & 63d dual momentum, 100-EMA-break OR
 * 63d≤0 exit). The two structural fixes: inverse-vol per-name sizing (60d realized vol; 0.4%/day
 * budget; 20% per-name cap — identical FORM to bollinger-mr-long-v2) and a 200d basket-index regime
 * gate (bear-market kill-switch for new entries). Reference; do not tune on viewed OOS data.
 */
export const TS_MOMENTUM_HALAL_BASKET_V2: TsMomentumHalalBasketV2Params = Object.freeze({
  version: 'v2',
  longMomLookback: 252,
  shortMomLookback: 63,
  emaExitPeriod: 100,
  volLookback: 60,
  targetVolBudget: 0.004,
  maxNameFraction: 0.2,
  regimeSmaPeriod: 200,
});

function paramsOrDefault(params?: TsMomentumHalalBasketV2Params): TsMomentumHalalBasketV2Params {
  return TsMomentumHalalBasketV2ParamsSchema.parse(params ?? TS_MOMENTUM_HALAL_BASKET_V2);
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined
    ? { matched, reasons, evidence: evidenceItems }
    : { matched, reasons, evidence: evidenceItems, sizeFraction };
}

/** Chronological close series ≤ asOf (re-asserts no-look-ahead before use). */
function closes(ctx: StrategyPointInTimeContext): number[] {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  return ctx.bars.map((b) => Number(b.close));
}

// ── Market-regime index (reference data; built once from REAL closes, read PIT-filtered ≤ asOf) ──

const meanN = (a: number[]): number => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export interface RegimeIndexPoint {
  ts: number; // epoch ms
  level: number; // equal-weight, daily-rebalanced basket index level (seeded at 100)
}

/**
 * Build an equal-weight, DAILY-REBALANCED basket index from per-name real closes. Pure & exported
 * for tests. For each consecutive pair of trading dates in the union of all names' dates, the index
 * return is the MEAN of the constituent returns over names that trade on BOTH dates (missing names
 * simply do not contribute that step); the level chains from 100. Level(d) depends only on closes
 * ≤ d, so a ≤ asOf slice of the result is look-ahead-safe.
 */
export function buildEqualWeightIndex(
  closesBySymbol: Map<string, { ts: Date; close: number }[]>,
): RegimeIndexPoint[] {
  // date(ms) → per-symbol close on that date
  const byDate = new Map<number, Map<string, number>>();
  for (const [symbol, series] of Array.from(closesBySymbol.entries())) {
    for (const { ts, close } of series) {
      if (!(close > 0)) continue;
      const key = ts.getTime();
      let row = byDate.get(key);
      if (!row) {
        row = new Map<string, number>();
        byDate.set(key, row);
      }
      row.set(symbol, close);
    }
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => a - b);
  const out: RegimeIndexPoint[] = [];
  let level = 100;
  for (let i = 0; i < dates.length; i++) {
    if (i === 0) {
      out.push({ ts: dates[0], level });
      continue;
    }
    const prev = byDate.get(dates[i - 1])!;
    const cur = byDate.get(dates[i])!;
    const rets: number[] = [];
    for (const [symbol, curClose] of Array.from(cur.entries())) {
      const prevClose = prev.get(symbol);
      if (prevClose !== undefined && prevClose > 0) rets.push(curClose / prevClose - 1);
    }
    if (rets.length) level *= 1 + meanN(rets);
    out.push({ ts: dates[i], level });
  }
  return out;
}

let REGIME_INDEX: RegimeIndexPoint[] | null = null;

/** Load the regime index from real closes. Called once by the CLI's prepareUniverse hook. */
export function configureRegimeIndex(closesBySymbol: Map<string, { ts: Date; close: number }[]>): void {
  REGIME_INDEX = buildEqualWeightIndex(closesBySymbol);
}

/** Test/hygiene helper — clears the index so a run without configuration degrades safely (fail-closed). */
export function resetRegimeIndex(): void {
  REGIME_INDEX = null;
}

export type RegimeVerdict =
  | { state: 'unavailable' }
  | { state: 'insufficient' }
  | { state: 'bull'; level: number; sma: number }
  | { state: 'bear'; level: number; sma: number };

/**
 * Point-in-time regime verdict at asOf: is the basket index above its OWN regimeSmaPeriod-day SMA?
 * Reads ONLY index points ≤ asOf (look-ahead guard). Pure given (REGIME_INDEX, asOf, period).
 * `unavailable` = index unset (fail closed); `insufficient` = fewer than `period` points yet.
 */
export function regimeVerdict(asOf: Date, period: number): RegimeVerdict {
  if (!REGIME_INDEX) return { state: 'unavailable' };
  const cutoff = asOf.getTime();
  const levels: number[] = [];
  for (const p of REGIME_INDEX) {
    if (p.ts <= cutoff) levels.push(p.level);
    else break; // REGIME_INDEX is sorted ascending by ts
  }
  if (levels.length < period) return { state: 'insufficient' };
  const smaVal = sma(levels, period);
  if (smaVal === null) return { state: 'insufficient' };
  const level = levels[levels.length - 1];
  return level > smaVal ? { state: 'bull', level, sma: smaVal } : { state: 'bear', level, sma: smaVal };
}

export const tsMomentumHalalBasketV2Setup: StrategySetup<TsMomentumHalalBasketV2Params> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'ts-momentum-halal-basket-v2',
  version: 'v2',
  cadence: 'daily',
  defaultParams: TS_MOMENTUM_HALAL_BASKET_V2,

  prepareUniverse(input: UniversePrepareInput) {
    configureRegimeIndex(input.closesBySymbol);
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const cs = closes(ctx);
    const needed = Math.max(p.longMomLookback + 1, p.emaExitPeriod, p.volLookback + 1);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (cs.length < needed) return check(false, ['insufficient_history'], [evidence('bars', cs.length)]);
    // Market-regime kill-switch: new entries only when the basket index is above its 200d SMA.
    const regime = regimeVerdict(ctx.asOf, p.regimeSmaPeriod);
    if (regime.state === 'unavailable') return check(false, ['regime_index_unavailable'], [evidence('params_version', p.version)]);
    if (regime.state === 'insufficient') return check(false, ['regime_index_insufficient'], [evidence('params_version', p.version)]);
    const ev = [
      evidence('params_version', p.version),
      evidence('regime_index_level', regime.level.toFixed(4)),
      evidence('regime_index_sma', regime.sma.toFixed(4)),
    ];
    if (regime.state === 'bear') return check(false, ['market_regime_bearish'], ev);
    return check(true, [], ev);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const cs = closes(ctx);
    const longMom = momentum(cs, p.longMomLookback);
    const shortMom = momentum(cs, p.shortMomLookback);
    if (longMom === null || shortMom === null) return check(false, ['momentum_unavailable'], screened.evidence);
    const matched = longMom > 0 && shortMom > 0;
    if (!matched) {
      const reason = longMom <= 0 ? 'long_momentum_not_positive' : 'short_momentum_not_positive';
      return check(false, [reason], [
        ...screened.evidence,
        evidence('mom_252d', longMom.toFixed(4)),
        evidence('mom_63d', shortMom.toFixed(4)),
      ]);
    }
    // Vol-scaled book weight (the sizing FIX) — reuses bollinger-mr-long-v2's proven helper. Hint
    // clamped further by the envelope downstream; it can only ever SHRINK exposure.
    const weight = volScaledWeight(cs, p.volLookback, p.targetVolBudget, p.maxNameFraction);
    const sigma = realizedDailyVol(cs, p.volLookback);
    const rvolAnn = annualizedRealizedVol(cs, p.volLookback);
    const ev = [
      ...screened.evidence,
      evidence('mom_252d', longMom.toFixed(4)),
      evidence('mom_63d', shortMom.toFixed(4)),
      evidence('realized_vol_daily', sigma === null ? 'na' : sigma.toFixed(5)),
      evidence('realized_vol_ann', rvolAnn === null ? 'na' : rvolAnn.toFixed(4)),
      evidence('size_fraction', weight === null ? 'na' : weight.toFixed(4)),
    ];
    return check(true, [], ev, weight ?? undefined);
  },

  exit(ctx, params) {
    // v1 rule family, UNCHANGED and regime-INDEPENDENT: existing positions exit only on their own
    // trend weakness (63d≤0 OR close<EMA100). The regime gate governs ENTRIES only.
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; vol-scaled dual-momentum (252d & 63d) on the halal NASDAQ basket, new entries gated by the basket index > ${p.regimeSmaPeriod}d SMA.`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'دخول بزخم مزدوج وحجم معدّل حسب التقلب' : stance === 'BEARISH' ? 'خروج عند كسر الاتجاه' : 'انتظار'}؛ بوابة نظام السوق على مؤشر السلة فوق متوسط ${p.regimeSmaPeriod} يوم.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
