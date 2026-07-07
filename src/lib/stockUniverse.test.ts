// src/lib/stockUniverse.test.ts
// Pure matcher tests — no network, no Prisma, no mocking required.
import { describe, it, expect } from 'vitest';
import { searchUniverse, TASI_UNIVERSE, NASDAQ_UNIVERSE_FALLBACK, type StockUniverseEntry } from './stockUniverse';

const sample: StockUniverseEntry[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', arName: 'أبل', market: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corp.', arName: 'مايكروسوفت', market: 'NASDAQ' },
  { symbol: '2222.SR', name: 'Saudi Aramco', arName: 'أرامكو السعودية', market: 'TASI' },
  { symbol: '1120.SR', name: 'Al Rajhi Bank', arName: 'مصرف الراجحي', market: 'TASI' },
];

describe('searchUniverse', () => {
  it('matches by symbol (case-insensitive)', () => {
    const results = searchUniverse(sample, 'aapl');
    expect(results.map((r) => r.symbol)).toEqual(['AAPL']);
  });

  it('matches by English name substring', () => {
    const results = searchUniverse(sample, 'aramco');
    expect(results.map((r) => r.symbol)).toEqual(['2222.SR']);
  });

  it('matches by Arabic name substring', () => {
    const results = searchUniverse(sample, 'راجحي');
    expect(results.map((r) => r.symbol)).toEqual(['1120.SR']);
  });

  it('returns an empty array for a blank query', () => {
    expect(searchUniverse(sample, '   ')).toEqual([]);
  });

  it('returns no matches when nothing matches', () => {
    expect(searchUniverse(sample, 'zzzzz')).toEqual([]);
  });

  it('caps results at the given limit', () => {
    const big: StockUniverseEntry[] = Array.from({ length: 50 }, (_, i) => ({
      symbol: `SYM${i}`,
      name: 'Common Corp',
      arName: '',
      market: 'NASDAQ' as const,
    }));
    const results = searchUniverse(big, 'common', 5);
    expect(results).toHaveLength(5);
  });
});

describe('bundled universes', () => {
  it('TASI roster has at least 50 real, verified companies', () => {
    expect(TASI_UNIVERSE.length).toBeGreaterThanOrEqual(50);
  });

  it('NASDAQ fallback roster has at least 40 companies', () => {
    expect(NASDAQ_UNIVERSE_FALLBACK.length).toBeGreaterThanOrEqual(40);
  });

  it('finds AAPL by English-name match in the real NASDAQ fallback list', () => {
    const results = searchUniverse(NASDAQ_UNIVERSE_FALLBACK, 'app');
    expect(results.some((r) => r.symbol === 'AAPL')).toBe(true);
  });

  it('finds Saudi Aramco by name and Al Rajhi by Arabic name in the real TASI roster', () => {
    expect(searchUniverse(TASI_UNIVERSE, 'aramco').some((r) => r.symbol === '2222.SR')).toBe(true);
    expect(searchUniverse(TASI_UNIVERSE, 'راجحي').some((r) => r.symbol === '1120.SR')).toBe(true);
  });
});
