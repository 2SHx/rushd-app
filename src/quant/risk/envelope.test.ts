import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { applyEnvelope, type PortfolioState, type MarketState, type RiskLimits, type ProposedDecision } from './envelope';

const D = Prisma.Decimal;

const limits: RiskLimits = {
  maxNameWeight: 0.5,
  maxGrossExposure: 1.0,
  maxOpenPositions: 10,
  maxRiskPct: 0.02,
  volTargetPct: 0.01,
  liquidityAdvFraction: 0.05,
  drawdownHaltPct: 0.2,
};

function basePortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return {
    equity: new D(100000),
    cash: new D(100000),
    positions: [],
    peakEquity: new D(100000),
    ...overrides,
  };
}

function baseMarket(overrides: Partial<MarketState> = {}): MarketState {
  return {
    symbol: 'AAPL',
    price: new D(100),
    atr: new D(5),
    adv: new D(1000),
    stopPrice: new D(95),
    ...overrides,
  };
}

describe('applyEnvelope', () => {
  it('kill-switch forces HOLD and blocks regardless of proposal', () => {
    const proposal: ProposedDecision = { action: 'BUY', qty: new D(10) };
    const result = applyEnvelope(proposal, basePortfolio(), baseMarket(), limits, true);
    expect(result.action).toBe('HOLD');
    expect(result.blocked).toBe(true);
    expect(result.qty).toEqual(new D(0));
    expect(result.adjustments).toEqual(['kill_switch']);
  });

  it('drawdown breaker blocks new BUYs but allows SELL', () => {
    const pf = basePortfolio({
      equity: new D(80000),
      peakEquity: new D(100000),
      positions: [{ symbol: 'AAPL', qty: new D(20), price: new D(100) }],
    });
    const buyResult = applyEnvelope({ action: 'BUY', qty: new D(10) }, pf, baseMarket(), limits, false);
    expect(buyResult.action).toBe('HOLD');
    expect(buyResult.blocked).toBe(true);
    expect(buyResult.adjustments).toEqual(['drawdown_breaker_blocks_new_buys']);

    const sellResult = applyEnvelope({ action: 'SELL', qty: new D(10) }, pf, baseMarket(), limits, false);
    expect(sellResult.action).toBe('SELL');
    expect(sellResult.blocked).toBe(false);
    expect(sellResult.qty).toEqual(new D(10));
  });

  it('clamps a large BUY by name-weight, vol-target, liquidity, and cash in sequence', () => {
    const pf = basePortfolio({ cash: new D(3000) });
    const mkt = baseMarket();
    const proposal: ProposedDecision = { action: 'BUY', qty: new D(100000) };
    const result = applyEnvelope(proposal, pf, mkt, limits, false);

    expect(result.action).toBe('BUY');
    expect(result.blocked).toBe(false);
    // name-weight cap: 500 -> vol-target: 200 -> liquidity (ADV*0.05): 50 -> cash (3000/100): 30
    expect(result.qty).toEqual(new D(30));
    expect(result.adjustments).toEqual([
      'clamped_by_max_name_weight',
      'clamped_by_vol_target',
      'clamped_by_liquidity_adv',
      'clamped_by_available_cash',
    ]);
  });

  it('clamps a BUY to zero and converts to HOLD when fully constrained', () => {
    const pf = basePortfolio({ cash: new D(0) });
    const result = applyEnvelope({ action: 'BUY', qty: new D(50) }, pf, baseMarket(), limits, false);
    expect(result.action).toBe('HOLD');
    expect(result.blocked).toBe(false);
    expect(result.qty).toEqual(new D(0));
    expect(result.adjustments).toContain('clamped_by_available_cash');
    expect(result.adjustments).toContain('clamped_to_zero_converted_to_hold');
  });

  it('SELL qty never exceeds the owned position', () => {
    const pf = basePortfolio({
      positions: [{ symbol: 'AAPL', qty: new D(5), price: new D(100) }],
    });
    const result = applyEnvelope({ action: 'SELL', qty: new D(50) }, pf, baseMarket(), limits, false);
    expect(result.action).toBe('SELL');
    expect(result.qty).toEqual(new D(5));
    expect(result.adjustments).toEqual(['sell_qty_clamped_to_owned']);
  });

  it('SELL with no owned position becomes a blocked-free HOLD', () => {
    const result = applyEnvelope({ action: 'SELL', qty: new D(10) }, basePortfolio(), baseMarket(), limits, false);
    expect(result.action).toBe('HOLD');
    expect(result.blocked).toBe(false);
    expect(result.qty).toEqual(new D(0));
  });

  it('HOLD proposal passes through untouched', () => {
    const result = applyEnvelope({ action: 'HOLD', qty: new D(0) }, basePortfolio(), baseMarket(), limits, false);
    expect(result).toEqual({ action: 'HOLD', qty: new D(0), adjustments: [], blocked: false });
  });

  it('is deterministic: identical inputs produce identical output', () => {
    const proposal: ProposedDecision = { action: 'BUY', qty: new D(100000) };
    const pf = basePortfolio({ cash: new D(3000) });
    const mkt = baseMarket();
    const r1 = applyEnvelope(proposal, pf, mkt, limits, false);
    const r2 = applyEnvelope(
      { action: 'BUY', qty: new D(100000) },
      basePortfolio({ cash: new D(3000) }),
      baseMarket(),
      limits,
      false
    );
    expect(r1).toEqual(r2);
  });

  it('uses exact Decimal arithmetic with no float drift', () => {
    const pf = basePortfolio({ equity: new D('100000.10') });
    const mkt = baseMarket({ atr: new D('3.33') });
    const result = applyEnvelope({ action: 'BUY', qty: new D(1) }, pf, mkt, { ...limits, maxNameWeight: 1, liquidityAdvFraction: 1 }, false);
    const expectedVolTargetQty = new D('100000.10').mul(0.01).div('3.33');
    expect(result.qty.lte(expectedVolTargetQty)).toBe(true);
    expect(result.action).toBe('BUY');
  });
});
