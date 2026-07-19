// nvda-focus-v1 — pre-registered R4-E7 single-name book (USER DIRECTIVE 2026-07-19: "focus on one
// stock, verified Sharia compliant"). Universe = {NVDA} ONLY. NVDA passes the C1 Tier-2 AAOIFI
// screen with FRESH SEC XBRL (debt 0.17% / cash+sec 0.92% / non-compliant income 1.07%, 107 bps
// purification, oldest input ~175d — src/quant/universe/README.md), so the C1-verified fixed route
// records the card as VERIFIED_COMPLIANT.
//
// SIGNAL (dual TIME-SERIES momentum, absolute filter): hold NVDA when BOTH the long leg (252d
// lookback, skip-21 — the classic 12−1M window) AND the short leg (63d lookback, no skip) have
// strictly positive time-series momentum; cash otherwise. Decide on bar-t close, fill next open.
// Exit when EITHER leg drops to ≤ threshold (or becomes incomputable ⇒ fail-closed to cash).
// Position size is 100% of book cash when in (single-name book BY DESIGN), envelope-clamped by the
// engine (ADV/cash + the book drawdown governor below). Concentration raises VARIANCE, not expected
// return; the $1,000/day goal remains a measured readout, never a promise.
//
// GOVERNOR (a-priori, derived from the E6/30%-gate family, NEVER from any viewed equity curve):
// linear book-level exposure 1.0 at ≤10% drawdown → 0.0 (all cash) at ≥25% drawdown, applied by the
// engine's pre-existing down-only `drawdownExposureScalar` / StrategyBookPolicy. No new engine code.
//
// FROZEN 3×3 plateau {231,252,273}×{42,63,84} on (longLookbackBars × shortLookbackBars); center
// {252,63}. The sweep is a ROBUSTNESS PROOF only — the chosen params are NEVER updated from it.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood, StrategyCheck, StrategyPointInTimeContext, StrategySetup,
} from './types';

const D = Prisma.Decimal;

/** Single-name fixed charter: NVDA only, C1 Tier-2 AAOIFI verified compliant. */
export const NVDA_FOCUS_UNIVERSE: readonly string[] = Object.freeze(['NVDA']);

export const NvdaFocusParamsSchema = z.object({
  version: z.literal('v1'),
  /** Long-leg time-series-momentum lookback in trading bars (a-priori 252). */
  longLookbackBars: z.number().int().positive(),
  /** Skip the most recent N bars on the long leg (a-priori 21 — the 12−1M window). */
  longSkipBars: z.number().int().nonnegative(),
  /** Short-leg time-series-momentum lookback in trading bars (a-priori 63, skip-0). */
  shortLookbackBars: z.number().int().positive(),
  /** Both legs must strictly exceed this absolute-momentum threshold to hold (a-priori 0). */
  absoluteThreshold: z.number().finite(),
  /** Full book exposure at or below this drawdown (a-priori 0.10). */
  drawdownStartFraction: z.number().min(0).max(1),
  /** All-cash at or above this book drawdown (a-priori 0.25). */
  drawdownCashFraction: z.number().min(0).max(1),
  /** Multiple-testing correction = 3×3 frozen grid points (dual-momentum precedent). */
  validationTrials: z.literal(9),
}).superRefine((params, ctx) => {
  if (params.longSkipBars >= params.longLookbackBars) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'longSkipBars must be smaller than longLookbackBars' });
  }
  if (!(params.drawdownCashFraction > params.drawdownStartFraction)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'drawdownCashFraction must exceed drawdownStartFraction' });
  }
});

export type NvdaFocusParams = z.infer<typeof NvdaFocusParamsSchema>;

export const NVDA_FOCUS_V1: NvdaFocusParams = Object.freeze({
  version: 'v1',
  longLookbackBars: 252,
  longSkipBars: 21,
  shortLookbackBars: 63,
  absoluteThreshold: 0,
  drawdownStartFraction: 0.10,
  drawdownCashFraction: 0.25,
  validationTrials: 9,
});

function paramsOrDefault(params?: NvdaFocusParams): NvdaFocusParams {
  return NvdaFocusParamsSchema.parse(params ?? NVDA_FOCUS_V1);
}

/** Single-name book policy carrying the frozen down-only drawdown governor; max one position. */
export function nvdaFocusBookPolicy(params?: NvdaFocusParams): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxOpenPositions: 1,
    decisionHistoryBars: 295,
    drawdownStartFraction: p.drawdownStartFraction,
    drawdownCashFraction: p.drawdownCashFraction,
  };
}

