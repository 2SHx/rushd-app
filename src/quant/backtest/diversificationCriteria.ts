// QDR-11 DIVERSIFICATION-class criteria. A DIVERSIFICATION version claims that a UNIVERSE-
// CONSTRUCTION RULE builds a better-diversified book than the incumbent rule — nothing else. It is
// adjudicated on two comparative criteria measured against the incumbent rule RE-RUN at the same
// formation dates, on the same universe, at the same sleeve size.
//
// WHAT AN ACCEPT HERE MEANS, and what it may never be used to suggest:
//   "When we pick which shares go in the basket using this new rule instead of the old one, the
//    basket's holdings move together less, and the basket's value swings less day to day — for the
//    same kind of market exposure."
// It does NOT say the rule makes more money, has a higher Sharpe, beats the market, beats the old
// rule, or has any edge. We did not test that, because we CANNOT: proving the return difference at
// this effect size takes 89–503 years of data (IR 0.111–0.263 ⇒ years = 6.1826 / IR²). The ×1.13
// implied Sharpe multiplier is why the lane was built and is motivation only — never a tested
// outcome, never a reported one, never on a card or in any UI surface.
//
// NO RETURN CLAIM IS PERMITTED. This is a contract violation, not a wording preference. Both arms'
// CAGR is nonetheless a MANDATORY DISCLOSURE with its own annotation — a record forbidding a claimed
// return GAIN while permitting silence about a return LOSS would be dishonest in exactly one
// direction, and this lane predicts a ~4.1pp CAGR give-up.
//
// Nothing here lowers a threshold that survives: every hard safety gate (Sharia veto, MC p95
// drawdown ≤ 30%, 5% risk-of-ruin, Sharpe > 3.00 ceiling, PIT integrity, reproducibility, the
// 100-observation floor, the OOS holdout) is byte-identical and still applies. Passing D1 and D2
// while failing the drawdown breaker never yields an ACCEPT.
//
// Pure and deterministic — no LLM, no DB, no clock. Every value is a plain number, never money.
import { movingBlockSampleIndices } from './monteCarlo';

export const DIVERSIFICATION_CRITERION_CODES = [
  'EFFECTIVE_BETS_RATIO',
  'BOOK_VOLATILITY_REDUCTION',
  'PLATEAU_INSTABILITY',
] as const;
export type DiversificationCriterionCode = typeof DIVERSIFICATION_CRITERION_CODES[number];

/** (D1) equal-weighted mean of the per-cycle effective-bet ratio. */
export const MIN_EFFECTIVE_BETS_RATIO = 1.10;
/** (D1) and every INDIVIDUAL cycle. One cycle diversifying worse fails the claim. */
export const MIN_CYCLE_EFFECTIVE_BETS_RATIO = 1.00;
/** (D2) point-estimate floor on `1 − sigma_B / sigma_A`. */
export const MIN_VOLATILITY_REDUCTION = 0.05;
/** (D2) one-sided 95% UPPER bound on `sigma_B / sigma_A`; the complement of the floor above. */
export const MAX_VOLATILITY_RATIO_UPPER_BOUND_95 = 0.95;
/** Plateau stability: all nine cells, not only the sealed one. */
export const MIN_PLATEAU_EFFECTIVE_BETS_RATIO = 1.00;
/**
 * QDR-11's sealed grid: {sectorCap 0.20|0.25|0.30} x {poolSize 60|80|100}. Asserted at seal, because
 * a non-empty check alone let a lane declare ONE cell and skip the guardrail while looking compliant.
 */
export const DIVERSIFICATION_PLATEAU_CELL_COUNT = 9;

export const DIVERSIFICATION_BOOTSTRAP_RESAMPLES = 2000;
const TRADING_DAYS_PER_YEAR = 252;
/** z(0.95) + z(0.80) — the same one-sided 95% / 80%-power pair the rest of the gate machinery uses. */
const Z_95_PLUS_Z_80 = 2.4865;

