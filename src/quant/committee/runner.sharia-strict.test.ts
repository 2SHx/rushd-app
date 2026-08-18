// Regression test for the strict-gate defect: runCommitteePass MUST evaluate the Sharia
// gate in STRICT mode for every mode it accepts, because every Decision it persists is
// executable (AUTO_PAPER auto-executes it in autoRun.ts; HUMAN_APPROVE is shown to a human
// who then triggers /api/quant/execute -> executeDecision). Real collectSignals + real
// evaluateShariaGate + real (keyless) MockScreener are used here — only the DB, the 6
// analyst network calls, and the PM's LLM call are stubbed, so this proves the actual gate
// wiring rather than a mocked stand-in for it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => {
  // All 6 analysts unanimously BULLISH, full conviction — so if the gate were permissive
  // (the pre-fix defect), the deterministic mock PM would propose (and the envelope would
  // pass through) a BUY. Deterministic + no network: proves the block is the gate, not
  // noise/abstains from a bare-bones fake context.
  function bullish(agent: string) {
    return {
      agent,
      symbol: 'AAPL',
      market: 'NASDAQ',
      asOf: new Date(),
      stance: 'BULLISH',
      conviction: 1,
      horizonDays: 30,
      rationaleEn: 'test bullish',
      rationaleAr: 'اختبار',
      evidence: [],
      determinism: 'deterministic',
      failureMode: 'ok',
      costCents: 0,
    };
  }
  const mockAnalyst = (agent: string) => ({ agent, run: async () => bullish(agent) });
  return {
    mockAnalyst,
    tx: {
      decision: { create: vi.fn() },
      analystSignalRecord: { createMany: vi.fn() },
    },
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: {
    portfolioItem: { findMany: vi.fn() },
    portfolioSnapshot: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    marketBar: { findMany: vi.fn() },
    $transaction: vi.fn(async (cb: any) => cb(h.tx)),
  },
}));

vi.mock('../data/pointInTime', () => ({
  loadPointInTimeContext: vi.fn(),
}));

vi.mock('../analysts/quantCore', () => ({ quantCoreAnalyst: h.mockAnalyst('QUANT_CORE') }));
vi.mock('../analysts/technical', () => ({ technicalAnalyst: h.mockAnalyst('TECHNICAL') }));
vi.mock('../analysts/news', () => ({ newsCatalystAnalyst: h.mockAnalyst('NEWS_CATALYST') }));
vi.mock('../analysts/fundamental', () => ({ fundamentalAnalyst: h.mockAnalyst('FUNDAMENTAL') }));
vi.mock('../analysts/pattern', () => ({ patternAnalyst: h.mockAnalyst('PATTERN_ANALOG') }));
vi.mock('../analysts/research', () => ({ researchAnalyst: h.mockAnalyst('RESEARCH') }));

import { prisma } from '@/lib/prisma';
import { loadPointInTimeContext } from '../data/pointInTime';
import { runCommitteePass } from './runner';

const D = Prisma.Decimal;
const bar = () => ({ high: new D(101), low: new D(99), close: new D(100), volume: new D(1000) });

describe('runCommitteePass — Sharia gate is strict regardless of mode (keyless)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Keyless: no ZOYA_API_KEY / composite source ⇒ registry.getScreener() -> MockScreener,
    // whose verdicts are fixtures (source 'mock') — NOT a VERIFIED_EXECUTION_SOURCE.
    vi.stubEnv('ZOYA_API_KEY', '');
    vi.stubEnv('SHARIA_SOURCE', '');
    vi.stubEnv('MARKET_DATA_MODE', 'bundled');
    (prisma.portfolioItem.findMany as any).mockResolvedValue([]);
    (prisma.portfolioSnapshot.findFirst as any).mockResolvedValue(null);
    (prisma.user.findUnique as any).mockResolvedValue({ cashVirtual: new D(100000) });
    (prisma.marketBar.findMany as any).mockResolvedValue([]);
    (loadPointInTimeContext as any).mockResolvedValue({
      symbol: 'AAPL',
      market: 'NASDAQ',
      asOf: new Date(),
      bars: () => Array.from({ length: 5 }, bar),
      fundamentals: () => null,
      news: () => [],
    });
    h.tx.decision.create.mockImplementation(async ({ data }: any) => ({ id: 'dec-1', ...data }));
  });

  it.each(['AUTO_PAPER', 'HUMAN_APPROVE'] as const)(
    'mode=%s: unanimous BULLISH signals still resolve HOLD (never BUY) — mock/unverified compliance is fail-closed',
    async (mode) => {
      const res = await runCommitteePass({ userId: 'user-1', symbol: 'AAPL', market: 'NASDAQ' as any, mode });

      expect(res.finalAction).not.toBe('BUY');
      expect(res.finalAction).toBe('HOLD');

      const persisted = h.tx.decision.create.mock.calls[0][0].data;
      expect(persisted.shariaGate.compliant).toBe(false);
      expect(persisted.shariaGate.reason).toBe('unverified_source_fail_closed');
      expect(persisted.riskAdjustments).toContain('sharia_veto');
    },
  );

  it('mode omitted (defaults to HUMAN_APPROVE for the persisted Decision) is also strict', async () => {
    const res = await runCommitteePass({ userId: 'user-1', symbol: 'AAPL', market: 'NASDAQ' as any });
    expect(res.finalAction).toBe('HOLD');
    const persisted = h.tx.decision.create.mock.calls[0][0].data;
    expect(persisted.mode).toBe('HUMAN_APPROVE');
    expect(persisted.shariaGate.compliant).toBe(false);
  });
});
