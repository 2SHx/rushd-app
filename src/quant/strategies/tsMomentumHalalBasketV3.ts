// ts-momentum-halal-basket-v3 — v2's signal family unchanged, plus ONE portfolio-level layer:
// a trailing-60d realized basket-vol governor targeting 15% annualized and at most six holdings.
// The governor is executed by portfolioEngine; this setup never encodes it as a per-name hint.
import { z } from 'zod';
import {
  TS_MOMENTUM_HALAL_BASKET_V2,
  TsMomentumHalalBasketV2ParamsSchema,
  tsMomentumHalalBasketV2Setup,
  type TsMomentumHalalBasketV2Params,
} from './tsMomentumHalalBasketV2';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import { assertNoLookahead } from '../data/pointInTime';
import type {
  PlateauNeighborhood,
  StrategyCheck,
  StrategyPointInTimeContext,
  StrategySetup,
  UniversePrepareInput,
} from './types';

export const TsMomentumHalalBasketV3ParamsSchema = TsMomentumHalalBasketV2ParamsSchema
  .omit({ version: true })
  .extend({
    version: z.literal('v3'),
    basketVolLookback: z.number().int().positive(),
    targetAnnualVol: z.number().positive(),
    maxOpenPositions: z.number().int().positive(),
    validationTrials: z.literal(9),
  });

export type TsMomentumHalalBasketV3Params = z.infer<typeof TsMomentumHalalBasketV3ParamsSchema>;

export const TS_MOMENTUM_HALAL_BASKET_V3: TsMomentumHalalBasketV3Params = Object.freeze({
  ...TS_MOMENTUM_HALAL_BASKET_V2,
  version: 'v3',
  basketVolLookback: 60,
  targetAnnualVol: 0.15,
  maxOpenPositions: 6,
  validationTrials: 9,
});

const parsedV3Params = new WeakMap<object, TsMomentumHalalBasketV3Params>();
const delegatedV2Params = new WeakMap<object, TsMomentumHalalBasketV2Params>();

interface ReplayCache {
  entry: Map<string, StrategyCheck>;
  exit: Map<string, StrategyCheck>;
}

const replayByScope = new WeakMap<object, ReplayCache>();

function replayCache(ctx: StrategyPointInTimeContext): ReplayCache | null {
  if (!ctx.replayScope) return null;
  const cached = replayByScope.get(ctx.replayScope);
  if (cached) return cached;
  const created = { entry: new Map<string, StrategyCheck>(), exit: new Map<string, StrategyCheck>() };
  replayByScope.set(ctx.replayScope, created);
  return created;
}

function paramsOrDefault(params?: TsMomentumHalalBasketV3Params): TsMomentumHalalBasketV3Params {
  const candidate = params ?? TS_MOMENTUM_HALAL_BASKET_V3;
  const cached = parsedV3Params.get(candidate);
  if (cached) return cached;
  const parsed = TsMomentumHalalBasketV3ParamsSchema.parse(candidate);
  parsedV3Params.set(candidate, parsed);
  parsedV3Params.set(parsed, parsed);
  return parsed;
}

function toV2(params?: TsMomentumHalalBasketV3Params): TsMomentumHalalBasketV2Params {
  const p = paramsOrDefault(params);
  const cached = delegatedV2Params.get(p);
  if (cached) return cached;
  const delegated = TsMomentumHalalBasketV2ParamsSchema.parse({ ...p, version: 'v2' });
  delegatedV2Params.set(p, delegated);
  return delegated;
}

function decisionKey(ctx: StrategyPointInTimeContext, p: TsMomentumHalalBasketV2Params): string {
  return [
    ctx.symbol, ctx.market, ctx.asOf.getTime(), p.longMomLookback, p.shortMomLookback, p.emaExitPeriod,
    p.volLookback, p.targetVolBudget, p.maxNameFraction, p.regimeSmaPeriod,
  ].join('|');
}

export function tsMomentumV3BookPolicy(params?: TsMomentumHalalBasketV3Params): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    realizedVolLookback: p.basketVolLookback,
    targetAnnualVol: p.targetAnnualVol,
    maxOpenPositions: p.maxOpenPositions,
    decisionHistoryBars: Math.max(p.longMomLookback + 1, p.emaExitPeriod, p.volLookback + 1),
  };
}

export const tsMomentumHalalBasketV3Setup: StrategySetup<TsMomentumHalalBasketV3Params> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'ts-momentum-halal-basket-v3',
  version: 'v3',
  cadence: 'daily',
  defaultParams: TS_MOMENTUM_HALAL_BASKET_V3,

  prepareUniverse(input) {
    tsMomentumHalalBasketV2Setup.prepareUniverse(input);
  },

  plateauNeighborhood(params): PlateauNeighborhood<TsMomentumHalalBasketV3Params> {
    const center = paramsOrDefault(params);
    const neighbors = [0.135, 0.15, 0.165].flatMap((targetAnnualVol) =>
      [5, 6, 7].flatMap((maxOpenPositions) => (
        targetAnnualVol === center.targetAnnualVol && maxOpenPositions === center.maxOpenPositions
          ? []
          : [{
            label: `targetAnnualVol=${targetAnnualVol}|maxOpenPositions=${maxOpenPositions}`,
            params: { ...center, targetAnnualVol, maxOpenPositions },
          }]
      )),
    );
    return { axes: ['targetAnnualVol', 'maxOpenPositions'], center, neighbors };
  },

  screen(ctx, params) {
    return tsMomentumHalalBasketV2Setup.screen(ctx, toV2(params));
  },

  entry(ctx, params) {
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    const p = toV2(params);
    const replay = replayCache(ctx);
    if (!replay) return tsMomentumHalalBasketV2Setup.entry(ctx, p);
    const key = decisionKey(ctx, p);
    const cached = replay.entry.get(key);
    if (cached) return cached;
    const result = tsMomentumHalalBasketV2Setup.entry(ctx, p);
    replay.entry.set(key, result);
    return result;
  },

  exit(ctx, params) {
    assertNoLookahead(ctx.bars, ctx.asOf, 'ts');
    const p = toV2(params);
    const replay = replayCache(ctx);
    if (!replay) return tsMomentumHalalBasketV2Setup.exit(ctx, p);
    const key = `${decisionKey(ctx, p)}|position=${ctx.positionQty.gt(0) ? 1 : 0}`;
    const cached = replay.exit.get(key);
    if (cached) return cached;
    const result = tsMomentumHalalBasketV2Setup.exit(ctx, p);
    replay.exit.set(key, result);
    return result;
  },

  signal(ctx, params) {
    const delegated = tsMomentumHalalBasketV2Setup.signal(ctx, toV2(params));
    const stanceAr = {
      BULLISH: 'صعودية',
      BEARISH: 'هبوطية',
      NEUTRAL: 'محايدة',
    }[delegated.stance];
    return {
      ...delegated,
      rationaleEn: `ts-momentum-halal-basket-v3 v3: ${delegated.stance}; volatility-scaled dual momentum on a declared research basket. Terminal status: REJECTED, research-only; AAOIFI status unscreened, execution blocked.`,
      rationaleAr: `ts-momentum-halal-basket-v3 v3: ${stanceAr}؛ زخم مزدوج بحجم معدّل حسب التقلب على سلة بحثية مُعلنة. الحالة النهائية: مرفوضة ومخصّصة للبحث فقط؛ لم يُتحقّق من توافقها وفق معايير أيوفي، لذا يُحظر تنفيذها.`,
    };
  },
};
