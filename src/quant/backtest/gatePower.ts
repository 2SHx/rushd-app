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

export interface GateSpec {
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

export type GateFeasibilityVerdict = 'FEASIBLE' | 'EMPTY_ACCEPTANCE_SET' | 'EMPTY_FALLBACK_ACCEPTANCE_SET' | 'UNDERPOWERED';

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
export function assessGateFeasibility(spec: GateSpec): GateFeasibility {
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
const GATE_KEYS = ['minimumOosDsr', 'maximumPlausibleSharpe', 'minimumOosObservations', 'hypothesizedAnnualSharpe'] as const;

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

/** Read a GateSpec out of a free-form manifest config; null when no DSR gate is declared. */
export function gateSpecFromConfig(config: unknown): GateSpec | null {
  const root = record(config);
  const validation = root ? record(root.validation) : null;
  if (!validation) return null;
  if (!GATE_KEYS.some((key) => validation[key] !== undefined)) return null;

  const observations = validation.minimumOosObservations;
  if (!Number.isInteger(observations) || Number(observations) < 2) {
    throw new Error('config.validation.minimumOosObservations must be an integer >= 2 when a DSR gate is declared');
  }
  const { trials, fallbackTrials } = trialsFromValidation(validation);
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
