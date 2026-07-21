// Pure decision-logic tests for halal-sector-capped-risk-parity-wide v1 (hand-built arithmetic
// inputs test the weighting/breadth-floor rules only — validation evidence comes solely from real-
// bar runs through the CLI, per docs/STRATEGY_LAB.md). Mirrors halalSectorCappedRiskParityCore's own
// coverage plus a dedicated sector-table-completeness check for the wider 100-name sleeve.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1,
  HalalSectorCappedRiskParityWideParamsSchema,
  halalSectorCappedRiskParityWideBookPolicy,
  halalSectorCappedRiskParityWideSetup,
  isClassified,
} from './halalSectorCappedRiskParityWide';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 1);
const HISTORY_DATES = Array.from({ length: 253 }, (_, i) => new Date(START + i * DAY));
const MONTH_END = HISTORY_DATES.at(-1)!; // last bar of its month given daily spacing

type Row = { ts: Date; close: number; volume: number };

// A real, honestly-classified 100-name-scale sample sleeve (documented top-40 names from the
// narrow sibling's FULL run plus a real breadth sample beyond Semiconductors/Software/Tech
// Hardware — Health Care, Industrials, Consumer Staples, Materials, Energy, Real Estate, Utilities
// — every name here is covered by this file's SYMBOL_SECTOR table, so `configureUniverse` never
// throws). Deliberately still Semiconductor-heavy (matching the narrow sibling's diagnosed 42.5%
// concentration) but with genuine additional sector variety to redistribute into.
const REAL_WIDE_SLEEVE = [
  'MU', 'NVDA', 'SNDK', 'AAPL', 'TSLA', 'AMD', 'MSFT', 'GOOGL', 'AVGO', 'MRVL',
  'AMAT', 'ORCL', 'LRCX', 'STX', 'KLAC', 'IBM', 'LLY', 'LITE', 'GEV', 'GLW',
  'QCOM', 'CSCO', 'PANW', 'TXN', 'XOM', 'JNJ', 'CRWD', 'CRM', 'NOW', 'ABBV',
  'ADI', 'VRT', 'COHR', 'ANET', 'TER', 'PEP', 'ISRG', 'PG', 'MPWR', 'HD',
  // wide-sleeve-only real breadth additions:
  'ABT', 'DHR', 'TMO', 'VRTX', 'MCK', // Health Care
  'UNP', 'UPS', 'CTAS', 'ROP', 'MMM', // Industrials
  'ADM', 'CLX', 'MKC', // Consumer Staples
  'NEM', 'PKG', // Materials
  'TPL', // Energy
  'CSGP', // Real Estate
  'CEG', // Utilities
];

/** `symbols` with full 253-bar history; volatility strictly increasing in array index (index 0 is
 * lowest-vol, so it earns the largest raw inverse-vol weight before capping) — same convention as
 * both siblings' own test fixtures. */
function makeBook(symbols: readonly string[]): UniversePrepareInput {
  const dailyBarsBySymbol = new Map<string, Row[]>();
  symbols.forEach((symbol, s) => {
    const delta = 0.002 + s * 0.0004; // strictly increasing daily-return magnitude ⇒ increasing σ
    let price = 100;
    const rows: Row[] = HISTORY_DATES.map((ts, i) => {
      if (i > 0) price *= 1 + (i % 2 === 0 ? delta : -delta);
      return { ts, close: price, volume: 1_000_000 };
    });
    dailyBarsBySymbol.set(symbol, rows);
  });
  return { symbols: [...symbols], closesBySymbol: new Map(), dailyBarsBySymbol };
}

function ctx(symbol: string, asOf: Date, scope: object): StrategyPointInTimeContext {
  return {
    symbol, market: 'NASDAQ', asOf, bars: [], positionQty: new D(0), replayScope: scope,
  } as unknown as StrategyPointInTimeContext;
}

function prepare(input: UniversePrepareInput, scope: object): void {
  halalSectorCappedRiskParityWideSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-sector-capped-risk-parity-wide v1 — sector-table completeness', () => {
  it('classifies every symbol in the documented wide sample sleeve (no silent gaps)', () => {
    const unclassified = REAL_WIDE_SLEEVE.filter((symbol) => !isClassified(symbol));
    expect(unclassified).toEqual([]);
  });

  it('does not classify an obviously-fake symbol (fail-closed, never guesses)', () => {
    expect(isClassified('ZZZZNOTREAL')).toBe(false);
  });
});

