// halal-sector-capped-risk-parity-wide v1 — the LAST planned test in this session's in-universe
// reweighting/selection research line (current NASDAQ-only halal sleeve; TASI real data does not
// exist in this DB — 0 MarketBar rows, market='TASI', verified this session).
//
// WHY: `halal-sector-capped-risk-parity-core` (REJECTED, terminal, on `main`) proved the sector-cap
// mechanism itself is directionally correct — MC book-day p95 maxDD fell from the
// `halal-risk-parity-core` baseline's 45.90% to 44.95% (−0.95pp) and OOS DSR rose 0.898→0.900
// (+0.002) — but that isolated A/B deliberately used the SAME narrow 40-name sleeve as its baseline,
// which resolved to 17/40 (42.5%) Semiconductors. With that little real sector variety to
// redistribute into, the 30% cap had almost no room to buy genuine diversification: it could only
// push weight into Software/Tech Hardware/Health Care/Consumer Discretionary — sectors that still
// share meaningful systematic beta with Semiconductors in broad tech drawdowns (2022) — so the
// effect on both target metrics was real but tiny. This dispatch tests whether that specific
// diagnosis holds at real breadth: the SAME mechanism, UNCHANGED (`capSectorExposure` and
// `sectorCappedInverseVolatilityWeights`, both imported verbatim from
// `halalSectorCappedRiskParityCore.ts`, never reimplemented), over the QDR-8 ceiling of 100 names
// instead of 40 — close to half of every real symbol in this DB (228 distinct NASDAQ symbols total)
// and the maximum breadth this project's own token-economy rule allows without new data ingestion.
//
// A-PRIORI HYPOTHESIS (frozen before any run; PRE-REGISTRATION IS BINDING — no retune after seeing
// any result, including the 1Y diagnostic; a bad FULL number is reported REJECTED as measured):
// widening the sleeve from 40 to 100 names gives the 30%-sector-cap water-filling mechanism genuine
// sector alternatives to redistribute into (real breadth beyond Semiconductors/Software/Tech
// Hardware/Communication Services/Consumer Discretionary — e.g. Health Care, Industrials, Consumer
// Staples, Materials, Energy, Real Estate, Utilities all gain multiple additional real constituents
// at 100 names that were absent or nearly absent at 40), and therefore MEANINGFULLY improves on the
// narrow sibling's marginal (<1pp / <0.01) result — either pushing MC p95 maxDD materially below
// 44.95% and/or OOS DSR materially above 0.900, not just a repeat of the same tiny nudge. This is an
// EMPIRICAL bet, not a certainty: it is equally plausible the wider sleeve still resolves to a
// tech-dominated top-100-by-dollar-volume list (real dollar volume on NASDAQ skews mega-cap tech),
// in which case the cap again has little genuine diversification to buy and the effect stays small
// — or a wider, noisier per-name volatility estimate at 100 names could even worsen the tail versus
// the 40-name book, independent of the sector-cap question entirely. Either outcome is reported as
// measured, honestly, with the explicit delta vs BOTH `halal-risk-parity-core` (45.90%/0.898) and
// `halal-sector-capped-risk-parity-core` (44.95%/0.900) — that three-way comparison IS the result of
// this dispatch, and (per the dispatch brief) this is expected to be the last test in this specific
// research line regardless of which way it lands.
//
// A-PRIORI v1 SPEC (frozen before any run; changes require a new version, never a retune):
// - Universe: C1 Sharia-verified sleeve ONLY (`buildVerifiedUniverse` → `selectDollarVolumeSleeve`,
//   maxNames=100 — the QDR-8 documented ceiling, "verified halal universe top ~100 by dollar-
//   volume"). universeCompatibility = 'halal-only'. This is the ONLY structural change vs the narrow
//   sibling — every other dimension (252d lookback, 30% sector cap, 20% per-name cap, weighting
//   pipeline, breadth floor) is held IDENTICAL so any change in the terminal numbers is cleanly
//   attributable to breadth, never a confound from a different mechanism.
// - Cadence: monthly — one rebalance decision per calendar month-end trading date; the book holds
//   between month-ends (identical month-end architecture to all four siblings).
// - Weighting pipeline: IDENTICAL to `halal-sector-capped-risk-parity-core` — the imported, UNCHANGED
//   `sectorCappedInverseVolatilityWeights(volBySymbol, sectorBySymbol, sectorCap, perNameCap)`, which
//   internally (1) computes normalized inverse-vol weights (weight_i ∝ 1/σ_i, σ_i = lookbackDays=252
//   trailing daily-return sample stdev), (2) applies `capSectorExposure` (sector water-filling,
//   default cap 0.30), THEN (3) the per-name `capAndRedistribute` (20% cap). Neither function is
//   reimplemented or modified in this file — both are called exactly as the sibling calls them.
// - A name with < lookbackDays+1 trailing bars, or a non-finite/zero σ_i, is excluded from ranking
//   (never assigned a weight, never silently defaulted to zero-risk) — identical rule to the sibling.
// - Breadth floor: fewer than minRankable=15 rankable names at a given month-end ⇒ the WHOLE book
//   holds cash that month (identical to the sibling; with 100 names available this floor should
//   almost never bind — worth confirming/reporting, not assuming).
// - Sector classification: `SYMBOL_SECTOR` below is a NEW static, honestly-sourced GICS-style
//   reference table (real public company sector/industry-group data), built independently for THIS
//   file (never importing or editing the narrow sibling's private, unexported table) so it can cover
//   whichever real symbols the wider 100-name C1-verified sleeve resolves to. It carries forward the
//   sibling's documented 40-name coverage plus real GICS-style entries for the additional NASDAQ/
//   S&P-500-constituent names a top-100-by-dollar-volume resolution is expected to include (Health
//   Care equipment/tools/distributors, Industrials/logistics/building-products, IT services,
//   Consumer Staples food/household, Materials/packaging, one real Utilities name, one real Real
//   Estate services name). `configureUniverse` fails FAST (throws before any rebalance decision) if
//   the resolved sleeve contains a symbol missing from this table — this setup never silently
//   guesses a sector for an unclassified name; any gap the 1Y diagnostic surfaces is the authoritative
//   list to extend the table with, not a bug to route around.
// - Sector cap default 0.30, per-name cap 20% — unchanged from the sibling, frozen a-priori, not
//   tuned against any result.
// - Plateau robustness (QDR-6): 2 axes, frozen 3×3 grid (9 trials) — sectorCap ∈ {0.25,0.30,0.35} ×
//   lookbackDays ∈ {231,252,273}, center = {0.30, 252} — identical grid to the narrow sibling.
// AAOIFI: sleeve is C1 VERIFIED_COMPLIANT at run time (buildC1ShariaRunSnapshot). Execution remains
// paper/simulated only per standing RUSHD policy, independent of this card's terminal verdict.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import { dailyReturns } from '../portfolio/frontier';
import { capSectorExposure, sectorCappedInverseVolatilityWeights } from './halalSectorCappedRiskParityCore';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

