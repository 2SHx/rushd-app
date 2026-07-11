import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('automation free-tier caps', () => {
  it('accepts configuration but never exceeds hard ceilings', async () => {
    process.env.AUTO_RUN_MAX_STRATEGIES = '500';
    process.env.AUTO_RUN_MAX_SYMBOLS = '200';
    vi.resetModules();

    const { MAX_STRATEGIES, MAX_SYMBOLS_PER_STRATEGY } = await import('./autoRun');

    expect(MAX_STRATEGIES).toBe(50);
    expect(MAX_SYMBOLS_PER_STRATEGY).toBe(20);
  });
});
