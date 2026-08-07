// Seal-time gate feasibility + power arithmetic for preregistered experiments (skill:
// backtesting-rigor). A preregistration is worthless if NO outcome inside its own plausibility
// fence can clear its own DSR gate: such an experiment is guaranteed REJECTED before a single bar
// is observed, and burns a real forward window to learn nothing. These are pure closed-form
// functions over the SAME deflated-Sharpe algebra that metrics.ts implements numerically.
//
// Statistics boundary: everything here is a plain number (Sharpe ratios, probabilities), never
// Prisma.Decimal money.
//
// NOTE ON THE DUPLICATED PROBIT/CDF HELPERS BELOW: metrics.ts keeps `erf`, `normalCDF` and
// `inverseNormalCDF` module-private, and metrics.ts is frozen (no gate-threshold or DSR-function
// churn is permitted). They are mirrored here byte-for-byte in algorithm so the closed form and the
// shipped numeric implementation cannot silently diverge; `gatePower.test.ts` pins them against the
// real `computeMetrics` output (agreement within 0.01 DSR) as the anchor test. If metrics.ts ever
// exports them, delete these copies and import instead.

import { volatilityBandFeasible } from './betaCriteria';
import { minimumDailyObservationsForVolReduction } from './diversificationCriteria';

/** Euler-Mascheroni gamma — identical constant to the one metrics.ts uses inside deflatedSharpe. */
export const EULER_MASCHERONI = 0.5772156649015329;

// Abramowitz & Stegun 7.1.26 erf approximation (max error ~1.5e-7). Mirrors metrics.ts.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

/** Standard normal CDF. Mirrors metrics.ts. */
export const normalCDF = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

