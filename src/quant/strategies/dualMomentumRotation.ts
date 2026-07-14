// dual-momentum-rotation — monthly long-only rotation over a fixed declared research sleeve.
// The setup ranks 12−1M relative momentum, then admits only the winner whose 12M absolute
// momentum is strictly positive. It is research-only: every name remains AAOIFI-unscreened and
// execution-blocked until a real screening source verifies the complete sleeve.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;

/** Fixed a-priori charter: both Sharia-index proxies plus the first five frozen research names. */
export const DUAL_MOMENTUM_UNIVERSE: readonly string[] = Object.freeze([
  'SPUS', 'HLAL', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN',
]);

export const DualMomentumRotationParamsSchema = z.object({
  version: z.literal('v1'),
  lookbackBars: z.number().int().positive(),
  skipRecentBars: z.number().int().nonnegative(),
  absoluteThreshold: z.number().finite(),
  validationTrials: z.literal(9),
});
export type DualMomentumRotationParams = z.infer<typeof DualMomentumRotationParamsSchema>;

export const DUAL_MOMENTUM_ROTATION_V1: DualMomentumRotationParams = Object.freeze({
  version: 'v1',
  lookbackBars: 252,
  skipRecentBars: 21,
  absoluteThreshold: 0,
  validationTrials: 9,
});

interface ClosePoint {
  readonly ts: Date;
  readonly close: number;
}

interface RotationDecision {
  readonly winner: string | null;
  readonly relative: number | null;
  readonly absolute: number | null;
  readonly reason: 'winner' | 'not_month_end' | 'incomplete_declared_universe' | 'absolute_not_above_threshold';
}

let CLOSES_BY_SYMBOL: ReadonlyMap<string, readonly ClosePoint[]> | null = null;
let MONTH_END_TIMES: ReadonlySet<number> = new Set();
let DECISION_CACHE = new Map<string, RotationDecision>();

function paramsOrDefault(params?: DualMomentumRotationParams): DualMomentumRotationParams {
  const parsed = DualMomentumRotationParamsSchema.parse(params ?? DUAL_MOMENTUM_ROTATION_V1);
  if (parsed.skipRecentBars >= parsed.lookbackBars) {
    throw new Error('skipRecentBars must be smaller than lookbackBars');
  }
  return parsed;
}

function evidence(ref: string, value: Prisma.Decimal | number | string): Evidence {
  return { kind: 'feature', ref, value: value instanceof D ? value.toString() : String(value) };
}

function check(matched: boolean, reasons: string[], evidenceItems: Evidence[]): StrategyCheck {
  return { matched, reasons, evidence: evidenceItems };
}

function monthKey(ts: Date): string {
  return `${ts.getUTCFullYear()}-${String(ts.getUTCMonth() + 1).padStart(2, '0')}`;
}

function exactDeclaredUniverse(symbols: readonly string[]): boolean {
  return symbols.length === DUAL_MOMENTUM_UNIVERSE.length
    && DUAL_MOMENTUM_UNIVERSE.every((symbol) => symbols.includes(symbol));
}

function configureUniverse(input: UniversePrepareInput): void {
  if (!exactDeclaredUniverse(input.symbols) || !exactDeclaredUniverse(Array.from(input.closesBySymbol.keys()))) {
    throw new Error('dual-momentum-rotation requires its exact declared universe');
  }

  const copied = new Map<string, readonly ClosePoint[]>();
  const monthEnds = new Map<string, number>();
  for (const symbol of DUAL_MOMENTUM_UNIVERSE) {
    const source = input.closesBySymbol.get(symbol)!;
    let previous = Number.NEGATIVE_INFINITY;
    const rows = source.map(({ ts, close }) => {
      const time = ts.getTime();
      if (!Number.isFinite(time) || time <= previous || !Number.isFinite(close) || close <= 0) {
        throw new Error(`invalid chronological close history for ${symbol}`);
      }
      previous = time;
      monthEnds.set(monthKey(ts), Math.max(monthEnds.get(monthKey(ts)) ?? Number.NEGATIVE_INFINITY, time));
      return Object.freeze({ ts: new Date(time), close });
    });
    copied.set(symbol, Object.freeze(rows));
  }
  CLOSES_BY_SYMBOL = copied;
  MONTH_END_TIMES = new Set(monthEnds.values());
  DECISION_CACHE = new Map();
}

/** Exact endpoints: relative = close[t−skip]/close[t−lookback]−1; absolute = close[t]/close[t−lookback]−1. */
export function dualMomentumMetrics(
  closes: readonly number[],
  lookbackBars: number,
  skipRecentBars: number,
): { relative: number; absolute: number } | null {
  if (closes.length < lookbackBars + 1 || skipRecentBars >= lookbackBars) return null;
  const current = closes.at(-1)!;
  const base = closes[closes.length - 1 - lookbackBars];
  const relativeEnd = closes[closes.length - 1 - skipRecentBars];
  if (![current, base, relativeEnd].every((value) => Number.isFinite(value) && value > 0)) return null;
  return { relative: relativeEnd / base - 1, absolute: current / base - 1 };
}

