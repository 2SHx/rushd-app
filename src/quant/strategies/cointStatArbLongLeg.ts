// coint-statarb-long-leg — Engle–Granger cointegrated halal PAIRS, LONG the undervalued leg only.
// Classical statistical arbitrage (Engle–Granger 1987 two-step; Chan "Algorithmic Trading" ch.4),
// realised long-only because the SHORT leg is Sharia-vetoed and is NEVER traded (no shorting, no
// margin). We therefore capture only the mean-reversion of the CHEAP leg back to its fitted fair
// value α+β·partner — half of a classical pair, so realistic edge is MODEST; a large Sharpe here
// would be SUSPECT, not success.
//
// Engle–Granger two-step, re-run point-in-time at every bar (walk-forward re-formation — the
// formation window strictly precedes the trade decision, so there is no look-ahead in pair
// SELECTION or in the hedge ratio):
//   1. FORMATION (trailing `formationBars` aligned real closes ending at asOf): for the long-leg
//      candidate Y = ctx.symbol, scan every OTHER halal name X in the universe book, OLS-regress
//      Y = α + β·X, form residuals e = Y − α − β·X, and run an ADF-lite unit-root test on e. Keep
//      the partner with the most-negative ADF t-stat that also clears `adfThreshold` (cointegrated)
//      AND has β > `minBeta` (a long-only pair needs a POSITIVE fair-value combination). Iterate the
//      universe in sorted order; ties break by symbol → fully deterministic.
//   2. TRADE the spread z-score z = e_last / σ(e_formation):
//      • entry: z ≤ −`entryZ`  → Y sits below its fitted value ⇒ Y undervalued ⇒ go LONG Y.
//      • exit : z ≥ `exitZ` (reversion to the mean) OR the pair stops cointegrating OR
//               close ≤ entryPrice − `atrStopMult`·ATR OR held ≥ `maxHoldingDays`.
//
// The PARTNER series is reference data (like NASDAQ_HALAL_UNIVERSE): populated once from REAL daily
// bars via `configurePairBook` (the CLI's prepareUniverse hook) and read PIT-filtered to ≤ asOf on
// every call, so the decision stays a pure function of (ctx, book, params). No LLM, no DB, no
// randomness. Position sizing (full-cash long, clamped) is owned by the engine's risk envelope.
//
// ADF-lite: the simplest Dickey–Fuller regression on the OLS residuals (which are mean-zero by
// construction, so no drift/trend term): Δe_t = γ·e_{t−1} + u_t through the origin; the test
// statistic is t = γ̂/se(γ̂). Cointegration ⇒ reject the unit root ⇒ t ≤ threshold. We use the
// MacKinnon (1991) Engle–Granger residual-based 5% critical value for the 2-variable, no-trend
// case ≈ −3.34 (documented; no p-value surface is claimed beyond this reject/accept gate).
import { Prisma } from '@prisma/client';
import { z as zod } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { NASDAQ_HALAL_UNIVERSE } from './bollingerMrLong';
import type { StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput } from './types';

export { NASDAQ_HALAL_UNIVERSE };

const D = Prisma.Decimal;
const DAY_MS = 86_400_000;

export const CointStatArbLongLegParamsSchema = zod.object({
  version: zod.literal('v1'),
  formationBars: zod.number().int().positive(), // rolling formation window (aligned real closes)
  entryZ: zod.number().positive(), // enter LONG when spread z ≤ −entryZ (k=2 default, DECIDED)
  exitZ: zod.number(), // exit when z ≥ exitZ (reversion to fitted mean)
  adfThreshold: zod.number(), // require ADF t-stat ≤ this (EG 2-var 5% ≈ −3.34)
  minBeta: zod.number(), // require hedge ratio β > this (positive fair-value combo for long-only)
  maxHoldingDays: zod.number().int().positive(), // time stop
  atrPeriod: zod.number().int().positive(),
  atrStopMult: zod.number().positive(), // hard stop = entryPrice − mult·ATR
});
export type CointStatArbLongLegParams = zod.infer<typeof CointStatArbLongLegParamsSchema>;