/** Peter Acklam's probit approximation. Mirrors metrics.ts. */
export function inverseNormalCDF(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * Expected-maximum-Sharpe multiple-testing offset in units of sqrt(Var[SR]):
 *   C(N) = (1-gamma)*Z^-1(1 - 1/N) + gamma*Z^-1(1 - 1/(N*e)),  C(N<=1) = 0.
 * This is exactly the bracket metrics.ts multiplies by sqrt(Var[SR]) to build SR0.
 */
export function expectedMaxSharpeOffset(trials: number): number {
  if (!Number.isFinite(trials) || trials <= 1) return 0;
  return (1 - EULER_MASCHERONI) * inverseNormalCDF(1 - 1 / trials)
    + EULER_MASCHERONI * inverseNormalCDF(1 - 1 / (trials * Math.E));
}

export interface DsrPoint {
  /** Annualized Sharpe being evaluated. */
  readonly annualSharpe: number;
  /** Number of non-overlapping return OBSERVATIONS (n), not sessions. */
  readonly observations: number;
  /** Observations per calendar year for the frozen inference unit (e.g. 252/5 = 50.4). */
  readonly observationsPerYear: number;
  /** Terminal DSR trial count N actually applied at verdict time. */
  readonly trials: number;
}

function assertDsrPoint(point: DsrPoint): void {
  if (!Number.isFinite(point.annualSharpe)) throw new Error('annualSharpe must be finite');
  if (!Number.isInteger(point.observations) || point.observations < 2) {
    throw new Error('observations must be an integer >= 2');
  }
  if (!Number.isFinite(point.observationsPerYear) || point.observationsPerYear <= 0) {
    throw new Error('observationsPerYear must be a positive number');
  }
  if (!Number.isInteger(point.trials) || point.trials < 1) {
    throw new Error('trials must be an integer >= 1');
  }
}

/**
 * Closed-form Deflated Sharpe attained by a GAUSSIAN return series with the given annualized
 * Sharpe, sample size and trial count:
 *
 *   SRp = annualSharpe / sqrt(observationsPerYear)
 *   DSR = Phi( SRp*sqrt(n-1)/sqrt(1 + SRp^2/2) - C(N) )
 *
 * The sqrt(1 + SRp^2/2) denominator is metrics.ts's PSR denominator evaluated at the Gaussian
 * reference moments (skew 0, kurtosis 3). Real returns are skewed and fat-tailed, which shifts this
 * term modestly in either direction (negative skew / excess kurtosis LOWER the attainable DSR), so
 * every result here is a NECESSARY, not sufficient, feasibility condition: an acceptance set this
 * function calls empty is certainly empty; one it calls non-empty may still be unreachable in
 * practice.
 */
export function attainableDsr(point: DsrPoint): number {
  assertDsrPoint(point);
  const srPeriod = point.annualSharpe / Math.sqrt(point.observationsPerYear);
  const denom = Math.sqrt(1 + (srPeriod * srPeriod) / 2);
  const z = (srPeriod * Math.sqrt(point.observations - 1)) / denom - expectedMaxSharpeOffset(point.trials);
  return normalCDF(z);
}

/**
 * Smallest observation count n whose attainable DSR strictly exceeds `requiredDsr` at the given
 * annualized Sharpe and trial count. Returns null when no finite n clears the gate (the DSR z-score
 * grows like sqrt(n), so this only happens for a non-positive Sharpe or a degenerate gate).
 */
export function minimumObservationsForDsr(
  point: Omit<DsrPoint, 'observations'>,
  requiredDsr: number,
  searchCeiling = 1_000_000,
): number | null {
  if (!Number.isFinite(requiredDsr) || requiredDsr <= 0 || requiredDsr >= 1) {
    throw new Error('requiredDsr must be inside (0,1)');
  }
  const srPeriod = point.annualSharpe / Math.sqrt(point.observationsPerYear);
  if (!(srPeriod > 0)) return null;
  const denom = Math.sqrt(1 + (srPeriod * srPeriod) / 2);
  const needed = inverseNormalCDF(requiredDsr) + expectedMaxSharpeOffset(point.trials);
  // z(n) > needed  <=>  n > 1 + (needed*denom/SRp)^2 ; solve then step up for float safety.
  const solved = 1 + ((needed * denom) / srPeriod) ** 2;
  let n = Math.max(2, Math.ceil(solved));
  while (n <= searchCeiling && !(attainableDsr({ ...point, observations: n }) > requiredDsr)) n += 1;
  return n <= searchCeiling ? n : null;
}

/** QDR-10 product class. ABSENT ⇒ 'ALPHA' — fail-closed to the strictest gate. */
/**
 * QDR-11: DIVERSIFICATION is NOT a third class competing with ALPHA and BETA on returns. ALPHA and
 * BETA each adjudicate a claim a book makes to a USER and terminate in AUTO_PAPER admission;
 * DIVERSIFICATION adjudicates a claim about BOOK STRUCTURE and terminates in permission to use the
 * RULE — no capital, no allocation, no QDR-7 tournament entry, no AUTO_PAPER book.
 */
export type ProductClass = 'ALPHA' | 'BETA' | 'DIVERSIFICATION';

/**
 * The QDR-6 Monte Carlo p95 max-drawdown breaker, for SEAL-TIME disclosure arithmetic only. The
 * terminal test still reads the run's own `drawdownBreakerPct` in `assembleReportCard` — this
 * constant never enters that path and changes no gate. It exists so a DIVERSIFICATION seal can say
 * out loud that its declared drawdown is predicted to fail, which QDR-11 requires it to.
 */
export const MONTE_CARLO_P95_DRAWDOWN_BREAKER = 0.30;

/**
 * QDR-10 2026-08-06b. The old 156-observation floor rested on the withdrawn (c1) convexity
 * criterion, whose calibration came from a benchmark-drift unit error; it is VOID. The BETA power
 * assertion now sits on criterion (a), whose CORRECTED false-alarm rates are 1.5% at n=52 and 0.2%
 * at n=104 — so 104 is the floor, precisely because it leaves each contiguous half at n=52.
 */
export const BETA_MIN_OBSERVATIONS = 104;
/** Criterion (a) specificity target, on the full window AND on each contiguous half. */
export const BETA_MAX_VOLATILITY_FALSE_ALARM = 0.05;
/**
 * The model-free sanity check that caught the original error: a benchmark model whose non-overlapping
 * blocks fall fewer than ~42% of the time is not any real equity index. Every calibrating simulation
 * must publish this fraction, and a value outside the band is a refusal at seal.
 */
export const BETA_NEGATIVE_BLOCK_FRACTION_BAND: readonly [number, number] = [0.42, 0.45];

/** Standard errors of slack allowed around the long-run band. Decisive, not brittle. */
export const BETA_NEGATIVE_BLOCK_TOLERANCE_SIGMA = 3;

/**
 * The 42-45% reference is a LONG-RUN figure, but any real benchmark sample is finite and its
 * negative-block fraction carries sampling error. Measured against real persisted SPUS bars
 * (1,200 daily closes, 2021-10-05..2026-07-17 => 239 non-overlapping five-session blocks) the
 * realized fraction is 40.2% — outside the raw band, yet only 0.87 SE from 43%, because one SE at
 * n=239 is 3.20pp and the raw band is just 3pp WIDE. Gating on the raw band would refuse the real
 * index the lane benchmarks against, which is the same class of error as the drift bug it exists to
 * catch: a threshold set without allowing for estimation noise.
 *
 * So the band is widened by `BETA_NEGATIVE_BLOCK_TOLERANCE_SIGMA` standard errors at the lane's own
 * observation count. The guard keeps essentially all of its power — the drift bug's 8.8% sits 10.7
 * SE from the reference and stays decisively refused — while real data passes.
 */
export function negativeBlockFractionBand(observations: number): readonly [number, number] {
  const [lo, hi] = BETA_NEGATIVE_BLOCK_FRACTION_BAND;
  if (!Number.isFinite(observations) || observations < 2) return [lo, hi];
  const centre = (lo + hi) / 2;
  const slack = BETA_NEGATIVE_BLOCK_TOLERANCE_SIGMA * Math.sqrt((centre * (1 - centre)) / observations);
  return [Math.max(0, lo - slack), Math.min(1, hi + slack)];
}

export interface BetaGateSpec {
  readonly productClass: 'BETA';
  readonly observations: number;
  readonly observationsPerYear: number;
  readonly trials: number;
  readonly fallbackTrials: number | null;
  readonly benchmarkSymbol: string;
  readonly targetAnnualVol: number;
  readonly volCeiling: number;
  readonly volFloor: number;
  readonly hypothesizedBeta: number;
  readonly maxAnnualTurnover: number;
  readonly maxAnnualCostDragBps: number;
  /**
   * Criterion (a) false-alarm rates at the reserved window — full window and per contiguous half —
   * established by the research director's simulation under THIS lane's own benchmark model. QDR-10
   * forbids deriving them from the log-variance closed form (measured materially optimistic), so the
   * seal verifies the declared figures and their consistency with the calibration; it never simulates.
   */
  readonly declaredVolatilityFalseAlarmRate: number;
  readonly declaredHalfWindowFalseAlarmRate: number;
  /**
   * Fraction of NEGATIVE non-overlapping benchmark blocks in the calibrating simulation. The
   * model-free falsifier: 8.8% is what the drift bug produced; real equities sit at 42-45%.
   */
  readonly declaredNegativeBenchmarkBlockFraction: number;
}

/**
 * QDR-11 DIVERSIFICATION seal block. Every field here is declared at seal and lives inside
 * `stableConfigHash`, so a favourable comparator cannot be chosen after the fact — the same door
 * QDR-10 closed by hashing `benchmarkSymbol`.
 */
export interface DiversificationGateSpec {
  readonly productClass: 'DIVERSIFICATION';
  /** DAILY observations in the reserved window. QDR-11 permits the daily unit for D1/D2 only. */
  readonly observations: number;
  readonly observationsPerYear: number;
  readonly trials: number;
  readonly fallbackTrials: number | null;
  /** The INCUMBENT rule, re-run at the same formation dates — never a hand-picked comparator. */
  readonly comparatorUniverseRule: string;
  /** Must name a REAL prior sealed version; `sealExperiment` throws if it resolves to none. */
  readonly comparatorVersionId: string;
  /** Content hash of the sector map, so a re-labeled sector cannot pose as a data update. */
  readonly sectorMapHash: string;
  readonly formationCadenceDays: number;
  readonly correlationLookbackDays: number;
  readonly minEffectiveBetsRatio: number;
  readonly minVolatilityReduction: number;
  readonly hypothesizedEffectiveBetsRatio: number;
  readonly hypothesizedVolReduction: number;
  /** Required. A declared value above the 30% breaker forces the predicted-rejection card line. */
  readonly hypothesizedMonteCarloP95Drawdown: number;
  readonly bootstrapBlockLength: number;
  /** All nine named plateau cells. */
  readonly plateauCells: readonly string[];
}

export interface GateSpec {
  readonly productClass?: 'ALPHA';
  /** DSR the OOS evidence must strictly exceed (the frozen 0.95 gate). */
  readonly requiredDsr: number;
  /** Annualized Sharpe at/above which the run is auto-flagged implausible (the frozen 3.0). */
  readonly sharpeCeiling: number;
  readonly observations: number;
  readonly observationsPerYear: number;
  /** Terminal trial count for the DECLARED tier (1 when confirmatory is the plan). */
  readonly trials: number;
  /** Trial count the lane falls back to if confirmatory status is not structurally earned. */
  readonly fallbackTrials: number | null;
  /** Effect size the director is willing to be held to, annualized. */
  readonly hypothesizedAnnualSharpe: number;
}

export type GateFeasibilityVerdict =
  | 'FEASIBLE'
  | 'EMPTY_ACCEPTANCE_SET'
  | 'EMPTY_FALLBACK_ACCEPTANCE_SET'
  | 'UNDERPOWERED'
  | 'EMPTY_BETA_VOLATILITY_BAND'
  | 'UNDERPOWERED_BETA_VOLATILITY'
  | 'BENCHMARK_MODEL_SANITY_FAILURE'
  | 'UNDERPOWERED_DIVERSIFICATION_VOLATILITY'
  | 'DIVERSIFICATION_COMPARATOR_MISSING';

export interface GateFeasibility {
  readonly verdict: GateFeasibilityVerdict;
  /** Highest DSR reachable without tripping the implausibility flag, at the declared tier. */
  readonly maxAttainableDsr: number;
  /** Same, at the exploratory fallback trial count (null when no fallback is declared). */
  readonly fallbackMaxAttainableDsr: number | null;
  /** DSR the declared effect size is expected to produce over the declared window. */
  readonly predictedDsr: number;
  /** Observations needed for the declared effect size to clear the gate at the declared tier. */
  readonly requiredObservations: number | null;
  /** Annualized Sharpe the declared window needs to clear the gate at the declared tier. */
  readonly requiredAnnualSharpe: number | null;
  readonly detail: string;
}

export interface BetaGateFeasibility {
  readonly verdict: GateFeasibilityVerdict;
  /** Is a realized outcome that satisfies criterion (a) possible at the reserved window at all? */
  readonly volatilityBandAchievable: boolean;
  readonly declaredVolatilityFalseAlarmRate: number;
  readonly declaredHalfWindowFalseAlarmRate: number;
  readonly minimumObservations: number;
  readonly detail: string;
}

export interface DiversificationGateFeasibility {
  readonly verdict: GateFeasibilityVerdict;
  /** DAILY observations the declared volatility reduction needs for 80% power. */
  readonly minimumObservations: number;
  readonly hypothesizedVolReduction: number;
  readonly hypothesizedEffectiveBetsRatio: number;
  /**
   * TRUE when the lane declares an MC p95 drawdown above the 30% breaker. This does NOT refuse the
   * seal — QDR-11 seals such a lane deliberately, to adjudicate the structural claim only — but it
   * forces the predicted-rejection disclosure line onto the manifest and the card, and the lane may
   * not be described as a candidate for admission anywhere while that line is live.
   */
  readonly predictedBreakerFailure: boolean;
  readonly detail: string;
}

/** The implausibility flag is `sharpe > ceiling`, so the ceiling itself is still admissible. */
function maxAdmissibleSharpe(sharpeCeiling: number): number {
  return sharpeCeiling;
}

/** Annualized Sharpe whose attainable DSR just clears `requiredDsr` at the declared window/tier. */
export function requiredAnnualSharpeForDsr(spec: GateSpec, trials: number): number | null {
  const needed = inverseNormalCDF(spec.requiredDsr) + expectedMaxSharpeOffset(trials);
  if (!Number.isFinite(needed)) return null;
  const root = Math.sqrt(spec.observations - 1);
  // Solve SRp*root/sqrt(1+SRp^2/2) = needed for SRp (closed form; no solution once needed >= root*sqrt(2)).
  const a = root * root - (needed * needed) / 2;
  if (a <= 0) return null;
  const srPeriod = needed / Math.sqrt(a);
  return srPeriod * Math.sqrt(spec.observationsPerYear);
}

export function assertGateSpec(spec: GateSpec): void {
  if (!Number.isFinite(spec.requiredDsr) || spec.requiredDsr <= 0 || spec.requiredDsr >= 1) {
    throw new Error('requiredDsr must be inside (0,1)');
  }
  if (!Number.isFinite(spec.sharpeCeiling) || spec.sharpeCeiling <= 0) {
    throw new Error('sharpeCeiling must be a positive number');
  }
  if (!Number.isFinite(spec.hypothesizedAnnualSharpe) || spec.hypothesizedAnnualSharpe <= 0) {
    throw new Error('hypothesizedAnnualSharpe must be a positive number');
  }
  if (spec.fallbackTrials !== null && (!Number.isInteger(spec.fallbackTrials) || spec.fallbackTrials < 1)) {
    throw new Error('fallbackTrials must be an integer >= 1 when declared');
  }
  assertDsrPoint({
    annualSharpe: spec.hypothesizedAnnualSharpe,
    observations: spec.observations,
    observationsPerYear: spec.observationsPerYear,
    trials: spec.trials,
  });
}

/**
 * Is this preregistration winnable, and is it worth running? Two independent questions:
 *  1. ACCEPTANCE SET — the best outcome that does not trip the implausibility flag must still clear
 *     the DSR gate. If it cannot, every possible outcome is a rejection and the experiment is a
 *     guaranteed waste of the forward window.
 *  2. POWER — the effect size the director actually predicts must clear the gate over the declared
 *     window. If it cannot, the experiment can only "succeed" by luck or by a Sharpe nobody claims.
 */
export function assessGateFeasibility(spec: GateSpec): GateFeasibility;
export function assessGateFeasibility(spec: BetaGateSpec): BetaGateFeasibility;
export function assessGateFeasibility(spec: DiversificationGateSpec): DiversificationGateFeasibility;
export function assessGateFeasibility(spec: AnyGateSpec): AnyGateFeasibility;
export function assessGateFeasibility(spec: AnyGateSpec): AnyGateFeasibility {
  if (spec.productClass === 'BETA') return assessBetaGateFeasibility(spec);
  if (spec.productClass === 'DIVERSIFICATION') return assessDiversificationGateFeasibility(spec);
  return assessAlphaGateFeasibility(spec);
}

export type AnyGateSpec = GateSpec | BetaGateSpec | DiversificationGateSpec;
export type AnyGateFeasibility = GateFeasibility | BetaGateFeasibility | DiversificationGateFeasibility;

/**
 * QDR-11 seal assertions. The power assertion sits on (D2), the binding criterion: the reserved
 * DAILY window must be able to detect the declared volatility reduction at 80% power. (D1) has no
 * separate power assertion — it is a comparative ratio the mechanism has already met 8/8 — but the
 * hypothesis must be DECLARED, so a lane cannot seal on a structural claim it never stated.
 *
 * There is no acceptance-set emptiness check analogous to ALPHA's: D1 and D2 are comparative ratios
 * with no implausibility ceiling above them, so no admissible outcome is excluded by construction.
 * A predicted drawdown-breaker failure is DISCLOSED, never a refusal — QDR-11 seals such a lane on
 * purpose, because the structural finding is separable and cheap (2.56 years) against the 89–503
 * the return question would need.
 */
export function assessDiversificationGateFeasibility(
  spec: DiversificationGateSpec,
): DiversificationGateFeasibility {
  assertDiversificationGateSpec(spec);
  const minimumObservations = minimumDailyObservationsForVolReduction(spec.hypothesizedVolReduction);
  const predictedBreakerFailure = spec.hypothesizedMonteCarloP95Drawdown > MONTE_CARLO_P95_DRAWDOWN_BREAKER;
  const base = {
    minimumObservations,
    hypothesizedVolReduction: spec.hypothesizedVolReduction,
    hypothesizedEffectiveBetsRatio: spec.hypothesizedEffectiveBetsRatio,
    predictedBreakerFailure,
  };
  if (!spec.comparatorVersionId.trim() || !spec.comparatorUniverseRule.trim()) {
    return {
      ...base,
      verdict: 'DIVERSIFICATION_COMPARATOR_MISSING',
      detail: 'a DIVERSIFICATION lane must name the incumbent rule AND a real prior sealed version; '
        + 'without both there is nothing to be a comparative claim ABOUT',
    };
  }
  if (spec.observations < minimumObservations) {
    return {
      ...base,
      verdict: 'UNDERPOWERED_DIVERSIFICATION_VOLATILITY',
      detail: `a ${(spec.hypothesizedVolReduction * 100).toFixed(1)}% volatility reduction needs `
        + `n >= ${minimumObservations} daily observations for 80% power; the reserved window holds `
        + `${spec.observations}. A seal that declares an effect its window cannot detect is refused`,
    };
  }
  return {
    ...base,
    verdict: 'FEASIBLE',
    detail: `reserved window holds ${spec.observations} daily observations against the `
      + `${minimumObservations} an ${(spec.hypothesizedVolReduction * 100).toFixed(1)}% reduction needs`
      + (predictedBreakerFailure
        ? `; NOTE p95 drawdown ${(spec.hypothesizedMonteCarloP95Drawdown * 100).toFixed(1)}% exceeds the `
          + `${(MONTE_CARLO_P95_DRAWDOWN_BREAKER * 100).toFixed(0)}% breaker — this lane is predicted to `
          + 'terminate REJECTED and is not a candidate for admission'
        : ''),
  };
}

export function assertDiversificationGateSpec(spec: DiversificationGateSpec): void {
  const positives: [string, number][] = [
    ['formationCadenceDays', spec.formationCadenceDays],
    ['correlationLookbackDays', spec.correlationLookbackDays],
    ['minEffectiveBetsRatio', spec.minEffectiveBetsRatio],
    ['hypothesizedEffectiveBetsRatio', spec.hypothesizedEffectiveBetsRatio],
    ['bootstrapBlockLength', spec.bootstrapBlockLength],
  ];
  for (const [key, value] of positives) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number`);
  }
  const fractions: [string, number][] = [
    ['minVolatilityReduction', spec.minVolatilityReduction],
    ['hypothesizedVolReduction', spec.hypothesizedVolReduction],
    ['hypothesizedMonteCarloP95Drawdown', spec.hypothesizedMonteCarloP95Drawdown],
  ];
  for (const [key, value] of fractions) {
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
      throw new Error(`${key} must sit strictly inside (0,1)`);
    }
  }
  for (const [key, value] of [
    ['sectorMapHash', spec.sectorMapHash],
    ['comparatorUniverseRule', spec.comparatorUniverseRule],
    ['comparatorVersionId', spec.comparatorVersionId],
  ] as [string, string][]) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${key} is required for a DIVERSIFICATION preregistration`);
    }
  }
  // A ratio at or below 1.00 is not a diversification claim — it is a claim of no change or of harm.
  if (!(spec.minEffectiveBetsRatio > 1)) throw new Error('minEffectiveBetsRatio must exceed 1');
  if (!(spec.hypothesizedEffectiveBetsRatio >= spec.minEffectiveBetsRatio)) {
    throw new Error('hypothesizedEffectiveBetsRatio must be at least minEffectiveBetsRatio; a lane may '
      + 'not declare an effect smaller than the floor it is gated against');
  }
  if (!(spec.hypothesizedVolReduction >= spec.minVolatilityReduction)) {
    throw new Error('hypothesizedVolReduction must be at least minVolatilityReduction');
  }
  if (!Number.isInteger(spec.observations) || spec.observations < 2) {
    throw new Error('observations must be an integer >= 2');
  }
  if (!Number.isFinite(spec.observationsPerYear) || spec.observationsPerYear <= 0) {
    throw new Error('observationsPerYear must be a positive number');
  }
  if (!Array.isArray(spec.plateauCells) || spec.plateauCells.length === 0) {
    throw new Error('plateauCells must name every cell evaluated inside the single terminal evaluation');
  }
}

