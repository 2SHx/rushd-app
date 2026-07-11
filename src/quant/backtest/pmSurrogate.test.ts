import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { PM_SURROGATE_ID, surrogateDecision, surrogateProposal } from './pmSurrogate';
import type { CommitteeResult } from '../committee/collect';
import type { PortfolioState, MarketState, RiskLimits } from '../risk/envelope';
import type { AnalystSignal, AgentKind } from '../types';
import type { ShariaGate } from '../gates/sharia';

const D = Prisma.Decimal;
const asOf = new Date('2026-06-30T00:00:00.000Z');

function fakeSignal(agent: AgentKind, overrides?: Partial<AnalystSignal>): AnalystSignal {
  return {
    agent,
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    stance: 'BULLISH',
    conviction: 0.8,
    horizonDays: 30,
    rationaleEn: 'test',
    rationaleAr: 'اختبار',
    evidence: [{ kind: 'feature', ref: 'x', value: '1' }],
    determinism: 'deterministic',
    failureMode: 'ok',
    costCents: 0,
    ...overrides,
  };
}

const compliantGate: ShariaGate = { compliant: true, reason: 'aaoifi_screen_pass', standard: 'AAOIFI', source: 'mock' };
const nonCompliantGate: ShariaGate = { compliant: false, reason: 'aaoifi_screen_fail', standard: 'AAOIFI', source: 'mock' };

function fakeResult(signals: AnalystSignal[], tradeable: boolean, gate: ShariaGate): CommitteeResult {
  return { symbol: 'AAPL', market: 'NASDAQ' as any, asOf, signals, shariaGate: gate, tradeable };
}

const limits: RiskLimits = {
  maxNameWeight: 0.5,
  maxGrossExposure: 1.0,
  maxOpenPositions: 10,
  maxRiskPct: 0.02,
  volTargetPct: 0.05,
  liquidityAdvFraction: 0.5,
  drawdownHaltPct: 0.2,
};

function basePortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return { equity: new D(100000), cash: new D(100000), positions: [], peakEquity: new D(100000), ...overrides };
}

function baseMarket(overrides: Partial<MarketState> = {}): MarketState {
  return { symbol: 'AAPL', price: new D(100), atr: new D(5), adv: new D(100000), stopPrice: new D(90), ...overrides };
}

const bullishSignals = [
  fakeSignal('QUANT_CORE', { stance: 'BULLISH', conviction: 0.9 }),
  fakeSignal('TECHNICAL', { stance: 'BULLISH', conviction: 0.8 }),
  fakeSignal('FUNDAMENTAL', { stance: 'NEUTRAL', conviction: 0.5 }),
];

const bearishSignals = [
  fakeSignal('QUANT_CORE', { stance: 'BEARISH', conviction: 0.9 }),
  fakeSignal('TECHNICAL', { stance: 'BEARISH', conviction: 0.8 }),
  fakeSignal('FUNDAMENTAL', { stance: 'NEUTRAL', conviction: 0.5 }),
];

const mixedLowSignals = [
  fakeSignal('QUANT_CORE', { stance: 'BULLISH', conviction: 0.2 }),
  fakeSignal('TECHNICAL', { stance: 'BEARISH', conviction: 0.2 }),
  fakeSignal('FUNDAMENTAL', { stance: 'NEUTRAL', conviction: 0.5 }),
];

describe('surrogateDecision (PM policy-surrogate)', () => {
  it('exposes a stable surrogate id', () => {
    expect(PM_SURROGATE_ID).toBe('det-conviction-v1');
  });

  it('mostly-bullish, high-conviction, tradeable → BUY with a positive, envelope-clamped qty', () => {
    const result = fakeResult(bullishSignals, true, compliantGate);
    const outcome = surrogateDecision(result, basePortfolio(), baseMarket(), limits, false);
    expect(outcome.proposedAction).toBe('BUY');
    expect(outcome.finalAction).toBe('BUY');
    expect(outcome.finalQty.gt(0)).toBe(true);
    // envelope clamp by max name weight (0.5 * 100000 / 100 = 500) must not be exceeded
    expect(outcome.finalQty.lte(500)).toBe(true);
  });

  it('exposes the deterministic proposal for reuse by free live PM mode', () => {
    const proposal = surrogateProposal(fakeResult(bullishSignals, true, compliantGate), basePortfolio(), baseMarket());
    expect(proposal.action).toBe('BUY');
    expect(proposal.qty.gt(0)).toBe(true);
  });

  it('mostly-bearish, tradeable, with an owned position → SELL', () => {
    const pf = basePortfolio({ positions: [{ symbol: 'AAPL', qty: new D(50), price: new D(100) }] });
    const result = fakeResult(bearishSignals, true, compliantGate);
    const outcome = surrogateDecision(result, pf, baseMarket(), limits, false);
    expect(outcome.proposedAction).toBe('SELL');
    expect(outcome.finalAction).toBe('SELL');
    expect(outcome.finalQty.gt(0)).toBe(true);
  });

  it('mixed/low-conviction signals fall inside the deadband → HOLD', () => {
    const result = fakeResult(mixedLowSignals, true, compliantGate);
    const outcome = surrogateDecision(result, basePortfolio(), baseMarket(), limits, false);
    expect(outcome.proposedAction).toBe('HOLD');
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.finalQty).toEqual(new D(0));
  });

  it('non-tradeable symbol + bullish proposal → HOLD forced by sharia_veto', () => {
    const result = fakeResult(bullishSignals, false, nonCompliantGate);
    const outcome = surrogateDecision(result, basePortfolio(), baseMarket(), limits, false);
    expect(outcome.proposedAction).toBe('BUY');
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.finalQty).toEqual(new D(0));
    expect(outcome.adjustments).toContain('sharia_veto');
  });

  it('kill-switch forces HOLD regardless of a bullish proposal', () => {
    const result = fakeResult(bullishSignals, true, compliantGate);
    const outcome = surrogateDecision(result, basePortfolio(), baseMarket(), limits, true);
    expect(outcome.proposedAction).toBe('BUY');
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.finalQty).toEqual(new D(0));
    expect(outcome.adjustments).toContain('kill_switch');
  });

  it('is deterministic: identical inputs produce identical output', () => {
    const result = fakeResult(bullishSignals, true, compliantGate);
    const pf = basePortfolio();
    const mkt = baseMarket();
    const a = surrogateDecision(result, pf, mkt, limits, false);
    const b = surrogateDecision(result, pf, mkt, limits, false);
    expect(a).toEqual(b);
  });
});