export interface DiversificationCycle {
  /** Formation date, reported on the card so the PIT schedule is auditable from the artifact. */
  readonly formationAt: string;
  /** EB(A,c): comparator arm effective bets on the MEASUREMENT window, never the formation window. */
  readonly comparatorEffectiveBets: number;
  /** EB(B,c): treatment arm, same window, same protocol. */
  readonly treatmentEffectiveBets: number;
  readonly comparatorNames: number;
  readonly treatmentNames: number;
  /**
   * Formation-window correlation of the treatment sleeve. REPORTED, NEVER GATED (QDR-11 D1): it is
   * the quantity the greedy selector explicitly minimized, so gating on it would certify an
   * optimizer against its own objective function.
   */
  readonly treatmentFormationCorrelation?: number;
}

export interface DiversificationPlateauCell {
  /** e.g. 'sectorCap=0.25,poolSize=80'. */
  readonly label: string;
  /** Exactly one cell is the SEALED cell; only it gates D1/D2. */
  readonly sealed: boolean;
  readonly meanEffectiveBetsRatio: number;
}

export interface DiversificationCriteriaInput {
  readonly cycles: readonly DiversificationCycle[];
  /**
   * DAILY NAV returns of the two arms, run through the SAME shared-cash engine over the SAME dates
   * with byte-identical config except the universe rule. Same length, index-aligned — the pairing is
   * what makes the D2 test powerful, and resampling the arms independently would discard it.
   */
  readonly comparatorDailyReturns: readonly number[];
  readonly treatmentDailyReturns: readonly number[];
  /** Declared at seal and hashed, with the block length. */
  readonly bootstrapSeed: number;
  readonly bootstrapBlockLength: number;
  readonly bootstrapResamples?: number;
  /** All nine named cells, exactly one flagged `sealed`. */
  readonly plateauCells: readonly DiversificationPlateauCell[];
  readonly minEffectiveBetsRatio?: number;
  readonly minVolatilityReduction?: number;
  /** MANDATORY DISCLOSURE, gates nothing, and may never be phrased as a claim in either direction. */
  readonly comparatorCagr: number;
  readonly treatmentCagr: number;
}

export interface DiversificationCriteriaResult {
  readonly failures: readonly DiversificationCriterionCode[];
  readonly cycleRatios: readonly number[];
  readonly meanEffectiveBetsRatio: number;
  readonly minCycleEffectiveBetsRatio: number;
  readonly comparatorAnnualVolatility: number;
  readonly treatmentAnnualVolatility: number;
  readonly volatilityRatio: number;
  readonly volatilityReduction: number;
  readonly volatilityRatioUpperBound95: number;
  readonly plateauMinEffectiveBetsRatio: number;
  readonly failingPlateauCells: readonly string[];
  /**
   * MANDATORY DISCLOSURE. QDR-11 requires the card to print BOTH arms' realized CAGR and their
   * difference, annotated as not distinguishable from zero. They gate nothing and may never be
   * phrased as a claim in either direction — but omitting them would be a claim by silence, and
   * this lane predicts a ~4.1pp give-up, so silence would be dishonest in exactly one direction.
   */
  readonly comparatorCagr: number;
  readonly treatmentCagr: number;
  readonly cagrDifference: number;
  /** Reported diagnostic; gates nothing. `null` when no cycle supplied one. */
  readonly meanFormationCorrelation: number | null;
}

function sampleStdDev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1));
}