describe('halal-sector-capped-risk-parity-wide v1 — HalalSectorCappedRiskParityWideParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalSectorCappedRiskParityWideParamsSchema.parse(HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1))
      .toEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
  });

  it('rejects a wrong version, non-integer lookback, out-of-range sectorCap/perNameCap, and wrong maxNames/minRankable', () => {
    const base = HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1;
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, version: 'v2' })).toThrow();
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, lookbackDays: 252.5 })).toThrow();
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, sectorCap: 0 })).toThrow();
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, sectorCap: 1.5 })).toThrow();
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, perNameCap: 1.5 })).toThrow();
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, maxNames: 40 })).toThrow();
    expect(() => HalalSectorCappedRiskParityWideParamsSchema.parse({ ...base, minRankable: 20 })).toThrow();
  });
});

describe('halal-sector-capped-risk-parity-wide v1 — full setup decision logic', () => {
  it('holds cash below the 15-name breadth floor', () => {
    const scope = {};
    prepare(makeBook(REAL_WIDE_SLEEVE.slice(0, 10)), scope);
    const weight = halalSectorCappedRiskParityWideSetup.targetWeight!(
      ctx(REAL_WIDE_SLEEVE[0], MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1,
    );
    expect(weight).toBe(0);
    const screened = halalSectorCappedRiskParityWideSetup.screen(
      ctx(REAL_WIDE_SLEEVE[0], MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1,
    );
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('insufficient_breadth');
  });

  it('throws at prepareUniverse for a symbol with no sector classification', () => {
    const scope = {};
    expect(() => prepare(makeBook([...REAL_WIDE_SLEEVE.slice(0, 20), 'ZZZZNOTREAL']), scope)).toThrow(
      /no sector classification/,
    );
  });

  it('assigns positive, sector-capped, name-capped weights on the wide sample sleeve, and no sector ever exceeds the cap', () => {
    const scope = {};
    prepare(makeBook(REAL_WIDE_SLEEVE), scope);
    const weights = REAL_WIDE_SLEEVE.map((symbol) => ({
      symbol,
      weight: halalSectorCappedRiskParityWideSetup.targetWeight!(ctx(symbol, MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1)!,
    }));
    expect(weights.every((w) => w.weight >= 0)).toBe(true);
    expect(weights.some((w) => w.weight > 0)).toBe(true);
    const sum = weights.reduce((a, w) => a + w.weight, 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    for (const w of weights) expect(w.weight).toBeLessThanOrEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1.perNameCap + 1e-9);
  });

  it('holds (null) between month-ends', () => {
    const scope = {};
    prepare(makeBook(REAL_WIDE_SLEEVE), scope);
    const midMonth = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(halalSectorCappedRiskParityWideSetup.targetWeight!(ctx('MU', midMonth, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1)).toBeNull();
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeBook(REAL_WIDE_SLEEVE), scope);
    const first = halalSectorCappedRiskParityWideSetup.targetWeight!(ctx('NVDA', MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
    const second = halalSectorCappedRiskParityWideSetup.targetWeight!(ctx('NVDA', MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeBook(REAL_WIDE_SLEEVE), otherScope);
    const third = halalSectorCappedRiskParityWideSetup.targetWeight!(ctx('NVDA', MONTH_END, otherScope), HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed): a tighter sectorCap can only shrink a bound sector name\'s weight', () => {
    const scope = {};
    prepare(makeBook(REAL_WIDE_SLEEVE), scope);
    const loose = halalSectorCappedRiskParityWideSetup.targetWeight!(
      ctx('MU', MONTH_END, scope), { ...HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1, sectorCap: 0.30 },
    );
    const tight = halalSectorCappedRiskParityWideSetup.targetWeight!(
      ctx('MU', MONTH_END, scope), { ...HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1, sectorCap: 0.10 },
    );
    expect(loose).toBeGreaterThan(0);
    expect(tight).toBeGreaterThan(0);
    expect(tight!).toBeLessThan(loose!);
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params', () => {
    const neighborhood = halalSectorCappedRiskParityWideSetup.plateauNeighborhood!(HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'sectorCap']);
    expect(neighborhood.center).toEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 100-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-sector-capped-risk-parity-wide', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-sector-capped-risk-parity-wide', undefined)).toEqual(halalSectorCappedRiskParityWideBookPolicy());
    expect(halalSectorCappedRiskParityWideBookPolicy().maxOpenPositions).toBe(100);
    expect(validationTrialsForSetup('halal-sector-capped-risk-parity-wide', HALAL_SECTOR_CAPPED_RISK_PARITY_WIDE_V1)).toBe(9);
  });
});
