import { describe, it, expect } from 'vitest';
import {
  loadSpusTier1,
  tier1EntriesFromSpus,
  isInSpusFixture,
  loadHlalPurificationFactors,
} from './tier1SpusFixture';

describe('loadSpusTier1 (committed SPUS fixture)', () => {
  it('parses ≥200 valid rows and fail-closed excludes non-tradable ones (zero price)', () => {
    const { rows, excluded } = loadSpusTier1();
    expect(rows.length).toBeGreaterThanOrEqual(200);
    // TPG spinoff line + ABIOMED CVR line in the fixture both carry Price=0.0 -> non-tradable.
    expect(excluded.some((e) => e.symbol === '2602335D' && e.reasonCode === 'zero_or_invalid_price_not_tradable')).toBe(true);
    expect(excluded.some((e) => e.symbol === '003654100CVR')).toBe(true);
    // no row is ever both included and excluded
    const includedSymbols = new Set(rows.map((r) => r.symbol));
    for (const e of excluded) expect(includedSymbols.has(e.symbol)).toBe(false);
  });

  it('a well-known constituent parses with a real positive price/market value', () => {
    const { rows } = loadSpusTier1();
    const nvda = rows.find((r) => r.symbol === 'NVDA');
    expect(nvda).toBeTruthy();
    expect(nvda!.priceUsd.toNumber()).toBeGreaterThan(0);
    expect(nvda!.marketValueUsd.toNumber()).toBeGreaterThan(0);
    expect(nvda!.asOf).toBe('2026-07-17');
  });

  it('a missing filePath throws rather than fabricating data', () => {
    expect(() => loadSpusTier1({ filePath: '/nonexistent/path.csv' })).toThrow();
  });
});

describe('tier1EntriesFromSpus', () => {
  it('labels every entry index-provider-screened with n/a purification ratio (fund-level screen only)', () => {
    const { entries } = tier1EntriesFromSpus();
    expect(entries.length).toBeGreaterThanOrEqual(200);
    for (const e of entries) {
      expect(e.tier).toBe('index-provider-screened');
      expect(e.purificationRatioBps).toBe('n/a — not computed');
      // structured reason code (not prose) for the documented QDR-8 exception
      expect(e.reasonCodes).toContain('FUND_LEVEL_PURIFICATION_ONLY');
      expect(e.market).toBe('NASDAQ');
      expect(e.provenance).toContain('SPUS holdings fixture');
    }
  });

  it('a symbol absent from the fixture is fail-closed (not a member)', () => {
    const { entries } = tier1EntriesFromSpus();
    expect(isInSpusFixture('NOT_A_REAL_TICKER_XYZ', entries)).toBe(false);
    expect(isInSpusFixture('NVDA', entries)).toBe(true);
  });
});

describe('loadHlalPurificationFactors', () => {
  it('parses fund-level dividend purification quarters (never per-name, never holdings)', () => {
    const quarters = loadHlalPurificationFactors();
    expect(quarters.length).toBeGreaterThan(0);
    const q2 = quarters.find((q) => q.quarter === 'Q2');
    expect(q2).toBeTruthy();
    expect(q2!.dividendPerShare).toBeCloseTo(0.019);
    expect(q2!.purificationPerShare).toBeCloseTo(0.00095);
  });
});