/**
 * QDR-10 BETA seal assertions, as corrected 2026-08-06b.
 *  FEASIBILITY — a band whose ceiling is at or below its floor, or which no realized volatility can
 *  satisfy once the half-window upper bound and the full-window lower bound are both applied at the
 *  reserved n, has a provably empty acceptance set.
 *  POWER — now set on criterion (a), NOT on the withdrawn (c1): the declared false-alarm rate must
 *  hold at <= 5% on the full window AND on each contiguous half, and the reserved window must meet
 *  the corrected 104-observation floor (which is exactly what leaves each half at n=52 / 1.5%).
 *  SANITY — the calibrating simulation must publish a negative-benchmark-block fraction inside
 *  42-45%; that single number is what caught the drift bug, and a miss is a refusal, not a warning.
 * The simulation itself is the research director's, per lane; the seal never simulates.
 */
export function assessBetaGateFeasibility(spec: BetaGateSpec): BetaGateFeasibility {
  assertBetaGateSpec(spec);
  const achievable = volatilityBandFeasible(spec.volFloor, spec.volCeiling, spec.observations);
  const [minBlocks, maxBlocks] = negativeBlockFractionBand(spec.observations);
  const base = {
    volatilityBandAchievable: achievable,
    declaredVolatilityFalseAlarmRate: spec.declaredVolatilityFalseAlarmRate,
    declaredHalfWindowFalseAlarmRate: spec.declaredHalfWindowFalseAlarmRate,
    minimumObservations: BETA_MIN_OBSERVATIONS,
  };
  if (!achievable) {
    return {
      ...base,
      verdict: 'EMPTY_BETA_VOLATILITY_BAND',
      detail: `BETA acceptance set is empty: volFloor ${spec.volFloor} / volCeiling ${spec.volCeiling} at n=`
        + `${spec.observations} leaves no realized volatility that clears the half-window upper bound and the `
        + 'full-window lower bound at the same time',
    };
  }
  if (spec.declaredNegativeBenchmarkBlockFraction < minBlocks
    || spec.declaredNegativeBenchmarkBlockFraction > maxBlocks) {
    return {
      ...base,
      verdict: 'BENCHMARK_MODEL_SANITY_FAILURE',
      detail: `calibrating benchmark falls in ${(spec.declaredNegativeBenchmarkBlockFraction * 100).toFixed(1)}% `
        + `of non-overlapping blocks, outside the ${(minBlocks * 100).toFixed(1)}-${(maxBlocks * 100).toFixed(1)}% band `
        + `real equities occupy at n=${spec.observations} (42-45% long-run, widened by `
        + `${BETA_NEGATIVE_BLOCK_TOLERANCE_SIGMA} SE for sampling error); `
        + 'a benchmark that rarely falls is not any real index and every figure derived from it is void',
    };
  }
  if (spec.declaredVolatilityFalseAlarmRate > BETA_MAX_VOLATILITY_FALSE_ALARM
    || spec.declaredHalfWindowFalseAlarmRate > BETA_MAX_VOLATILITY_FALSE_ALARM
    || spec.observations < BETA_MIN_OBSERVATIONS) {
    return {
      ...base,
      verdict: 'UNDERPOWERED_BETA_VOLATILITY',
      detail: `BETA criterion (a) false-alarm rates ${spec.declaredVolatilityFalseAlarmRate} full / `
        + `${spec.declaredHalfWindowFalseAlarmRate} per half over n=${spec.observations} miss the `
        + `<= ${BETA_MAX_VOLATILITY_FALSE_ALARM} bar at the corrected ${BETA_MIN_OBSERVATIONS}-observation floor `
        + '(measured: n=52 ⇒ 1.5%, n=104 ⇒ 0.2%)',
    };
  }
  return { ...base, verdict: 'FEASIBLE', detail: 'BETA volatility band achievable and specific at the reserved window' };
}

