import { Prisma } from '@prisma/client';
import type { IntradayBar } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  TS_MOMENTUM_HALAL_BASKET_V2,
  tsMomentumHalalBasketV2Setup,
} from './tsMomentumHalalBasketV2';
import {
  TS_MOMENTUM_HALAL_BASKET_V3,
  tsMomentumHalalBasketV3Setup,
  tsMomentumV3BookPolicy,
} from './tsMomentumHalalBasketV3';
import type { StrategyPointInTimeContext } from './types';
import { LookaheadError } from '../data/pointInTime';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const BASE = new Date('2020-01-02T00:00:00.000Z').getTime();

function closes(): { ts: Date; close: number }[] {
  return Array.from({ length: 320 }, (_, i) => ({
    ts: new Date(BASE + i * DAY),
    close: 100 + i * 0.2,
  }));
}

function context(positionQty = 0, finalClose?: number): StrategyPointInTimeContext {
  const points = closes();
  if (finalClose !== undefined) points[points.length - 1].close = finalClose;
  const bars = points.map((point, i) => ({
    id: `A-${i}`, symbol: 'A', market: 'NASDAQ', ts: point.ts,
    open: new D(point.close), high: new D(point.close), low: new D(point.close),
    close: new D(point.close), volume: new D(1_000_000), session: 'REGULAR',
    source: 'YAHOO', createdAt: point.ts,
  })) as IntradayBar[];
  return {
    symbol: 'A', market: 'NASDAQ', asOf: bars.at(-1)!.ts, bars, snapshot: null,
    positionQty: new D(positionQty), entryPrice: positionQty ? new D(150) : null,
    entryTs: positionQty ? bars.at(-100)!.ts : null,
  };
}

function prepare(): void {
  const history = closes();
  tsMomentumHalalBasketV3Setup.prepareUniverse({
    symbols: ['A'],
    closesBySymbol: new Map([['A', history]]),
  });
}

function changeBar(ctx: StrategyPointInTimeContext, index: number, close: number): StrategyPointInTimeContext {
  const bars = [...ctx.bars];
  bars[index] = {
    ...bars[index], open: new D(close), high: new D(close), low: new D(close), close: new D(close),
  } as IntradayBar;
  return { ...ctx, bars };
}

