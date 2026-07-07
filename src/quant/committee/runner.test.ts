import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  tx: {
    decision: { create: vi.fn() },
    analystSignalRecord: { createMany: vi.fn() },
  },
}));

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
vi.mock('./collect', () => ({ collectSignals: vi.fn() }));
vi.mock('./pm', () => ({ runPortfolioManager: vi.fn() }));

import { prisma } from '@/lib/prisma';
import { loadPointInTimeContext } from '../data/pointInTime';
import { collectSignals } from './collect';
import { runPortfolioManager } from './pm';
import { runCommitteePass } from './runner';

const D = Prisma.Decimal;

const signal = (agent: string) => ({
  agent,
  symbol: 'AAPL',
  market: 'NASDAQ',
  asOf: new Date(),
  stance: 'NEUTRAL',
  conviction: 0.4,
  horizonDays: 30,
  rationaleEn: 'x',
  rationaleAr: 'ص',
  evidence: [{ kind: 'feature', ref: 'r', value: 'v' }],
  determinism: 'deterministic',
  failureMode: 'ok',
  costCents: 0,
});

const bar = () => ({ high: new D(101), low: new D(99), close: new D(100), volume: new D(1000) });

describe('runCommitteePass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.portfolioItem.findMany as any).mockResolvedValue([]);
    (prisma.portfolioSnapshot.findFirst as any).mockResolvedValue(null);
    (prisma.user.findUnique as any).mockResolvedValue({ cashVirtual: new D(100000) });
    (prisma.marketBar.findMany as any).mockResolvedValue([]);
    (loadPointInTimeContext as any).mockResolvedValue({
      symbol: 'AAPL',
      market: 'NASDAQ',
      asOf: new Date(),
      bars: () => [bar(), bar(), bar()],
      fundamentals: () => null,
      news: () => [],
    });
    (collectSignals as any).mockResolvedValue({
      symbol: 'AAPL',
      market: 'NASDAQ',
      asOf: new Date(),
      signals: [signal('QUANT_CORE'), signal('TECHNICAL')],
      shariaGate: { compliant: true, reason: 'ok', standard: 'AAOIFI', source: 'mock' },
      tradeable: true,
    });
    (runPortfolioManager as any).mockResolvedValue({
      proposedAction: 'HOLD',
      proposedQty: new D(0),
      finalAction: 'HOLD',
      finalQty: new D(0),
      adjustments: ['mock_pm_hold'],
      debate: [],
      pmModelId: 'mock',
      rationaleEn: 'hold',
      rationaleAr: 'انتظار',
      costCents: 0,
    });
    h.tx.decision.create.mockResolvedValue({ id: 'dec-1' });
  });

  it('persists a Decision + one AnalystSignalRecord per signal and returns finalAction', async () => {
    const res = await runCommitteePass({ userId: 'user-1', symbol: 'AAPL', market: 'NASDAQ' as any });
    expect(res).toEqual({ decisionId: 'dec-1', finalAction: 'HOLD' });

    const decData = h.tx.decision.create.mock.calls[0][0].data;
    expect(decData.userId).toBe('user-1');
    expect(decData.finalAction).toBe('HOLD');
    expect(decData.seed).toBeTypeOf('number'); // reproducibility
    expect(decData.temperature.equals(new D(0))).toBe(true);
    expect(decData.mode).toBe('HUMAN_APPROVE');

    const rows = h.tx.analystSignalRecord.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(2);
    expect(rows[0].agent).toBe('QUANT_CORE');
    expect(rows[0].conviction.equals(new D('0.4'))).toBe(true);
  });

  it('derives portfolio holdings from the DB, not the caller (loads by userId)', async () => {
    await runCommitteePass({ userId: 'user-1', symbol: 'AAPL', market: 'NASDAQ' as any });
    expect((prisma.portfolioItem.findMany as any).mock.calls[0][0]).toEqual({ where: { userId: 'user-1' } });
  });
});
