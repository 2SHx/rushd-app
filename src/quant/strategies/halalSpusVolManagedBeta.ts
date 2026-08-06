// Forward-only SPUS volatility-managed beta v1. Return ratios/volatility are plain numbers at the
// statistics boundary; prices, holdings, and execution money remain Prisma.Decimal in the engine.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const HALAL_SPUS_VOL_MANAGED_BETA_ID = 'halal-spus-vol-managed-beta' as const;
export const HALAL_SPUS_VOL_MANAGED_BETA_UNIVERSE: readonly string[] = Object.freeze(['SPUS']);
export const HALAL_SPUS_FORWARD_START = '2026-08-07T20:00:00.000Z' as const;
export const HALAL_SPUS_FORWARD_FROM_DATE = '2026-08-08' as const;
/**
 * QDR-9 amendment (2026-08-06, before the forward window opens): the original 504-session / 100-
 * observation window had a provably EMPTY acceptance set — clearing DSR > 0.95 there needed an
 * annualized Sharpe of 3.13 while Sharpe > 3.00 trips the implausibility flag. The window is sized
 * by the power solver at the declared effect size (annualized Sharpe 0.80, confirmatory N = 1):
 * 216 non-overlapping five-session observations, i.e. 217 whole five-session blocks of sessions.
 * These constants are cross-checked against the sealed manifest in the test file — if the
 * preregistration moves and these do not, that test fails.
 */
export const HALAL_SPUS_MIN_FORWARD_SESSIONS = 1085;
export const HALAL_SPUS_MIN_FIVE_SESSION_OBSERVATIONS = 216;
export const HALAL_SPUS_MANIFEST_CONFIG_HASH = 'e2f9fe4d20ce06b95002fffb6cf3979a96f1b514776f51b96d48b70665dd15c7' as const;

export const HalalSpusVolManagedBetaParamsSchema = z.object({
  version: z.literal('v1'),
  volatilityLookbackSessions: z.union([z.literal(21), z.literal(42), z.literal(63)]),
  targetAnnualVolatility: z.union([z.literal(0.08), z.literal(0.10), z.literal(0.12)]),
  validationTrials: z.literal(108),
});
export type HalalSpusVolManagedBetaParams = z.infer<typeof HalalSpusVolManagedBetaParamsSchema>;

export const HALAL_SPUS_VOL_MANAGED_BETA_V1: HalalSpusVolManagedBetaParams = Object.freeze({
  version: 'v1',
  volatilityLookbackSessions: 42,
  targetAnnualVolatility: 0.10,
  validationTrials: 108,
});

interface PreparedState {
  readonly sessionTimes: readonly number[];
}

let UNSCOPED_STATE: PreparedState | null = null;
const SCOPED_STATES = new WeakMap<object, PreparedState>();

function paramsOrDefault(params?: HalalSpusVolManagedBetaParams): HalalSpusVolManagedBetaParams {
  return HalalSpusVolManagedBetaParamsSchema.parse(params ?? HALAL_SPUS_VOL_MANAGED_BETA_V1);
}

function configureUniverse(input: UniversePrepareInput): void {
  if (input.symbols.length !== 1 || input.symbols[0] !== 'SPUS' || input.closesBySymbol.size !== 1) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires the exact SPUS universe`);
  }
  const rows = input.closesBySymbol.get('SPUS');
  if (!rows?.length) throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires observed SPUS sessions`);
  let previous = Number.NEGATIVE_INFINITY;
  const sessionTimes = rows.map((row) => {
    const time = row.ts.getTime();
    if (!Number.isFinite(time) || time <= previous || !Number.isFinite(row.close) || row.close <= 0) {
      throw new Error('SPUS session spine must be positive, chronological, and unique');
    }
    previous = time;
    return time;
  });
  const state = { sessionTimes };
  if (input.replayScope) SCOPED_STATES.set(input.replayScope, state);
  else UNSCOPED_STATE = state;
}