/** v1 — DECIDED calibration (252d formation, k=2 entry, mean-reversion exit, EG-5% ADF gate). Reference; do not tune. */
export const COINT_STATARB_LONG_LEG_V1: CointStatArbLongLegParams = Object.freeze({
  version: 'v1',
  formationBars: 252,
  entryZ: 2,
  exitZ: 0,
  adfThreshold: -3.34,
  minBeta: 0,
  maxHoldingDays: 30,
  atrPeriod: 14,
  atrStopMult: 3,
});

function paramsOrDefault(params?: CointStatArbLongLegParams): CointStatArbLongLegParams {
  return CointStatArbLongLegParamsSchema.parse(params ?? COINT_STATARB_LONG_LEG_V1);
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

// ── Pure Engle–Granger math (exported for unit tests) ────────────────────────────────────────

/** Ordinary least squares Y = α + β·X. Returns null on degenerate (zero-variance) X. */
export function ols(x: number[], y: number[]): { alpha: number; beta: number } | null {
  const n = Math.min(x.length, y.length);
  if (n < 2) return null;
  const mx = meanN(x.slice(0, n));
  const my = meanN(y.slice(0, n));
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    sxx += dx * dx;
    sxy += dx * (y[i] - my);
  }
  if (sxx === 0) return null;
  const beta = sxy / sxx;
  return { alpha: my - beta * mx, beta };
}

/** OLS residuals e = Y − α − β·X. */
export function residuals(x: number[], y: number[], alpha: number, beta: number): number[] {
  const n = Math.min(x.length, y.length);
  const e: number[] = [];
  for (let i = 0; i < n; i++) e.push(y[i] - alpha - beta * x[i]);
  return e;
}

/**
 * ADF-lite unit-root t-statistic on a mean-zero series: Δe_t = γ·e_{t−1} + u_t (through the origin,
 * no lags/trend). t = γ̂/se(γ̂). A strongly stationary (mean-reverting) series ⇒ γ̂ ≈ −1 ⇒ large
 * negative t; a random walk ⇒ γ̂ ≈ 0 ⇒ t near 0. Null when there is not enough history.
 */
export function adfTStat(series: number[]): number | null {
  const n = series.length;
  if (n < 3) return null;
  let sxx = 0; // Σ e_{t-1}²
  let sxy = 0; // Σ e_{t-1}·Δe_t
  const xs: number[] = [];
  const ys: number[] = [];
  for (let t = 1; t < n; t++) {
    const xPrev = series[t - 1];
    const dy = series[t] - series[t - 1];
    xs.push(xPrev);
    ys.push(dy);
    sxx += xPrev * xPrev;
    sxy += xPrev * dy;
  }
  if (sxx === 0) return null;
  const gamma = sxy / sxx;
  const m = xs.length;
  if (m < 3) return null;
  let sse = 0;
  for (let i = 0; i < m; i++) {
    const u = ys[i] - gamma * xs[i];
    sse += u * u;
  }
  const s2 = sse / (m - 1); // 1 estimated parameter (through the origin)
  const se = Math.sqrt(s2 / sxx);
  if (!isFinite(se) || se === 0) return null;
  return gamma / se;
}

/** z-score of the LAST element of a series against the series' own mean/std. Null if too short. */
export function lastZScore(series: number[]): number | null {
  if (series.length < 2) return null;
  const sd = popStd(series);
  if (sd === 0) return null;
  return (series[series.length - 1] - meanN(series)) / sd;
}

export interface PairFit {
  partner: string;
  beta: number;
  alpha: number;
  adf: number;
  z: number;
  sigma: number;
}

