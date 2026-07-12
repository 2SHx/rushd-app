import { Prisma } from '@prisma/client';
import type { IntradayBar, SymbolSnapshot } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { median, deriveIexMinCumVolume } from './gapperCalibration';
import { gapperOrbSetup, GAPPER_ORB_V1, GAPPER_ORB_V1_IEX, GapperOrbParamsSchema } from './gapperOrb';
import type { StrategyPointInTimeContext } from './types';

const D = Prisma.Decimal;

describe('gapper-orb IEX calibration math (fixed inputs)', () => {
  it('median handles odd, even, and empty samples', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it('derives the v1-iex threshold = round50k(baseline × median ratio)', () => {
    // median of these five is exactly 0.0328 → 10e6 × 0.0328 = 328,000 → rounds to 350,000.
    const t = deriveIexMinCumVolume([0.02, 0.03, 0.0328, 0.05, 0.15]);
    expect(t.median).toBeCloseTo(0.0328, 6);
    expect(t.raw).toBeCloseTo(328_000, 3);
    expect(t.rounded).toBe(350_000);
  });

  it('rounds to the nearest 50k bucket', () => {
    expect(deriveIexMinCumVolume([0.031]).rounded).toBe(300_000); // 310k → 300k
    expect(deriveIexMinCumVolume([0.036]).rounded).toBe(350_000); // 360k → 350k
  });
});

describe('gapper-orb v1-iex versioned config', () => {
  it('is an additive version that only rescales the volume leg', () => {
    expect(GAPPER_ORB_V1_IEX.version).toBe('v1-iex');
    expect(GAPPER_ORB_V1_IEX.minCumVolume).toBe(350_000);
    expect(GAPPER_ORB_V1_IEX.minCumVolume).toBe(deriveIexMinCumVolume([0.0328]).rounded);
    // mcap band + gap thresholds are DECIDED-unchanged from the consolidated-tape reference.
    expect(GAPPER_ORB_V1_IEX.mcapMin).toBe(GAPPER_ORB_V1.mcapMin);
    expect(GAPPER_ORB_V1_IEX.mcapMax).toBe(GAPPER_ORB_V1.mcapMax);
    expect(GAPPER_ORB_V1_IEX.premarketMovePctMin).toBe(GAPPER_ORB_V1.premarketMovePctMin);
    expect(GAPPER_ORB_V1_IEX.dayMovePctMin).toBe(GAPPER_ORB_V1.dayMovePctMin);
  });

  it('schema accepts both v1 and v1-iex', () => {
    expect(() => GapperOrbParamsSchema.parse(GAPPER_ORB_V1)).not.toThrow();
    expect(() => GapperOrbParamsSchema.parse(GAPPER_ORB_V1_IEX)).not.toThrow();
  });

  it('selection changes behavior: an IEX-scale volume passes v1-iex but fails v1', () => {
    const day = '2024-01-05';
    const bar = (session: IntradayBar['session'], hhmm: string, close: number): IntradayBar =>
      ({
        id: `b-${session}-${hhmm}`, symbol: 'TEST', market: 'NASDAQ',
        ts: new Date(`${day}T${hhmm}:00.000Z`),
        open: new D(close), high: new D(close), low: new D(close), close: new D(close),
        volume: new D(1000), session, source: 'ALPACA', createdAt: new Date(0),
      }) as IntradayBar;
    // last PRE close 106 with pm-move 6% ⇒ reconstructed priorClose 100; REGULAR close 106 ⇒ day-move 6%.
    const bars = [bar('PRE', '13:00', 106), bar('REGULAR', '14:36', 106)];
    const asOf = bars[1].ts;
    const snapshot = {
      id: 'snap', symbol: 'TEST', market: 'NASDAQ', asOf,
      mcap: new D(100_000_000), float: null, premarketMovePct: new D(6),
      cumVolume: new D(500_000), // between 350k (v1-iex) and 10e6 (v1)
      source: 'ALPACA', mcapSource: 'FUNDAMENTALS', createdAt: new Date(0),
    } as SymbolSnapshot;
    const ctx: StrategyPointInTimeContext = { symbol: 'TEST', market: 'NASDAQ', asOf, bars, snapshot, positionQty: new D(0) };

    const v1 = gapperOrbSetup.screen(ctx, GAPPER_ORB_V1);
    expect(v1.matched).toBe(false);
    expect(v1.reasons).toContain('cumulative_volume_below_min');

    const iex = gapperOrbSetup.screen(ctx, GAPPER_ORB_V1_IEX);
    expect(iex.matched).toBe(true);
    expect(iex.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'params_version', value: 'v1-iex' }),
    ]));
  });
});
