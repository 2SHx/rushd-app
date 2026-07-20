// Pure decision-logic tests for halal-sector-capped-risk-parity-core v1 (hand-built arithmetic
// inputs test the sector-cap/weighting/breadth-floor rules only — validation evidence comes solely
// from real-bar runs through the CLI, per docs/STRATEGY_LAB.md).
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { selectDailyBacktestRoute, strategyBookPolicyForSetup, validationTrialsForSetup } from '../../../scripts/backtest';
import { inverseVolatilityWeights } from './halalRiskParityCore';
import type { StrategyPointInTimeContext, UniversePrepareInput } from './types';
import {
  capSectorExposure,
  HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1,
  HalalSectorCappedRiskParityCoreParamsSchema,
  halalSectorCappedRiskParityCoreBookPolicy,
  halalSectorCappedRiskParityCoreSetup,
  sectorCappedInverseVolatilityWeights,
} from './halalSectorCappedRiskParityCore';

const D = Prisma.Decimal;
const DAY = 86_400_000;
const START = Date.UTC(2023, 0, 1);
const HISTORY_DATES = Array.from({ length: 253 }, (_, i) => new Date(START + i * DAY));
const MONTH_END = HISTORY_DATES.at(-1)!; // last bar of its month given daily spacing

type Row = { ts: Date; close: number; volume: number };

// The real, honestly-classified 40-name sleeve documented in halal-markowitz-core's / halal-risk-
// parity-core's FULL-run cards (docs/STRATEGY_LAB.md) — every name here is covered by this file's
// SYMBOL_SECTOR table, so `configureUniverse` never throws. 17 of the 40 are Semiconductors, which
// deliberately exceeds the default 30% sector cap once inverse-vol weighted, giving a real (not
// synthetic-sector) integration case where the cap must bind.
const REAL_40_SLEEVE = [
  'MU', 'NVDA', 'SNDK', 'AAPL', 'TSLA', 'AMD', 'MSFT', 'GOOGL', 'AVGO', 'MRVL',
  'AMAT', 'ORCL', 'LRCX', 'STX', 'KLAC', 'IBM', 'LLY', 'LITE', 'GEV', 'GLW',
  'QCOM', 'CSCO', 'PANW', 'TXN', 'XOM', 'JNJ', 'CRWD', 'CRM', 'NOW', 'ABBV',
  'ADI', 'VRT', 'COHR', 'ANET', 'TER', 'PEP', 'ISRG', 'PG', 'MPWR', 'HD',
];

/** `symbols` with full 253-bar history; volatility strictly increasing in array index (index 0 is
 * lowest-vol, so it earns the largest raw inverse-vol weight before capping) — same convention as
 * halal-risk-parity-core's own test fixture. */
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
  halalSectorCappedRiskParityCoreSetup.prepareUniverse({ ...input, replayScope: scope });
}