export function assertBetaGateSpec(spec: BetaGateSpec): void {
  const positives: [string, number][] = [
    ['targetAnnualVol', spec.targetAnnualVol],
    ['volCeiling', spec.volCeiling],
    ['volFloor', spec.volFloor],
    ['hypothesizedBeta', spec.hypothesizedBeta],
    ['maxAnnualTurnover', spec.maxAnnualTurnover],
  ];
  for (const [key, value] of positives) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${key} must be a positive number`);
  }
  if (!Number.isFinite(spec.maxAnnualCostDragBps) || spec.maxAnnualCostDragBps < 0) {
    throw new Error('maxAnnualCostDragBps must be a non-negative number');
  }
  if (!spec.benchmarkSymbol.trim()) throw new Error('benchmarkSymbol is required for a BETA preregistration');
  const rates: [string, number][] = [
    ['declaredVolatilityFalseAlarmRate', spec.declaredVolatilityFalseAlarmRate],
    ['declaredHalfWindowFalseAlarmRate', spec.declaredHalfWindowFalseAlarmRate],
    ['declaredNegativeBenchmarkBlockFraction', spec.declaredNegativeBenchmarkBlockFraction],
  ];
  for (const [key, value] of rates) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${key} must be inside [0,1]`);
  }
  if (!Number.isInteger(spec.observations) || spec.observations < 2) {
    throw new Error('observations must be an integer >= 2');
  }
  if (!Number.isFinite(spec.observationsPerYear) || spec.observationsPerYear <= 0) {
    throw new Error('observationsPerYear must be a positive number');
  }
}

