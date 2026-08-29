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

  it('free PM deterministically proposes through the same risk envelope', async () => {
    const outcome = await runPortfolioManager(baseInputs());
    expect(['BUY', 'SELL', 'HOLD']).toContain(outcome.proposedAction);
    expect(['BUY', 'SELL', 'HOLD']).toContain(outcome.finalAction);
    expect(outcome.proposedAction).toBe('BUY');
    expect(outcome.finalAction).toBe('BUY');
    expect(outcome.finalQty.gt(0)).toBe(true);
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

/**
 * MANDATORY DIVESTMENT.
 *
 * Before this, a holding that became non-compliant was never sold: the Sharia veto in pm.ts only
 * examined `finalAction === 'BUY'`, and `gateAllowsAction` deliberately permits HOLD. So the engine
 * stopped adding to the position and then left it open forever.
 *
 * The owner hit this in the real world — ASTS ceased to be permissible while held, after its debt
 * went from $148M to $2,963M in eighteen months. AAOIFI requires divestment; holding is not a
 * neutral default.
 *
 * These tests pin the three properties that make the fix safe rather than merely present: it sells
 * the WHOLE position, it does NOT fire when there is nothing to sell, and it does NOT override the
 * kill switch.
 */
describe('runPortfolioManager — mandatory Sharia divestment', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  const held = (qty: number) => basePortfolio({
    positions: [{ symbol: 'AAPL', qty: new D(qty), price: new D(100) }],
    cash: new D(50000),
  });

  it('sells the ENTIRE position when a held name is no longer compliant', async () => {
    const outcome = await runPortfolioManager(baseInputs({
      result: fakeResult(false, nonCompliantGate),
      portfolio: held(40),
    }), {
      // The committee wants to sit tight. The obligation must override its preference.
      __proposeForTest: async () => ({
        action: 'HOLD', qty: 0, rationaleEn: 'hold', rationaleAr: 'انتظار',
      }),
    });
    expect(outcome.proposedAction).toBe('HOLD');
    expect(outcome.finalAction).toBe('SELL');
    expect(outcome.finalQty).toEqual(new D(40));
    expect(outcome.adjustments).toContain('sharia_divestment_required');
  });

  it('upgrades a PARTIAL sell to the full position — a partial sale does not discharge the obligation', async () => {
    const outcome = await runPortfolioManager(baseInputs({
      result: fakeResult(false, nonCompliantGate),
      portfolio: held(40),
    }), {
      __proposeForTest: async () => ({
        action: 'SELL', qty: 5, rationaleEn: 'trim', rationaleAr: 'تقليص',
      }),
    });
    expect(outcome.finalAction).toBe('SELL');
    expect(outcome.finalQty).toEqual(new D(40));
  });

  /**
   * An UNKNOWN verdict already arrives as `compliant: false` (sharia.ts folds it there deliberately),
   * so a name the screener cannot see is divested rather than held on evidence nobody has. This is
   * the same fail-closed direction the file already takes for BUYs.
   */
  it('divests on an UNKNOWN verdict, not just a screened failure', async () => {
    const unknownGate: ShariaGate = {
      compliant: false, reason: 'not_covered_by_source', standard: 'AAOIFI', source: 'none',
    };
    const outcome = await runPortfolioManager(baseInputs({
      result: fakeResult(false, unknownGate),
      portfolio: held(12),
    }), {
      __proposeForTest: async () => ({ action: 'HOLD', qty: 0, rationaleEn: 'h', rationaleAr: 'ه' }),
    });
    expect(outcome.finalAction).toBe('SELL');
    expect(outcome.finalQty).toEqual(new D(12));
  });

  it('does NOT fire when the non-compliant name is not held — nothing to divest', async () => {
    const outcome = await runPortfolioManager(baseInputs({
      result: fakeResult(false, nonCompliantGate),
      portfolio: basePortfolio(),
    }), {
      __proposeForTest: async () => ({ action: 'HOLD', qty: 0, rationaleEn: 'h', rationaleAr: 'ه' }),
    });
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.adjustments).not.toContain('sharia_divestment_required');
  });

  /**
   * THE SAFETY PROPERTY. Compliance does not outrank a safety stop. The kill switch exists to stop
   * the engine trading at all, and a divestment that punched through it would be a compliance rule
   * silently disabling a safety control. The obligation is RECORDED instead, so a human sees that it
   * exists and could not be acted on — a different state from a quiet day.
   */
  it('does NOT override the kill switch; records the blocked obligation instead', async () => {
    const outcome = await runPortfolioManager(baseInputs({
      result: fakeResult(false, nonCompliantGate),
      portfolio: held(40),
      killSwitch: true,
    }), {
      __proposeForTest: async () => ({ action: 'HOLD', qty: 0, rationaleEn: 'h', rationaleAr: 'ه' }),
    });
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.adjustments).toContain('kill_switch');
    expect(outcome.adjustments).toContain('sharia_divestment_required_but_blocked');
    expect(outcome.adjustments).not.toContain('sharia_divestment_required');
  });

  it('leaves a compliant holding entirely alone', async () => {
    const outcome = await runPortfolioManager(baseInputs({
      result: fakeResult(true, compliantGate),
      portfolio: held(40),
    }), {
      __proposeForTest: async () => ({ action: 'HOLD', qty: 0, rationaleEn: 'h', rationaleAr: 'ه' }),
    });
    expect(outcome.finalAction).toBe('HOLD');
    expect(outcome.adjustments.join(',')).not.toMatch(/divestment/);
  });
});
