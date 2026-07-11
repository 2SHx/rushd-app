import { Prisma } from '@prisma/client';
import type { IntradayBar, SymbolSnapshot } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { loadFixture } from '../data/fixtureLoader';
import { gapperOrbSetup, GAPPER_ORB_V1, type GapperOrbParams } from './gapperOrb';
import { STRATEGY_SETUP_CATALOG } from './catalog';
import type { StrategyPointInTimeContext } from './types';
import { LookaheadError } from '../data/pointInTime';

const D = Prisma.Decimal;

function realFixtureContext(
  symbol: string,
  date: string,
  asOf: Date,
  positionQty = new D(0),
): StrategyPointInTimeContext {
  const fixture = loadFixture(symbol, date);
  if (!fixture?.fundamentals) throw new Error(`Missing real fixture fundamentals for ${symbol} ${date}`);
  const bars = fixture.bars
    .map((bar, index) => ({
      id: `${symbol}-${index}`, symbol, market: 'NASDAQ',
      ts: new Date(new Date(bar.ts).getTime() + 60_000),
      open: new D(bar.open), high: new D(bar.high), low: new D(bar.low), close: new D(bar.close),
      volume: new D(bar.volume), session: bar.session, source: fixture.source, createdAt: new Date(0),
    } as IntradayBar))
    .filter((bar) => bar.ts <= asOf);
  const cumVolume = bars.reduce((sum, bar) => sum.plus(bar.volume), new D(0));
  const snapshot = {
    id: `${symbol}-snapshot`, symbol, market: 'NASDAQ', asOf,
    mcap: new D(fixture.fundamentals.marketCap), float: null,
    premarketMovePct: fixture.verification.premarketMovePct == null
      ? null : new D(fixture.verification.premarketMovePct),
    cumVolume, source: fixture.source, mcapSource: 'FUNDAMENTALS', createdAt: new Date(0),
  } as SymbolSnapshot;
  return { symbol, market: 'NASDAQ', asOf, bars, snapshot, positionQty };
}

const permissiveAapl: GapperOrbParams = {
  ...GAPPER_ORB_V1,
  mcapMin: 1,
  mcapMax: 4_000_000_000_000,
  premarketMovePctMin: -100,
  dayMovePctMin: -100,
  minCumVolume: 1,
};

describe('gapper-ORB v1 setup', () => {
  it('is registered as a versioned deterministic setup', () => {
    expect(STRATEGY_SETUP_CATALOG['gapper-orb']).toBe(gapperOrbSetup);
    expect(gapperOrbSetup.defaultParams).toMatchObject({ version: 'v1', openingRangeMinutes: 5 });
  });

  it('screens the captured SNDL gapper at the first complete qualifying PIT cutoff', () => {
    const ctx = realFixtureContext('SNDL', '2021-02-11', new Date('2021-02-11T17:59:00.000Z'));
    const screen = gapperOrbSetup.screen(ctx);

    expect(screen.matched).toBe(true);
    expect(screen.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ ref: 'params_version', value: 'v1' }),
      expect.objectContaining({ ref: 'cumulative_volume' }),
    ]));
    expect(gapperOrbSetup.entry(ctx).matched).toBe(false); // real SNDL never clears its five-minute OR high
  });

  it('rejects the same SNDL day one completed bar before day-move confirmation', () => {
    const ctx = realFixtureContext('SNDL', '2021-02-11', new Date('2021-02-11T17:58:00.000Z'));
    expect(gapperOrbSetup.screen(ctx)).toMatchObject({ matched: false, reasons: ['day_move_below_min'] });
  });

  it('detects a real AAPL opening-range breakout with explicit permissive test parameters', () => {
    const ctx = realFixtureContext('AAPL', '2024-01-05', new Date('2024-01-05T14:36:00.000Z'));
    expect(gapperOrbSetup.entry(ctx, permissiveAapl).matched).toBe(true);
    expect(gapperOrbSetup.signal(ctx, permissiveAapl)).toMatchObject({
      stance: 'BULLISH', determinism: 'deterministic', costCents: 0, conviction: 0.25,
    });
  });

  it('exits a long on the real AAPL opening-range-low breach and never shorts', () => {
    const flat = realFixtureContext('AAPL', '2024-01-05', new Date('2024-01-05T14:50:00.000Z'));
    expect(gapperOrbSetup.exit(flat, permissiveAapl).matched).toBe(false);

    const long = realFixtureContext('AAPL', '2024-01-05', new Date('2024-01-05T14:50:00.000Z'), new D(10));
    expect(gapperOrbSetup.exit(long, permissiveAapl)).toMatchObject({ matched: true, reasons: ['opening_range_stop'] });
    expect(gapperOrbSetup.signal(long, permissiveAapl).stance).toBe('BEARISH');
  });

  it('abstains when PIT snapshot data is missing', () => {
    const ctx = realFixtureContext('SNDL', '2021-02-11', new Date('2021-02-11T17:59:00.000Z'));
    expect(gapperOrbSetup.screen({ ...ctx, snapshot: null })).toMatchObject({
      matched: false, reasons: ['missing_pit_screen_data'],
    });
  });

  it('LOOK-AHEAD INJECTION → rejects future bars and snapshots even in constructed contexts', () => {
    const ctx = realFixtureContext('SNDL', '2021-02-11', new Date('2021-02-11T17:59:00.000Z'));
    const futureBar = { ...ctx.bars.at(-1)!, ts: new Date(ctx.asOf.getTime() + 60_000) };
    expect(() => gapperOrbSetup.screen({ ...ctx, bars: [...ctx.bars, futureBar] })).toThrow(LookaheadError);

    const futureSnapshot = { ...ctx.snapshot!, asOf: new Date(ctx.asOf.getTime() + 60_000) };
    expect(() => gapperOrbSetup.screen({ ...ctx, snapshot: futureSnapshot })).toThrow(LookaheadError);
  });
});