function assessAlphaGateFeasibility(spec: GateSpec): GateFeasibility {
  assertGateSpec(spec);
  const point = {
    observations: spec.observations,
    observationsPerYear: spec.observationsPerYear,
    trials: spec.trials,
  };
  const maxAttainableDsr = attainableDsr({ ...point, annualSharpe: maxAdmissibleSharpe(spec.sharpeCeiling) });
  const fallbackMaxAttainableDsr = spec.fallbackTrials === null
    ? null
    : attainableDsr({
      ...point,
      trials: spec.fallbackTrials,
      annualSharpe: maxAdmissibleSharpe(spec.sharpeCeiling),
    });
  const predictedDsr = attainableDsr({ ...point, annualSharpe: spec.hypothesizedAnnualSharpe });
  const requiredObservations = minimumObservationsForDsr({
    annualSharpe: spec.hypothesizedAnnualSharpe,
    observationsPerYear: spec.observationsPerYear,
    trials: spec.trials,
  }, spec.requiredDsr);
  const requiredAnnualSharpe = requiredAnnualSharpeForDsr(spec, spec.trials);

  const base = { maxAttainableDsr, fallbackMaxAttainableDsr, predictedDsr, requiredObservations, requiredAnnualSharpe };
  if (!(maxAttainableDsr > spec.requiredDsr)) {
    return {
      ...base,
      verdict: 'EMPTY_ACCEPTANCE_SET',
      detail: `acceptance set is empty: n=${spec.observations} at ${spec.trials} trials caps DSR at `
        + `${maxAttainableDsr.toFixed(4)} <= required ${spec.requiredDsr}, because clearing the gate would `
        + `need annualized Sharpe ${requiredAnnualSharpe === null ? 'infinity' : requiredAnnualSharpe.toFixed(2)} `
        + `> implausibility ceiling ${spec.sharpeCeiling}`,
    };
  }
  if (fallbackMaxAttainableDsr !== null && !(fallbackMaxAttainableDsr > spec.requiredDsr)) {
    return {
      ...base,
      verdict: 'EMPTY_FALLBACK_ACCEPTANCE_SET',
      detail: `exploratory fallback acceptance set is empty: n=${spec.observations} at ${spec.fallbackTrials} `
        + `fallback trials caps DSR at ${fallbackMaxAttainableDsr.toFixed(4)} <= required ${spec.requiredDsr}; `
        + 'a lane that fails to earn confirmatory status would be rejected by arithmetic alone',
    };
  }
  if (!(predictedDsr > spec.requiredDsr)) {
    return {
      ...base,
      verdict: 'UNDERPOWERED',
      detail: `underpowered: the declared annualized Sharpe ${spec.hypothesizedAnnualSharpe} over n=`
        + `${spec.observations} observations reaches DSR ${predictedDsr.toFixed(4)} <= required ${spec.requiredDsr}; `
        + `size the window to n >= ${requiredObservations ?? 'unreachable'} observations`,
    };
  }
  return { ...base, verdict: 'FEASIBLE', detail: 'acceptance set non-empty and powered at the declared effect size' };
}