function rotationDecision(asOf: Date, params: DualMomentumRotationParams): RotationDecision {
  if (!MONTH_END_TIMES.has(asOf.getTime())) {
    return { winner: null, relative: null, absolute: null, reason: 'not_month_end' };
  }
  const cacheKey = `${asOf.getTime()}|${params.lookbackBars}|${params.skipRecentBars}|${params.absoluteThreshold}`;
  const cached = DECISION_CACHE.get(cacheKey);
  if (cached) return cached;
  if (!CLOSES_BY_SYMBOL) {
    return { winner: null, relative: null, absolute: null, reason: 'incomplete_declared_universe' };
  }

  const ranked: { symbol: string; relative: number; absolute: number }[] = [];
  for (const symbol of DUAL_MOMENTUM_UNIVERSE) {
    const all = CLOSES_BY_SYMBOL.get(symbol);
    const available = all?.filter((point) => point.ts.getTime() <= asOf.getTime()) ?? [];
    if (available.at(-1)?.ts.getTime() !== asOf.getTime()) {
      const incomplete = { winner: null, relative: null, absolute: null, reason: 'incomplete_declared_universe' } as const;
      DECISION_CACHE.set(cacheKey, incomplete);
      return incomplete;
    }
    const metrics = dualMomentumMetrics(available.map((point) => point.close), params.lookbackBars, params.skipRecentBars);
    if (!metrics) {
      const incomplete = { winner: null, relative: null, absolute: null, reason: 'incomplete_declared_universe' } as const;
      DECISION_CACHE.set(cacheKey, incomplete);
      return incomplete;
    }
    ranked.push({ symbol, ...metrics });
  }
  ranked.sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol));
  const top = ranked[0];
  const decision: RotationDecision = top.absolute > params.absoluteThreshold
    ? { winner: top.symbol, relative: top.relative, absolute: top.absolute, reason: 'winner' }
    : { winner: null, relative: top.relative, absolute: top.absolute, reason: 'absolute_not_above_threshold' };
  DECISION_CACHE.set(cacheKey, decision);
  return decision;
}

function decisionEvidence(decision: RotationDecision, params: DualMomentumRotationParams): Evidence[] {
  return [
    evidence('params_version', params.version),
    evidence('declared_universe', DUAL_MOMENTUM_UNIVERSE.join(',')),
    evidence('winner', decision.winner ?? 'cash'),
    evidence('relative_12_1m', decision.relative === null ? 'na' : decision.relative.toFixed(6)),
    evidence('absolute_12m', decision.absolute === null ? 'na' : decision.absolute.toFixed(6)),
    evidence('absolute_threshold', params.absoluteThreshold.toFixed(4)),
    evidence('aaoifi_status', 'unscreened_execution_blocked'),
  ];
}

export const dualMomentumRotationSetup: StrategySetup<DualMomentumRotationParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'dual-momentum-rotation',
  version: 'v1',
  cadence: 'daily',
  defaultParams: DUAL_MOMENTUM_ROTATION_V1,

  prepareUniverse(input) {
    configureUniverse(input);
  },

  plateauNeighborhood(params): PlateauNeighborhood<DualMomentumRotationParams> {
    const center = paramsOrDefault(params);
    const neighbors = [210, 252, 294].flatMap((lookbackBars) =>
      [-0.01, 0, 0.01].flatMap((absoluteThreshold) => (
        lookbackBars === center.lookbackBars && absoluteThreshold === center.absoluteThreshold
          ? []
          : [{
            label: `lookbackBars=${lookbackBars}|absoluteThreshold=${absoluteThreshold}`,
            params: { ...center, lookbackBars, absoluteThreshold },
          }]
      )),
    );
    return { axes: ['lookbackBars', 'absoluteThreshold'], center, neighbors };
  },

  screen(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.market !== 'NASDAQ') return check(false, ['market_not_nasdaq'], []);
    if (!DUAL_MOMENTUM_UNIVERSE.includes(ctx.symbol)) return check(false, ['outside_declared_universe'], []);
    const decision = rotationDecision(ctx.asOf, p);
    return check(decision.reason === 'winner', decision.reason === 'winner' ? [] : [decision.reason], decisionEvidence(decision, p));
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    const screened = this.screen(ctx, p);
    if (!screened.matched) return screened;
    const decision = rotationDecision(ctx.asOf, p);
    const matched = decision.winner === ctx.symbol;
    return check(matched, matched ? [] : ['not_top_relative_momentum'], screened.evidence);
  },

  exit(ctx, params) {
    const p = paramsOrDefault(params);
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    if (!MONTH_END_TIMES.has(ctx.asOf.getTime())) return check(false, ['hold_between_month_ends'], []);
    const decision = rotationDecision(ctx.asOf, p);
    const matched = decision.winner !== ctx.symbol;
    const reason = decision.reason === 'absolute_not_above_threshold'
      ? 'absolute_momentum_not_above_threshold'
      : decision.winner === null
        ? 'incomplete_declared_universe'
        : 'rotate_to_new_winner';
    return check(matched, matched ? [reason] : ['hold_monthly_winner'], decisionEvidence(decision, p));
  },

  signal(ctx, params): AnalystSignal {
    const p = paramsOrDefault(params);
    const exit = this.exit(ctx, p);
    const entry = exit.matched ? check(false, [], []) : this.entry(ctx, p);
    const stance: Stance = exit.matched ? 'BEARISH' : entry.matched ? 'BULLISH' : 'NEUTRAL';
    const active = exit.matched ? exit : entry;
    const stanceAr = stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة';
    return {
      agent: 'PATTERN_ANALOG', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf,
      stance, conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: p.lookbackBars,
      rationaleEn: `${this.id} ${p.version}: ${stance}; declared research sleeve, candidate and research-only. AAOIFI status unscreened; execution blocked.`,
      rationaleAr: `${this.id} ${p.version}: ${stanceAr}؛ سلة بحثية مُعلنة، مرشحة ومخصّصة للبحث فقط. لم تُفحص وفق معايير أيوفي؛ لذا يُحظر التنفيذ.`,
      evidence: active.evidence.length ? active.evidence : [evidence('params_version', p.version)],
      determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
