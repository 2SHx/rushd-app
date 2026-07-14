import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BT_LIMITS } from '../backtest/engine';
import { simulateStrategyBook, type StrategyBookSeries } from '../backtest/portfolioEngine';
import type { StrategyPointInTimeContext } from './types';
import {
  TOM_OVERLAY_UNIVERSE,
  TOM_OVERLAY_V1,
  buildTomEligibility,
  tomOverlayBookPolicy,
  tomOverlaySetup,
} from './tomOverlay';
import {
  backtestRunMode,
  dailyUniverseForSetup,
  diagnosticReportOutput,
  exposureReturnBlocks,
  limitsForDailySetup,
  selectDailyBacktestRoute,
  strategyBookPolicyForSetup,
  validationTradeRecordsForSetup,
  validationTrialsForSetup,
} from '../../../scripts/backtest';

const D = Prisma.Decimal;

const DATES = [
  '2023-11-01', '2023-11-02', '2023-11-03', '2023-11-27', '2023-11-28', '2023-11-29', '2023-11-30',
  '2023-12-01', '2023-12-04', '2023-12-05', '2023-12-06',
  '2023-12-20', '2023-12-21', '2023-12-22', '2023-12-26', '2023-12-27', '2023-12-28', '2023-12-29',
  '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08',
  '2024-01-25', '2024-01-26', '2024-01-29', '2024-01-30', '2024-01-31',
  '2024-02-01', '2024-02-02', '2024-02-05', '2024-02-06', '2024-02-07', '2024-02-08',
].map((date) => new Date(`${date}T00:00:00.000Z`));

function rows(close = 100): { ts: Date; close: number }[] {
  return DATES.map((ts, index) => ({ ts, close: close + index }));
}

function prepare(source = rows()): void {
  tomOverlaySetup.prepareUniverse!({ symbols: ['SPUS'], closesBySymbol: new Map([['SPUS', source]]) });
}

function context(asOf: Date, source = rows(), positionQty = new D(0)): StrategyPointInTimeContext {
  const available = source.filter((row) => row.ts <= asOf);
  return {
    symbol: 'SPUS', market: 'NASDAQ', asOf, snapshot: null, positionQty,
    bars: available.map((row, index) => ({
      id: `SPUS-${index}`, symbol: 'SPUS', market: 'NASDAQ', ts: row.ts,
      open: new D(row.close), high: new D(row.close), low: new D(row.close), close: new D(row.close),
      volume: new D(1_000_000_000), session: 'REGULAR', source: 'YAHOO', createdAt: row.ts,
    })),
  };
}

function series(source = rows()): StrategyBookSeries[] {
  return [{
    symbol: 'SPUS', market: 'NASDAQ',
    bars: source.map((row) => ({
      ts: row.ts, open: new D(row.close), high: new D(row.close), low: new D(row.close), close: new D(row.close),
      volume: new D(1_000_000_000), source: 'YAHOO',
    })),
  }];
}

function flatSeries(
  source: readonly { ts: Date; close: number }[],
  opts: { high?: number; low?: number; volumeAt?: (ts: Date) => number } = {},
): StrategyBookSeries[] {
  return [{
    symbol: 'SPUS', market: 'NASDAQ',
    bars: source.map((row) => ({
      ts: row.ts, open: new D(row.close), high: new D(opts.high ?? row.close),
      low: new D(opts.low ?? row.close), close: new D(row.close),
      volume: new D(opts.volumeAt?.(row.ts) ?? 1_000_000_000), source: 'YAHOO',
    })),
  }];
}

