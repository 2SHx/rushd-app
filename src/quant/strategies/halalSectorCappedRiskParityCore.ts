// halal-sector-capped-risk-parity-core v1 — R7: an ISOLATED controlled test of ONE new variable (a
// sector-exposure cap) against the already-known `halal-risk-parity-core` v1 baseline (REJECTED,
// MC book-day p95 maxDD 45.90%, OOS DSR 0.898 — the best MC-tail result of any T2 setup so far).
// Every other dimension — universe (C1-verified top-40-by-dollar-volume sleeve), lookback (252d),
// per-name cap (20%), weighting base (weight_i ∝ 1/σ_i, inverse-vol risk parity) — is held IDENTICAL
// to that sibling on purpose, so any change in the terminal numbers is cleanly attributable to the
// sector cap alone, never a confound from a different universe size or a different weighting base.
//
// WHY: all three prior T2 mechanism tests this session (halal-markowitz-core, halal-risk-parity-core,
// halal-momentum-risk-parity-core) independently diagnosed the SAME root cause for the recurring
// DRAWDOWN_RISK_FAILURE — the C1-verified NASDAQ halal universe is dominated by correlated mega-cap
// tech/semiconductor names sharing common systematic beta, and no within-universe REWEIGHTING scheme
// (equal/mean-variance/inverse-vol/momentum-tilted) can diversify that away, because reweighting only
// changes HOW MUCH of each already-correlated name is held, never WHAT is held. Real TASI cross-market
// diversification does not exist in this DB (verified this session: 0 MarketBar rows, market='TASI').
// A sector-exposure CAP is the correct next lever precisely because it constrains WHAT can be held
// (forcing genuine sector spread within the existing NASDAQ-only universe) — a structurally different
// mechanism from all three prior reweighting-only tests, not a parameter retune of any of them.
//
// A-PRIORI HYPOTHESIS (frozen before any run; PRE-REGISTRATION IS BINDING — no retune after seeing
// any result, including the 1Y diagnostic; a bad FULL number is reported REJECTED as measured):
// capping any single sector at 30% of book weight (water-filling redistribution to other sectors)
// reduces MC book-day p95 maxDD below halal-risk-parity-core's 45.90% AND/OR lifts OOS DSR above its
// 0.898, because it forces the book off its uncapped concentration in Semiconductors/Software/Tech
// Hardware into genuinely less-correlated sectors (Health Care, Consumer Staples, Industrials,
// Energy, Materials, Real Estate) that historically have LOWER pairwise correlation to the tech
// cluster's systematic drawdowns (e.g. 2022). This is an EMPIRICAL bet, not a certainty: it is
// equally plausible the cap merely forces the book into thinly-represented sectors within this
// tech-heavy universe without buying real diversification, or degrades risk-adjusted return enough
// to worsen DSR even if drawdown improves. Either outcome is reported as measured, honestly, with the
// explicit delta vs the sibling's 45.90%/0.898 — that comparison IS the result of this dispatch.
//
// A-PRIORI v1 SPEC (frozen before any run; changes require a new version, never a retune):
// - Universe: C1 Sharia-verified sleeve ONLY (`buildVerifiedUniverse` → `selectDollarVolumeSleeve`,
//   maxNames=40 — MUST match halal-risk-parity-core exactly; this is what makes the A/B clean, not a
//   new universe size). universeCompatibility = 'halal-only'.
// - Cadence: monthly — one rebalance decision per calendar month-end trading date; the book holds
//   between month-ends (identical month-end architecture to all three T2 siblings).
// - Weighting pipeline (the ONLY new element vs halal-risk-parity-core):
//   (1) compute normalized inverse-vol weights (weight_i ∝ 1/σ_i, σ_i = lookbackDays=252 trailing
//       daily-return sample stdev) via the imported, UNCHANGED `inverseVolatilityWeights` — called
//       with cap=1 so it returns the raw normalized weights uncapped at the per-name step;
//   (2) apply the NEW `capSectorExposure` (this file, pure function) BEFORE the per-name cap: group
//       weights by sector via the static `SYMBOL_SECTOR` table below; any sector whose SUMMED weight
//       exceeds `sectorCap` (default 0.30) is scaled down to exactly `sectorCap`, and the freed weight
//       is redistributed proportionally across all OTHER (still-uncapped) names' current weight share,
//       iterating to a fixed point (mirrors `capAndRedistribute`'s per-name water-filling algorithm,
//       lines 185-218 of halalRiskParityCore.ts, applied at the sector-aggregate level);
//   (3) THEN apply the existing, UNCHANGED `capAndRedistribute` (imported, 20% per-name cap) on the
//       sector-capped weights — order matters: sector cap first, then name cap, never the reverse.
// - A name with < lookbackDays+1 trailing bars, or a non-finite/zero σ_i, is excluded from ranking
//   (never assigned a weight, never silently defaulted to zero-risk) — identical rule to the sibling.
// - Breadth floor: fewer than minRankable=15 rankable names at a given month-end ⇒ the WHOLE book
//   holds cash that month (identical to the sibling).
// - Sector classification: `SYMBOL_SECTOR` below is a static, honestly-sourced GICS-style reference
//   table (real public company sector data, compiled 2026-07-20) covering every symbol the C1-verified
//   40-name sleeve is expected to resolve to (the same/near-identical top-40-by-dollar-volume names
//   documented for the `halal-risk-parity-core`/`halal-markowitz-core` siblings' FULL runs, plus a
//   generous buffer of other well-known NASDAQ/S&P-500-constituent names). It is real-world static
//   reference metadata, never fabricated market data. `configureUniverse` fails FAST (throws before
//   any rebalance decision) if the resolved sleeve contains a symbol missing from this table — this
//   setup never silently guesses a sector for an unclassified name.
// - Sector cap default 0.30 — a common practical concentration-limit convention, frozen a-priori, not
//   tuned against any result.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — sectorCap ∈ {0.25,0.30,0.35} ×
//   lookbackDays ∈ {231,252,273}, center = {0.30, 252}. perNameCap stays FIXED at 0.20 (already
//   validated by all three T2 siblings) rather than re-sweeping it.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot). Execution remains
// paper/simulated only per standing RUSHD policy, independent of this card's terminal verdict.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import { capAndRedistribute, inverseVolatilityWeights } from './halalRiskParityCore';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