describe('ts-momentum-halal-basket-v3', () => {
  it('delegates entry and exit outcomes to v2 byte-for-byte', () => {
    prepare();
    const entryCtx = context();
    expect(tsMomentumHalalBasketV3Setup.entry(entryCtx))
      .toEqual(tsMomentumHalalBasketV2Setup.entry(entryCtx, TS_MOMENTUM_HALAL_BASKET_V2));

    const exitCtx = context(10, 80);
    expect(tsMomentumHalalBasketV3Setup.exit(exitCtx))
      .toEqual(tsMomentumHalalBasketV2Setup.exit(exitCtx, TS_MOMENTUM_HALAL_BASKET_V2));
  });

  it('does not reuse an entry cache hit for changed bars or market', () => {
    prepare();
    const replayScope = {};
    const original = { ...context(), replayScope };
    const hit = tsMomentumHalalBasketV3Setup.entry(original);
    expect(tsMomentumHalalBasketV3Setup.entry(original)).toBe(hit);

    const changedBars = changeBar(context(), 300, 20);
    const changedResult = tsMomentumHalalBasketV3Setup.entry(changedBars);
    expect(changedResult).not.toBe(hit);
    expect(changedResult).toEqual(tsMomentumHalalBasketV2Setup.entry(changedBars, TS_MOMENTUM_HALAL_BASKET_V2));

    const changedMarket = { ...context(), market: 'TASI' as const };
    const marketResult = tsMomentumHalalBasketV3Setup.entry(changedMarket);
    expect(marketResult).not.toBe(hit);
    expect(marketResult).toEqual(tsMomentumHalalBasketV2Setup.entry(changedMarket, TS_MOMENTUM_HALAL_BASKET_V2));
  });

  it('checks look-ahead before returning an entry cache hit', () => {
    prepare();
    const replayScope = {};
    const original = { ...context(), replayScope };
    tsMomentumHalalBasketV3Setup.entry(original);
    const future = {
      ...original,
      bars: [...original.bars, {
        ...original.bars.at(-1)!,
        id: 'A-future',
        ts: new Date(original.asOf.getTime() + DAY),
      } as IntradayBar],
    };
    expect(() => tsMomentumHalalBasketV3Setup.entry(future)).toThrow(LookaheadError);
  });

  it('does not reuse a position-present exit cache hit for changed bars', () => {
    prepare();
    const replayScope = {};
    const original = { ...context(10), replayScope };
    const hit = tsMomentumHalalBasketV3Setup.exit(original);
    expect(tsMomentumHalalBasketV3Setup.exit(original)).toBe(hit);

    const changed = context(10, 80);
    const changedResult = tsMomentumHalalBasketV3Setup.exit(changed);
    expect(changedResult).not.toBe(hit);
    expect(changedResult).toEqual(tsMomentumHalalBasketV2Setup.exit(changed, TS_MOMENTUM_HALAL_BASKET_V2));
  });

  it('identifies v3 as rejected, research-only, AAOIFI-unscreened and execution-blocked in both languages', () => {
    prepare();
    const result = tsMomentumHalalBasketV3Setup.signal(context());
    expect(result.rationaleEn).toContain('ts-momentum-halal-basket-v3 v3');
    expect(result.rationaleEn).toContain('REJECTED, research-only');
    expect(result.rationaleEn).toContain('AAOIFI status unscreened, execution blocked');
    expect(result.rationaleEn).not.toMatch(/certified halal|halal basket/i);
    expect(result.rationaleAr).toContain('ts-momentum-halal-basket-v3 v3');
    expect(result.rationaleAr).toContain('مرفوضة ومخصّصة للبحث فقط');
    expect(result.rationaleAr).toContain('لم يُتحقّق من توافقها وفق معايير أيوفي');
    expect(result.rationaleAr).toContain('يُحظر تنفيذها');
    expect(result.rationaleAr).not.toContain('حلال');
  });

  it('exposes only the frozen 60d/15%/six-name book policy', () => {
    expect(tsMomentumV3BookPolicy()).toEqual({
      realizedVolLookback: 60,
      targetAnnualVol: 0.15,
      maxOpenPositions: 6,
      decisionHistoryBars: 253,
    });
  });

  it('persists the frozen center-plus-neighbors trial count', () => {
    expect(TS_MOMENTUM_HALAL_BASKET_V3.validationTrials).toBe(9);
    const grid = tsMomentumHalalBasketV3Setup.plateauNeighborhood!(TS_MOMENTUM_HALAL_BASKET_V3);
    expect([grid.center, ...grid.neighbors.map((neighbor) => neighbor.params)])
      .toHaveLength(TS_MOMENTUM_HALAL_BASKET_V3.validationTrials);
    expect(grid.neighbors.every((neighbor) => neighbor.params.validationTrials === 9)).toBe(true);
  });

  it('pre-registers exactly the frozen 3×3 plateau grid without replacing center', () => {
    const grid = tsMomentumHalalBasketV3Setup.plateauNeighborhood!(TS_MOMENTUM_HALAL_BASKET_V3);
    expect(grid.center).toEqual(TS_MOMENTUM_HALAL_BASKET_V3);
    expect(grid.neighbors).toHaveLength(8);
    const cells = [grid.center, ...grid.neighbors.map((neighbor) => neighbor.params)]
      .map((params) => `${params.targetAnnualVol}|${params.maxOpenPositions}`)
      .sort();
    expect(cells).toEqual([
      '0.135|5', '0.135|6', '0.135|7',
      '0.15|5', '0.15|6', '0.15|7',
      '0.165|5', '0.165|6', '0.165|7',
    ]);
  });
});
