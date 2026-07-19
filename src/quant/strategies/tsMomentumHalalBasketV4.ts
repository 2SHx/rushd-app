// ts-momentum-halal-basket-v4 — pre-registered E1 candidate. v3's signal family, volatility
// target, position cap, and plateau grid are unchanged. The only strategy layer is an a-priori
// peak-to-trough drawdown governor; C1 supplies the verified index-provider-screened universe.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import {
  TS_MOMENTUM_HALAL_BASKET_V3,
  TsMomentumHalalBasketV3ParamsSchema,
  tsMomentumHalalBasketV3Setup,
  type TsMomentumHalalBasketV3Params,
} from './tsMomentumHalalBasketV3';
import type { PlateauNeighborhood, StrategySetup, UniversePrepareInput } from './types';

export const TsMomentumHalalBasketV4ParamsSchema = TsMomentumHalalBasketV3ParamsSchema
  .omit({ version: true })
  .extend({
    version: z.literal('v4'),
    drawdownStartFraction: z.literal(0.08),
    drawdownCashFraction: z.literal(0.20),
  });

export type TsMomentumHalalBasketV4Params = z.infer<typeof TsMomentumHalalBasketV4ParamsSchema>;

export const TS_MOMENTUM_HALAL_BASKET_V4: TsMomentumHalalBasketV4Params = Object.freeze({
  ...TS_MOMENTUM_HALAL_BASKET_V3,
  version: 'v4',
  drawdownStartFraction: 0.08,
  drawdownCashFraction: 0.20,
});

function paramsOrDefault(params?: TsMomentumHalalBasketV4Params): TsMomentumHalalBasketV4Params {
  return TsMomentumHalalBasketV4ParamsSchema.parse(params ?? TS_MOMENTUM_HALAL_BASKET_V4);
}

function toV3(params?: TsMomentumHalalBasketV4Params): TsMomentumHalalBasketV3Params {
  return TsMomentumHalalBasketV3ParamsSchema.parse({ ...paramsOrDefault(params), version: 'v3' });
}

export function tsMomentumV4BookPolicy(params?: TsMomentumHalalBasketV4Params): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    realizedVolLookback: p.basketVolLookback,
    targetAnnualVol: p.targetAnnualVol,
    maxOpenPositions: p.maxOpenPositions,
    drawdownStartFraction: p.drawdownStartFraction,
    drawdownCashFraction: p.drawdownCashFraction,
    decisionHistoryBars: Math.max(p.longMomLookback + 1, p.emaExitPeriod, p.volLookback + 1),
  };
}

export const tsMomentumHalalBasketV4Setup: StrategySetup<TsMomentumHalalBasketV4Params> & {
  prepareUniverse(input: UniversePrepareInput): void;
} = {
  id: 'ts-momentum-halal-basket-v4',
  version: 'v4',
  cadence: 'daily',
  universeCompatibility: 'fixed',
  defaultParams: TS_MOMENTUM_HALAL_BASKET_V4,

  prepareUniverse(input) { tsMomentumHalalBasketV3Setup.prepareUniverse(input); },

  plateauNeighborhood(params): PlateauNeighborhood<TsMomentumHalalBasketV4Params> {
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

  screen(ctx, params) { return tsMomentumHalalBasketV3Setup.screen(ctx, toV3(params)); },
  entry(ctx, params) { return tsMomentumHalalBasketV3Setup.entry(ctx, toV3(params)); },
  exit(ctx, params) { return tsMomentumHalalBasketV3Setup.exit(ctx, toV3(params)); },
  signal(ctx, params) {
    const delegated = tsMomentumHalalBasketV3Setup.signal(ctx, toV3(params));
    return {
      ...delegated,
      rationaleEn: `ts-momentum-halal-basket-v4 v4: ${delegated.stance}; v3 dual momentum with an 8%-to-20% drawdown governor on C1's index-provider-screened paper universe. Candidate; not validated or advice.`,
      rationaleAr: `ts-momentum-halal-basket-v4 v4: ${delegated.stance === 'BULLISH' ? 'صعودية' : delegated.stance === 'BEARISH' ? 'هبوطية' : 'محايدة'}؛ زخم v3 مع خفض التعرض بين تراجع 8% و20% على سلة ورقية مفحوصة من مزود المؤشر C1. مرشحة غير مُعتمدة وليست نصيحة.`,
    };
  },
};