/**
 * Time-series momentum over the window [t−lookback, t−skip]: close[t−skip]/close[t−lookback] − 1.
 * Null when history is too short or any endpoint is nonpositive/nonfinite (⇒ fail-closed to cash).
 */
export function tsMomentum(closes: readonly number[], lookbackBars: number, skipBars: number): number | null {
  if (closes.length < lookbackBars + 1 || skipBars >= lookbackBars) return null;
  const base = closes[closes.length - 1 - lookbackBars];
  const end = closes[closes.length - 1 - skipBars];
  if (![base, end].every((value) => Number.isFinite(value) && value > 0)) return null;
  return end / base - 1;
}

interface DualLegState {
  readonly long: number | null;
  readonly short: number | null;
  readonly hold: boolean;
}

function dualLegState(ctx: StrategyPointInTimeContext, p: NvdaFocusParams): DualLegState {
  const closes = ctx.bars.map((bar) => Number(bar.close.toString()));
  const long = tsMomentum(closes, p.longLookbackBars, p.longSkipBars);
  const short = tsMomentum(closes, p.shortLookbackBars, 0);
  const hold = long !== null && short !== null
    && long > p.absoluteThreshold && short > p.absoluteThreshold;
  return { long, short, hold };
}

function evidence(ref: string, value: string | number): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function legEvidence(state: DualLegState, p: NvdaFocusParams): Evidence[] {
  return [
    evidence('symbol', 'NVDA'),
    evidence('long_ts_momentum_252_skip21', state.long === null ? 'na' : state.long.toFixed(6)),
    evidence('short_ts_momentum_63', state.short === null ? 'na' : state.short.toFixed(6)),
    evidence('absolute_threshold', p.absoluteThreshold.toFixed(4)),
    evidence('sharia_state', 'c1_verified_compliant'),
  ];
}

const LONG_LOOKBACKS = [231, 252, 273] as const;
const SHORT_LOOKBACKS = [42, 63, 84] as const;

export const nvdaFocusSetup: StrategySetup<NvdaFocusParams> = {
  id: 'nvda-focus-v1',
  version: 'v1',
  cadence: 'daily',
  // Owns the single-name NVDA book; any --universe/--symbols override is rejected.
  universeCompatibility: 'fixed',
  defaultParams: NVDA_FOCUS_V1,

  plateauNeighborhood(params): PlateauNeighborhood<NvdaFocusParams> {
    const center = paramsOrDefault(params);
    const neighbors = [];
    for (const longLookbackBars of LONG_LOOKBACKS) {
      for (const shortLookbackBars of SHORT_LOOKBACKS) {
        if (longLookbackBars === center.longLookbackBars && shortLookbackBars === center.shortLookbackBars) continue;
        neighbors.push({
          label: `long${longLookbackBars}|short${shortLookbackBars}`,
          params: { ...center, longLookbackBars, shortLookbackBars },
        });
      }
    }
    return { axes: ['longLookbackBars', 'shortLookbackBars'], center, neighbors };
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    const matched = ctx.symbol === 'NVDA';
    return check(matched, matched ? [] : ['outside_nvda_focus_charter'], legEvidence(dualLegState(ctx, p), p));
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    const state = dualLegState(ctx, p);
    return check(state.hold, state.hold ? [] : ['dual_ts_momentum_not_both_positive'], legEvidence(state, p));
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const state = dualLegState(ctx, p);
    const matched = !state.hold;
    return check(matched, matched ? ['ts_momentum_leg_non_positive_or_incomputable'] : ['hold_dual_ts_momentum'], legEvidence(state, p));
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const exit = this.exit(ctx, p);
    const entry = exit.matched ? check(false, [], []) : this.entry(ctx, p);
    const stance: Stance = exit.matched ? 'BEARISH' : entry.matched ? 'BULLISH' : 'NEUTRAL';
    const active = exit.matched ? exit : entry;
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: p.longLookbackBars,
      rationaleEn: `${this.id}: ${stance}; single-name NVDA dual time-series momentum (252d skip-21 AND 63d), C1 AAOIFI-verified. Candidate simulation, not advice; single-name focus raises variance, not expected return.`,
      rationaleAr: `${this.id}: ${stanceAr}؛ زخم زمني مزدوج لسهم NVDA وحده (252 يوم مع تخطي 21 و63 يوم)، مفحوص وفق أيوفي عبر C1. محاكاة مرشحة وليست نصيحة؛ التركيز على سهم واحد يرفع التباين لا العائد المتوقع.`,
      evidence: active.evidence.length ? active.evidence : legEvidence(dualLegState(ctx, p), p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