/**
 * GICS-style sector classification, public company sector data, compiled 2026-07-20. Covers the
 * documented C1-verified top-40-by-dollar-volume halal sleeve (per halal-risk-parity-core's and
 * halal-markowitz-core's FULL-run cards) plus a generous buffer of other well-known NASDAQ/S&P-500-
 * constituent names, so `configureUniverse` can fail fast (never silently misclassify) if a resolved
 * sleeve name is genuinely missing. Real, honestly-sourced static reference metadata — never invented.
 */
const SECTOR_SYMBOLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Semiconductors: [
    'NVDA', 'AMD', 'MU', 'KLAC', 'LRCX', 'AMAT', 'MRVL', 'ON', 'MCHP', 'QCOM', 'TXN', 'ADI',
    'NXPI', 'SWKS', 'TER', 'COHR', 'LITE', 'SNDK', 'STX', 'AVGO', 'MPWR',
  ],
  Software: [
    'MSFT', 'ORCL', 'CRM', 'NOW', 'ADBE', 'INTU', 'PANW', 'CRWD', 'SNPS', 'CDNS', 'WDAY', 'FTNT', 'GDDY',
  ],
  'Tech Hardware': ['AAPL', 'CSCO', 'ANET', 'GLW', 'IBM', 'NTAP', 'FFIV', 'JBL', 'FLEX'],
  'Communication Services': ['GOOGL', 'GOOG', 'META', 'NFLX', 'CMCSA'],
  'Consumer Discretionary': [
    'AMZN', 'TSLA', 'HD', 'LOW', 'SBUX', 'BKNG', 'NKE', 'ORLY', 'AZO', 'ROST', 'TJX', 'EXPE',
    'ULTA', 'DASH', 'GRMN', 'DECK', 'LULU',
  ],
  'Consumer Staples': ['COST', 'PG', 'PEP', 'CL', 'KMB', 'MDLZ', 'MNST', 'CHD', 'EL', 'HSY', 'KVUE', 'TGT', 'BBY'],
  'Health Care': [
    'JNJ', 'LLY', 'ABBV', 'MRK', 'GILD', 'AMGN', 'ISRG', 'BSX', 'MDT', 'SYK', 'DXCM', 'IDXX',
    'BIIB', 'REGN', 'RVTY', 'PODD', 'TECH', 'CRL', 'EW', 'RMD', 'INCY',
  ],
  Industrials: [
    'HON', 'CMI', 'EMR', 'ITW', 'PWR', 'JCI', 'CARR', 'OTIS', 'NSC', 'CSX', 'FAST', 'GWW', 'PNR',
    'DOV', 'AOS', 'ALLE', 'HUBB', 'ROK', 'IR', 'TT', 'GNRC', 'URI', 'WAB', 'RSG', 'WM', 'GEV', 'VRT',
  ],
  Energy: ['XOM', 'COP', 'SLB', 'HAL', 'DVN', 'EOG', 'FCX'],
  Materials: ['LIN', 'APD', 'SHW', 'ECL', 'NUE', 'STLD', 'ALB', 'MLM', 'VMC', 'CRH', 'PPG', 'CF', 'DD', 'CTVA', 'WY'],
  'Real Estate': ['PLD', 'WELL', 'MAA', 'EQIX'],
});

