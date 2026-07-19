// multi-mode-book-v1 — pre-registered E3 candidate. One shared-cash StrategyBook combines three
// disjoint C1-screened sleeves. The existing allocator fixes 20/40/40 from terminal-card priors;
// no live/OOS result can change those weights during this version's validation.
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { allocateTournamentCapital } from '../allocation/allocator';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import type { AnalystSignal, Evidence, Stance } from '../types';
import { BOLLINGER_MR_LONG_V2, bollingerMrLongV2Setup } from './bollingerMrLongV2';
import { dualMomentumMetrics } from './dualMomentumRotation';
import {
  TS_MOMENTUM_HALAL_BASKET_V3,
  tsMomentumHalalBasketV3Setup,
} from './tsMomentumHalalBasketV3';
import type {
  PlateauNeighborhood, StrategyCheck, StrategyPointInTimeContext, StrategySetup, UniversePrepareInput,
} from './types';

const D = Prisma.Decimal;

export const MULTI_MODE_MOMENTUM_UNIVERSE = Object.freeze([
  'TSLA', 'AVGO', 'AMD', 'ORCL', 'QCOM', 'CSCO',
] as const);
export const MULTI_MODE_MEAN_REVERSION_UNIVERSE = Object.freeze([
  'ADBE', 'PEP', 'JNJ', 'PG', 'ABT',
] as const);
export const MULTI_MODE_DUAL_UNIVERSE = Object.freeze([
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMAT',
] as const);
export const MULTI_MODE_UNIVERSE = Object.freeze([
  ...MULTI_MODE_MOMENTUM_UNIVERSE,
  ...MULTI_MODE_MEAN_REVERSION_UNIVERSE,
  ...MULTI_MODE_DUAL_UNIVERSE,
] as const);

const liveZero = {
  days: 0, deflatedSharpe: 0, maxDrawdown: 0, currentDrawdown: 0,
  drawdownBreaker: 0.30, trackingError: 0, trackingErrorLimit: 0.20,
};

export const MULTI_MODE_ALLOCATOR_RESULT = allocateTournamentCapital({
  seed: 42,
  modes: [
    {
      modeId: 'momentum', validationStatus: 'REJECTED', incubationAuthorized: true,
      evidenceCardComplete: true, shariaState: 'VERIFIED_COMPLIANT', implausible: false,
      validation: { deflatedSharpe: 0.4138, maxDrawdown: 0.29628 }, live: liveZero,
    },
    {
      modeId: 'mean-reversion', validationStatus: 'REJECTED', incubationAuthorized: true,
      evidenceCardComplete: true, shariaState: 'VERIFIED_COMPLIANT', implausible: false,
      validation: { deflatedSharpe: 0.997, maxDrawdown: 0.0984 }, live: liveZero,
    },
    {
      modeId: 'dual-momentum', validationStatus: 'REJECTED', incubationAuthorized: true,
      evidenceCardComplete: true, shariaState: 'VERIFIED_COMPLIANT', implausible: false,
      validation: { deflatedSharpe: 0.737, maxDrawdown: 0.173578 }, live: liveZero,
    },
  ],
});

const allocatorWeight = (id: string): number => Number(MULTI_MODE_ALLOCATOR_RESULT.allocations[id]);

export const MultiModeBookParamsSchema = z.object({
  version: z.literal('v1'),
  allocatorSeed: z.literal(42),
  momentumWeight: z.number().positive().max(0.40),
  meanReversionWeight: z.number().positive().max(0.40),
  dualMomentumWeight: z.number().positive().max(0.40),
  validationTrials: z.literal(3),
  rebalanceRule: z.literal('component-signal-cadence'),
}).superRefine((params, ctx) => {
  if (Math.abs(params.momentumWeight + params.meanReversionWeight + params.dualMomentumWeight - 1) > 1e-12) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'sleeve weights must sum to one' });
  }
});

export type MultiModeBookParams = z.infer<typeof MultiModeBookParamsSchema>;

export const MULTI_MODE_BOOK_V1: MultiModeBookParams = Object.freeze({
  version: 'v1', allocatorSeed: 42,
  momentumWeight: allocatorWeight('momentum'),
  meanReversionWeight: allocatorWeight('mean-reversion'),
  dualMomentumWeight: allocatorWeight('dual-momentum'),
  validationTrials: 3,
  rebalanceRule: 'component-signal-cadence',
});