describe('halal-sector-capped-risk-parity-core v1 — capSectorExposure (hand-computable)', () => {
  it('scales an over-cap sector down to exactly the cap and redistributes the excess proportionally to other sectors', () => {
    // A=0.6 (S1), B=0.2 (S2), C=0.2 (S2); cap 0.5. S1 sum 0.6 > 0.5 → scale 0.5/0.6, excess 0.1.
    // Remaining (S2) sum 0.4 → B,C each get +(their share/0.4)*0.1 = +0.05.
    const sectors = new Map([['A', 'S1'], ['B', 'S2'], ['C', 'S2']]);
    const capped = capSectorExposure(new Map([['A', 0.6], ['B', 0.2], ['C', 0.2]]), sectors, 0.5);
    expect(capped.get('A')).toBeCloseTo(0.5, 10);
    expect(capped.get('B')).toBeCloseTo(0.25, 10);
    expect(capped.get('C')).toBeCloseTo(0.25, 10);
    const sum = Array.from(capped.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('leaves partial cash when every sector pins at the cap (capacity exhausted)', () => {
    // Three single-name sectors, weight 1/3 each, cap 0.2: all three exceed cap, none left to
    // redistribute to → each pins at 0.2, 0.4 residual cash.
    const sectors = new Map([['A', 'S1'], ['B', 'S2'], ['C', 'S3']]);
    const capped = capSectorExposure(new Map([['A', 1 / 3], ['B', 1 / 3], ['C', 1 / 3]]), sectors, 0.2);
    expect(capped.get('A')).toBeCloseTo(0.2, 10);
    expect(capped.get('B')).toBeCloseTo(0.2, 10);
    expect(capped.get('C')).toBeCloseTo(0.2, 10);
    const sum = Array.from(capped.values()).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(0.6, 10);
    expect(sum).toBeLessThanOrEqual(1);
  });

  it('is a no-op when no sector exceeds the cap', () => {
    const sectors = new Map([['A', 'S1'], ['B', 'S2']]);
    const weights = new Map([['A', 0.4], ['B', 0.3]]);
    const capped = capSectorExposure(weights, sectors, 0.5);
    expect(capped.get('A')).toBeCloseTo(0.4, 10);
    expect(capped.get('B')).toBeCloseTo(0.3, 10);
  });

  it('rejects an out-of-range sectorCap', () => {
    const sectors = new Map([['A', 'S1']]);
    expect(() => capSectorExposure(new Map([['A', 1]]), sectors, 0)).toThrow();
    expect(() => capSectorExposure(new Map([['A', 1]]), sectors, 1.5)).toThrow();
  });

  it('throws for a symbol with no sector classification (never silently misclassifies)', () => {
    const sectors = new Map([['A', 'S1']]);
    expect(() => capSectorExposure(new Map([['A', 0.5], ['B', 0.5]]), sectors, 0.3)).toThrow(/no sector classification/);
  });
});

describe('halal-sector-capped-risk-parity-core v1 — sectorCappedInverseVolatilityWeights pipeline', () => {
  const vol = new Map([['A', 0.01], ['B', 0.01], ['C', 0.02], ['D', 0.04]]);
  const sectors = new Map([['A', 'S1'], ['B', 'S1'], ['C', 'S2'], ['D', 'S2']]);

  it('with sectorCap=1 (no-op), the pipeline output is IDENTICAL to inverseVolatilityWeights+capAndRedistribute alone', () => {
    const pipeline = sectorCappedInverseVolatilityWeights(vol, sectors, 1, 0.5);
    const directOnly = inverseVolatilityWeights(vol, 0.5);
    expect(pipeline.size).toBe(directOnly.size);
    for (const [symbol, w] of Array.from(directOnly.entries())) {
      expect(pipeline.get(symbol)).toBeCloseTo(w, 12);
    }
  });

  it('a binding sectorCap keeps every sector at or below the cap and the total at or below 1', () => {
    const weights = sectorCappedInverseVolatilityWeights(vol, sectors, 0.3, 1);
    const bySector = new Map<string, number>();
    for (const [symbol, w] of Array.from(weights.entries())) {
      const sector = sectors.get(symbol)!;
      bySector.set(sector, (bySector.get(sector) ?? 0) + w);
    }
    for (const sum of Array.from(bySector.values())) expect(sum).toBeLessThanOrEqual(0.3 + 1e-9);
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('halal-sector-capped-risk-parity-core v1 — HalalSectorCappedRiskParityCoreParamsSchema', () => {
  it('accepts the frozen default params', () => {
    expect(HalalSectorCappedRiskParityCoreParamsSchema.parse(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1))
      .toEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
  });

  it('rejects a wrong version, non-integer lookback, out-of-range sectorCap/perNameCap, and wrong maxNames/minRankable', () => {
    const base = HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1;
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, version: 'v2' })).toThrow();
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, lookbackDays: 252.5 })).toThrow();
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, sectorCap: 0 })).toThrow();
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, sectorCap: 1.5 })).toThrow();
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, perNameCap: 1.5 })).toThrow();
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, maxNames: 60 })).toThrow();
    expect(() => HalalSectorCappedRiskParityCoreParamsSchema.parse({ ...base, minRankable: 20 })).toThrow();
  });
});