function preparedState(replayScope?: object): PreparedState {
  const state = replayScope ? SCOPED_STATES.get(replayScope) ?? null : UNSCOPED_STATE;
  if (!state) throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires prepareUniverse before evaluation`);
  return state;
}

/** Population-stdev annualized volatility over exactly the trailing close-to-close log returns. */
export function annualizedPopulationLogVolatility(
  closes: readonly number[],
  lookbackSessions: number,
): number | null {
  if (!Number.isInteger(lookbackSessions) || lookbackSessions <= 0 || closes.length < lookbackSessions + 1) {
    return null;
  }
  const window = closes.slice(-(lookbackSessions + 1));
  if (!window.every((close) => Number.isFinite(close) && close > 0)) return null;
  const returns = window.slice(1).map((close, index) => Math.log(close / window[index]));
  const mean = returns.reduce((sum, value) => sum + value, 0) / lookbackSessions;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / lookbackSessions;
  const annualized = Math.sqrt(variance) * Math.sqrt(252);
  return Number.isFinite(annualized) && annualized > 0 ? annualized : null;
}

interface WeightDecision {
  readonly scheduled: boolean;
  readonly realizedAnnualVolatility: number | null;
  readonly targetWeight: number | null;
}

function weightDecision(
  ctx: StrategyPointInTimeContext,
  params: HalalSpusVolManagedBetaParams,
): WeightDecision {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  if (ctx.market !== 'NASDAQ' || ctx.symbol !== 'SPUS') {
    return { scheduled: true, realizedAnnualVolatility: null, targetWeight: 0 };
  }
  const state = preparedState(ctx.replayScope);
  const sessionIndex = state.sessionTimes.indexOf(ctx.asOf.getTime());
  if (sessionIndex < 0) return { scheduled: true, realizedAnnualVolatility: null, targetWeight: 0 };
  if ((sessionIndex + 1) % 5 !== 0) {
    return { scheduled: false, realizedAnnualVolatility: null, targetWeight: null };
  }
  const closes = ctx.bars.map((bar) => Number(bar.close.toString()));
  const realizedAnnualVolatility = annualizedPopulationLogVolatility(
    closes,
    params.volatilityLookbackSessions,
  );
  const targetWeight = realizedAnnualVolatility === null
    ? 0
    : Math.min(1, params.targetAnnualVolatility / realizedAnnualVolatility);
  return { scheduled: true, realizedAnnualVolatility, targetWeight };
}

function evidence(ref: string, value: string | number): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function decisionEvidence(
  params: HalalSpusVolManagedBetaParams,
  decision: WeightDecision,
): Evidence[] {
  return [
    evidence('params_version', params.version),
    evidence('decision_cadence', 'every_fifth_completed_SPUS_session'),
    evidence('volatility_estimator', 'population_stdev_close_to_close_log_returns_sqrt252'),
    evidence('volatility_lookback_sessions', params.volatilityLookbackSessions),
    evidence('target_annual_volatility', params.targetAnnualVolatility),
    evidence('realized_annual_volatility', decision.realizedAnnualVolatility?.toFixed(12) ?? 'unavailable'),
    evidence('target_weight', decision.targetWeight?.toFixed(12) ?? 'hold_between_rebalances'),
    evidence('reserve', 'non_interest_bearing_cash'),
    evidence('fund_sharia_status', 'point_in_time_verification_required'),
  ];
}

function check(matched: boolean, reasons: string[], items: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: items };
}

export function halalSpusVolManagedBetaBookPolicy(
  params?: HalalSpusVolManagedBetaParams,
): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxGrossFraction: 1,
    maxOpenPositions: 1,
    decisionHistoryBars: p.volatilityLookbackSessions + 1,
  };
}

export interface FiveSessionBookPoint {
  readonly ts: Date;
  readonly equity: number;
}

/** Non-overlapping five-session NAV returns; return ratios intentionally cross into plain numbers. */
export function nonOverlappingFiveSessionBookReturns(
  points: readonly FiveSessionBookPoint[],
): number[] {
  const ordered = [...points];
  for (let index = 0; index < ordered.length; index++) {
    if (!Number.isFinite(ordered[index].ts.getTime()) || !Number.isFinite(ordered[index].equity)
      || ordered[index].equity <= 0 || (index > 0 && ordered[index].ts <= ordered[index - 1].ts)) {
      throw new Error('Five-session book points must be positive, chronological, and unique');
    }
  }
  const returns: number[] = [];
  for (let start = 0; start + 5 < ordered.length; start += 5) {
    returns.push(ordered[start + 5].equity / ordered[start].equity - 1);
  }
  return returns;
}

/** The exact NAV points whose transitions define the frozen five-session inference unit. */
export function fiveSessionMetricCurve(
  points: readonly FiveSessionBookPoint[],
): FiveSessionBookPoint[] {
  // Reuse the validator so malformed points cannot enter DSR through this projection.
  nonOverlappingFiveSessionBookReturns(points);
  return points.filter((_, index) => index % 5 === 0);
}

/** OOS expectancy for the frozen inference unit; used identically by center and plateau neighbors. */
export function meanOosFiveSessionBookReturn(
  points: readonly FiveSessionBookPoint[],
  oosFraction: number,
): number {
  if (!Number.isFinite(oosFraction) || oosFraction <= 0 || oosFraction > 1) {
    throw new Error('five-session OOS fraction must be in (0,1]');
  }
  const returns = nonOverlappingFiveSessionBookReturns(points);
  const slice = returns.slice(Math.floor(returns.length * (1 - oosFraction)));
  return slice.length ? slice.reduce((sum, value) => sum + value, 0) / slice.length : 0;
}

export interface HalalSpusForwardRunGuardInput {
  readonly runMode: 'TERMINAL' | 'DIAGNOSTIC_NON_TERMINAL';
  readonly now: Date;
  readonly from?: string;
  readonly to?: string;
  readonly seed: number;
  readonly oosFraction: number;
  readonly completedSessions?: number;
  readonly fiveSessionObservations?: number;
}

/** Fail before simulation/result persistence unless the sealed forward-only evidence gate is met. */
export function assertHalalSpusForwardRunAllowed(input: HalalSpusForwardRunGuardInput): void {
  if (input.runMode === 'DIAGNOSTIC_NON_TERMINAL') {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} forbids diagnostic and historical performance inspection`);
  }
  if (input.seed !== 42 || input.oosFraction !== 1) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires frozen seed=42 and oosFraction=1`);
  }
  const nowTime = input.now.getTime();
  const forwardStart = Date.parse(HALAL_SPUS_FORWARD_START);
  if (!Number.isFinite(nowTime) || nowTime < forwardStart) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} forward evidence cannot start before ${HALAL_SPUS_FORWARD_START}`);
  }
  if (!input.from || !input.to || !/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires explicit forward-only --from/--to dates`);
  }
  const fromTime = Date.parse(`${input.from}T00:00:00.000Z`);
  const toTime = Date.parse(`${input.to}T23:59:59.999Z`);
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime) || fromTime > toTime
    || input.from !== HALAL_SPUS_FORWARD_FROM_DATE || fromTime <= forwardStart || toTime > nowTime) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} rejects historical, invalid, incomplete, or future windows`);
  }
  const hasSessions = input.completedSessions !== undefined;
  const hasObservations = input.fiveSessionObservations !== undefined;
  if (hasSessions !== hasObservations) throw new Error('Forward evidence counts must be supplied together');
  if (!hasSessions) return;
  if (!Number.isInteger(input.completedSessions) || input.completedSessions! < HALAL_SPUS_MIN_FORWARD_SESSIONS) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires at least ${HALAL_SPUS_MIN_FORWARD_SESSIONS} completed forward sessions`);
  }
  if (!Number.isInteger(input.fiveSessionObservations)
    || input.fiveSessionObservations! < HALAL_SPUS_MIN_FIVE_SESSION_OBSERVATIONS) {
    throw new Error(`${HALAL_SPUS_VOL_MANAGED_BETA_ID} requires at least ${HALAL_SPUS_MIN_FIVE_SESSION_OBSERVATIONS} non-overlapping five-session observations`);
  }
}

/**
 * This sealed version is deliberately CODIFIED-but-blocked. Remove this fence only in a separately
 * reviewed change that binds the exact manifest hash to QA_PASS/independent-ready state and verifies
 * immutable decision-time SPUS Sharia + fund-lifecycle receipts across the whole forward window.
 */
export function assertHalalSpusTerminalEvidenceReady(): never {
  throw new Error(
    `${HALAL_SPUS_VOL_MANAGED_BETA_ID} is blocked before simulation: sealed manifest ${HALAL_SPUS_MANIFEST_CONFIG_HASH} `
    + 'is not independently READY_TO_RUN and no immutable point-in-time SPUS Sharia/lifecycle evidence root is wired',
  );
}

export const halalSpusVolManagedBetaSetup: StrategySetup<HalalSpusVolManagedBetaParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: HALAL_SPUS_VOL_MANAGED_BETA_ID,
  version: 'v1',
  cadence: 'daily',
  universeCompatibility: 'fixed',
  defaultParams: HALAL_SPUS_VOL_MANAGED_BETA_V1,

  prepareUniverse(input) { configureUniverse(input); },

  plateauNeighborhood(params): PlateauNeighborhood<HalalSpusVolManagedBetaParams> {
    const center = paramsOrDefault(params);
    const neighbors = ([21, 42, 63] as const).flatMap((volatilityLookbackSessions) =>
      ([0.08, 0.10, 0.12] as const).flatMap((targetAnnualVolatility) => (
        volatilityLookbackSessions === center.volatilityLookbackSessions
          && targetAnnualVolatility === center.targetAnnualVolatility
          ? []
          : [{
            label: `volatilityLookbackSessions=${volatilityLookbackSessions}|targetAnnualVolatility=${targetAnnualVolatility}`,
            params: paramsOrDefault({ ...center, volatilityLookbackSessions, targetAnnualVolatility }),
          }]
      )),
    );
    return { axes: ['volatilityLookbackSessions', 'targetAnnualVolatility'], center, neighbors };
  },

  targetWeight(ctx, params) {
    return weightDecision(ctx, paramsOrDefault(params)).targetWeight;
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const decision = weightDecision(ctx, p);
    const reasons = !decision.scheduled
      ? ['hold_between_five_session_rebalances']
      : decision.realizedAnnualVolatility === null ? ['cash_insufficient_or_degenerate_volatility'] : [];
    return check(decision.scheduled, reasons, decisionEvidence(p, decision));
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const decision = weightDecision(ctx, p);
    const matched = decision.scheduled && (decision.targetWeight ?? 0) > 0 && ctx.positionQty.lte(0);
    return check(matched, matched ? [] : ['no_new_long_target'], decisionEvidence(p, decision));
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    const decision = weightDecision(ctx, p);
    const matched = decision.scheduled && decision.targetWeight === 0 && ctx.positionQty.gt(0);
    return check(matched, matched ? ['rebalance_to_cash'] : ['retain_or_resize_at_target'], decisionEvidence(p, decision));
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const decision = weightDecision(ctx, p);
    const stance: Stance = decision.targetWeight !== null && decision.targetWeight > 0
      ? 'BULLISH'
      : decision.targetWeight === 0 && ctx.positionQty.gt(0) ? 'BEARISH' : 'NEUTRAL';
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 5,
      rationaleEn: `${this.id} ${p.version}: ${stance}; deterministic forward-only volatility-managed SPUS research, with idle capital held as non-interest-bearing cash. Point-in-time fund Sharia status is required; not investment advice.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ بحث حتمي مستقبلي فقط لإدارة تقلب صندوق SPUS، مع الاحتفاظ برأس المال غير المستثمر نقداً دون عائد ربوي. يلزم تحقق شرعي للصندوق في حينه؛ وليست نصيحة استثمارية.`,
      evidence: decisionEvidence(p, decision),
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
