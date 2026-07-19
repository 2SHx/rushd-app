// bollinger-mr-long-v3 — pre-registered E2 breadth candidate. v2's entry, exit, inverse-vol
// sizing, and plateau neighborhood are unchanged; C1 supplies the verified top-100 sleeve and the
// shared-cash engine supplies honest portfolio-level risk evidence.
import { z } from 'zod';
import type { StrategyBookPolicy } from '../backtest/portfolioEngine';
import {
  BOLLINGER_MR_LONG_V2,
  BollingerMrLongV2ParamsSchema,
  bollingerMrLongV2Setup,
  type BollingerMrLongV2Params,
} from './bollingerMrLongV2';
import type { PlateauNeighborhood, StrategySetup } from './types';

export const BollingerMrLongV3ParamsSchema = BollingerMrLongV2ParamsSchema
  .omit({ version: true })
  .extend({ version: z.literal('v3'), validationTrials: z.literal(5) });

export type BollingerMrLongV3Params = z.infer<typeof BollingerMrLongV3ParamsSchema>;

export const BOLLINGER_MR_LONG_V3: BollingerMrLongV3Params = Object.freeze({
  ...BOLLINGER_MR_LONG_V2,
  version: 'v3',
  validationTrials: 5,
});

const parsedParams = new WeakMap<object, BollingerMrLongV3Params>();
const delegatedParams = new WeakMap<object, BollingerMrLongV2Params>();

function paramsOrDefault(params?: BollingerMrLongV3Params): BollingerMrLongV3Params {
  const candidate = params ?? BOLLINGER_MR_LONG_V3;
  const cached = parsedParams.get(candidate);
  if (cached) return cached;
  const parsed = BollingerMrLongV3ParamsSchema.parse(candidate);
  parsedParams.set(candidate, parsed);
  parsedParams.set(parsed, parsed);
  return parsed;
}

function toV2(params?: BollingerMrLongV3Params): BollingerMrLongV2Params {
  const p = paramsOrDefault(params);
  const cached = delegatedParams.get(p);
  if (cached) return cached;
  const delegated = BollingerMrLongV2ParamsSchema.parse({ ...p, version: 'v2' });
  delegatedParams.set(p, delegated);
  return delegated;
}

export function bollingerV3BookPolicy(params?: BollingerMrLongV3Params): StrategyBookPolicy {
  const p = paramsOrDefault(params);
  return {
    maxOpenPositions: 6,
    decisionHistoryBars: Math.max(
      p.bandPeriod,
      p.regimeLookback + 1,
      p.trendSmaPeriod,
      p.volLookback + 1,
      p.atrPeriod + 1,
    ),
  };
}

export const bollingerMrLongV3Setup: StrategySetup<BollingerMrLongV3Params> = {
  id: 'bollinger-mr-long-v3',
  version: 'v3',
  cadence: 'daily',
  universeCompatibility: 'fixed',
  defaultParams: BOLLINGER_MR_LONG_V3,

  plateauNeighborhood(params): PlateauNeighborhood<BollingerMrLongV3Params> {
    const p = paramsOrDefault(params);
    return {
      axes: ['entryStdev', 'varianceRatioMax'],
      center: p,
      neighbors: [
        { label: 'entryStdev-0.25', params: { ...p, entryStdev: p.entryStdev - 0.25 } },
        { label: 'entryStdev+0.25', params: { ...p, entryStdev: p.entryStdev + 0.25 } },
        { label: 'varianceRatioMax-0.05', params: { ...p, varianceRatioMax: p.varianceRatioMax - 0.05 } },
        { label: 'varianceRatioMax+0.05', params: { ...p, varianceRatioMax: p.varianceRatioMax + 0.05 } },
      ],
    };
  },

  screen(ctx, params) { return bollingerMrLongV2Setup.screen(ctx, toV2(params)); },
  entry(ctx, params) { return bollingerMrLongV2Setup.entry(ctx, toV2(params)); },
  exit(ctx, params) { return bollingerMrLongV2Setup.exit(ctx, toV2(params)); },
  signal(ctx, params) {
    const delegated = bollingerMrLongV2Setup.signal(ctx, toV2(params));
    return {
      ...delegated,
      rationaleEn: `bollinger-mr-long-v3 v3: ${delegated.stance}; unchanged v2 mean reversion across C1's screened breadth sleeve. Candidate; simulated, not validated or advice.`,
      rationaleAr: `bollinger-mr-long-v3 v3: ${delegated.stance === 'BULLISH' ? 'صعودية' : delegated.stance === 'BEARISH' ? 'هبوطية' : 'محايدة'}؛ ارتداد v2 نفسه عبر سلة C1 الواسعة المفحوصة. مرشحة ومحاكاة غير مُعتمدة وليست نصيحة.`,
    };
  },
};