describe('halal-sector-capped-risk-parity-core v1 — full setup decision logic', () => {
  it('holds cash below the 15-name breadth floor', () => {
    const scope = {};
    prepare(makeBook(REAL_40_SLEEVE.slice(0, 10)), scope);
    const weight = halalSectorCappedRiskParityCoreSetup.targetWeight!(
      ctx(REAL_40_SLEEVE[0], MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1,
    );
    expect(weight).toBe(0);
    const screened = halalSectorCappedRiskParityCoreSetup.screen(
      ctx(REAL_40_SLEEVE[0], MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1,
    );
    expect(screened.matched).toBe(false);
    expect(screened.reasons).toContain('insufficient_breadth');
  });

  it('throws at prepareUniverse for a symbol with no sector classification', () => {
    const scope = {};
    expect(() => prepare(makeBook([...REAL_40_SLEEVE.slice(0, 20), 'ZZZZNOTREAL']), scope)).toThrow(
      /no sector classification/,
    );
  });

  it('assigns positive, sector-capped, name-capped weights on the real 40-name sleeve, and no sector ever exceeds the cap', () => {
    const scope = {};
    prepare(makeBook(REAL_40_SLEEVE), scope);
    const SECTOR_OF: Record<string, string> = {
      MU: 'Semiconductors', NVDA: 'Semiconductors', SNDK: 'Semiconductors', AMD: 'Semiconductors',
      AVGO: 'Semiconductors', MRVL: 'Semiconductors', AMAT: 'Semiconductors', LRCX: 'Semiconductors',
      STX: 'Semiconductors', KLAC: 'Semiconductors', LITE: 'Semiconductors', QCOM: 'Semiconductors',
      TXN: 'Semiconductors', ADI: 'Semiconductors', COHR: 'Semiconductors', TER: 'Semiconductors',
      MPWR: 'Semiconductors',
      AAPL: 'Tech Hardware', IBM: 'Tech Hardware', GLW: 'Tech Hardware', CSCO: 'Tech Hardware', ANET: 'Tech Hardware',
      TSLA: 'Consumer Discretionary', HD: 'Consumer Discretionary',
      MSFT: 'Software', ORCL: 'Software', PANW: 'Software', CRWD: 'Software', CRM: 'Software', NOW: 'Software',
      GOOGL: 'Communication Services',
      LLY: 'Health Care', JNJ: 'Health Care', ABBV: 'Health Care', ISRG: 'Health Care',
      GEV: 'Industrials', VRT: 'Industrials',
      XOM: 'Energy',
      PEP: 'Consumer Staples', PG: 'Consumer Staples',
    };
    const weights = REAL_40_SLEEVE.map((symbol) => ({
      symbol,
      weight: halalSectorCappedRiskParityCoreSetup.targetWeight!(ctx(symbol, MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1)!,
    }));
    expect(weights.every((w) => w.weight >= 0)).toBe(true);
    expect(weights.some((w) => w.weight > 0)).toBe(true);
    const sum = weights.reduce((a, w) => a + w.weight, 0);
    expect(sum).toBeLessThanOrEqual(1 + 1e-9);
    const bySector = new Map<string, number>();
    for (const { symbol, weight } of weights) {
      const sector = SECTOR_OF[symbol];
      bySector.set(sector, (bySector.get(sector) ?? 0) + weight);
    }
    // Semiconductors (17/40 names) is the deliberately over-represented sector; confirm the cap bound it.
    expect(bySector.get('Semiconductors')!).toBeLessThanOrEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1.sectorCap + 1e-9);
    for (const sectorSum of Array.from(bySector.values())) {
      expect(sectorSum).toBeLessThanOrEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1.sectorCap + 1e-9);
    }
    for (const w of weights) expect(w.weight).toBeLessThanOrEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1.perNameCap + 1e-9);
  });

  it('holds (null) between month-ends', () => {
    const scope = {};
    prepare(makeBook(REAL_40_SLEEVE), scope);
    const midMonth = HISTORY_DATES[HISTORY_DATES.length - 3];
    expect(halalSectorCappedRiskParityCoreSetup.targetWeight!(ctx('MU', midMonth, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1)).toBeNull();
  });

  it('is deterministic: repeated calls and independently prepared scopes agree exactly', () => {
    const scope = {};
    prepare(makeBook(REAL_40_SLEEVE), scope);
    const first = halalSectorCappedRiskParityCoreSetup.targetWeight!(ctx('NVDA', MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
    const second = halalSectorCappedRiskParityCoreSetup.targetWeight!(ctx('NVDA', MONTH_END, scope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
    expect(second).toBe(first);

    const otherScope = {};
    prepare(makeBook(REAL_40_SLEEVE), otherScope);
    const third = halalSectorCappedRiskParityCoreSetup.targetWeight!(ctx('NVDA', MONTH_END, otherScope), HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
    expect(third).toBe(first);
  });

  it('plateau-neighbor params get their own decisions (cache is params-keyed): a tighter sectorCap can only shrink a bound sector name\'s weight', () => {
    const scope = {};
    prepare(makeBook(REAL_40_SLEEVE), scope);
    // Both 0.10 and 0.30 bind (Semiconductors' uncapped share is well above either), and both start
    // from the SAME base uncapped inverse-vol weights, so scale = sectorCap / originalSectorSum is
    // strictly smaller for the tighter cap ⇒ every Semiconductors name's weight strictly shrinks.
    const loose = halalSectorCappedRiskParityCoreSetup.targetWeight!(
      ctx('MU', MONTH_END, scope), { ...HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1, sectorCap: 0.30 },
    );
    const tight = halalSectorCappedRiskParityCoreSetup.targetWeight!(
      ctx('MU', MONTH_END, scope), { ...HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1, sectorCap: 0.10 },
    );
    expect(loose).toBeGreaterThan(0);
    expect(tight).toBeGreaterThan(0);
    expect(tight!).toBeLessThan(loose!);
  });

  it('declares a frozen 3×3 plateau neighborhood centered on the default params', () => {
    const neighborhood = halalSectorCappedRiskParityCoreSetup.plateauNeighborhood!(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
    expect(neighborhood.axes).toEqual(['lookbackDays', 'sectorCap']);
    expect(neighborhood.center).toEqual(HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1);
    expect(neighborhood.neighbors).toHaveLength(8); // 3×3 grid minus the center
  });

  it('is registered: shared route, 40-position policy, 9 validation trials', () => {
    expect(selectDailyBacktestRoute('halal-sector-capped-risk-parity-core', undefined)).toBe('shared');
    expect(strategyBookPolicyForSetup('halal-sector-capped-risk-parity-core', undefined)).toEqual(halalSectorCappedRiskParityCoreBookPolicy());
    expect(halalSectorCappedRiskParityCoreBookPolicy().maxOpenPositions).toBe(40);
    expect(validationTrialsForSetup('halal-sector-capped-risk-parity-core', HALAL_SECTOR_CAPPED_RISK_PARITY_CORE_V1)).toBe(9);
  });
});
