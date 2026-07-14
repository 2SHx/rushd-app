import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { filterRealDailyBars, type DailyBarInput, DEFAULT_BT_LIMITS } from '../backtest/engine';
import { simulateStrategyBook, type StrategyBookSeries } from '../backtest/portfolioEngine';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  DUAL_MOMENTUM_ROTATION_V1,
  DUAL_MOMENTUM_UNIVERSE,
  dualMomentumMetrics,
  dualMomentumRotationSetup,
  dualMomentumRotationBookPolicy,
} from './dualMomentumRotation';
import {
  dailyUniverseForSetup,
  limitsForDailySetup,
  selectDailyBacktestRoute,
  strategyBookPolicyForSetup,
  validationTrialsForSetup,
} from '../../../scripts/backtest';

const D = Prisma.Decimal;
const DAY = 86_400_000;

function prepare(
  closesBySymbol: Map<string, { ts: Date; close: number }[]>,
  symbols: readonly string[] = DUAL_MOMENTUM_UNIVERSE,
): void {
  dualMomentumRotationSetup.prepareUniverse!({ symbols: [...symbols], closesBySymbol });
}

function context(
  symbol: string,
  rows: readonly { ts: Date; close: number }[],
  asOf = rows.at(-1)!.ts,
  positionQty = new D(0),
): StrategyPointInTimeContext {
  return {
    symbol,
    market: 'NASDAQ',
    asOf,
    bars: rows.map((row, index) => ({
      id: `${symbol}-${index}`, symbol, market: 'NASDAQ', ts: row.ts,
      open: new D(row.close), high: new D(row.close), low: new D(row.close), close: new D(row.close),
      volume: new D(1_000_000_000), session: 'REGULAR', source: 'YAHOO', createdAt: row.ts,
    })),
    snapshot: null,
    positionQty,
  };
}

function monthEndBook(
  winner: string,
  opts: { missing?: string; tieWith?: string; absolute?: number; future?: boolean } = {},
): Map<string, { ts: Date; close: number }[]> {
  const start = Date.UTC(2023, 0, 1);
  const dates = Array.from({ length: 253 }, (_, index) => new Date(start + index * DAY));
  const book = new Map<string, { ts: Date; close: number }[]>();
  for (const symbol of DUAL_MOMENTUM_UNIVERSE) {
    const length = symbol === opts.missing ? 252 : 253;
    const rows = dates.slice(0, length).map((ts) => ({ ts, close: 100 }));
    if (length === 253) {
      const relative = symbol === winner || symbol === opts.tieWith ? 130 : 110;
      rows[231].close = relative; // t-21
      rows[252].close = symbol === winner ? (opts.absolute ?? 140) : Math.max(relative, 120);
    }
    if (opts.future) rows.push({ ts: new Date(Date.UTC(2025, 0, 2)), close: symbol === winner ? 1 : 10_000 });
    book.set(symbol, rows);
  }
  return book;
}

function toSeries(book: ReadonlyMap<string, readonly { ts: Date; close: number }[]>): StrategyBookSeries[] {
  return Array.from(book, ([symbol, rows]) => ({
    symbol,
    market: 'NASDAQ' as const,
    bars: rows.map(({ ts, close }) => ({
      ts, open: new D(close), high: new D(close), low: new D(close), close: new D(close),
      volume: new D(1_000_000_000), source: 'YAHOO' as const,
    })),
  }));
}