/**
 * GICS-style sector/industry-group classification, real public company sector data, compiled
 * 2026-07-21. Carries forward `halalSectorCappedRiskParityCore`'s documented 40-name coverage
 * (reproduced here, not imported — that table is private/unexported by design, and this file must
 * stand alone with its OWN honestly-sourced table) plus real classifications for the additional
 * well-known NASDAQ/S&P-500-constituent names a top-100-by-dollar-volume C1-verified resolution is
 * expected to include. `configureUniverse` fails fast (never silently misclassifies) if a resolved
 * sleeve name is genuinely missing. Real, honestly-sourced static reference metadata — never
 * invented; industry-group-level buckets (Semiconductors / Software / Tech Hardware, all within GICS
 * "Information Technology") are used, matching the sibling's granularity, because a single coarse
 * "Information Technology" bucket would defeat the sector cap's purpose in this tech-heavy universe.
 */
const SECTOR_SYMBOLS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  Semiconductors: [
    'NVDA', 'AMD', 'MU', 'KLAC', 'LRCX', 'AMAT', 'MRVL', 'ON', 'MCHP', 'QCOM', 'TXN', 'ADI',
    'NXPI', 'SWKS', 'TER', 'COHR', 'LITE', 'SNDK', 'STX', 'AVGO', 'MPWR',
  ],
  Software: [
    'MSFT', 'ORCL', 'CRM', 'NOW', 'ADBE', 'INTU', 'PANW', 'CRWD', 'SNPS', 'CDNS', 'WDAY', 'FTNT', 'GDDY',
    // wide-sleeve additions (Software & Services GICS industry group — application/systems software,
    // IT consulting/services, internet services & infrastructure):
    'ACN', 'ADSK', 'AKAM', 'CTSH', 'FICO', 'IT', 'PTC', 'TYL', 'VRSN',
  ],
  'Tech Hardware': [
    'AAPL', 'CSCO', 'ANET', 'GLW', 'IBM', 'NTAP', 'FFIV', 'JBL', 'FLEX',
    // wide-sleeve additions (Technology Hardware & Equipment GICS industry group — communications
    // equipment, electronic equipment/instruments/components, technology distributors):
    'CDW', 'CIEN', 'FSLR', 'SMCI', 'TEL', 'TRMB', 'ZBRA',
  ],
  'Communication Services': [
    'GOOGL', 'GOOG', 'META', 'NFLX', 'CMCSA',
    'TTD', // The Trade Desk — Interactive Media & Services
  ],
  'Consumer Discretionary': [
    'AMZN', 'TSLA', 'HD', 'LOW', 'SBUX', 'BKNG', 'NKE', 'ORLY', 'AZO', 'ROST', 'TJX', 'EXPE',
    'ULTA', 'DASH', 'GRMN', 'DECK', 'LULU',
    // wide-sleeve additions:
    'DHI', 'EBAY', 'GPC', 'PHM', 'RL', 'TPR', 'TSCO', 'WSM',
  ],
  'Consumer Staples': [
    'COST', 'PG', 'PEP', 'CL', 'KMB', 'MDLZ', 'MNST', 'CHD', 'EL', 'HSY', 'KVUE', 'TGT', 'BBY',
    // wide-sleeve additions:
    'ADM', 'CLX', 'MKC',
  ],
  'Health Care': [
    'JNJ', 'LLY', 'ABBV', 'MRK', 'GILD', 'AMGN', 'ISRG', 'BSX', 'MDT', 'SYK', 'DXCM', 'IDXX',
    'BIIB', 'REGN', 'RVTY', 'PODD', 'TECH', 'CRL', 'EW', 'RMD', 'INCY',
    // wide-sleeve additions (Health Care Equipment & Supplies / Life Sciences Tools & Services /
    // Health Care Distributors / Providers / Biotechnology):
    'A', 'ABT', 'ALGN', 'BDX', 'CAH', 'COO', 'COR', 'DHR', 'GEHC', 'LH', 'MCK', 'MTD', 'STE',
    'TMO', 'VRTX', 'WAT', 'WST',
  ],
  Industrials: [
    'HON', 'CMI', 'EMR', 'ITW', 'PWR', 'JCI', 'CARR', 'OTIS', 'NSC', 'CSX', 'FAST', 'GWW', 'PNR',
    'DOV', 'AOS', 'ALLE', 'HUBB', 'ROK', 'IR', 'TT', 'GNRC', 'URI', 'WAB', 'RSG', 'WM', 'GEV', 'VRT',
    // wide-sleeve additions (Building Products / Commercial & Professional Services / Ground &
    // Air-Freight Transportation / Industrial Conglomerates / Machinery — real GICS Industrials
    // constituents, incl. UBER: reclassified from Consumer Discretionary to Industrials/Ground
    // Transportation under the 2023 GICS structure):
    'BLDR', 'CHRW', 'CPRT', 'CTAS', 'EFX', 'EXPD', 'JBHT', 'LII', 'MAS', 'MMM', 'NDSN', 'ODFL',
    'ROL', 'ROP', 'UBER', 'UNP', 'UPS', 'VLTO', 'XYL',
    'FIX', // Comfort Systems USA — Construction & Engineering (mechanical/electrical contracting)
  ],
  Energy: [
    'XOM', 'COP', 'SLB', 'HAL', 'DVN', 'EOG', 'FCX',
    'TPL', // Texas Pacific Land — Oil, Gas & Consumable Fuels (GICS-reclassified from Real Estate)
  ],
  Materials: [
    'LIN', 'APD', 'SHW', 'ECL', 'NUE', 'STLD', 'ALB', 'MLM', 'VMC', 'CRH', 'PPG', 'CF', 'DD', 'CTVA', 'WY',
    // wide-sleeve additions (Containers & Packaging / Metals & Mining):
    'AVY', 'NEM', 'PKG',
  ],
  'Real Estate': [
    'PLD', 'WELL', 'MAA', 'EQIX',
    'CSGP', // CoStar Group — Real Estate Services
  ],
  Utilities: [
    'CEG', // Constellation Energy — Electric Utilities
  ],
});

