import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { ShariaScreener, ShariaVerdict } from '@/services/marketData';
import { buildShariaRunSnapshot, deriveShariaState } from './shariaSnapshot';

// Network-free: keyless never touches a screener; the configured case injects a mock screener, so no
// Zoya HTTP call is ever made. No database is used anywhere in this suite.
function mockScreener(nonCompliant: Set<string> = new Set()): ShariaScreener {
  return {
    screen: vi.fn(async (symbol: string): Promise<ShariaVerdict> => ({
      symbol,
      compliant: !nonCompliant.has(symbol),
      standard: 'AAOIFI',
      source: 'zoya',
      asOf: new Date('2026-01-01T00:00:00.000Z'),
    })),
  };
}

describe('buildShariaRunSnapshot', () => {
  beforeEach(() => {
    delete process.env.ZOYA_API_KEY;
    delete process.env.MARKET_DATA_MODE;
  });

  it('records UNSCREENED honestly when no real source is configured — and never screens', async () => {
    const screener = mockScreener();
    const snap = await buildShariaRunSnapshot(['MSFT', 'AAPL'], 'NASDAQ', { screener });
    expect(snap.screened).toBe(false);
    expect(snap.source).toBe('none');
    expect(snap.state).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(snap.verdicts).toEqual([
      { symbol: 'AAPL', compliant: null, standard: 'AAOIFI', source: 'none', reason: 'unscreened_no_real_source' },
      { symbol: 'MSFT', compliant: null, standard: 'AAOIFI', source: 'none', reason: 'unscreened_no_real_source' },
    ]);
    // Keyless MUST NOT fabricate a verdict from any screener.
    expect(screener.screen).not.toHaveBeenCalled();
    // Serializes cleanly for the results JSON / BacktestRun.
    expect(JSON.parse(JSON.stringify(snap)).state).toBe('UNSCREENED_EXECUTION_BLOCKED');
  });

  it('derives VERIFIED_COMPLIANT from a real screening source when every symbol passes', async () => {
    const snap = await buildShariaRunSnapshot(['MSFT', 'AAPL'], 'NASDAQ', {
      screened: true, screener: mockScreener(),
    });
    expect(snap.screened).toBe(true);
    expect(snap.source).toBe('zoya');
    expect(snap.state).toBe('VERIFIED_COMPLIANT');
    expect(snap.verdicts.every((v) => v.compliant === true && v.source === 'zoya')).toBe(true);
  });

  it('derives VERIFIED_NON_COMPLIANT (fail-closed) when any symbol fails the real screen', async () => {
    const snap = await buildShariaRunSnapshot(['MSFT', 'TSLA'], 'NASDAQ', {
      screened: true, screener: mockScreener(new Set(['TSLA'])),
    });
    expect(snap.state).toBe('VERIFIED_NON_COMPLIANT');
    expect(snap.verdicts.find((v) => v.symbol === 'TSLA')!.compliant).toBe(false);
  });
});

describe('deriveShariaState', () => {
  it('maps screened flag + verdicts to the honest card state', () => {
    expect(deriveShariaState(false, [])).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(deriveShariaState(true, [])).toBe('UNSCREENED_EXECUTION_BLOCKED');
    expect(deriveShariaState(true, [{ compliant: true }, { compliant: true }])).toBe('VERIFIED_COMPLIANT');
    expect(deriveShariaState(true, [{ compliant: true }, { compliant: null }])).toBe('VERIFIED_NON_COMPLIANT');
    expect(deriveShariaState(true, [{ compliant: false }])).toBe('VERIFIED_NON_COMPLIANT');
  });
});
