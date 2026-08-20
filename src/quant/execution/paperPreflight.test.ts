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

describe('reconciliation semantics — durable-record accountability, not "any position exists"', () => {
  const LEGACY_POSITIONS = [
    { symbol: 'A', side: 'long', qty: '3' },
    { symbol: 'B', side: 'long', qty: '10' },
    { symbol: 'C', side: 'long', qty: '1.5' },
    { symbol: 'D', side: 'long', qty: '7' },
    { symbol: 'E', side: 'long', qty: '2' },
    { symbol: 'F', side: 'short', qty: '-4' },
  ];

  it('(a) the LEGACY account shape (negative cash, 6 positions, one short) still BLOCKS, with no durable records', () => {
    const result = evaluateAlpacaPaperPreflight({
      ...clean,
      account: { ...clean.account, cash: '-82800.08', buying_power: '0' },
      positions: LEGACY_POSITIONS,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(['NON_POSITIVE_CASH', 'UNRECONCILED_POSITIONS', 'SHORT_POSITION']);
  });

  it('(b) a position with NO matching durable record BLOCKS', () => {
    const result = evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'long', qty: '5' }],
      ourFilledOrders: [],
    });
    expect(result.blockers).toEqual(['UNRECONCILED_POSITIONS']);
  });

  it('(c) a position whose record exists but whose quantity does not match BLOCKS', () => {
    const result = evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'long', qty: '5' }],
      ourFilledOrders: [{ symbol: 'AAPL', side: 'BUY', qty: '4' }],
    });
    expect(result.blockers).toEqual(['UNRECONCILED_POSITIONS']);
  });

  it('(d) a position fully accounted for by our own filled records PASSES', () => {
    const result = evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'long', qty: '5' }],
      ourFilledOrders: [
        { symbol: 'AAPL', side: 'BUY', qty: '8' },
        { symbol: 'AAPL', side: 'SELL', qty: '3' },
        { symbol: 'MSFT', side: 'BUY', qty: '100' }, // unrelated symbol, must not interfere
      ],
    });
    expect(result).toMatchObject({ ready: true, blockers: [] });
  });

  it('(e) a SHORT position BLOCKS even when a record exists that would otherwise "net" to match', () => {
    const result = evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'short', qty: '-2' }],
      ourFilledOrders: [{ symbol: 'AAPL', side: 'SELL', qty: '2' }],
    });
    expect(result.blockers).toEqual(['UNRECONCILED_POSITIONS', 'SHORT_POSITION']);
  });

  it('(f) an ambiguous or unparseable position BLOCKS (fail-closed)', () => {
    // Unknown side.
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'weird', qty: '5' }],
      ourFilledOrders: [{ symbol: 'AAPL', side: 'BUY', qty: '5' }],
    }).blockers).toEqual(['UNRECONCILED_POSITIONS']);
    // Unparseable qty.
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'long', qty: 'not-a-number' }],
      ourFilledOrders: [{ symbol: 'AAPL', side: 'BUY', qty: '5' }],
    }).blockers).toEqual(['UNRECONCILED_POSITIONS']);
    // Our own record has an unparseable qty.
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'long', qty: '5' }],
      ourFilledOrders: [{ symbol: 'AAPL', side: 'BUY', qty: 'garbage' }],
    }).blockers).toEqual(['UNRECONCILED_POSITIONS']);
    // More than 6 fractional digits — more precision than the qty column tracks.
    expect(evaluateAlpacaPaperPreflight({
      ...clean,
      positions: [{ symbol: 'AAPL', side: 'long', qty: '5.1234567' }],
      ourFilledOrders: [{ symbol: 'AAPL', side: 'BUY', qty: '5.1234567' }],
    }).blockers).toEqual(['UNRECONCILED_POSITIONS']);
  });

  it('(g) a flat account still PASSES as it does today, with no durable records needed', () => {
    expect(evaluateAlpacaPaperPreflight({ ...clean, ourFilledOrders: [] })).toMatchObject({ ready: true, blockers: [] });
    expect(evaluateAlpacaPaperPreflight(clean)).toMatchObject({ ready: true, blockers: [] });
  });
});