const SYMBOL_SECTOR: ReadonlyMap<string, string> = new Map(
  Object.entries(SECTOR_SYMBOLS).flatMap(([sector, symbols]) => symbols.map((symbol) => [symbol, sector] as const)),
);

export const HalalSectorCappedRiskParityWideParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackDays: z.number().int().positive(),
  minRankable: z.literal(15),
  perNameCap: z.number().positive().max(1),
  sectorCap: z.number().positive().max(1),
  maxNames: z.literal(100),
  validationTrials: z.literal(9),
});
export type HalalSectorCappedRiskParityWideParams = z.infer<typeof HalalSectorCappedRiskParityWideParamsSchema>;

export const HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1: HalalSectorCappedRiskParityWideParams = Object.freeze({
  version: 'v1',
  lookbackDays: 252,
  minRankable: 15,
  perNameCap: 0.20,
  sectorCap: 0.30,
  maxNames: 100,
  validationTrials: 9,
});

export function halalSectorCappedRiskParityWideBookPolicy(
  params?: HalalSectorCappedRiskParityWideParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: p.maxNames,
    decisionHistoryBars: p.lookbackDays + 5,
  };
}

// Compact per-symbol storage (Float64Array), matching all four siblings' convention.
interface CompactSeries {
  readonly ts: Float64Array;
  readonly close: Float64Array;
}