/**
 * Fit one candidate pair over aligned formation closes (x=partner, y=long leg). Returns null unless
 * OLS is well-posed, β > minBeta, the ADF t-stat clears the threshold (cointegrated), and a z-score
 * is computable. Pure — the caller supplies already-PIT-aligned arrays.
 */
export function fitPair(
  x: number[],
  y: number[],
  partner: string,
  p: CointStatArbLongLegParams,
): PairFit | null {
  if (x.length < 3 || x.length !== y.length) return null;
  const fit = ols(x, y);
  if (!fit || fit.beta <= p.minBeta) return null;
  const e = residuals(x, y, fit.alpha, fit.beta);
  const adf = adfTStat(e);
  if (adf === null || adf > p.adfThreshold) return null;
  const z = lastZScore(e);
  if (z === null) return null;
  return { partner, beta: fit.beta, alpha: fit.alpha, adf, z, sigma: popStd(e) };
}

// ── Pair book (reference data; populated once from REAL bars, read PIT-filtered ≤ asOf) ────────

interface BookEntry {
  key: string; // trading-date key (YYYY-MM-DD)
  ts: number; // epoch ms
  close: number;
}
let PAIR_BOOK: Map<string, BookEntry[]> | null = null;

const dateKey = (ts: Date): string => ts.toISOString().slice(0, 10);

/**
 * Load the partner reference book from real daily closes (MOCK already excluded upstream). Called
 * once by the CLI's prepareUniverse hook before the per-symbol simulation loop. Frozen per symbol,
 * sorted ascending; every read below filters to ≤ asOf so nothing dated after the decision leaks.
 */
export function configurePairBook(closesBySymbol: Map<string, { ts: Date; close: number }[]>): void {
  const book = new Map<string, BookEntry[]>();
  for (const [symbol, series] of Array.from(closesBySymbol.entries())) {
    const entries = series
      .map((s: { ts: Date; close: number }) => ({ key: dateKey(s.ts), ts: s.ts.getTime(), close: s.close }))
      .sort((a: BookEntry, b: BookEntry) => a.ts - b.ts);
    book.set(symbol, entries);
  }
  PAIR_BOOK = book;
}

/** Test/hygiene helper — clears the book so a run without configuration degrades safely. */
export function resetPairBook(): void {
  PAIR_BOOK = null;
}

/** Partner closes ≤ asOf as a date→close map (PIT filter — the look-ahead guard for the book). */
function partnerSeriesAsOf(symbol: string, asOf: Date): Map<string, number> {
  const entries = PAIR_BOOK?.get(symbol);
  const out = new Map<string, number>();
  if (!entries) return out;
  const cutoff = asOf.getTime();
  for (const e of entries) {
    if (e.ts <= cutoff) out.set(e.key, e.close);
  }
  return out;
}

/** Long-leg closes ≤ asOf from ctx.bars (engine already guarantees ≤ asOf) as a date→close map. */
function longLegSeries(ctx: StrategyPointInTimeContext): Map<string, number> {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  const out = new Map<string, number>();
  for (const b of ctx.bars) out.set(dateKey(b.ts), Number(b.close));
  return out;
}

/** Last `formationBars` closes shared (by trading date) between two date→close maps, chronological. */
function alignTail(
  yMap: Map<string, number>,
  xMap: Map<string, number>,
  formationBars: number,
): { x: number[]; y: number[] } {
  const shared: string[] = [];
  for (const k of Array.from(yMap.keys())) if (xMap.has(k)) shared.push(k);
  shared.sort();
  const tail = shared.slice(-formationBars);
  return { x: tail.map((k) => xMap.get(k)!), y: tail.map((k) => yMap.get(k)!) };
}

/**
 * Select the best cointegrated partner for the long-leg symbol at asOf (PIT). Scans the halal
 * universe in sorted order and keeps the most-negative ADF t-stat that clears the gates. Pure given
 * (ctx, PAIR_BOOK, params). Returns null if the book is unset or no pair cointegrates.
 */