// ── manifest config → GateSpec ─────────────────────────────────────────────────────────────────
/**
 * Keys whose presence in `config.validation` means "this preregistration declares a DSR acceptance
 * gate". If ANY appears, the block must carry the whole spec (missing/invalid fields throw); if
 * NONE appears the manifest declares no numeric gate and seals unchecked — that keeps older
 * manifests whose `validation` block only describes a fold scheme sealing exactly as before.
 */
const GATE_KEYS = [
  'minimumOosDsr', 'maximumPlausibleSharpe', 'minimumOosObservations', 'hypothesizedAnnualSharpe',
  // QDR-10: declaring a product class (or any BETA band key) is itself a declaration of a gate.
  'productClass', 'benchmarkSymbol', 'targetAnnualVol', 'volCeiling', 'volFloor',
] as const;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requireNumber(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`config.validation.${key} must be a finite number when a DSR gate is declared`);
  }
  return value;
}

/** Terminal trial count declared by the validation block, plus the exploratory fallback. */
function trialsFromValidation(validation: Record<string, unknown>): { trials: number; fallbackTrials: number | null } {
  const tier = validation.trialTier;
  const family = validation.relatedFamilyTrials;
  if (tier === undefined) {
    if (!Number.isInteger(family) || Number(family) < 1) {
      throw new Error('config.validation.relatedFamilyTrials must be an integer >= 1 when a DSR gate is declared');
    }
    return { trials: Number(family), fallbackTrials: null };
  }
  if (tier !== 'EXPLORATORY' && tier !== 'CONFIRMATORY') {
    throw new Error("config.validation.trialTier must be 'EXPLORATORY' or 'CONFIRMATORY'");
  }
  if (!Number.isInteger(family) || Number(family) < 1) {
    throw new Error('config.validation.relatedFamilyTrials must be an integer >= 1 when a DSR gate is declared');
  }
  if (tier === 'EXPLORATORY') return { trials: Number(family), fallbackTrials: null };
  const confirmatory = validation.confirmatoryTrials;
  if (confirmatory !== 1) {
    throw new Error('config.validation.confirmatoryTrials must be exactly 1 for a CONFIRMATORY tier');
  }
  return { trials: 1, fallbackTrials: Number(family) };
}

