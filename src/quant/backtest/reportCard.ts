// Rushd Quant — QDR-6 validation report card. Assembles the metrics + measured daily-return
// distribution + Monte Carlo gate + promotion checklist into one honest, persistable object,
// and renders it as a compact terminal table. Every claim carries a dataFeed label; an
// implausible flag (Sharpe > 3 or a daily-return claim ≥ 3σ of history) prints in RED.
// Pure formatting — no DB, no LLM, no randomness.
import { evaluateBetaCriteria, type BetaCriteriaInput, type BetaCriteriaResult, type BetaCriterionCode, BETA_CRITERION_CODES } from './betaCriteria';
import {
  evaluateDiversificationCriteria,
  DIVERSIFICATION_CRITERION_CODES,
  type DiversificationCriteriaInput,
  type DiversificationCriteriaResult,
  type DiversificationCriterionCode,
} from './diversificationCriteria';
import type { ProductClass } from './gatePower';
import type { BacktestMetrics, BenchmarkEvidence, PathShapeEvidence } from './metrics';
import type { DailyReturnDistribution } from './distribution';
import type { BootstrapResult, PermutationResult } from './monteCarlo';
import type { TrialCountEvidence } from './trialFamilies';

export type DataFeed = 'alpaca-iex' | 'fixtures-real' | 'yahoo-short-history' | 'yahoo-daily';

export const MIN_TRADES_FOR_VALIDATION = 100;
/** Versioned QDR-7 default: at most 5% of bootstrap paths may reach the ruin threshold. */
export const DEFAULT_MAX_RISK_OF_RUIN = 0.05;

/**
 * QDR-10 widens the terminal labels so a beta admission can never be read as an alpha result.
 * ALPHA keeps 'ACCEPTED'/'REJECTED' byte-identically; a BETA version can NEVER emit bare 'ACCEPTED'.
 */
export type TerminalValidationStatus =
  | 'ACCEPTED' | 'REJECTED'
  | 'ACCEPTED_BETA' | 'REJECTED_BETA'
  | 'ACCEPTED_DIVERSIFICATION' | 'REJECTED_DIVERSIFICATION';

/**
 * What an ACCEPT entitles. ALPHA and BETA terminate in AUTO_PAPER admission; DIVERSIFICATION
 * terminates in permission to use the RULE — no capital, no allocation, no QDR-7 tournament entry,
 * no AUTO_PAPER book. A future version may adopt the rule and must still earn its own verdict.
 */
export type AcceptanceMeaning = 'AUTO_PAPER_ADMISSION_ONLY' | 'UNIVERSE_RULE_ADMISSION_ONLY';

// ── QDR-11 verbatim card copy. These lines are a CONTRACT, not a wording preference: a
// DIVERSIFICATION version may make no return, Sharpe, edge, or outperformance claim anywhere.
/** MANDATORY on every DIVERSIFICATION card, printed beside the treatment arm's deflated Sharpe. */
export const DIVERSIFICATION_NO_RETURN_COMPARISON_LINE =
  'no return or Sharpe comparison between the two arms is reported; that difference needs 89–503 '
  + 'years of data for 80% power and is beyond measurement';
/**
 * The MIRROR OBLIGATION. A record that forbids claiming a return GAIN while permitting silence
 * about a return LOSS would be dishonest in exactly one direction, so both arms' CAGR and their
 * difference are printed — with this annotation, which is what keeps the disclosure from becoming a
 * claim. Omission would be a claim by silence.
 */
export const DIVERSIFICATION_CAGR_DISCLOSURE_LINE =
  'the difference in return between the two arms is not statistically distinguishable from zero at '
  + 'this sample size and is neither claimed nor denied, in either direction';
/**
 * Phrased entirely in QDR-11's PERMITTED vocabulary. An earlier draft said what the class does not
 * claim by naming the banned phrases inside a negation — which the acceptance suite refuses, and
 * rightly: a blanket textual ban is the only enforceable form, because "we only said it in a
 * negation" is exactly the argument a later violation would make. Saying it in permitted words is
 * also stronger, since it forecloses the comparison in BOTH directions rather than one.
 */
export const DIVERSIFICATION_ACCEPT_MEANING_LINE =
  'ACCEPTED_DIVERSIFICATION admits the UNIVERSE-SELECTION RULE only: the basket\'s holdings move '
  + 'together less and its value swings less day to day, for the same kind of market exposure. No '
  + 'claim about returns of any kind is made or implied, in either direction, and no capital — real '
  + 'or paper — sits behind this result.';
/** Forced onto the card whenever the sealed p95 drawdown prediction exceeds the breaker. */
export const DIVERSIFICATION_PREDICTED_REJECTION_LINE =
  'this lane is predicted to fail the drawdown breaker and is therefore predicted to terminate '
  + 'REJECTED; it is sealed to adjudicate the structural claim only and is not a candidate for admission';