/** Exported for correlation-aware sleeve selection (decorrelatedSleeve); classification unchanged. */
export const SYMBOL_SECTOR: ReadonlyMap<string, string> = new Map(
  Object.entries(SECTOR_SYMBOLS).flatMap(([sector, symbols]) => symbols.map((symbol) => [symbol, sector] as const)),
);

export const HalalSectorCappedRiskParityCoreParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  minRankable: z.literal(15),
  perNameCap: z.number().positive().max(1),
  sectorCap: z.number().positive().max(1),
  maxNames: z.literal(40),
  validationTrials: z.literal(9),
});
export type HalalSectorCappedRiskParityCoreParams = z.infer<typeof HalalSectorCappedRiskParityCoreParamsSchema>;

export const HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1: HalalSectorCappedRiskParityCoreParams = Object.freeze({
  version: 'v1',
  lookbackDays: 252,
  minRankable: 15,
  perNameCap: 0.20,
  sectorCap: 0.30,
  maxNames: 40,
  validationTrials: 9,
});

export function halalSectorCappedRiskParityCoreBookPolicy(
  params?: HalalSectorCappedRiskParityCoreParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching both siblings' convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface SectorCappedRiskParityState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly monthEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class both siblings document).
  readonly decisionCache: Map<string, SectorCappedRiskParityDecision>;
}

interface SectorCappedRiskParityDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'insufficient_breadth';
  readonly rankable: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (sector-capped, name-capped) weight
}

let UNSCOPED_STATE: SectorCappedRiskParityState | null = null;
const SCOPED_STATES = new WeakMap<object, SectorCappedRiskParityState>();

