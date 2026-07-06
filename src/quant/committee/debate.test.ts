import { describe, it, expect, beforeEach } from 'vitest';
import { runDebate } from './debate';
import type { CommitteeResult } from './collect';
import type { AnalystSignal, AgentKind } from '../types';
import type { ShariaGate } from '../gates/sharia';

const asOf = new Date('2026-06-30T00:00:00.000Z');

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

const gate: ShariaGate = { compliant: true, reason: 'aaoifi_screen_pass', standard: 'AAOIFI', source: 'mock' };

function fakeResult(signals: AnalystSignal[], tradeable = true): CommitteeResult {
  return { symbol: 'AAPL', market: 'NASDAQ' as any, asOf, signals, shariaGate: gate, tradeable };
}

describe('runDebate (mock mode)', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  it('synthesizes one BULL + one BEAR turn from the signal stance distribution — no throw', async () => {
    const result = fakeResult([
      fakeSignal('QUANT_CORE', { stance: 'BULLISH', conviction: 0.8 }),
      fakeSignal('TECHNICAL', { stance: 'BULLISH', conviction: 0.6 }),
      fakeSignal('NEWS_CATALYST', { stance: 'BEARISH', conviction: 0.4 }),
    ]);
    const turns = await runDebate(result);
    expect(turns).toHaveLength(2);
    expect(turns.map((t) => t.side).sort()).toEqual(['BEAR', 'BULL']);
    for (const t of turns) {
      expect(t.round).toBe(1);
      expect(t.argumentEn.length).toBeGreaterThan(0);
      expect(t.argumentAr.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for identical inputs', async () => {
    const result = fakeResult([fakeSignal('QUANT_CORE', { stance: 'BULLISH' }), fakeSignal('TECHNICAL', { stance: 'BEARISH' })]);
    const a = await runDebate(result);
    const b = await runDebate(result);
    expect(a).toEqual(b);
  });

  it('respects the rounds cap without throwing even when a higher value is requested', async () => {
    const result = fakeResult([fakeSignal('QUANT_CORE')]);
    const turns = await runDebate(result, { rounds: 10 });
    expect(turns.length).toBeGreaterThan(0);
  });
});
