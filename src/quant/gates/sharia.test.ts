import { describe, it, expect, vi, beforeEach } from 'vitest';

const screenMock = vi.fn();
vi.mock('@/services/marketData', () => ({
  registry: { getScreener: () => ({ screen: screenMock }) },
}));

import { evaluateShariaGate, gateAllowsAction } from './sharia';

describe('evaluateShariaGate', () => {
  beforeEach(() => {
    screenMock.mockReset();
  });

  it('returns compliant true for a compliant symbol from a verified source', async () => {
    screenMock.mockResolvedValue({
      symbol: 'AAPL',
      compliant: true,
      standard: 'AAOIFI',
      source: 'zoya',
      asOf: new Date(),
    });
    const gate = await evaluateShariaGate('AAPL', 'NASDAQ' as any);
    expect(gate.compliant).toBe(true);
  });

  it('fails closed when a mock source claims compliance', async () => {
    screenMock.mockResolvedValue({
      symbol: 'AAPL',
      compliant: true,
      standard: 'AAOIFI',
      source: 'mock',
      asOf: new Date(),
    });
    const gate = await evaluateShariaGate('AAPL', 'NASDAQ' as any);
    expect(gate).toMatchObject({
      compliant: false,
      reason: 'unverified_source_fail_closed',
      source: 'mock',
    });
  });

  it.each(['etf-holdings', 'saudi-sharia-list'])('accepts current compliant %s evidence', async (source) => {
    screenMock.mockResolvedValue({
      symbol: 'AAPL', compliant: true, standard: 'AAOIFI', source, asOf: new Date(),
    });
    expect(await evaluateShariaGate('AAPL', 'NASDAQ' as any)).toMatchObject({ compliant: true, source });
  });

  it('fails closed on stale, future-dated, or arbitrary positive evidence', async () => {
    for (const verdict of [
      { source: 'etf-holdings', asOf: new Date(Date.now() - 551 * 86_400_000) },
      { source: 'zoya', asOf: new Date(Date.now() + 86_400_000) },
      { source: 'owner-spreadsheet', asOf: new Date() },
    ]) {
      screenMock.mockResolvedValue({
        symbol: 'AAPL', compliant: true, standard: 'AAOIFI', ...verdict,
      });
      expect((await evaluateShariaGate('AAPL', 'NASDAQ' as any)).compliant).toBe(false);
    }
  });

  it('returns compliant false for a blacklisted symbol (TSLA)', async () => {
    screenMock.mockResolvedValue({
      symbol: 'TSLA',
      compliant: false,
      standard: 'AAOIFI',
      source: 'mock',
      asOf: new Date(),
    });
    const gate = await evaluateShariaGate('TSLA', 'NASDAQ' as any);
    expect(gate.compliant).toBe(false);
  });

  it('fails closed when free sources do not cover the symbol', async () => {
    screenMock.mockResolvedValue({
      symbol: 'UNKNOWN', compliant: null, standard: 'AAOIFI', source: 'none', asOf: new Date(),
    });
    expect(await evaluateShariaGate('UNKNOWN', 'NASDAQ' as any)).toMatchObject({
      compliant: false,
      reason: 'not_covered_by_free_sources',
      source: 'none',
    });
  });

  it('fails closed when the screener throws', async () => {
    screenMock.mockRejectedValue(new Error('provider down'));
    const gate = await evaluateShariaGate('AAPL', 'NASDAQ' as any);
    expect(gate.compliant).toBe(false);
    expect(gate.reason).toMatch(/fail_closed/);
  });
});

describe('gateAllowsAction', () => {
  it('blocks BUY but allows SELL/HOLD when non-compliant', () => {
    const gate = { compliant: false, reason: 'aaoifi_screen_fail', standard: 'AAOIFI', source: 'mock' };
    expect(gateAllowsAction(gate, 'BUY')).toBe(false);
    expect(gateAllowsAction(gate, 'SELL')).toBe(true);
    expect(gateAllowsAction(gate, 'HOLD')).toBe(true);
  });

  it('allows all actions when compliant', () => {
    const gate = { compliant: true, reason: 'aaoifi_screen_pass', standard: 'AAOIFI', source: 'mock' };
    expect(gateAllowsAction(gate, 'BUY')).toBe(true);
    expect(gateAllowsAction(gate, 'SELL')).toBe(true);
    expect(gateAllowsAction(gate, 'HOLD')).toBe(true);
  });
});