interface ClosePoint { ts: Date; close: number }
let dualCloses: ReadonlyMap<string, readonly ClosePoint[]> = new Map();
let dualMonthEnds: ReadonlySet<number> = new Set();

function paramsOrDefault(params?: MultiModeBookParams): MultiModeBookParams {
  return MultiModeBookParamsSchema.parse(params ?? MULTI_MODE_BOOK_V1);
}

function evidence(ref: string, value: string | number): Evidence {
  return { kind: 'feature', ref, value: String(value) };
}

function check(matched: boolean, reasons: string[], items: Evidence[], sizeFraction?: number): StrategyCheck {
  return sizeFraction === undefined ? { matched, reasons, evidence: items } : { matched, reasons, evidence: items, sizeFraction };
}

function exactUniverse(symbols: readonly string[]): boolean {
  return symbols.length === MULTI_MODE_UNIVERSE.length
    && MULTI_MODE_UNIVERSE.every((symbol) => symbols.includes(symbol));
}

function prepare(input: UniversePrepareInput): void {
  if (!exactUniverse(input.symbols) || !exactUniverse(Array.from(input.closesBySymbol.keys()))) {
    throw new Error('multi-mode-book-v1 requires its exact disjoint C1 charter');
  }
  tsMomentumHalalBasketV3Setup.prepareUniverse({
    symbols: [...MULTI_MODE_MOMENTUM_UNIVERSE],
    replayScope: input.replayScope,
    closesBySymbol: new Map(MULTI_MODE_MOMENTUM_UNIVERSE.map((symbol) => [
      symbol, [...input.closesBySymbol.get(symbol)!],
    ])),
  });
  const monthEnds = new Map<string, number>();
  dualCloses = new Map(MULTI_MODE_DUAL_UNIVERSE.map((symbol) => {
    const rows = input.closesBySymbol.get(symbol)!.map(({ ts, close }) => ({ ts: new Date(ts), close }));
    for (const row of rows) {
      const key = `${row.ts.getUTCFullYear()}-${row.ts.getUTCMonth()}`;
      monthEnds.set(key, Math.max(monthEnds.get(key) ?? Number.NEGATIVE_INFINITY, row.ts.getTime()));
    }
    return [symbol, rows] as const;
  }));
  dualMonthEnds = new Set(monthEnds.values());
}

function dualWinner(asOf: Date): string | null {
  if (!dualMonthEnds.has(asOf.getTime())) return null;
  const ranked: { symbol: string; relative: number; absolute: number }[] = [];
  for (const symbol of MULTI_MODE_DUAL_UNIVERSE) {
    const available = (dualCloses.get(symbol) ?? []).filter((row) => row.ts <= asOf);
    if (available.at(-1)?.ts.getTime() !== asOf.getTime()) return null;
    const metrics = dualMomentumMetrics(available.map(({ close }) => close), 252, 21);
    if (!metrics) return null;
    ranked.push({ symbol, ...metrics });
  }
  ranked.sort((a, b) => b.relative - a.relative || a.symbol.localeCompare(b.symbol));
  return ranked[0].absolute > 0 ? ranked[0].symbol : null;
}

function scaleEntry(result: StrategyCheck, scale: number): StrategyCheck {
  if (!result.matched) return result;
  return { ...result, sizeFraction: (result.sizeFraction ?? 1) * scale };
}

export function multiModeBookPolicy(): StrategyBookPolicy {
  return { maxOpenPositions: 12, decisionHistoryBars: 295 };
}

