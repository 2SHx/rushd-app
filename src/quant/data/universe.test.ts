import { beforeEach, describe, expect, it, vi } from 'vitest';

const screen = vi.fn();

vi.mock('@/services/marketData', async () => {
  const actual = await vi.importActual<typeof import('@/services/marketData')>('@/services/marketData');
  return {
    ...actual,
    registry: { getScreener: () => ({ screen }) },
  };
});

import { getHalalUniverse } from './universe';

describe('getHalalUniverse', () => {
  beforeEach(() => {
    delete process.env.MARKET_DATA_MODE;
    screen.mockReset();
    screen.mockImplementation(async (symbol: string) => ({
      symbol,
      compliant: true,
      standard: 'AAOIFI',
      source: 'mock',
      asOf: new Date(),
    }));
  });

  it('reuses the 24-hour Sharia verdict cache', async () => {
    await getHalalUniverse('TASI');
    const firstPassCalls = screen.mock.calls.length;
    await getHalalUniverse('TASI');

    expect(firstPassCalls).toBeGreaterThan(0);
    expect(screen).toHaveBeenCalledTimes(firstPassCalls);
  });

  it('uses the full candidate roster when the allowlist is omitted', async () => {
    const universe = await getHalalUniverse('NASDAQ');

    expect(universe.map(entry => entry.symbol)).toEqual(expect.arrayContaining(['MSFT', 'NVDA', 'GOOGL']));
    expect(universe.length).toBeGreaterThan(3);
  });

  it('does not admit mock compliance verdicts in live mode', async () => {
    process.env.MARKET_DATA_MODE = 'live';

    const universe = await getHalalUniverse('NASDAQ');

    expect(universe).toEqual([]);
  });
});
