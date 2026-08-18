import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collectSignals } from './collect';
import type { Analyst, AnalystSignal, AgentKind } from '../types';
import type { PointInTimeContext } from '../data/pointInTime';
import type { ShariaGate } from '../gates/sharia';

const asOf = new Date('2026-06-30T00:00:00.000Z');

/** Plain object implementing PointInTimeContext — no DB. */
function fakeCtx(): PointInTimeContext {
  return {
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    bars: () => [],
    fundamentals: () => null,
    news: () => [],
  };
}

function fakeSignal(agent: AgentKind, overrides?: Partial<AnalystSignal>): AnalystSignal {
  return {
    agent,
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    stance: 'BULLISH',
    conviction: 0.5,
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

function okAnalyst(agent: AgentKind): Analyst {
  return { agent, run: async (ctx) => fakeSignal(agent, { symbol: ctx.symbol, market: ctx.market, asOf: ctx.asOf }) };
}

function throwingAnalyst(agent: AgentKind): Analyst {
  return {
    agent,
    run: async () => {
      throw new Error('boom');
    },
  };
}

const compliantGate: ShariaGate = { compliant: true, reason: 'aaoifi_screen_pass', standard: 'AAOIFI', source: 'MOCK' };
const nonCompliantGate: ShariaGate = { compliant: false, reason: 'aaoifi_screen_fail', standard: 'AAOIFI', source: 'MOCK' };

describe('collectSignals', () => {
  it('returns one signal per analyst in stable order', async () => {
    const analysts = [okAnalyst('QUANT_CORE'), okAnalyst('TECHNICAL'), okAnalyst('NEWS_CATALYST')];
    const result = await collectSignals(fakeCtx(), { analysts, gate: async () => compliantGate });
    expect(result.signals).toHaveLength(3);
    expect(result.signals.map((s) => s.agent)).toEqual(['QUANT_CORE', 'TECHNICAL', 'NEWS_CATALYST']);
  });

  it('contains a throwing analyst as an abstain signal without crashing', async () => {
    const analysts = [okAnalyst('QUANT_CORE'), throwingAnalyst('TECHNICAL')];
    const result = await collectSignals(fakeCtx(), { analysts, gate: async () => compliantGate });
    expect(result.signals).toHaveLength(2);
    const failed = result.signals[1];
    expect(failed.agent).toBe('TECHNICAL');
    expect(failed.failureMode).toBe('abstain');
    expect(failed.conviction).toBe(0);
    expect(failed.rationaleEn).toContain('boom');
    expect(failed.rationaleAr.length).toBeGreaterThan(0);
  });

  it('tradeable reflects the injected gate compliant flag (true)', async () => {
    const result = await collectSignals(fakeCtx(), { analysts: [okAnalyst('QUANT_CORE')], gate: async () => compliantGate });
    expect(result.tradeable).toBe(true);
    expect(result.shariaGate).toEqual(compliantGate);
  });

  it('tradeable reflects the injected gate compliant flag (false)', async () => {
    const result = await collectSignals(fakeCtx(), { analysts: [okAnalyst('QUANT_CORE')], gate: async () => nonCompliantGate });
    expect(result.tradeable).toBe(false);
    expect(result.shariaGate).toEqual(nonCompliantGate);
  });

  it('propagates asOf/symbol/market from the context', async () => {
    const ctx = fakeCtx();
    const result = await collectSignals(ctx, { analysts: [okAnalyst('QUANT_CORE')], gate: async () => compliantGate });
    expect(result.symbol).toBe(ctx.symbol);
    expect(result.market).toBe(ctx.market);
    expect(result.asOf).toBe(ctx.asOf);
  });
});

describe('collectSignals — default (no gate override) stays PERMISSIVE (keyless analysis path)', () => {
  beforeEach(() => {
    // Keyless: no real Sharia source configured, so registry.getScreener() -> MockScreener
    // (source 'mock'). Callers that never override `gate` are direct/analysis callers (e.g.
    // backtest/engine.ts) — they must still get a usable, BUY-eligible verdict.
    vi.stubEnv('ZOYA_API_KEY', '');
    vi.stubEnv('SHARIA_SOURCE', '');
    vi.stubEnv('MARKET_DATA_MODE', 'bundled');
  });

  it('a pure analysis call with no execution intent still returns a BUY-eligible gate keyless', async () => {
    const result = await collectSignals(fakeCtx(), { analysts: [okAnalyst('QUANT_CORE')] });
    expect(result.shariaGate.compliant).toBe(true);
    expect(result.shariaGate.reason).toBe('unverified_source_permissive');
    expect(result.tradeable).toBe(true);
  });
});