/**
 * QDR-10: the class is read from the SEALED config and absence resolves to ALPHA, the strictest
 * gate. Because it lives in `config`, it is inside `stableConfigHash` — mutating it after seal
 * breaks hash recomputation and fails QDR-9 confirmatory condition (a). That hash, not reviewer
 * diligence, is the anti-gate-shopping guardrail.
 */
export function productClassFromConfig(config: unknown): ProductClass {
  const root = record(config);
  const validation = root ? record(root.validation) : null;
  const declared = validation?.productClass;
  if (declared === undefined || declared === null) return 'ALPHA';
  if (declared !== 'ALPHA' && declared !== 'BETA' && declared !== 'DIVERSIFICATION') {
    throw new Error("config.validation.productClass must be 'ALPHA', 'BETA' or 'DIVERSIFICATION'");
  }
  return declared;
}

function requireString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`config.validation.${key} must be a non-empty string when a BETA gate is declared`);
  }
  return value;
}

function requireStringArray(source: Record<string, unknown>, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((v) => typeof v !== 'string' || !v.trim())) {
    throw new Error(`config.validation.${key} must be a non-empty array of strings when a DIVERSIFICATION gate is declared`);
  }
  return value as string[];
}

/**
 * Read a gate spec out of a free-form manifest config; null when no gate is declared at all.
 * A BETA block does NOT require the DSR keys: QDR-10 makes DSR a reported figure for that class,
 * never a gate, so demanding `hypothesizedAnnualSharpe` from a lane that is forbidden to claim an
 * edge would be incoherent. Present-but-incomplete still throws, per class.
 */