function paramsOrDefault(
  params?: HalalSectorCappedRiskParityCoreParams,
): HalalSectorCappedRiskParityCoreParams {
  return HalalSectorCappedRiskParityCoreParamsSchema.parse(params ?? HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
}

function monthOf(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  if (!daily || daily.size === 0) {
    throw new Error('halal-sector-capped-risk-parity-core requires dailyBarsBySymbol for its resolved C1 sleeve');
  }
  const unclassified = Array.from(daily.keys()).filter((symbol) => !SYMBOL_SECTOR.has(symbol));
  if (unclassified.length > 0) {
    throw new Error(
      `halal-sector-capped-risk-parity-core: no sector classification for ${unclassified.join(', ')} — `
      + 'add real, honestly-sourced GICS-style entries to SYMBOL_SECTOR before running (never guess).',
    );
  }
  const seriesBySymbol = new Map<string, CompactSeries>();
  const monthEnds = new Map<number, number>(); // month index → max ts
  for (const [symbol, rows] of Array.from(daily.entries())) {
    const ts = new Float64Array(rows.length);
    const close = new Float64Array(rows.length);
    let previous = Number.NEGATIVE_INFINITY;
    rows.forEach((row: { ts: Date; close: number }, i: number) => {
      const time = row.ts.getTime();
      if (!Number.isFinite(time) || time <= previous || !Number.isFinite(row.close) || row.close <= 0) {
        throw new Error(`invalid chronological daily history for ${symbol}`);
      }
      previous = time;
      ts[i] = time;
      close[i] = row.close;
      const m = monthOf(time);
      monthEnds.set(m, Math.max(monthEnds.get(m) ?? Number.NEGATIVE_INFINITY, time));
    });
    seriesBySymbol.set(symbol, { ts, close });
  }
  const state: SectorCappedRiskParityState = {
    seriesBySymbol,
    monthEndTimes: new Set(monthEnds.values()),
    decisionCache: new Map(),
  };
  if (input.replayScope) SCOPED_STATES.set(input.replayScope, state);
  else UNSCOPED_STATE = state;
}

/** Index of the bar whose ts === target, or -1. Binary search over epoch-ms. */
function indexOf(series: CompactSeries, targetMs: number): number {
  let lo = 0;
  let hi = series.ts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.ts[mid] === targetMs) return mid;
    if (series.ts[mid] < targetMs) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

/** Sample (n−1) standard deviation — identical definition to both siblings' private helper
 * (not exported by halalRiskParityCore, so reimplemented verbatim here). Returns 0 for < 2
 * observations (excluded upstream as degenerate). */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Sector-exposure water-filling: any sector whose SUMMED weight exceeds `sectorCap` is scaled down
 * (proportionally, within-sector) to exactly `sectorCap`, and the freed weight is redistributed
 * proportionally across all still-uncapped names' current weight share — mirroring
 * `capAndRedistribute`'s per-name water-filling algorithm (halalRiskParityCore.ts:185-218) applied
 * at the sector-aggregate level instead of the per-name level. Iterates to a fixed point (a newly-
 * inflated sector can itself need capping on a later pass). Preserves the total sum unless capacity
 * is exhausted (every sector pins at `sectorCap` before the sum reaches 1), in which case the
 * residual excess is left undistributed — the book then holds partial cash, exactly like
 * `capAndRedistribute`'s own capacity-exhausted behavior. Pure, deterministic, no randomness.
 * Throws if any input symbol has no `sectorBySymbol` entry (never silently misclassifies).
 */
export function capSectorExposure(
  weightsBySymbol: ReadonlyMap<string, number>,
  sectorBySymbol: ReadonlyMap<string, string>,
  sectorCap: number,
): Map<string, number> {
  if (!(sectorCap > 0) || sectorCap > 1) throw new Error('sectorCap must be in (0, 1]');
  let remaining = new Map(weightsBySymbol);
  const capped = new Map<string, number>();
  const totalSectors = new Set(Array.from(weightsBySymbol.keys()).map((symbol) => {
    const sector = sectorBySymbol.get(symbol);
    if (sector === undefined) throw new Error(`capSectorExposure: no sector classification for ${symbol}`);
    return sector;
  })).size;
  const maxIterations = totalSectors + 2; // at least one sector is capped per pass that changes anything
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const sectorSums = new Map<string, number>();
    const sectorGroups = new Map<string, string[]>();
    for (const [symbol, w] of Array.from(remaining.entries())) {
      const sector = sectorBySymbol.get(symbol)!; // validated above; every remaining symbol is classified
      sectorSums.set(sector, (sectorSums.get(sector) ?? 0) + w);
      const group = sectorGroups.get(sector);
      if (group) group.push(symbol);
      else sectorGroups.set(sector, [symbol]);
    }
    let excess = 0;
    let changed = false;
    for (const [sector, sum] of Array.from(sectorSums.entries())) {
      if (sum > sectorCap + 1e-12) {
        const scale = sectorCap / sum;
        excess += sum - sectorCap;
        for (const symbol of sectorGroups.get(sector)!) {
          capped.set(symbol, (remaining.get(symbol) ?? 0) * scale);
          remaining.delete(symbol);
        }
        changed = true;
      }
    }
    if (!changed) break;
    if (remaining.size === 0) break; // capacity exhausted; residual excess dropped, book under-invests
    const remainingSum = Array.from(remaining.values()).reduce((a, b) => a + b, 0);
    if (!(remainingSum > 0)) break;
    for (const [symbol, w] of Array.from(remaining.entries())) remaining.set(symbol, w + (w / remainingSum) * excess);
  }
  for (const [symbol, w] of Array.from(remaining.entries())) capped.set(symbol, w);
  // Defensive floating-point safety margin, mirroring capAndRedistribute's own final clamp.
  const total = Array.from(capped.values()).reduce((a, b) => a + b, 0);
  if (total > 1) {
    const scale = 1 / total;
    for (const [symbol, w] of Array.from(capped.entries())) capped.set(symbol, w * scale);
  }
  return capped;
}