describe('dual-momentum-rotation v1', () => {
  it('uses the exact 12-1 relative endpoint and distinct 12M absolute endpoint', () => {
    const closes = Array(253).fill(100) as number[];
    closes[231] = 120;
    closes[252] = 150;

    const metrics = dualMomentumMetrics(closes, 252, 21)!;
    expect(metrics.relative).toBeCloseTo(0.2, 12);
    expect(metrics.absolute).toBeCloseTo(0.5, 12);
    expect(dualMomentumMetrics(closes.slice(1), 252, 21)).toBeNull();
  });

  it('ranks the exact seven-asset sleeve with a canonical-symbol tie-break', () => {
    const tied = monthEndBook('MSFT', { tieWith: 'AAPL' });
    prepare(tied);
    const asOf = tied.get('AAPL')!.at(-1)!.ts;

    expect(dualMomentumRotationSetup.entry(context('AAPL', tied.get('AAPL')!), DUAL_MOMENTUM_ROTATION_V1).matched).toBe(true);
    expect(dualMomentumRotationSetup.entry(context('MSFT', tied.get('MSFT')!), DUAL_MOMENTUM_ROTATION_V1).matched).toBe(false);
    expect(() => prepare(tied, DUAL_MOMENTUM_UNIVERSE.slice(0, 6))).toThrow(/exact declared universe/);
    expect(asOf.toISOString()).toContain('2023');
  });

  it('fails cash-safe when any declared asset lacks 253 bars', () => {
    const incomplete = monthEndBook('AAPL', { missing: 'HLAL' });
    prepare(incomplete);

    const check = dualMomentumRotationSetup.entry(context('AAPL', incomplete.get('AAPL')!));
    expect(check.matched).toBe(false);
    expect(check.reasons).toContain('incomplete_declared_universe');
  });

  it('signals only on the precomputed irregular month-end and is invariant to future prices', () => {
    const book = monthEndBook('AAPL');
    const irregular = new Date('2024-01-30T00:00:00.000Z');
    const nextMonth = new Date('2024-02-27T00:00:00.000Z');
    for (const rows of Array.from(book.values())) {
      rows.push({ ts: irregular, close: rows.at(-1)!.close });
      rows.push({ ts: nextMonth, close: rows.at(-1)!.close });
    }
    prepare(book);
    const aapl = book.get('AAPL')!;
    const atIrregular = context('AAPL', aapl.slice(0, -1), irregular);
    const earlier = dualMomentumRotationSetup.entry(atIrregular);
    expect(earlier.matched).toBe(true);
    expect(dualMomentumRotationSetup.entry(context('AAPL', aapl, nextMonth)).matched).toBe(true);

    const withFuturePrices = new Map(Array.from(book, ([symbol, rows]) => [
      symbol,
      [...rows, { ts: new Date('2024-03-28T00:00:00.000Z'), close: symbol === 'AAPL' ? 1 : 100_000 }],
    ]));
    prepare(withFuturePrices);
    expect(dualMomentumRotationSetup.entry(atIrregular)).toEqual(earlier);

    const midMonth = new Date('2024-02-15T00:00:00.000Z');
    expect(dualMomentumRotationSetup.entry({ ...atIrregular, asOf: midMonth }).matched).toBe(false);
    expect(() => dualMomentumRotationSetup.entry({
      ...atIrregular,
      bars: [...atIrregular.bars, { ...atIrregular.bars.at(-1)!, ts: new Date('2025-01-01T00:00:00.000Z') }],
    })).toThrow(/Look-ahead/);
  });

  it('exits to cash when absolute momentum is negative or exactly the threshold', () => {
    for (const absoluteClose of [90, 100]) {
      const book = monthEndBook('AAPL', { absolute: absoluteClose });
      prepare(book);
      const exit = dualMomentumRotationSetup.exit(context('AAPL', book.get('AAPL')!, undefined, new D(10)));
      expect(exit.matched).toBe(true);
      expect(exit.reasons).toContain('absolute_momentum_not_above_threshold');
    }
  });

  it('rotates the old winner into the new winner next-open, exits first, never churns mid-month, and keeps the 25% cap', () => {
    const prehistory = Array.from({ length: 253 }, (_, index) => new Date(Date.UTC(2023, 11, 1) + index * 60_000));
    const january = Array.from({ length: 22 }, (_, index) => new Date(Date.UTC(2024, 0, 10 + index)));
    const february = Array.from({ length: 22 }, (_, index) => new Date(Date.UTC(2024, 1, 7 + index)));
    const dates = [...prehistory, ...january, ...february, new Date('2024-03-01T00:00:00.000Z')];
    const book = new Map<string, { ts: Date; close: number }[]>();
    for (const symbol of DUAL_MOMENTUM_UNIVERSE) {
      const closes = dates.map(() => 100);
      closes[253] = symbol === 'AAPL' ? 150 : symbol === 'MSFT' ? 120 : 110;
      closes[274] = symbol === 'AAPL' ? 155 : symbol === 'MSFT' ? 125 : 115;
      closes[275] = symbol === 'AAPL' ? 120 : symbol === 'MSFT' ? 170 : 115;
      closes[296] = symbol === 'AAPL' ? 125 : symbol === 'MSFT' ? 175 : 120;
      closes[297] = closes[296];
      book.set(symbol, dates.map((ts, index) => ({ ts, close: closes[index] })));
    }
    prepare(book);
    const result = simulateStrategyBook({
      setup: dualMomentumRotationSetup,
      series: toSeries(book),
      startingCash: new D(100_000),
      limits: limitsForDailySetup(dualMomentumRotationSetup.id, {
        ...DEFAULT_BT_LIMITS,
        maxRiskPct: 100,
        volTargetPct: 100,
        liquidityAdvFraction: 1,
      }),
    });
    const marchFills = result.fills.filter((fill) => fill.ts.toISOString().startsWith('2024-03-01'));

    expect(marchFills.map((fill) => `${fill.action}:${fill.symbol}`)).toEqual(['SELL:AAPL', 'BUY:MSFT']);
    expect(result.fills.filter((fill) => fill.signalTs.toISOString().includes('2024-02-')).length).toBe(2);
    expect(Math.max(...result.daily.map((point) => point.positions.length))).toBe(1);
    expect(result.daily.every((point) => point.cash.gte(0))).toBe(true);
    expect(result.fills.filter((fill) => fill.action === 'BUY').every((fill) => (
      fill.envelope.adjustments.includes('clamped_by_max_name_weight')
    ))).toBe(true);

    prepare(book);
    const replay = simulateStrategyBook({
      setup: dualMomentumRotationSetup, series: toSeries(book), startingCash: new D(100_000),
      limits: limitsForDailySetup(dualMomentumRotationSetup.id, DEFAULT_BT_LIMITS),
    });
    prepare(book);
    const replay2 = simulateStrategyBook({
      setup: dualMomentumRotationSetup, series: toSeries(book), startingCash: new D(100_000),
      limits: limitsForDailySetup(dualMomentumRotationSetup.id, DEFAULT_BT_LIMITS),
    });
    expect(replay.daily.map((point) => point.nav.toString())).toEqual(replay2.daily.map((point) => point.nav.toString()));
  });

  it('pins the shared route, fixed universe, nine-trial 3x3 plateau, and source exclusion', () => {
    expect(selectDailyBacktestRoute(dualMomentumRotationSetup.id)).toBe('shared');
    expect(dailyUniverseForSetup(dualMomentumRotationSetup.id, null)).toEqual(DUAL_MOMENTUM_UNIVERSE);
    expect(() => dailyUniverseForSetup(dualMomentumRotationSetup.id, ['AAPL'])).toThrow(/exact seven-asset universe/);
    expect(validationTrialsForSetup(dualMomentumRotationSetup.id, DUAL_MOMENTUM_ROTATION_V1)).toBe(9);
    expect(limitsForDailySetup(dualMomentumRotationSetup.id, DEFAULT_BT_LIMITS)).toMatchObject({
      maxNameWeight: 0.25,
      maxOpenPositions: 1,
    });
    expect(dualMomentumRotationBookPolicy()).toEqual({
      maxGrossFraction: 0.25,
      maxOpenPositions: 1,
      decisionHistoryBars: 295,
    });
    expect(strategyBookPolicyForSetup(dualMomentumRotationSetup.id, DUAL_MOMENTUM_ROTATION_V1))
      .toEqual(dualMomentumRotationBookPolicy());
    const plateau = dualMomentumRotationSetup.plateauNeighborhood!(DUAL_MOMENTUM_ROTATION_V1);
    expect(plateau.center).toEqual(DUAL_MOMENTUM_ROTATION_V1);
    expect(plateau.neighbors).toHaveLength(8);
    expect(new Set(plateau.neighbors.map((neighbor) => `${neighbor.params.lookbackBars}|${neighbor.params.absoluteThreshold}`)))
      .toEqual(new Set(['210|-0.01', '210|0', '210|0.01', '252|-0.01', '252|0.01', '294|-0.01', '294|0', '294|0.01']));

    const mixed: DailyBarInput[] = ['YAHOO', 'MOCK', 'ALPACA'].map((source, index) => ({
      ts: new Date(index * DAY), open: new D(100), high: new D(100), low: new D(100), close: new D(100),
      volume: new D(1), source: source as DailyBarInput['source'],
    }));
    const filtered = filterRealDailyBars(mixed);
    expect(filtered.excludedMock).toBe(1);
    expect(filtered.real.map((bar) => bar.source)).toEqual(['YAHOO', 'ALPACA']);
    expect(() => simulateStrategyBook({
      setup: dualMomentumRotationSetup,
      series: [{ ...toSeries(monthEndBook('AAPL')).find((item) => item.symbol === 'NVDA')!, bars: [{ ...toSeries(monthEndBook('AAPL')).find((item) => item.symbol === 'NVDA')!.bars[0], source: 'MOCK' }] }],
      startingCash: new D(100_000), limits: DEFAULT_BT_LIMITS,
    })).toThrow(/requires YAHOO\/ALPACA/);
  });

  it('uses bilingual result-neutral research-only and unscreened execution-blocked copy', () => {
    const book = monthEndBook('AAPL');
    prepare(book);
    const signal = dualMomentumRotationSetup.signal(context('AAPL', book.get('AAPL')!));

    expect(signal.rationaleEn).toMatch(/declared research sleeve.*candidate.*research-only.*AAOIFI status unscreened.*execution blocked/i);
    expect(signal.rationaleAr).toMatch(/بحثية.*مرشحة.*للبحث فقط.*أيوفي.*يُحظر التنفيذ/);
  });
});