export function gateSpecFromConfig(config: unknown): AnyGateSpec | null {
  const root = record(config);
  const validation = root ? record(root.validation) : null;
  if (!validation) return null;
  if (!GATE_KEYS.some((key) => validation[key] !== undefined)) return null;

  const observations = validation.minimumOosObservations;
  if (!Number.isInteger(observations) || Number(observations) < 2) {
    throw new Error('config.validation.minimumOosObservations must be an integer >= 2 when a DSR gate is declared');
  }
  const { trials, fallbackTrials } = trialsFromValidation(validation);
  const declaredClass = productClassFromConfig(config);
  if (declaredClass === 'DIVERSIFICATION') {
    // Present-but-incomplete THROWS; absent entirely still seals as EXPLORATORY ALPHA. The
    // fail-closed default is untouched — a lane cannot reach this branch without declaring the class.
    return {
      productClass: 'DIVERSIFICATION',
      observations: Number(observations),
      observationsPerYear: requireNumber(validation, 'observationsPerYear'),
      trials,
      fallbackTrials,
      comparatorUniverseRule: requireString(validation, 'comparatorUniverseRule'),
      comparatorVersionId: requireString(validation, 'comparatorVersionId'),
      sectorMapHash: requireString(validation, 'sectorMapHash'),
      formationCadenceDays: requireNumber(validation, 'formationCadenceDays'),
      correlationLookbackDays: requireNumber(validation, 'correlationLookbackDays'),
      minEffectiveBetsRatio: requireNumber(validation, 'minEffectiveBetsRatio'),
      minVolatilityReduction: requireNumber(validation, 'minVolatilityReduction'),
      hypothesizedEffectiveBetsRatio: requireNumber(validation, 'hypothesizedEffectiveBetsRatio'),
      hypothesizedVolReduction: requireNumber(validation, 'hypothesizedVolReduction'),
      hypothesizedMonteCarloP95Drawdown: requireNumber(validation, 'hypothesizedMonteCarloP95Drawdown'),
      bootstrapBlockLength: requireNumber(validation, 'bootstrapBlockLength'),
      plateauCells: requireStringArray(validation, 'plateauCells'),
    };
  }
  if (declaredClass === 'BETA') {
    const targetAnnualVol = requireNumber(validation, 'targetAnnualVol');
    return {
      productClass: 'BETA',
      observations: Number(observations),
      observationsPerYear: requireNumber(validation, 'observationsPerYear'),
      trials,
      fallbackTrials,
      benchmarkSymbol: requireString(validation, 'benchmarkSymbol'),
      targetAnnualVol,
      volCeiling: requireNumber(validation, 'volCeiling'),
      volFloor: requireNumber(validation, 'volFloor'),
      hypothesizedBeta: requireNumber(validation, 'hypothesizedBeta'),
      maxAnnualTurnover: requireNumber(validation, 'maxAnnualTurnover'),
      maxAnnualCostDragBps: requireNumber(validation, 'maxAnnualCostDragBps'),
      declaredVolatilityFalseAlarmRate: requireNumber(validation, 'declaredVolatilityFalseAlarmRate'),
      declaredHalfWindowFalseAlarmRate: requireNumber(validation, 'declaredHalfWindowFalseAlarmRate'),
      declaredNegativeBenchmarkBlockFraction: requireNumber(validation, 'declaredNegativeBenchmarkBlockFraction'),
    };
  }
  return {
    requiredDsr: requireNumber(validation, 'minimumOosDsr'),
    sharpeCeiling: requireNumber(validation, 'maximumPlausibleSharpe'),
    observations: Number(observations),
    observationsPerYear: requireNumber(validation, 'observationsPerYear'),
    trials,
    fallbackTrials,
    hypothesizedAnnualSharpe: requireNumber(validation, 'hypothesizedAnnualSharpe'),
  };
}
