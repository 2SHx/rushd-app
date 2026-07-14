// tom-overlay — observed-session turn-of-month seasonality on the SPUS proxy.
// Calendar membership is inferred from SPUS timestamps: a missing bar cannot be distinguished from
// a market holiday. Prices never influence eligibility, and incomplete boundaries fail closed.
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const TOM_OVERLAY_UNIVERSE: readonly string[] = Object.freeze(['SPUS']);

export const TomOverlayParamsSchema = z.object({
  version: z.literal('v1'),
  lastSessions: z.number().int().positive(),
  firstSessions: z.number().int().positive(),
  validationTrials: z.literal(9),
});
export type TomOverlayParams = z.infer<typeof TomOverlayParamsSchema>;

export const TOM_OVERLAY_V1: TomOverlayParams = Object.freeze({
  version: 'v1',
  lastSessions: 4,
  firstSessions: 3,
  validationTrials: 9,
});

export function tomOverlayBookPolicy(): StrategyBookPolicy {
  return { maxGrossFraction: 0.25, maxOpenPositions: 1 };
}

let SESSION_TIMES: readonly number[] | null = null;
let ELIGIBILITY_CACHE = new Map<string, ReadonlySet<number>>();

function monthKey(time: number): string {
  const ts = new Date(time);
  return `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isFollowingMonth(left: number, right: number): boolean {
  const a = new Date(left);
  const b = new Date(right);
  return b.getUTCFullYear() * 12 + b.getUTCMonth() === a.getUTCFullYear() * 12 + a.getUTCMonth() + 1;
}

/** Pure observed-calendar builder; only timestamps determine membership. */
export function buildTomEligibility(
  timestamps: readonly Date[],
  lastSessions: number,
  firstSessions: number,
): ReadonlySet<number> {
  if (!Number.isInteger(lastSessions) || lastSessions <= 0 || !Number.isInteger(firstSessions) || firstSessions <= 0) {
    throw new Error('TOM session counts must be positive integers');
  }
  const months: { firstTime: number; times: number[] }[] = [];
  let previous = Number.NEGATIVE_INFINITY;
  for (const ts of timestamps) {
    const time = ts.getTime();
    if (!Number.isFinite(time) || time <= previous) throw new Error('TOM timestamps must be chronological and unique');
    previous = time;
    const key = monthKey(time);
    const last = months.at(-1);
    if (!last || monthKey(last.firstTime) !== key) months.push({ firstTime: time, times: [time] });
    else last.times.push(time);
  }

  const eligible = new Set<number>();
  for (let index = 0; index < months.length - 1; index++) {
    const current = months[index];
    const next = months[index + 1];
    if (!isFollowingMonth(current.firstTime, next.firstTime)) continue;
    // Require the next month's fourth observed session as an executable exit fill; a truncated
    // terminal month must not create exposure that this sample cannot close.
    if (current.times.length < lastSessions || next.times.length <= firstSessions) continue;
    for (const time of current.times.slice(-lastSessions)) eligible.add(time);
    for (const time of next.times.slice(0, firstSessions)) eligible.add(time);
  }
  return eligible;
}

function configureUniverse(input: UniversePrepareInput): void {
  const keys = Array.from(input.closesBySymbol.keys());
  if (input.symbols.length !== 1 || input.symbols[0] !== 'SPUS' || keys.length !== 1 || keys[0] !== 'SPUS') {
    throw new Error('tom-overlay requires its exact SPUS universe');
  }
  let previous = Number.NEGATIVE_INFINITY;
  const times = input.closesBySymbol.get('SPUS')!.map(({ ts, close }) => {
    const time = ts.getTime();
    if (!Number.isFinite(time) || time <= previous || !Number.isFinite(close) || close <= 0) {
      throw new Error('invalid chronological positive close history for SPUS');
    }
    previous = time;
    return time;
  });
  SESSION_TIMES = Object.freeze(times);
  ELIGIBILITY_CACHE = new Map();
}

function paramsOrDefault(params?: TomOverlayParams): TomOverlayParams {
  return TomOverlayParamsSchema.parse(params ?? TOM_OVERLAY_V1);
}

function eligibility(params: TomOverlayParams): ReadonlySet<number> {
  if (!SESSION_TIMES) throw new Error('tom-overlay requires prepareUniverse before evaluation');
  const key = `${params.lastSessions}|${params.firstSessions}`;
  const cached = ELIGIBILITY_CACHE.get(key);
  if (cached) return cached;
  const built = buildTomEligibility(SESSION_TIMES.map((time) => new Date(time)), params.lastSessions, params.firstSessions);
  ELIGIBILITY_CACHE.set(key, built);
  return built;
}

function evidence(ref: string, value: string | number): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function scheduleEvidence(params: TomOverlayParams, nextTime: number | null): Evidence[] {
  return [
    evidence('params_version', params.version),
    evidence('last_sessions', params.lastSessions),
    evidence('first_sessions', params.firstSessions),
    evidence('next_observed_session', nextTime === null ? 'unavailable' : new Date(nextTime).toISOString()),
    evidence('calendar_basis', 'observed_SPUS_sessions_missing_bar_indistinguishable_from_holiday'),
    evidence('aaoifi_status', 'SPUS_proxy_unscreened_execution_blocked'),
  ];
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[] = []): StrategyCheck {
  return { matched, reasons, evidence: evidenceItems };
}

function sessionPair(asOf: Date): { current: number; next: number | null } | null {
  if (!SESSION_TIMES) throw new Error('tom-overlay requires prepareUniverse before evaluation');
  const current = asOf.getTime();
  const index = SESSION_TIMES.indexOf(current);
  return index < 0 ? null : { current, next: SESSION_TIMES[index + 1] ?? null };
}

function validateContext(ctx: Parameters<StrategySetup<TomOverlayParams>['screen']>[0]): StrategyCheck | null {
  assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
  if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq']);
  if (ctx.symbol !== 'SPUS') return check(false, ['outside_declared_universe']);
  if (!sessionPair(ctx.asOf)) return check(false, ['session_not_in_prepared_spine']);
  return null;
}

export const tomOverlaySetup: StrategySetup<TomOverlayParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'tom-overlay',
  version: 'v1',
  cadence: 'daily',
  // Owns the fixed single-name SPUS observed-session book; a --universe/--symbols override is rejected.
  universeCompatibility: 'fixed',
  defaultParams: TOM_OVERLAY_V1,

  prepareUniverse(input) {
    configureUniverse(input);
  },

  plateauNeighborhood(params): PlateauNeighborhood<TomOverlayParams> {
    const center = paramsOrDefault(params);
    const neighbors = [3, 4, 5].flatMap((lastSessions) => [2, 3, 4].flatMap((firstSessions) => (
      lastSessions === center.lastSessions && firstSessions === center.firstSessions
        ? []
        : [{
          label: `lastSessions=${lastSessions}|firstSessions=${firstSessions}`,
          params: { ...center, lastSessions, firstSessions },
        }]
    )));
    return { axes: ['lastSessions', 'firstSessions'], center, neighbors };
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    const invalid = validateContext(ctx);
    if (invalid) return invalid;
    const pair = sessionPair(ctx.asOf)!;
    return check(true, [], scheduleEvidence(p, pair.next));
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const pair = sessionPair(ctx.asOf)!;
    if (pair.next === null) return check(false, ['next_session_unavailable'], screened.evidence);
    const eligible = eligibility(p);
    const matched = !eligible.has(pair.current) && eligible.has(pair.next);
    return check(matched, matched ? ['enter_next_open_before_tom_window'] : ['outside_tom_entry_boundary'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    const invalid = validateContext(ctx);
    if (invalid) return invalid;
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position']);
    const pair = sessionPair(ctx.asOf)!;
    const proof = scheduleEvidence(p, pair.next);
    if (pair.next === null) return check(false, ['next_session_unavailable'], proof);
    const eligible = eligibility(p);
    const matched = !eligible.has(pair.next);
    return check(matched, matched ? ['exit_or_retry_next_open_outside_tom'] : ['hold_tom_window'], proof);
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const exit = this.exit(ctx, p);
    const entry = exit.matched ? check(false, []) : this.entry(ctx, p);
    const stance: Stance = exit.matched ? 'BEARISH' : entry.matched ? 'BULLISH' : 'NEUTRAL';
    const active = exit.matched ? exit : entry;
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: p.lastSessions + p.firstSessions,
      rationaleEn: `${this.id} ${p.version}: ${stance}; candidate and research-only. SPUS is an AAOIFI-unscreened proxy; execution blocked, never halal-certified.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ مرشح وللبحث فقط. صندوق SPUS وكيل غير مفحوص وفق أيوفي؛ لذا يحظر التنفيذ ولا يُعتمد حلالاً.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