/**
 * The full weighting pipeline: (1) raw normalized inverse-vol weights (imported, UNCHANGED,
 * called with cap=1 so no per-name capping happens yet), (2) NEW sector-exposure cap, (3) THEN the
 * imported, UNCHANGED per-name `capAndRedistribute`. Order matters: sector cap first, name cap
 * second. With `sectorCap=1` step (2) is a structural no-op (no sector can ever exceed a cap of 1
 * when the total normalized sum is 1), so the pipeline degrades EXACTLY to
 * `inverseVolatilityWeights(volBySymbol, perNameCap)` — the strong correctness check this file's
 * test suite exercises directly.
 */
export function sectorCappedInverseVolatilityWeights(
  volBySymbol: ReadonlyMap<string, number>,
  sectorBySymbol: ReadonlyMap<string, string>,
  sectorCap: number,
  perNameCap: number,
): Map<string, number> {
  const uncapped = inverseVolatilityWeights(volBySymbol, 1);
  const sectorCapped = capSectorExposure(uncapped, sectorBySymbol, sectorCap);
  return capAndRedistribute(sectorCapped, perNameCap);
}

function wideDecision(
  asOf: Date,
  params: HalalSectorCappedRiskParityCoreParams,
  replayScope?: object,
): SectorCappedRiskParityDecision {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) return { reason: 'insufficient_breadth', rankable: 0, weights: new Map() };
  const asOfMs = asOf.getTime();
  if (!state.monthEndTimes.has(asOfMs)) return { reason: 'not_month_end', rankable: 0, weights: new Map() };
  const cacheKey = `${asOfMs}|${params.lookbackDays}|${params.perNameCap}|${params.sectorCap}`;
  const cached = state.decisionCache.get(cacheKey);
  if (cached) return cached;

  const volBySymbol = new Map<string, number>();
  for (const [symbol, series] of Array.from(state.seriesBySymbol.entries())) {
    const i = indexOf(series, asOfMs);
    if (i < params.lookbackDays) continue; // no bar at asOf, or insufficient trailing history
    const closes: number[] = [];
    for (let k = i - params.lookbackDays; k <= i; k++) closes.push(series.close[k]);
    let returns: number[];
    try {
      returns = dailyReturns(closes);
    } catch {
      continue; // defensive: malformed close series excluded, never crashes the book
    }
    const sigma = stdev(returns);
    if (!(sigma > 0) || !Number.isFinite(sigma)) continue; // degenerate/zero-variance names excluded
    volBySymbol.set(symbol, sigma);
  }

  let result: SectorCappedRiskParityDecision;
  if (volBySymbol.size < params.minRankable) {
    result = { reason: 'insufficient_breadth', rankable: volBySymbol.size, weights: new Map() };
  } else {
    // Defensive-only: selectDollarVolumeSleeve already caps the resolved universe at maxNames=40
    // upstream, so this never triggers in a real CLI run. Deterministic alphabetical truncation only.
    const eligible = volBySymbol.size > params.maxNames
      ? new Map(Array.from(volBySymbol.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(0, params.maxNames))
      : volBySymbol;
    const weights = sectorCappedInverseVolatilityWeights(eligible, SYMBOL_SECTOR, params.sectorCap, params.perNameCap);
    result = { reason: 'ranked', rankable: volBySymbol.size, weights };
  }
  state.decisionCache.set(cacheKey, result);
  return result;
}