describe('tom-overlay v1', () => {
  it('builds contiguous last-4/first-3 windows and fails closed at both boundaries', () => {
    const eligible = buildTomEligibility(DATES, 4, 3);
    expect(['2023-12-26', '2023-12-27', '2023-12-28', '2023-12-29', '2024-01-02', '2024-01-03', '2024-01-04']
      .every((date) => eligible.has(Date.parse(`${date}T00:00:00.000Z`)))).toBe(true);
    expect(eligible.has(Date.parse('2023-11-01T00:00:00.000Z'))).toBe(false);
    expect(eligible.has(Date.parse('2024-02-08T00:00:00.000Z'))).toBe(false);
    const terminalBeforeFourthSession = DATES.filter((ts) => ts <= new Date('2024-02-05T00:00:00.000Z'));
    expect(buildTomEligibility(terminalBeforeFourthSession, 4, 3).has(Date.parse('2024-01-31T00:00:00.000Z')))
      .toBe(false);
  });

  it('signals one close before the window, exits after first-3 close, and exposes calendar ambiguity', () => {
    prepare();
    const entry = tomOverlaySetup.entry(context(new Date('2023-12-22T00:00:00.000Z')));
    const exit = tomOverlaySetup.exit(context(new Date('2024-01-04T00:00:00.000Z'), rows(), new D(10)));
    expect(entry.matched).toBe(true);
    expect(entry.evidence).toContainEqual(expect.objectContaining({
      ref: 'calendar_basis', value: 'observed_SPUS_sessions_missing_bar_indistinguishable_from_holiday',
    }));
    expect(exit.matched).toBe(true);
    expect(tomOverlaySetup.entry(context(new Date('2023-12-26T00:00:00.000Z'))).matched).toBe(false);
  });

  it('depends only on timestamps, rejects future bars, and validates the exact positive chronological spine', () => {
    prepare(rows(100));
    const asOf = new Date('2023-12-22T00:00:00.000Z');
    const before = tomOverlaySetup.entry(context(asOf));
    const changed = rows(100).map((row) => ({ ...row, close: row.ts > asOf ? 1_000_000 : row.close }));
    prepare(changed);
    expect(tomOverlaySetup.entry(context(asOf))).toEqual(before);
    const ctx = context(asOf);
    expect(() => tomOverlaySetup.entry({
      ...ctx, bars: [...ctx.bars, { ...ctx.bars.at(-1)!, ts: new Date('2025-01-01T00:00:00.000Z') }],
    })).toThrow(/Look-ahead/);
    expect(() => tomOverlaySetup.prepareUniverse!({ symbols: ['HLAL'], closesBySymbol: new Map([['HLAL', rows()]]) }))
      .toThrow(/exact SPUS universe/);
    expect(() => prepare([{ ts: DATES[0], close: 100 }, { ts: DATES[0], close: 101 }])).toThrow(/chronological/);
    expect(() => prepare([{ ts: DATES[0], close: 0 }])).toThrow(/chronological/);
  });

  it('fills next-open, closes episodes, remains max-one, and continuously caps gross at 25%', () => {
    prepare();
    const result = simulateStrategyBook({
      setup: tomOverlaySetup, series: series(), startingCash: new D(100_000),
      limits: limitsForDailySetup(tomOverlaySetup.id, {
        ...DEFAULT_BT_LIMITS, maxRiskPct: 100, volTargetPct: 100, liquidityAdvFraction: 1,
      }), policy: tomOverlayBookPolicy(),
    });
    const fills = result.fills.map((fill) => `${fill.action}:${fill.ts.toISOString().slice(0, 10)}`);
    expect(fills).toContain('BUY:2023-12-26');
    expect(fills).toContain('SELL:2024-01-05');
    expect(Math.max(...result.daily.map((point) => point.positions.length))).toBe(1);
    expect(result.daily.every((point) => point.cash.gte(0))).toBe(true);
    expect(result.fills.every((fill) => fill.navAfter.lte(0) || fill.positionsValueAfter.div(fill.navAfter).lte(0.25000001))).toBe(true);
    expect(validationTradeRecordsForSetup(tomOverlaySetup.id, result.tradeRecords)).toHaveLength(3);
    const blocks = exposureReturnBlocks(result.daily);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((block) => block.length > 0)).toBe(true);
  });

  it('retries a liquidity-partial boundary exit on later opens until flat, without a late entry retry', () => {
    const flat = rows().map((row) => ({ ...row, close: 100 }));
    prepare(flat);
    const thinExitOpens = new Set(['2024-01-05', '2024-01-08', '2024-01-25']);
    const result = simulateStrategyBook({
      setup: tomOverlaySetup,
      series: flatSeries(flat, {
        volumeAt: (ts) => thinExitOpens.has(ts.toISOString().slice(0, 10)) ? 1 : 1_000_000_000,
      }),
      startingCash: new D(1_000),
      limits: { ...DEFAULT_BT_LIMITS, liquidityAdvFraction: 1 },
      policy: tomOverlayBookPolicy(),
    });
    const januarySells = result.fills
      .filter((fill) => fill.action === 'SELL' && fill.ts.getUTCMonth() === 0)
      .map((fill) => fill.ts.toISOString().slice(0, 10));
    const january25 = result.daily.find((point) => point.ts.toISOString().startsWith('2024-01-25'))!;

    expect(januarySells).toEqual(['2024-01-05', '2024-01-08', '2024-01-25']);
    expect(january25.positions).toHaveLength(0);
  });

  it('passes trailing high-range history into both volatility and max-risk clamps', () => {
    const flat = rows().map((row) => ({ ...row, close: 100 }));
    prepare(flat);
    const result = simulateStrategyBook({
      setup: tomOverlaySetup,
      series: flatSeries(flat, { high: 150, low: 50 }),
      startingCash: new D(100_000), limits: DEFAULT_BT_LIMITS,
      policy: tomOverlayBookPolicy(),
    });
    const buy = result.fills.find((fill) => fill.action === 'BUY')!;

    expect(buy.envelope.adjustments).toContain('clamped_by_vol_target');
    expect(buy.envelope.adjustments).toContain('clamped_by_max_risk_pct');
    expect(buy.qty.lt(250)).toBe(true);
  });

  it('pins exact routing, nine trials, center+8 plateau, and the fixed-cap policy', () => {
    expect(TOM_OVERLAY_UNIVERSE).toEqual(['SPUS']);
    expect(selectDailyBacktestRoute(tomOverlaySetup.id)).toBe('shared');
    expect(dailyUniverseForSetup(tomOverlaySetup.id, null)).toEqual(['SPUS']);
    expect(() => dailyUniverseForSetup(tomOverlaySetup.id, ['HLAL'])).toThrow(/exact SPUS universe/);
    expect(validationTrialsForSetup(tomOverlaySetup.id, TOM_OVERLAY_V1)).toBe(9);
    expect(limitsForDailySetup(tomOverlaySetup.id, DEFAULT_BT_LIMITS).maxOpenPositions).toBe(1);
    expect(strategyBookPolicyForSetup(tomOverlaySetup.id, TOM_OVERLAY_V1)).toEqual(tomOverlayBookPolicy());
    expect(tomOverlayBookPolicy()).toEqual({ maxGrossFraction: 0.25, maxOpenPositions: 1 });
    const plateau = tomOverlaySetup.plateauNeighborhood!(TOM_OVERLAY_V1);
    expect(plateau.neighbors).toHaveLength(8);
    expect(new Set(plateau.neighbors.map((item) => `${item.params.lastSessions}|${item.params.firstSessions}`)))
      .toEqual(new Set(['3|2', '3|3', '3|4', '4|2', '4|4', '5|2', '5|3', '5|4']));
  });

  it('marks diagnostics loudly and removes the terminal STATUS label', () => {
    expect(backtestRunMode(undefined)).toBe('TERMINAL');
    expect(backtestRunMode('true')).toBe('DIAGNOSTIC_NON_TERMINAL');
    expect(() => backtestRunMode('maybe')).toThrow(/diagnostic/);
    expect(diagnosticReportOutput('header\n  STATUS: REJECTED', 'DIAGNOSTIC_NON_TERMINAL')).toBe(
      'DIAGNOSTIC_NON_TERMINAL\nheader\n  DIAGNOSTIC CHECKLIST (NON-TERMINAL): standard gates shown for context only',
    );
  });

  it('uses bilingual candidate-only, unscreened, execution-blocked language', () => {
    prepare();
    const signal = tomOverlaySetup.signal(context(new Date('2023-12-22T00:00:00.000Z')));
    expect(signal.rationaleEn).toMatch(/candidate.*research-only.*AAOIFI-unscreened.*execution blocked/i);
    expect(signal.rationaleAr).toMatch(/مرشح.*للبحث فقط.*أيوفي.*يحظر التنفيذ/);
    expect(signal.rationaleEn).toMatch(/never halal-certified/i);
  });
});