/** `sigma_arm = stdev(daily returns) × √252`, exactly as QDR-11 (D2) defines it. */
export function annualizedDailyVolatility(dailyReturns: readonly number[]): number {
  return sampleStdDev(dailyReturns) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/**
 * One-sided 95% UPPER bound on `sigma_B / sigma_A` from a PAIRED seeded moving-block bootstrap:
 * the SAME resampled block-index sequence is applied to both arms on every draw. The arms share the
 * market factor, so resampling them independently throws away the pairing that makes this test
 * powerful — and would inflate the bound toward accepting nothing.
 *
 * Reuses the shipped `movingBlockSampleIndices`; no new estimator is invented.
 */
export function pairedVolatilityRatioUpperBound95(
  comparatorDailyReturns: readonly number[],
  treatmentDailyReturns: readonly number[],
  opts: { readonly seed: number; readonly blockLength: number; readonly resamples?: number },
): number {
  const n = comparatorDailyReturns.length;
  if (n !== treatmentDailyReturns.length) {
    throw new Error(
      'paired bootstrap requires index-aligned arms of equal length; unequal series would silently '
      + 'discard the pairing that makes the D2 test powerful',
    );
  }
  if (n < 2) throw new Error('paired bootstrap requires at least 2 daily observations per arm');
  const resamples = opts.resamples ?? DIVERSIFICATION_BOOTSTRAP_RESAMPLES;

  const ratios: number[] = [];
  for (let r = 0; r < resamples; r++) {
    // Per-draw seed, fully determined by the SEALED seed so the whole bound replays exactly.
    // The large odd stride matters: with a naive `seed + r`, sealed seeds 42 and 43 would share
    // 399 of 400 draws and produce an identical 95th percentile — two lanes with different declared
    // seeds would be running the same bootstrap. Caught by the determinism test below.
    const indices = movingBlockSampleIndices(n, {
      seed: opts.seed * 1_000_003 + r, sampleLength: n, blockLength: opts.blockLength,
    });
    const a: number[] = [];
    const b: number[] = [];
    for (const i of indices) { a.push(comparatorDailyReturns[i]); b.push(treatmentDailyReturns[i]); }
    const sa = sampleStdDev(a);
    ratios.push(sa > 0 ? sampleStdDev(b) / sa : Infinity);
  }
  ratios.sort((x, y) => x - y);
  const index = Math.min(ratios.length - 1, Math.ceil(0.95 * ratios.length) - 1);
  return ratios[Math.max(0, index)];
}

/**
 * SEAL-TIME feasibility arithmetic for (D2), the binding criterion — not the terminal test.
 * `ln(sigma_B/sigma_A)` has SE `√(1/(n−1))` in DAILY observations, so 80% power at one-sided 95%
 * needs `2.4865·√(1/(n−1)) ≤ |ln(1 − r)|`, i.e. `n ≥ 1 + (2.4865/|ln(1−r)|)²`.
 *
 * ⚠ QDR-11's prose states this as `2.4865·√(4/(n−1)) ≤ |ln(1 − r)|`. Those differ by a factor of 2
 * in the SE, because `√(4/(n−1))` is the SE of the log-VARIANCE ratio and must be compared against
 * `|ln((1−r)²)| = 2·|ln(1−r)|`. The record's own answer — "n ≥ 407 at the declared 11.6%" — is the
 * one this function reproduces (it returns 408; the record rounded). Implementing the prose
 * literally would demand n ≥ 1628 and would refuse the very lane the record concludes is feasible.
 * The NUMBER is authoritative and unchanged; only the intermediate expression is restated.
 *
 * This independent-sample form UNDERSTATES the power of a paired comparison of two arms driven by
 * the same market factor, so relying on it at seal errs toward refusing feasible lanes, never toward
 * admitting infeasible ones. No credit for the pairing is taken at seal — only by the bootstrap at
 * terminal.
 */
export function minimumDailyObservationsForVolReduction(hypothesizedVolReduction: number): number {
  if (!Number.isFinite(hypothesizedVolReduction)
    || hypothesizedVolReduction <= 0 || hypothesizedVolReduction >= 1) {
    throw new Error('hypothesizedVolReduction must sit strictly inside (0,1)');
  }
  const effect = Math.abs(Math.log(1 - hypothesizedVolReduction));
  return Math.ceil(1 + (Z_95_PLUS_Z_80 / effect) ** 2);
}

/**
 * Evaluate (D1), (D2) and plateau stability. Every hard safety gate — drawdown breaker, risk of
 * ruin, Sharia, PIT, reproducibility, the observation floor — is evaluated by the EXISTING
 * machinery in `assembleReportCard` and is not touched here.
 */
export function evaluateDiversificationCriteria(
  input: DiversificationCriteriaInput,
): DiversificationCriteriaResult {
  const failures: DiversificationCriterionCode[] = [];

  if (input.cycles.length === 0) throw new Error('DIVERSIFICATION evidence requires at least one formation cycle');
  const sealedCells = input.plateauCells.filter((cell) => cell.sealed);
  if (sealedCells.length !== 1) {
    // The sealed cell is named BEFORE any OOS contact, which is what stops the other cells from
    // ever rescuing a run. Zero or several sealed cells destroys that guarantee.
    throw new Error(
      `DIVERSIFICATION plateau must name exactly one sealed cell, found ${sealedCells.length}`,
    );
  }

  // ── (D1) EFFECTIVE-BET RATIO, on realized forward returns, never on the formation window.
  const cycleRatios = input.cycles.map((cycle) => {
    if (!(cycle.comparatorEffectiveBets > 0)) {
      throw new Error(`cycle ${cycle.formationAt} has non-positive comparator effective bets`);
    }
    return cycle.treatmentEffectiveBets / cycle.comparatorEffectiveBets;
  });
  const meanEffectiveBetsRatio = cycleRatios.reduce((sum, r) => sum + r, 0) / cycleRatios.length;
  const minCycleEffectiveBetsRatio = Math.min(...cycleRatios);
  const minMeanRatio = input.minEffectiveBetsRatio ?? MIN_EFFECTIVE_BETS_RATIO;
  // Both parts required: the claim is "this rule produces a better-diversified book", not "on
  // average, over periods we chose".
  if (!(meanEffectiveBetsRatio >= minMeanRatio)
    || !(minCycleEffectiveBetsRatio >= MIN_CYCLE_EFFECTIVE_BETS_RATIO)) {
    failures.push('EFFECTIVE_BETS_RATIO');
  }

  // ── (D2) REALIZED BOOK-VOLATILITY REDUCTION — the binding criterion.
  const comparatorAnnualVolatility = annualizedDailyVolatility(input.comparatorDailyReturns);
  const treatmentAnnualVolatility = annualizedDailyVolatility(input.treatmentDailyReturns);
  if (!(comparatorAnnualVolatility > 0)) {
    throw new Error('comparator arm has zero realized volatility; the D2 ratio is undefined');
  }
  const volatilityRatio = treatmentAnnualVolatility / comparatorAnnualVolatility;
  const volatilityReduction = 1 - volatilityRatio;
  const volatilityRatioUpperBound95 = pairedVolatilityRatioUpperBound95(
    input.comparatorDailyReturns,
    input.treatmentDailyReturns,
    { seed: input.bootstrapSeed, blockLength: input.bootstrapBlockLength, resamples: input.bootstrapResamples },
  );
  const minReduction = input.minVolatilityReduction ?? MIN_VOLATILITY_REDUCTION;
  // A point estimate alone can be noise; an uncertainty bound alone can pass on a trivial effect.
  // Same grammar as QDR-10 criterion (a) — a floor plus a bound, no new estimator.
  if (!(volatilityReduction >= minReduction)
    || !(volatilityRatioUpperBound95 <= MAX_VOLATILITY_RATIO_UPPER_BOUND_95)) {
    failures.push('BOOK_VOLATILITY_REDUCTION');
  }

  // ── PLATEAU STABILITY — QDR-6's existing guardrail restated in this claim's unit, not a new
  // criterion. All cells must clear 1.00 or the result is a knife-edge parameter artifact.
  const failingPlateauCells = input.plateauCells
    .filter((cell) => !(cell.meanEffectiveBetsRatio >= MIN_PLATEAU_EFFECTIVE_BETS_RATIO))
    .map((cell) => cell.label);
  const plateauMinEffectiveBetsRatio = Math.min(...input.plateauCells.map((c) => c.meanEffectiveBetsRatio));
  if (failingPlateauCells.length > 0) failures.push('PLATEAU_INSTABILITY');

  const formationCorrelations = input.cycles
    .map((cycle) => cycle.treatmentFormationCorrelation)
    .filter((rho): rho is number => typeof rho === 'number' && Number.isFinite(rho));

  return {
    failures,
    cycleRatios,
    meanEffectiveBetsRatio,
    minCycleEffectiveBetsRatio,
    comparatorAnnualVolatility,
    treatmentAnnualVolatility,
    volatilityRatio,
    volatilityReduction,
    volatilityRatioUpperBound95,
    plateauMinEffectiveBetsRatio,
    failingPlateauCells,
    comparatorCagr: input.comparatorCagr,
    treatmentCagr: input.treatmentCagr,
    cagrDifference: input.treatmentCagr - input.comparatorCagr,
    meanFormationCorrelation: formationCorrelations.length
      ? formationCorrelations.reduce((sum, r) => sum + r, 0) / formationCorrelations.length
      : null,
  };
}