/** The formation-window correlation is the selector\'s own objective function; gating it would
 * certify an optimizer against itself. Printed with this annotation, never gated. */
export const DIVERSIFICATION_FORMATION_RHO_ANNOTATION =
  'formation-window correlation is reported, never gated: it is the quantity the selector minimized';
// Arabic counterparts live in messages/*.json under i18n-fintech-expert review per QDR-11; the
// terminal card is an operator artifact and stays English-only, as for BETA.

/**
 * QDR-19 verbatim card copy. The BENCHMARK and PATH-SHAPE blocks are MANDATORY PUBLISHED EVIDENCE
 * and gate NOTHING — printed under QDR-10's `BETA_CAPTURE_REPORT_ANNOTATION` precedent and QDR-11's
 * `DIVERSIFICATION_FORMATION_RHO_ANNOTATION` precedent: print the evidence and tell the reader
 * exactly what it cannot support. QDR-19 adopted NO Ulcer, CVaR or IR threshold, moved NO breaker,
 * and added NO `RejectionReasonCode`; `checklist` and `rejectionReasonCodes` are byte-identical
 * after this record. Sealed lanes print these lines too, because reporting is additive, sits
 * OUTSIDE `stableConfigHash(config)`, and cannot touch a verdict.
 */
export const QDR19_REPORTED_NEVER_GATED_ANNOTATION =
  'reported, never gated: QDR-19 adopted no Ulcer, CVaR or Information-Ratio threshold and moved no '
  + 'breaker; a threshold derived from the book in front of it would be gate-shopping';
/** Forced onto every benchmark block built from a reconstructed basket rather than an instrument. */
export const QDR19_NON_DECLARABLE_BENCHMARK_LINE =
  'CONTEXT ONLY — a reconstructed equal-weight universe basket is survivor-conditioned by the same '
  + 'bias QDR-15 haircuts at -0.16 Sharpe and may never be a DECLARED benchmark';
/** Printed beside the binding max-DD p95 whenever the sensitivity disclosure is present. */
export const QDR19_PATH_LENGTH_SENSITIVITY_LINE =
  'max drawdown is a divergent extreme-value statistic: its p95 grows with path length by '
  + 'construction (~6.3pp per ln-unit measured), so window length alone can move a pass into a fail';

/** QDR-10 verbatim card copy. A BETA version may make no alpha claim anywhere. */
export const BETA_DSR_ANNOTATION = 'reported, not a gate; this version makes no edge claim';
/**
 * (c1-report), QDR-10 2026-08-06b verbatim. Captures are printed on every BETA card and gate
 * NOTHING: the convexity effect is real but too small to resolve inside a product horizon. Printing
 * the number while refusing to gate on it is the honest posture — the reader gets the evidence and
 * is told exactly what it cannot support. Arabic counterpart (owed in messages/*.json under
 * i18n-fintech-expert review; the terminal card is an operator artifact and stays English-only):
 * «نِسَب الالتقاط مُدرجة للشفافية وليست معيارًا للترقية؛ الأثر أصغر من أن يُقاس ضمن أفق المنتج»
 */
export const BETA_CAPTURE_REPORT_ANNOTATION =
  'capture convexity is reported for transparency and is not a promotion criterion; the effect is '
  + 'too small to resolve inside a product horizon (measured: ≤44% power at 10.3 years)';
export const BETA_NO_EDGE_DISCLAIMER =
  'ACCEPTED_BETA has NOT been shown to have an edge: it delivers market exposure within a declared '
  + 'volatility band, with bounded drawdown, no shortfall against its own delivered beta, and honest costs.';
export const BETA_NEGATIVE_WINDOW_LINE = 'delivered a negative return over the tested window; the benchmark did too';
// Arabic counterparts live with the UI copy (messages/*.json) and are gated by i18n-fintech-expert
// review per QDR-10; the terminal card is an operator artifact and stays English-only, as today.
export type ShariaValidationState =
  | 'VERIFIED_COMPLIANT'
  | 'VERIFIED_NON_COMPLIANT'
  | 'UNSCREENED_EXECUTION_BLOCKED'
  | 'UNVERIFIED';
export type RejectionReasonCode =
  | 'INSUFFICIENT_SAMPLE'
  | 'OOS_FAILURE'
  | 'DSR_FAILURE'
  | 'DRAWDOWN_RISK_FAILURE'
  | 'IMPLAUSIBLE_RESULT'
  | 'NO_PROFIT_PLATEAU_OVERFIT'
  | 'SHARIA_NON_COMPLIANT'
  | 'SHARIA_UNVERIFIABLE'
  | 'DATA_QUALITY_PIT_FAILURE'
  | 'REPRODUCIBILITY_FAILURE';