function evidence(ref: string, value: number | string): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

function decisionEvidence(
  symbol: string,
  decision: SectorCappedRiskParityDecision,
  params: HalalSectorCappedRiskParityCoreParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve'),
    evidence('weighting_mechanism', 'sector_capped_inverse_volatility_risk_parity'),
    evidence('lookback_days', params.lookbackDays),
    evidence('per_name_cap', params.perNameCap),
    evidence('sector_cap', params.sectorCap),
    evidence('sector', SYMBOL_SECTOR.get(symbol) ?? 'unclassified'),
    evidence('rankable_names', decision.rankable),
    evidence('target_weight', weight !== undefined ? weight.toFixed(8) : '0'),
    evidence('aaoifi_status', 'c1_verified_compliant_sleeve'),
  ];
}

export const halalSectorCappedRiskParityCoreSetup: StrategySetup<HalalSectorCappedRiskParityCoreParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-sector-capped-risk-parity-core',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const monthEnds = Array.from(state.monthEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalSectorCappedRiskParityCoreParams);
      for (const t of monthEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalSectorCappedRiskParityCoreParams> {
    const center = paramsOrDefault(params);
    const neighbors = [231, 252, 273].flatMap((lookbackDays) =>
      [0.25, 0.30, 0.35].flatMap((sectorCap) => (
        lookbackDays === center.lookbackDays && sectorCap === center.sectorCap
          ? []
          : [{
            label: `lookbackDays=${lookbackDays}|sectorCap=${sectorCap}`,
            params: { ...center, lookbackDays, sectorCap },
          }]
      )),
    );
    return { axes: ['lookbackDays', 'sectorCap'], center, neighbors };
  },

  targetWeight(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return 0;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return null;
    return decision.weights.get(ctx.symbol) ?? 0;
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    return check(
      decision.reason === 'ranked',
      decision.reason === 'ranked' ? [] : [decision.reason],
      decisionEvidence(ctx.symbol, decision, p),
    );
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const matched = decision.weights.has(ctx.symbol);
    return check(matched, matched ? [] : ['zero_weight_this_month'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    if (decision.reason === 'not_month_end') return check(false, ['hold_between_month_ends'], []);
    const matched = !decision.weights.has(ctx.symbol);
    return check(
      matched,
      matched ? [decision.reason === 'ranked' ? 'zero_weight_this_month' : decision.reason] : ['retain_weighted_name'],
      decisionEvidence(ctx.symbol, decision, p),
    );
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const target = this.targetWeight!(ctx, p);
    const decision = wideDecision(ctx.asOf, p, ctx.replayScope);
    const stance: Stance = target !== null && target > 0
      ? 'BULLISH'
      : target === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 21,
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly inverse-volatility (risk-parity) weight, sector-capped at ${(p.sectorCap * 100).toFixed(0)}% then per-name-capped at ${(p.perNameCap * 100).toFixed(0)}%, over the C1-verified 40-name dollar-volume sleeve. Isolated A/B vs halal-risk-parity-core — no directional signal. Candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ وزن شهري عكسي للتقلب (تكافؤ المخاطر)، بحد قطاعي أقصى ${(p.sectorCap * 100).toFixed(0)}% ثم حد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم، عبر سلة الأربعين اسمًا المفحوصة C1. اختبار معزول مقابل halal-risk-parity-core — لا إشارة اتجاهية. مرشح بحثي فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