export const multiModeBookSetup: StrategySetup<MultiModeBookParams> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'multi-mode-book-v1', version: 'v1', cadence: 'daily', universeCompatibility: 'fixed',
  defaultParams: MULTI_MODE_BOOK_V1,
  prepareUniverse: prepare,

  plateauNeighborhood(params): PlateauNeighborhood<MultiModeBookParams> {
    const center = paramsOrDefault(params);
    return {
      axes: ['momentumWeight', 'dualMomentumWeight'], center,
      neighbors: [
        { label: 'momentum+5|mean-reversion-5', params: { ...center, momentumWeight: 0.25, meanReversionWeight: 0.35 } },
        { label: 'momentum+5|dual-momentum-5', params: { ...center, momentumWeight: 0.25, dualMomentumWeight: 0.35 } },
      ],
    };
  },

  screen(ctx) {
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    const matched = MULTI_MODE_UNIVERSE.includes(ctx.symbol as never);
    return check(matched, matched ? [] : ['outside_multi_mode_charter'], [
      evidence('allocator_seed', 42), evidence('charter', 'C1-disjoint-long-only-cash'),
    ]);
  },

  entry(ctx, params) {
    const p = paramsOrDefault(params);
    if (MULTI_MODE_MOMENTUM_UNIVERSE.includes(ctx.symbol as never)) {
      return scaleEntry(
        tsMomentumHalalBasketV3Setup.entry(ctx, TS_MOMENTUM_HALAL_BASKET_V3),
        p.momentumWeight / (MULTI_MODE_MOMENTUM_UNIVERSE.length * TS_MOMENTUM_HALAL_BASKET_V3.maxNameFraction),
      );
    }
    if (MULTI_MODE_MEAN_REVERSION_UNIVERSE.includes(ctx.symbol as never)) {
      return scaleEntry(
        bollingerMrLongV2Setup.entry(ctx, BOLLINGER_MR_LONG_V2),
        p.meanReversionWeight / (MULTI_MODE_MEAN_REVERSION_UNIVERSE.length * BOLLINGER_MR_LONG_V2.maxNameFraction),
      );
    }
    const winner = dualWinner(ctx.asOf);
    const matched = winner === ctx.symbol;
    return check(matched, matched ? [] : ['not_dual_momentum_winner'], [
      evidence('sleeve', 'dual-momentum'), evidence('winner', winner ?? 'cash'),
    ], matched ? p.dualMomentumWeight : undefined);
  },

  exit(ctx, params) {
    if (MULTI_MODE_MOMENTUM_UNIVERSE.includes(ctx.symbol as never)) {
      return tsMomentumHalalBasketV3Setup.exit(ctx, TS_MOMENTUM_HALAL_BASKET_V3);
    }
    if (MULTI_MODE_MEAN_REVERSION_UNIVERSE.includes(ctx.symbol as never)) {
      return bollingerMrLongV2Setup.exit(ctx, BOLLINGER_MR_LONG_V2);
    }
    if (ctx.positionQty.lte(0)) return check(false, ['no_long_position'], []);
    if (!dualMonthEnds.has(ctx.asOf.getTime())) return check(false, ['hold_between_month_ends'], []);
    const winner = dualWinner(ctx.asOf);
    return check(winner !== ctx.symbol, winner !== ctx.symbol ? ['rotate_or_cash'] : ['hold_winner'], [
      evidence('sleeve', 'dual-momentum'), evidence('winner', winner ?? 'cash'),
    ]);
  },

  signal(ctx, params): AnalystSignal {
    const exit = this.exit(ctx, params);
    const entry = exit.matched ? check(false, [], []) : this.entry(ctx, params);
    const stance: Stance = exit.matched ? 'BEARISH' : entry.matched ? 'BULLISH' : 'NEUTRAL';
    return {
      agent: 'QUANT_CORE', symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf, stance,
      conviction: stance === 'NEUTRAL' ? 0 : 0.25, horizonDays: 63,
      rationaleEn: `multi-mode-book-v1: ${stance}; fixed allocator blend of disjoint C1-screened momentum, mean-reversion, and dual-momentum sleeves. Candidate simulation, not advice.`,
      rationaleAr: `multi-mode-book-v1: ${stance === 'BULLISH' ? 'صعودية' : stance === 'BEARISH' ? 'هبوطية' : 'محايدة'}؛ مزيج ثابت من سلال زخم وارتداد وزخم مزدوج مفحوصة عبر C1. محاكاة مرشحة وليست نصيحة.`,
      evidence: (exit.matched ? exit : entry).evidence, determinism: 'deterministic', failureMode: 'ok', costCents: 0,
    };
  },
};