export interface PromotionChecklist {
  walkForward: boolean;
  oosHoldoutPct: number; // fraction reserved out-of-sample
  oosHoldoutOk: boolean; // ≥ 0.20
  enoughTrades: boolean; // ≥ 100
  deflatedSharpeOk: boolean; // DSR > 0.95
  profitPlateau: boolean; // parameter robustness (evaluated upstream; false until proven)
  mcMaxDDWithinBreaker: boolean; // MC maxDD p95 ≤ drawdown breaker
  mcRiskOfRuinWithinLimit: boolean;
  dataQualityPitOk: boolean;
  reproducible: boolean;
}

export interface ReportCard {
  setup: string;
  symbols: string[];
  /** Resolved universe tag: 'halal' | 'wide' | 'custom:N-symbols' | 'fixed'. */
  universe: string;
  /** Period preset the run resolved to: 'FULL' | '3Y' | '2Y' | '1Y' | 'CUSTOM'. */
  periodPreset: string;
  from: string;
  to: string;
  dataFeed: DataFeed;
  seed: number;
  gitSha: string;
  full: BacktestMetrics;
  oos: BacktestMetrics;
  distribution: DailyReturnDistribution;
  bootstrap: BootstrapResult;
  /** QDR-16: optional non-binding IID view of the same curve; never read by a gate. */
  bootstrapDisclosure?: BootstrapResult;
  permutation: PermutationResult;
  kellyFraction: number;
  kellyClampedQty: number;
  checklist: PromotionChecklist;
  implausible: boolean;
  shariaState: ShariaValidationState;
  status: TerminalValidationStatus;
  rejectionReasonCodes: RejectionReasonCode[];
  acceptanceMeaning: AcceptanceMeaning;
  riskOfRuinLimit: number;
  trialCount?: TrialCountEvidence;
  /** QDR-10 class this version was SEALED as; absent input resolves to 'ALPHA' (strictest). */
  productClass: ProductClass;
  /** DIVERSIFICATION only: which of D1/D2/plateau failed. Empty array = all three passed. */
  diversificationCriterionFailures?: DiversificationCriterionCode[];
  diversificationSummary?: DiversificationCriteriaResult;
  /** DIVERSIFICATION only: the sealed p95 drawdown prediction exceeded the breaker, so the card
   * carries the predicted-rejection line and may not be described as a candidate for admission. */
  predictedBreakerFailure?: boolean;
  /** BETA only: which of the three promotion criteria failed. Empty array = all three passed. */
  betaCriterionFailures?: BetaCriterionCode[];
  betaSummary?: BetaCriteriaResult;
  /** QDR-19 mandatory published evidence. Reported only — no gate, no reason code, ever. */
  benchmarkEvidence?: BenchmarkEvidence;
  pathShapeEvidence?: PathShapeEvidence;
}

export interface AssembleArgs {
  setup: string;
  symbols: string[];
  /** Resolved universe tag ('halal' | 'wide' | 'custom:N-symbols' | 'fixed'); defaults to 'custom'. */
  universe?: string;
  /** Period preset ('FULL' | '3Y' | '2Y' | '1Y' | 'CUSTOM'); defaults to 'CUSTOM'. */
  periodPreset?: string;
  from: string;
  to: string;
  dataFeed: DataFeed;
  seed: number;
  gitSha: string;
  full: BacktestMetrics;
  oos: BacktestMetrics;
  distribution: DailyReturnDistribution;
  bootstrap: BootstrapResult;
  /** Non-binding IID disclosure paired with the binding moving-block result. */
  bootstrapDisclosure?: BootstrapResult;
  permutation: PermutationResult;
  kellyFraction: number;
  kellyClampedQty: number;
  oosFraction: number;
  drawdownBreakerPct: number;
  maxRiskOfRuin?: number;
  walkForward?: boolean;
  profitPlateau?: boolean;
  shariaState?: ShariaValidationState;
  dataQualityPitOk?: boolean;
  reproducible?: boolean;
  trialCount?: TrialCountEvidence;
  /** QDR-10: absent ⇒ 'ALPHA'. Read from the SEALED config by the caller, never chosen at runtime. */
  productClass?: ProductClass;
  /**
   * BETA evidence for the three promotion criteria. A BETA card WITHOUT it fails closed: all three
   * criteria are recorded as failed rather than silently passing an unevaluated gate.
   */
  betaEvidence?: BetaCriteriaInput;
  /**
   * QDR-11 DIVERSIFICATION evidence for D1, D2 and plateau stability. A DIVERSIFICATION card
   * WITHOUT it fails closed on all three, exactly as BETA does — an unevaluated gate never passes.
   */
  diversificationEvidence?: DiversificationCriteriaInput;
  /** Sealed `hypothesizedMonteCarloP95Drawdown` above the breaker; forces the disclosure line. */
  predictedBreakerFailure?: boolean;
  /**
   * QDR-19 BENCHMARK block: benchmark id and source, matched-date benchmark CAGR/vol/Sharpe/maxDD/
   * Ulcer, active return, tracking error, IR, the IR t-statistic and `psrVsBenchmark`. Optional at
   * this layer ONLY because assembling it needs a matched-date benchmark curve the caller owns; it
   * can never alter `checklist` or `rejectionReasonCodes`, whatever it contains.
   */
  benchmarkEvidence?: BenchmarkEvidence;
  /** QDR-19 PATH-SHAPE block: Ulcer, time underwater, CVaR(5%), Martin, bootstrap Ulcer p50/p95
   * and the max-DD path-length sensitivity disclosure. Same reported-never-gated status. */
  pathShapeEvidence?: PathShapeEvidence;
}