interface SectorCappedRiskParityWideState {
  readonly seriesBySymbol: ReadonlyMap<string, CompactSeries>;
  readonly monthEndTimes: ReadonlySet<number>;
  // Keyed by asOf AND every varying plateau param: a date-only key would leak the center run's
  // decisions into every plateau neighbor (same regression class all four siblings document).
  readonly decisionCache: Map<string, SectorCappedRiskParityWideDecision>;
}

interface SectorCappedRiskParityWideDecision {
  readonly reason: 'ranked' | 'not_month_end' | 'insufficient_breadth';
  readonly rankable: number;
  readonly weights: ReadonlyMap<string, number>; // symbol → final (sector-capped, name-capped) weight
}

let UNSCOPED_STATE: SectorCappedRiskParityWideState | null = null;
const SCOPED_STATES = new WeakMap<object, SectorCappedRiskParityWideState>();

function paramsOrDefault(
  params?: HalalSectorCappedRiskParityWideParams,
): HalalSectorCappedRiskParityWideParams {
  return HalalSectorCappedRiskParityWideParamsSchema.parse(params ?? HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
}

function monthOf(tsMs: number): number {
  const d = new Date(tsMs);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function configureUniverse(input: UniversePrepareInput): void {
  const daily = input.dailyBarsBySymbol;
  if (!daily || daily.size === 0) {
    throw new Error('halal-sector-capped-risk-parity-wide requires dailyBarsBySymbol for its resolved C1 sleeve');
  }
  const unclassified = Array.from(daily.keys()).filter((symbol) => !SYMBOL_SECTOR.has(symbol));
  if (unclassified.length > 0) {
    throw new Error(
      `halal-sector-capped-risk-parity-wide: no sector classification for ${unclassified.join(', ')} — `
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
  const state: SectorCappedRiskParityWideState = {
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

/** Sample (n−1) standard deviation — identical definition to all four siblings' private helper
 * (not exported by halalRiskParityCore, so reimplemented verbatim here). Returns 0 for < 2
 * observations (excluded upstream as degenerate). */
function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function wideDecision(
  asOf: Date,
  params: HalalSectorCappedRiskParityWideParams,
  replayScope?: object,
): SectorCappedRiskParityWideDecision {
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

  let result: SectorCappedRiskParityWideDecision;
  if (volBySymbol.size < params.minRankable) {
    result = { reason: 'insufficient_breadth', rankable: volBySymbol.size, weights: new Map() };
  } else {
    // Defensive-only: selectDollarVolumeSleeve already caps the resolved universe at maxNames=100
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
  decision: SectorCappedRiskParityWideDecision,
  params: HalalSectorCappedRiskParityWideParams,
): Evidence[] {
  const weight = decision.weights.get(symbol);
  return [
    evidence('params_version', params.version),
    evidence('universe_mode', 'c1_verified_dollar_volume_sleeve_wide'),
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

export const halalSectorCappedRiskParityWideSetup: StrategySetup<HalalSectorCappedRiskParityWideParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'halal-sector-capped-risk-parity-wide',
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'halal-only',
  defaultParams: HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1,

  prepareUniverse(input) { configureUniverse(input); },

  tradableBookSymbols(replayScope, paramSets) {
    const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
    if (!state) throw new Error('tradableBookSymbols requires prepareUniverse first');
    const union = new Set<string>();
    const monthEnds = Array.from(state.monthEndTimes).sort((a, b) => a - b);
    for (const raw of paramSets) {
      const p = paramsOrDefault(raw as HalalSectorCappedRiskParityWideParams);
      for (const t of monthEnds) {
        const decision = wideDecision(new Date(t), p, replayScope);
        decision.weights.forEach((_w, symbol) => union.add(symbol));
      }
    }
    return Array.from(union).sort();
  },

  plateauNeighborhood(params): PlateauNeighborhood<HalalSectorCappedRiskParityWideParams> {
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
      rationaleEn: `${this.id} ${p.version}: ${stance}; monthly inverse-volatility (risk-parity) weight, sector-capped at ${(p.sectorCap * 100).toFixed(0)}% then per-name-capped at ${(p.perNameCap * 100).toFixed(0)}%, over the C1-verified 100-name dollar-volume sleeve (breadth test vs the 40-name isolated A/B). No directional signal. Candidate, research-only.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ وزن شهري عكسي للتقلب (تكافؤ المخاطر)، بحد قطاعي أقصى ${(p.sectorCap * 100).toFixed(0)}% ثم حد أقصى ${(p.perNameCap * 100).toFixed(0)}% لكل اسم، عبر سلة المائة اسم المفحوصة C1 (اختبار الاتساع مقابل اختبار الأربعين اسمًا المعزول). لا إشارة اتجاهية. مرشح بحثي فقط.`,
      evidence: decisionEvidence(ctx.symbol, decision, p),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};

// Exported for tests: proves this file's classification covers the exact set of symbols the
// documented top-100-by-dollar-volume C1-verified sleeve resolution needs (no silent gaps).
export function isClassified(symbol: string): boolean {
  return SYMBOL_SECTOR.has(symbol);
}
