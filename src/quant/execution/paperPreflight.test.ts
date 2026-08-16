import { describe, expect, it } from 'vitest';
// Runtime source intentionally stays dependency-free so the read-only Node CLI can use it directly.
import { evaluateAlpacaPaperPreflight, isExactAlpacaPaperUrl } from '../../../scripts/paper-preflight.mjs';

const clean = {
  baseUrl: 'https://paper-api.alpaca.markets',
  account: { status: 'ACTIVE', currency: 'USD', cash: '100000', buying_power: '200000', trading_blocked: false },
  positions: [],
  openOrders: [],
};

describe('Alpaca remote-paper preflight', () => {
  it('accepts only the exact paper origin', () => {
    expect(isExactAlpacaPaperUrl(clean.baseUrl)).toBe(true);
    expect(isExactAlpacaPaperUrl('https://paper-api.alpaca.markets/')).toBe(true);
    expect(isExactAlpacaPaperUrl('https://api.alpaca.markets')).toBe(false);
    expect(isExactAlpacaPaperUrl('https://paper-api.alpaca.markets.evil.test')).toBe(false);
    expect(isExactAlpacaPaperUrl('https://paper-api.alpaca.markets?next=live')).toBe(false);
  });

  it('allows a clean, active, positive-cash paper account', () => {
    expect(evaluateAlpacaPaperPreflight(clean)).toMatchObject({ ready: true, blockers: [] });
  });

  it('blocks the observed negative-cash and zero-buying-power account', () => {
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, cash: '-82800.08', buying_power: '0' },
    })).toMatchObject({ ready: false, blockers: ['NON_POSITIVE_CASH'] });
  });

  it('requires USD cash for the whole bounded run while ignoring margin buying power', () => {
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, cash: '499.9999', buying_power: '1000000' },
    }).blockers).toEqual(['CASH_BELOW_RUN_CAP']);
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, currency: 'SAR' },
    }).blockers).toEqual(['ACCOUNT_NOT_USD']);
  });

  it('blocks trading-disabled, dirty, or short paper accounts', () => {
    const result = evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, trading_blocked: true },
      positions: [{ symbol: 'AAPL', side: 'short', qty: '-2' }],
      openOrders: [{ id: 'order-1' }],
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual([
      'TRADING_BLOCKED',
      'UNRECONCILED_POSITIONS',
      'SHORT_POSITION',
      'OPEN_ORDERS',
    ]);
  });

  it('rejects malformed cash instead of treating it as zero', () => {
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, cash: 'NaN' },
    }).blockers).toEqual(['INVALID_CASH']);
  });

  it('treats an absent or malformed trading flag as blocked', () => {
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, trading_blocked: undefined },
    }).blockers).toEqual(['TRADING_BLOCKED']);
  });
});
