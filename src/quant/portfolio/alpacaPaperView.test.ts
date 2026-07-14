import { describe, expect, it, vi } from 'vitest';
import { loadAlpacaPaperView } from './alpacaPaperView';
import type { SessionUser } from '@/lib/auth-credentials';
import type { AlpacaPaperPortfolioSnapshot } from '@/quant/execution/alpacaPaper';

const parent: SessionUser = { id: 'parent-1', role: 'PARENT', tier: 'ULTRA', parentId: null };
const child: SessionUser = { id: 'child-1', role: 'CHILD', tier: 'BASIC', parentId: 'parent-1' };
const configured = {
  NODE_ENV: 'development',
  MARKET_DATA_MODE: 'live',
  ALPACA_API_KEY: 'key',
  ALPACA_API_SECRET: 'secret',
  ALPACA_PAPER: 'true',
} as NodeJS.ProcessEnv;
const snapshot: AlpacaPaperPortfolioSnapshot = {
  retrievedAt: '2026-07-15T00:00:00.000Z',
  account: {
    status: 'ACTIVE', currency: 'USD', equity: '100000', cash: '-1000', buyingPower: '198000',
    dayPnl: '250', dayPnlPct: '0.002506', cashNegative: true, tradingBlocked: false,
  },
  positions: [],
  openOrders: [],
};

describe('loadAlpacaPaperView', () => {
  it('never exposes the shared broker account to a child', async () => {
    const load = vi.fn(async () => snapshot);
    expect(await loadAlpacaPaperView(child, configured, load)).toEqual({ status: 'hidden' });
    expect(load).not.toHaveBeenCalled();
  });

  it('requires an explicit viewer allowlist outside development', async () => {
    const env = { ...configured, NODE_ENV: 'production' } as NodeJS.ProcessEnv;
    expect(await loadAlpacaPaperView(parent, env, async () => snapshot)).toEqual({ status: 'hidden' });
    expect(await loadAlpacaPaperView(parent, {
      ...env,
      ALPACA_PORTFOLIO_VIEWER_USER_IDS: 'other, parent-1',
    } as NodeJS.ProcessEnv, async () => snapshot)).toMatchObject({ status: 'ready' });
  });

  it('shows an honest configuration state without paper credentials', async () => {
    expect(await loadAlpacaPaperView(parent, { NODE_ENV: 'development' } as NodeJS.ProcessEnv))
      .toEqual({ status: 'unconfigured' });
  });

  it('reads the paper account independently of the quote-data mode', async () => {
    const env = { ...configured, MARKET_DATA_MODE: 'bundled' } as NodeJS.ProcessEnv;
    expect(await loadAlpacaPaperView(parent, env, async () => snapshot))
      .toEqual({ status: 'ready', ...snapshot });
  });

  it('returns the adapter snapshot and degrades without leaking an upstream error', async () => {
    expect(await loadAlpacaPaperView(parent, configured, async () => snapshot))
      .toEqual({ status: 'ready', ...snapshot });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadAlpacaPaperView(parent, configured, async () => { throw new Error('secret upstream detail'); }))
      .toEqual({ status: 'error' });
    expect(warn).toHaveBeenCalledWith('[alpaca-paper] Portfolio snapshot unavailable.');
    warn.mockRestore();
  });
});
