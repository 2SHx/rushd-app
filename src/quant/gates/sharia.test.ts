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

  it('returns compliant true for a compliant symbol', async () => {
    screenMock.mockResolvedValue({
      symbol: 'AAPL',
      compliant: true,
      standard: 'AAOIFI',
      source: 'mock',
      asOf: new Date(),
    });
    const gate = await evaluateShariaGate('AAPL', 'NASDAQ' as any);
    expect(gate.compliant).toBe(true);
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
