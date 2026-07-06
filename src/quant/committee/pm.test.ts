import { describe, it, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { runPortfolioManager, type PmInputs } from './pm';
import type { CommitteeResult } from './collect';
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

function fakeResult(tradeable: boolean, gate: ShariaGate): CommitteeResult {
  return {
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    signals: [fakeSignal('QUANT_CORE'), fakeSignal('TECHNICAL')],
    shariaGate: gate,
    tradeable,
  };
}

const limits: RiskLimits = {
  maxNameWeight: 0.1,
  maxGrossExposure: 1.0,
  maxOpenPositions: 10,
  maxRiskPct: 0.02,
  volTargetPct: 0.01,
  liquidityAdvFraction: 0.05,
  drawdownHaltPct: 0.2,
};

function basePortfolio(overrides: Partial<PortfolioState> = {}): PortfolioState {
  return { equity: new D(100000), cash: new D(100000), positions: [], peakEquity: new D(100000), ...overrides };
}

function baseMarket(overrides: Partial<MarketState> = {}): MarketState {
  return { symbol: 'AAPL', price: new D(100), atr: new D(5), adv: new D(1000), stopPrice: new D(95), ...overrides };
}

function baseInputs(overrides: Partial<PmInputs> = {}): PmInputs {
  return {
    result: fakeResult(true, compliantGate),
    portfolio: basePortfolio(),
    market: baseMarket(),
    limits,
    killSwitch: false,
    seed: 1,
    ...overrides,
  };
}

describe('runPortfolioManager (mock mode)', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  it('mock PM with a compliant, bullish committee returns a valid PmOutcome (HOLD acceptable in mock)', async () => {
    const outcome = await runPortfolioManager(baseInputs());
    expect(['BUY', 'SELL', 'HOLD']).toContain(outcome.proposedAction);
    expect(['BUY', 'SELL', 'HOLD']).toContain(outcome.finalAction);
    expect(outcome.finalAction).toBe('HOLD'); // mock proposer is deterministic HOLD
    expect(outcome.proposedQty).toBeInstanceOf(Prisma.Decimal);
    expect(outcome.finalQty).toBeInstanceOf(Prisma.Decimal);
    expect(outcome.debate.length).toBeGreaterThan(0);
    expect(outcome.rationaleAr.length).toBeGreaterThan(0);
    expect(outcome.rationaleEn.length).toBeGreaterThan(0);
    expect(outcome.costCents).toBe(0);
  });

  it('SHARIA VETO: a forced BUY proposal on a non-tradeable symbol becomes HOLD with sharia_veto', async () => {
    const inputs = baseInputs({ result: fakeResult(false, nonCompliantGate) });
    const outcome = await runPortfolioManager(inputs, {
      __proposeForTest: async () => ({
        action: 'BUY',
        qty: 10,
        rationaleEn: 'forced test BUY',
        rationaleAr: 'شراء اختباري قسري',
      }),
    });
    expect(outcome.proposedAction).toBe('BUY');
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.finalQty).toEqual(new D(0));
    expect(outcome.adjustments).toContain('sharia_veto');
  });

  it('ENVELOPE: a BUY proposal exceeding limits is clamped (finalQty < proposedQty)', async () => {
    const inputs = baseInputs();
    const outcome = await runPortfolioManager(inputs, {
      __proposeForTest: async () => ({
        action: 'BUY',
        qty: 100000, // far beyond maxNameWeight/cash/liquidity caps
        rationaleEn: 'forced oversized BUY',
        rationaleAr: 'شراء اختباري كبير',
      }),
    });
    expect(outcome.finalAction).toBe('BUY');
    expect(outcome.finalQty.lt(outcome.proposedQty)).toBe(true);
    expect(outcome.adjustments.length).toBeGreaterThan(0);
  });

  it('kill-switch true forces HOLD regardless of proposal', async () => {
    const inputs = baseInputs({ killSwitch: true });
    const outcome = await runPortfolioManager(inputs, {
      __proposeForTest: async () => ({
        action: 'BUY',
        qty: 10,
        rationaleEn: 'forced test BUY',
        rationaleAr: 'شراء اختباري قسري',
      }),
    });
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.adjustments).toContain('kill_switch');
  });

  it('is deterministic for identical inputs', async () => {
    const a = await runPortfolioManager(baseInputs());
    const b = await runPortfolioManager(baseInputs());
    expect(a).toEqual(b);
  });
});