export function bestPairAsOf(
  ctx: StrategyPointInTimeContext,
  p: CointStatArbLongLegParams,
): PairFit | null {
  if (!PAIR_BOOK) return null;
  const yMap = longLegSeries(ctx);
  let best: PairFit | null = null;
  for (const partner of [...NASDAQ_HALAL_UNIVERSE].sort()) {
    if (partner === ctx.symbol) continue;
    const xMap = partnerSeriesAsOf(partner, ctx.asOf);
    if (xMap.size === 0) continue;
    const { x, y } = alignTail(yMap, xMap, p.formationBars);
    if (x.length < p.formationBars) continue; // demand a full formation window (no look-ahead, real bars only)
    const fit = fitPair(x, y, partner, p);
    if (fit && (best === null || fit.adf < best.adf)) best = fit;
  }
  return best;
}

/** ATR (simple mean true range) over the last `period` bars of ctx.bars. */
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

function pairEvidence(fit: PairFit, p: CointStatArbLongLegParams): Evidence[] {
  return [
    evidence('params_version', p.version),
    evidence('partner', fit.partner),
    evidence('beta', fit.beta.toFixed(4)),
    evidence('adf_tstat', fit.adf.toFixed(4)),
    evidence('spread_z', fit.z.toFixed(4)),
  ];
}

export const cointStatArbLongLegSetup: StrategySetup<CointStatArbLongLegParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'coint-statarb-long-leg',
  version: 'v1',
  cadence: 'daily',
  defaultParams: COINT_STATARB_LONG_LEG_V1,

  prepareUniverse(input: UniversePrepareInput) {
    configurePairBook(input.closesBySymbol);
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.bars.length < p.formationBars) {
      return check(false, ['insufficient_history'], [evidence('bars', ctx.bars.length)]);
    }
    if (!PAIR_BOOK) return check(false, ['pair_book_unconfigured'], []);
    const fit = bestPairAsOf(ctx, p);
    if (!fit) return check(false, ['no_cointegrated_partner'], [evidence('params_version', p.version)]);
    return check(true, [], pairEvidence(fit, p));
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return check(false, screened.reasons, screened.evidence);
    const fit = bestPairAsOf(ctx, p)!;
    const matched = fit.z <= -p.entryZ;
    return check(matched, matched ? [] : ['spread_not_undervalued'], pairEvidence(fit, p));
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const fit = bestPairAsOf(ctx, p);
    const reasons: string[] = [];
    const ev: Evidence[] = [];

    if (!fit) {
      // Pair stopped cointegrating (or book lost coverage): reversion thesis is void → exit.
      reasons.push('cointegration_broken');
    } else {
      ev.push(...pairEvidence(fit, p));
      if (fit.z >= p.exitZ) reasons.push('spread_reverted');
    }

    const close = ctx.bars.length ? Number(ctx.bars[ctx.bars.length - 1].close) : 0;
    if (ctx.entryPrice && ctx.entryPrice.gt(0)) {
      const stop = Number(ctx.entryPrice) - p.atrStopMult * atr(ctx, p.atrPeriod);
      if (close <= stop) reasons.push('atr_hard_stop');
    }
    if (ctx.entryTs) {
      const heldDays = (ctx.asOf.getTime() - ctx.entryTs.getTime()) / DAY_MS;
      if (heldDays >= p.maxHoldingDays) reasons.push('max_holding_days');
    }

    return check(reasons.length > 0, reasons.length ? reasons : ['hold'], ev);
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; long the undervalued leg of a cointegrated halal pair (short leg Sharia-vetoed, never traded).`,
      rationaleAr: `${this.id} ${p.version}: ${stance === 'BULLISH' ? 'شراء الطرف المقوّم بأقل من قيمته' : stance === 'BEARISH' ? 'خروج عند عودة الفرق للمتوسط' : 'انتظار'}؛ زوج متكامل حلال، الطرف القصير ممنوع شرعاً.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