export function assembleReportCard(a: AssembleArgs): ReportCard {
  const enoughTrades = a.full.trades >= MIN_TRADES_FOR_VALIDATION;
  const mcMaxDDWithinBreaker = a.bootstrap.maxDrawdown.p95 <= a.drawdownBreakerPct;
  const riskOfRuinLimit = a.maxRiskOfRuin ?? DEFAULT_MAX_RISK_OF_RUIN;
  if (!Number.isFinite(riskOfRuinLimit) || riskOfRuinLimit < 0 || riskOfRuinLimit > 1) {
    throw new Error('maxRiskOfRuin must be a finite ratio between 0 and 1');
  }
  const mcRiskOfRuinWithinLimit = a.bootstrap.riskOfRuin <= riskOfRuinLimit;
  const checklist: PromotionChecklist = {
    walkForward: a.walkForward ?? false,
    oosHoldoutPct: a.oosFraction,
    oosHoldoutOk: a.oosFraction >= 0.2,
    enoughTrades,
    deflatedSharpeOk: a.oos.deflatedSharpe > 0.95,
    profitPlateau: a.profitPlateau ?? false,
    mcMaxDDWithinBreaker,
    mcRiskOfRuinWithinLimit,
    dataQualityPitOk: a.dataQualityPitOk ?? false,
    reproducible: a.reproducible ?? false,
  };
  const implausible = a.full.implausible || a.oos.implausible;
  const shariaState = a.shariaState ?? 'UNVERIFIED';
  // QDR-10: class is sealed, not chosen here; absence resolves to ALPHA, the strictest gate.
  const productClass: ProductClass = a.productClass ?? 'ALPHA';
  const isBeta = productClass === 'BETA';
  const isDiversification = productClass === 'DIVERSIFICATION';
  // A BETA card with no evidence fails closed on all three promotion criteria — never silently passes.
  const betaSummary = isBeta && a.betaEvidence ? evaluateBetaCriteria(a.betaEvidence) : undefined;
  const betaCriterionFailures: BetaCriterionCode[] | undefined = isBeta
    ? (betaSummary ? [...betaSummary.failures] : [...BETA_CRITERION_CODES])
    : undefined;
  // Same fail-closed rule for DIVERSIFICATION.
  const diversificationSummary = isDiversification && a.diversificationEvidence
    ? evaluateDiversificationCriteria(a.diversificationEvidence)
    : undefined;
  const diversificationCriterionFailures: DiversificationCriterionCode[] | undefined = isDiversification
    ? (diversificationSummary ? [...diversificationSummary.failures] : [...DIVERSIFICATION_CRITERION_CODES])
    : undefined;

  const rejectionReasonCodes: RejectionReasonCode[] = [];
  if (!enoughTrades) rejectionReasonCodes.push('INSUFFICIENT_SAMPLE');
  // (c3) the ABSOLUTE positive-CAGR demand does not apply to BETA — it is an alpha demand in
  // disguise; the beta-scaled shortfall test inside the criteria replaces it. Walk-forward and the
  // OOS holdout percentage are byte-identical for both classes.
  // (c3) is likewise an alpha demand for DIVERSIFICATION, and a class forbidden to claim a return
  // may not be gated on one: D1/D2/plateau replace it. QDR-7's ordered reason-code list is NOT
  // disturbed — a D1/D2/plateau failure emits the existing OOS_FAILURE.
  const oosFailure = isBeta || isDiversification
    ? !checklist.walkForward || !checklist.oosHoldoutOk
      || (betaCriterionFailures?.length ?? 0) > 0
      || (diversificationCriterionFailures?.length ?? 0) > 0
    : !checklist.walkForward || !checklist.oosHoldoutOk || a.oos.cagr <= 0;
  if (oosFailure) rejectionReasonCodes.push('OOS_FAILURE');
  // DSR is REPORTED for BETA and DIVERSIFICATION and is never a gate for either; deflatedSharpeOk
  // itself is untouched.
  if (!isBeta && !isDiversification && !checklist.deflatedSharpeOk) rejectionReasonCodes.push('DSR_FAILURE');
  if (!mcMaxDDWithinBreaker || !mcRiskOfRuinWithinLimit) rejectionReasonCodes.push('DRAWDOWN_RISK_FAILURE');
  if (implausible) rejectionReasonCodes.push('IMPLAUSIBLE_RESULT');
  if (!checklist.profitPlateau) rejectionReasonCodes.push('NO_PROFIT_PLATEAU_OVERFIT');
  if (shariaState === 'VERIFIED_NON_COMPLIANT') rejectionReasonCodes.push('SHARIA_NON_COMPLIANT');
  if (shariaState === 'UNSCREENED_EXECUTION_BLOCKED' || shariaState === 'UNVERIFIED') {
    rejectionReasonCodes.push('SHARIA_UNVERIFIABLE');
  }
  if (!checklist.dataQualityPitOk) rejectionReasonCodes.push('DATA_QUALITY_PIT_FAILURE');
  if (!checklist.reproducible) rejectionReasonCodes.push('REPRODUCIBILITY_FAILURE');
  const accepted = rejectionReasonCodes.length === 0;
  const status: TerminalValidationStatus = isDiversification
    ? (accepted ? 'ACCEPTED_DIVERSIFICATION' : 'REJECTED_DIVERSIFICATION')
    : isBeta
      ? (accepted ? 'ACCEPTED_BETA' : 'REJECTED_BETA')
      : (accepted ? 'ACCEPTED' : 'REJECTED');

  return {
    productClass,
    ...(betaCriterionFailures ? { betaCriterionFailures } : {}),
    ...(betaSummary ? { betaSummary } : {}),
    ...(diversificationCriterionFailures ? { diversificationCriterionFailures } : {}),
    ...(diversificationSummary ? { diversificationSummary } : {}),
    ...(a.predictedBreakerFailure ? { predictedBreakerFailure: true } : {}),
    setup: a.setup, symbols: a.symbols, universe: a.universe ?? 'custom',
    periodPreset: a.periodPreset ?? 'CUSTOM', from: a.from, to: a.to, dataFeed: a.dataFeed,
    seed: a.seed, gitSha: a.gitSha, full: a.full, oos: a.oos, distribution: a.distribution,
    bootstrap: a.bootstrap,
    ...(a.bootstrapDisclosure ? { bootstrapDisclosure: a.bootstrapDisclosure } : {}),
    permutation: a.permutation, kellyFraction: a.kellyFraction,
    kellyClampedQty: a.kellyClampedQty, checklist, implausible, shariaState, status,
    rejectionReasonCodes,
    // QDR-11: an ACCEPTED_DIVERSIFICATION version receives no capital, no allocation, no QDR-7
    // tournament entry and no AUTO_PAPER book — it admits the RULE, and a future version adopting
    // that rule must still earn its own ALPHA or BETA verdict on its own claim.
    acceptanceMeaning: isDiversification ? 'UNIVERSE_RULE_ADMISSION_ONLY' : 'AUTO_PAPER_ADMISSION_ONLY',
    riskOfRuinLimit,
    ...(a.trialCount ? { trialCount: a.trialCount } : {}),
    // QDR-19 reporting, spread LAST: purely additive, and absent input leaves the assembled card
    // byte-identical to the pre-QDR-19 object, key order included.
    ...(a.benchmarkEvidence ? { benchmarkEvidence: a.benchmarkEvidence } : {}),
    ...(a.pathShapeEvidence ? { pathShapeEvidence: a.pathShapeEvidence } : {}),
  };
}

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const yn = (b: boolean) => (b ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`);

/** Compact, colorized table. `color=false` yields plain text (for logs/CI diffing). */
export function renderReportCard(c: ReportCard, color = true): string {
  const paint = (s: string, code: string) => (color ? `${code}${s}${RESET}` : s);
  const L: string[] = [];
  L.push('════════════════════════════════════════════════════════════════');
  L.push(`  QDR-6 VALIDATION REPORT CARD — ${c.setup}`);
  const symbolsLine = c.symbols.length > 12
    ? `${c.symbols.slice(0, 12).join(', ')} … (+${c.symbols.length - 12} more)`
    : c.symbols.join(', ');
  L.push(`  ${symbolsLine}  |  ${c.from} → ${c.to}`);
  L.push(paint(`  universe=${c.universe}  periodPreset=${c.periodPreset}`, DIM));
  L.push(paint(`  dataFeed=${c.dataFeed}  seed=${c.seed}  gitSha=${c.gitSha}`, DIM));
  if (c.productClass === 'BETA') {
    L.push(paint('  productClass=BETA — risk-managed market exposure; this version makes no edge claim', YELLOW));
  }
  if (c.productClass === 'DIVERSIFICATION') {
    L.push(paint('  productClass=DIVERSIFICATION — a claim about BOOK STRUCTURE, not about returns', YELLOW));
  }
  if (c.periodPreset !== 'FULL' && c.periodPreset !== 'CUSTOM') {
    L.push(paint('  NOTE: shorter-preset run — EVIDENCE VIEW only; ACCEPTED verdicts bind to FULL period', YELLOW));
  }
  L.push('────────────────────────────────────────────────────────────────');
  L.push(`  Trades (full/OOS):    ${c.full.trades} / ${c.oos.trades}`);
  L.push(`  CAGR:                 ${pct(c.full.cagr)}   (OOS ${pct(c.oos.cagr)})`);
  L.push(`  Sharpe:               ${c.full.sharpe.toFixed(2)}   (OOS ${c.oos.sharpe.toFixed(2)})`);
  L.push(`  Deflated Sharpe:      ${c.full.deflatedSharpe.toFixed(3)}   (OOS ${c.oos.deflatedSharpe.toFixed(3)})`);
  if (c.productClass === 'BETA') L.push(paint(`                        ${BETA_DSR_ANNOTATION}`, YELLOW));
  if (c.productClass === 'DIVERSIFICATION') {
    // QDR-11: the treatment arm's DSR is printed under QDR-10's reported-not-a-gate annotation,
    // extended with the line that forbids the inter-arm comparison a reader would otherwise infer.
    L.push(paint(`                        ${BETA_DSR_ANNOTATION}`, YELLOW));
    L.push(paint(`                        ${DIVERSIFICATION_NO_RETURN_COMPARISON_LINE}`, YELLOW));
  }
  if (c.trialCount) {
    // QDR-9: the trial count is the single most consequential input to the DSR verdict, so the tier
    // that produced it — and, when EXPLORATORY, exactly which structural conditions went unproved —
    // must be readable off the card. No threshold or reason code depends on these lines.
    const t = c.trialCount;
    const confirmatory = t.tier === 'CONFIRMATORY';
    const label = confirmatory ? 'confirmatory' : 'family-wide';
    L.push(`  DSR trial count:      ${t.familyTrials} ${label} (${t.plateauTrials} local plateau; ${t.method})`);
    L.push(paint(confirmatory
      ? `  DSR trial tier:       CONFIRMATORY N=1 — all 6 structural conditions proved; exploratory fallback ${t.exploratoryFamilyTrials}`
      : `  DSR trial tier:       EXPLORATORY (fail-closed) — unproved: ${t.confirmatoryFailures.join(', ') || 'none recorded'}`,
    DIM));
  }
  L.push(`  Max Drawdown:         ${pct(c.full.maxDrawdown)}   Hit-rate: ${pct(c.full.hitRate)}`);
  L.push('──── measured daily-return distribution (no promised returns) ────');
  L.push(`  Days observed:        ${c.distribution.count}`);
  L.push(`  Mean / Std (daily):   ${pct(c.distribution.mean)} / ${pct(c.distribution.std)}`);
  L.push(`  ${paint(`P(day ≥ +5%): ${pct(c.distribution.probDayGe5pct)}`, YELLOW)}   ${paint(`P(day ≤ −5%): ${pct(c.distribution.probDayLe5pct)}`, YELLOW)}`);
  L.push('──── Monte Carlo gate (seeded) ────');
  const bootstrapUnits = c.bootstrap.observationUnit === 'book-day' ? 'book-days' : 'trades';
  const bootstrapMethod = c.bootstrap.method ?? 'iid-legacy-unspecified';
  const blockLabel = c.bootstrap.blockLength ? `; block length=${c.bootstrap.blockLength}` : '';
  L.push(`  Bootstrap method:     ${bootstrapMethod}${blockLabel}`);
  L.push(`  Bootstrap resamples:  ${c.bootstrap.resamples}  (${c.bootstrap.tradesPerPath} ${bootstrapUnits}/path)`);
  L.push(`  Max DD p5/p50/p95:    ${pct(c.bootstrap.maxDrawdown.p5)} / ${pct(c.bootstrap.maxDrawdown.p50)} / ${pct(c.bootstrap.maxDrawdown.p95)}`);
  if (c.bootstrapDisclosure) {
    L.push(paint(`  Non-binding IID p95: ${pct(c.bootstrapDisclosure.maxDrawdown.p95)} (same curve/seed/resamples; no gate effect)`, YELLOW));
  }
  // QDR-19(B2): the mandatory path-length sensitivity disclosure sits beside the BINDING p95 above.
  // The binding figure is the one at `binding: true`; every other length is context.
  const sensitivity = c.pathShapeEvidence?.maxDrawdownPathLengthSensitivity;
  if (sensitivity?.length) {
    L.push(`  Max DD p95 by length: ${sensitivity.map((s) => `${s.pathLength}:${pct(s.p95)}`).join('  ')}`);
    L.push(paint(`                        ${QDR19_PATH_LENGTH_SENSITIVITY_LINE}`, YELLOW));
  }
  if (c.bootstrap.ulcerIndex) {
    L.push(`  Bootstrap Ulcer p50/p95: ${pct(c.bootstrap.ulcerIndex.p50)} / ${pct(c.bootstrap.ulcerIndex.p95)}`);
  }
  L.push(`  Risk of ruin:         ${pct(c.bootstrap.riskOfRuin)} (limit ${pct(c.riskOfRuinLimit)})`);
  L.push(`  Sign-permutation p:   ${c.permutation.pValue.toFixed(3)}  (observed mean ${pct(c.permutation.observedMean)}; method=${c.permutation.method ?? 'sign-flip-legacy-unspecified'})`);
  L.push(`  Kelly fraction:       ${c.kellyFraction.toFixed(4)}  → clamped qty ${c.kellyClampedQty.toFixed(4)}`);
  if (c.productClass === 'BETA') {
    L.push('──── QDR-10 BETA criteria (this class is NOT gated on the alpha DSR test) ────');
    const s = c.betaSummary;
    if (s) {
      L.push(`  Volatility band:      realized ${pct(s.realizedAnnualVolatility)} (95% bounds ${pct(s.volatilityLowerBound95)} … ${pct(s.volatilityUpperBound95)})`);
      L.push(`  Vol half-windows:     95% upper bounds ${s.halfWindowUpperBounds95.map(pct).join(' / ')}`);
      L.push(`  Capture up/down:      ${s.upCapture.toFixed(3)} / ${s.downCapture.toFixed(3)}  (down/up ${s.captureRatio.toFixed(3)})`);
      L.push(paint(`                        ${BETA_CAPTURE_REPORT_ANNOTATION}`, YELLOW));
      L.push(`  Beta-scaled floor:    OOS CAGR ${pct(c.oos.cagr)} vs required ${pct(s.requiredCagr)}`);
      L.push(`  Cost envelope:        turnover ${(s.turnoverRatio * 100).toFixed(1)}% of assumption; drag ${s.costDragBps.toFixed(1)} bps/yr`);
      if (s.negativeWindowWithNegativeBenchmark) L.push(paint(`  ${BETA_NEGATIVE_WINDOW_LINE}`, YELLOW));
    } else {
      L.push(paint('  BETA evidence MISSING — every criterion fails closed', RED));
    }
    const failures = c.betaCriterionFailures ?? [];
    L.push(`  Criteria:             ${BETA_CRITERION_CODES.map((code) => `${code}:${yn(!failures.includes(code))}`).join('  ')}`);
    L.push(paint(`  ${BETA_NO_EDGE_DISCLAIMER}`, YELLOW));
  }
  if (c.productClass === 'DIVERSIFICATION') {
    L.push('──── QDR-11 DIVERSIFICATION criteria (comparative; NO return claim is permitted) ────');
    const d = c.diversificationSummary;
    if (d) {
      L.push(`  Comparator arm:       incumbent rule, re-run at the SAME formation dates`);
      L.push(`  (D1) effective bets:  mean ratio ${d.meanEffectiveBetsRatio.toFixed(3)} over ${d.cycleRatios.length} cycle(s); worst cycle ${d.minCycleEffectiveBetsRatio.toFixed(3)}`);
      L.push(`  (D2) book volatility: ${pct(d.comparatorAnnualVolatility)} → ${pct(d.treatmentAnnualVolatility)}  (reduction ${pct(d.volatilityReduction)})`);
      L.push(`       paired bootstrap: 95% upper bound on σ_B/σ_A = ${d.volatilityRatioUpperBound95.toFixed(4)}`);
      L.push(`  Plateau stability:    worst cell mean ratio ${d.plateauMinEffectiveBetsRatio.toFixed(3)}`
        + (d.failingPlateauCells.length ? `  (failing: ${d.failingPlateauCells.join(', ')})` : ''));
      if (d.meanFormationCorrelation !== null) {
        L.push(`  Formation ρ (mean):   ${d.meanFormationCorrelation.toFixed(3)}`);
        L.push(paint(`                        ${DIVERSIFICATION_FORMATION_RHO_ANNOTATION}`, DIM));
      }
      // THE MIRROR OBLIGATION — both arms' CAGR and the difference, always, with the annotation
      // that keeps disclosure from becoming a claim. Omission would be a claim by silence.
      L.push(`  Both arms' CAGR:      comparator ${pct(d.comparatorCagr)}  treatment ${pct(d.treatmentCagr)}`);
      L.push(`  Difference:           ${pct(d.cagrDifference)} (treatment − comparator)`);
      L.push(paint(`  ${DIVERSIFICATION_CAGR_DISCLOSURE_LINE}`, YELLOW));
    } else {
      L.push(paint('  DIVERSIFICATION evidence MISSING — every criterion fails closed', RED));
    }
    const dFailures = c.diversificationCriterionFailures ?? [];
    L.push(`  Criteria:             ${DIVERSIFICATION_CRITERION_CODES.map((code) => `${code}:${yn(!dFailures.includes(code))}`).join('  ')}`);
    if (c.predictedBreakerFailure) L.push(paint(`  ${DIVERSIFICATION_PREDICTED_REJECTION_LINE}`, RED));
    L.push(paint(`  ${DIVERSIFICATION_ACCEPT_MEANING_LINE}`, YELLOW));
  }
  // ──── QDR-19 mandatory published evidence. Both blocks are additive and gate NOTHING; when the
  // caller supplies no evidence the rendered card is byte-identical to the pre-QDR-19 output.
  if (c.pathShapeEvidence) {
    const ps = c.pathShapeEvidence;
    L.push('──── QDR-19 PATH SHAPE (published evidence; NOTHING here is a gate) ────');
    L.push(`  Ulcer Index:          ${(ps.ulcerIndex * 100).toFixed(2)}   Martin (CAGR/UI): ${ps.martinRatio.toFixed(3)}`);
    L.push(`  Time underwater:      ${pct(ps.timeUnderwater)}  (drawdown floor ${pct(ps.underwaterThreshold)})`);
    L.push(`  CVaR(${(ps.cvarAlpha * 100).toFixed(0)}%):             ${pct(ps.conditionalValueAtRisk)} per period   Sortino: ${ps.sortinoRatio.toFixed(3)}`);
    if (ps.bootstrapUlcer) {
      L.push(`  Bootstrap UI p50/p95: ${(ps.bootstrapUlcer.p50 * 100).toFixed(2)} / ${(ps.bootstrapUlcer.p95 * 100).toFixed(2)}`);
    }
    L.push(paint(`                        ${QDR19_REPORTED_NEVER_GATED_ANNOTATION}`, YELLOW));
  }
  if (c.benchmarkEvidence) {
    const b = c.benchmarkEvidence;
    L.push('──── QDR-19 BENCHMARK (published evidence; the IR is NOT a pass/fail gate) ────');
    L.push(`  Benchmark:            ${b.benchmarkId}  (${b.benchmarkSource})`);
    if (!b.declarable) L.push(paint(`                        ${QDR19_NON_DECLARABLE_BENCHMARK_LINE}`, YELLOW));
    L.push(`  Matched dates:        ${b.matchedObservations} observations (${b.years.toFixed(3)} yr)`);
    L.push(`  Benchmark CAGR/vol:   ${pct(b.benchmark.cagr)} / ${pct(b.benchmark.annualVolatility)}`
      + `   Sharpe ${b.benchmark.sharpe.toFixed(3)}`);
    L.push(`  Benchmark maxDD/UI:   ${pct(b.benchmark.maxDrawdown)} / ${(b.benchmark.ulcerIndex * 100).toFixed(2)}`
      + `   Martin ${b.benchmark.martinRatio.toFixed(3)}`);
    L.push(`  Active return:        ${pct(b.activeReturn)}/yr arithmetic  (CAGR difference ${pct(b.activeCagr)})`);
    L.push(`  Tracking error:       ${pct(b.trackingError)}   Information Ratio ${b.informationRatio.toFixed(3)}`);
    L.push(`  IR t-stat:            ${b.informationRatioTStat.toFixed(3)}  (one-sided p ${b.informationRatioPValue.toFixed(4)})`);
    L.push(`  PSR vs benchmark:     ${b.psrVsBenchmark.toFixed(4)}  (SR* = benchmark matched-date annualized Sharpe)`);
    L.push(paint(`                        ${QDR19_REPORTED_NEVER_GATED_ANNOTATION}`, YELLOW));
  }
  L.push('──── promotion checklist (all required) ────');
  L.push(`  walk-forward:${yn(c.checklist.walkForward)}  OOS≥20% (${pct(c.checklist.oosHoldoutPct)}):${yn(c.checklist.oosHoldoutOk)}  trades≥100:${yn(c.checklist.enoughTrades)}`);
  L.push(`  deflated-Sharpe:${yn(c.checklist.deflatedSharpeOk)}  profit-plateau:${yn(c.checklist.profitPlateau)}  MC-maxDD≤breaker:${yn(c.checklist.mcMaxDDWithinBreaker)}`);
  L.push(`  MC-risk-of-ruin≤limit:${yn(c.checklist.mcRiskOfRuinWithinLimit)}`);
  L.push(`  data/PIT integrity:${yn(c.checklist.dataQualityPitOk)}  reproducible clean run:${yn(c.checklist.reproducible)}`);
  L.push('────────────────────────────────────────────────────────────────');
  if (c.implausible) {
    L.push(paint('  ⚠ IMPLAUSIBLE: Sharpe > 3 or daily claim ≥ 3σ — treat as overfit/bug', RED));
  }
  L.push(`  Sharia state:         ${c.shariaState}`);
  L.push(paint(`  STATUS: ${c.status}`, c.status.startsWith('ACCEPTED') ? GREEN : RED));
  L.push(`  Rejection reasons:    ${c.rejectionReasonCodes.length ? c.rejectionReasonCodes.join(', ') : 'none'}`);
  L.push(c.acceptanceMeaning === 'UNIVERSE_RULE_ADMISSION_ONLY'
    ? '  ACCEPTED = admission of the UNIVERSE-SELECTION RULE only; no capital, no allocation, no paper book.'
    : '  ACCEPTED = admission to AUTO_PAPER only; no profit promise or AUTO_REAL permission.');
  L.push('════════════════════════════════════════════════════════════════');
  return L.join('\n');
}
