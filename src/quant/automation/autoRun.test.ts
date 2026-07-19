import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const h = vi.hoisted(() => ({
  isHalted: vi.fn(),
  runCommitteePass: vi.fn(),
  executeDecision: vi.fn(),
  decisionUpdate: vi.fn(),
  strategyFindMany: vi.fn(),
  autoRunClaimCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    decision: { update: (...a: any[]) => h.decisionUpdate(...a) },
    strategy: { findMany: (...a: any[]) => h.strategyFindMany(...a) },
    autoRunClaim: { create: (...a: any[]) => h.autoRunClaimCreate(...a) },
  },
}));
vi.mock('./control', () => ({ isHalted: (...a: any[]) => h.isHalted(...a) }));
vi.mock('../committee/runner', () => ({ runCommitteePass: (...a: any[]) => h.runCommitteePass(...a) }));
vi.mock('../execution/executeDecision', () => ({ executeDecision: (...a: any[]) => h.executeDecision(...a) }));

import { runAutomatedStrategies, MAX_STRATEGIES, MAX_SYMBOLS_PER_STRATEGY } from './autoRun';

function strategy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'strat-1', ownerUserId: 'user-1', market: 'NASDAQ',
    config: { symbols: ['AAPL'] }, autonomyTier: 'AUTO_PAPER', enabled: true, ...overrides,
  };
}

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '5' });
}

describe('runAutomatedStrategies', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.isHalted.mockResolvedValue(false);
    h.strategyFindMany.mockResolvedValue([]);
    h.autoRunClaimCreate.mockResolvedValue({});
  });

  it('uses conservative free-tier defaults', () => {
    expect(MAX_STRATEGIES).toBe(1);
    expect(MAX_SYMBOLS_PER_STRATEGY).toBe(5);
  });

  it('halted: returns immediately, never queries strategies or calls the runner', async () => {
    h.isHalted.mockResolvedValue(true);
    const res = await runAutomatedStrategies();
    expect(res).toEqual({ processed: false, ran: 0, executed: 0, reason: 'halted' });
    expect(h.strategyFindMany).not.toHaveBeenCalled();
    expect(h.runCommitteePass).not.toHaveBeenCalled();
  });

  it('only loads AUTO_PAPER strategies, capped at MAX_STRATEGIES (AUTO_REAL/HUMAN_APPROVE excluded by query)', async () => {
    h.strategyFindMany.mockResolvedValue([]);
    await runAutomatedStrategies();
    expect(h.strategyFindMany).toHaveBeenCalledWith({
      where: { enabled: true, autonomyTier: 'AUTO_PAPER' },
      take: MAX_STRATEGIES,
    });
  });

  it('MED#1: an INCUBATION_PAPER strategy with a valid symbols config is never picked up', async () => {
    // The mock stands in for Postgres's WHERE evaluation: the query itself is the
    // structural discriminator (security gate 2026-07-19), not a config parse failure.
    h.strategyFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      const pool = [
        strategy({ id: 'incubation-1', autonomyTier: 'INCUBATION_PAPER', config: { symbols: ['AAPL'] } }),
        strategy({ id: 'auto-paper-1' }),
      ];
      return pool.filter(s => Object.entries(where).every(([k, v]) => (s as Record<string, unknown>)[k] === v));
    });
    h.runCommitteePass.mockResolvedValue({ decisionId: 'd1', finalAction: 'HOLD' });

    await runAutomatedStrategies();

    const ranStrategyIds = h.runCommitteePass.mock.calls.map(call => call[0].strategyId);
    expect(ranStrategyIds).not.toContain('incubation-1');
  });

  it('claims each (day, strategy, symbol) unit before running the committee pass', async () => {
    h.strategyFindMany.mockResolvedValue([strategy()]);
    h.runCommitteePass.mockResolvedValue({ decisionId: 'dec-1', finalAction: 'HOLD' });
    const now = new Date('2026-07-07T12:00:00Z');

    await runAutomatedStrategies(now);

    expect(h.autoRunClaimCreate).toHaveBeenCalledWith({ data: { key: '2026-07-07:strat-1:AAPL' } });
    expect(h.runCommitteePass).toHaveBeenCalledTimes(1);
  });

  it('race-safety: a unit whose claim throws P2002 is skipped — runCommitteePass NOT called for it', async () => {
    h.strategyFindMany.mockResolvedValue([strategy()]);
    h.autoRunClaimCreate.mockRejectedValueOnce(uniqueViolation());

    const res = await runAutomatedStrategies();

    expect(h.runCommitteePass).not.toHaveBeenCalled();
    expect(res).toEqual({ processed: false, ran: 0, executed: 0 });
  });

  it('two concurrent invocations do not double-execute: the 2nd sees P2002 on every claim', async () => {
    const strategies = [strategy()];
    h.strategyFindMany.mockResolvedValue(strategies);
    h.runCommitteePass.mockResolvedValue({ decisionId: 'dec-1', finalAction: 'BUY' });
    h.executeDecision.mockResolvedValue({ orderId: 'order-1', status: 'FILLED' });

    // 1st invocation claims successfully.
    h.autoRunClaimCreate.mockResolvedValueOnce({});
    const first = await runAutomatedStrategies();
    expect(first).toEqual({ processed: true, ran: 1, executed: 1 });

    // 2nd "concurrent" invocation: the claim for the same unit now conflicts.
    h.autoRunClaimCreate.mockRejectedValueOnce(uniqueViolation());
    const second = await runAutomatedStrategies();
    expect(second).toEqual({ processed: false, ran: 0, executed: 0 });
    expect(h.executeDecision).toHaveBeenCalledTimes(1);
  });

  it('a non-unique-constraint claim error propagates (not swallowed)', async () => {
    h.strategyFindMany.mockResolvedValue([strategy()]);
    h.autoRunClaimCreate.mockRejectedValueOnce(new Error('db down'));
    await expect(runAutomatedStrategies()).rejects.toThrow('db down');
  });

  it('symbols beyond MAX_SYMBOLS_PER_STRATEGY are truncated', async () => {
    const symbols = Array.from({ length: MAX_SYMBOLS_PER_STRATEGY + 5 }, (_, i) => `SYM${i}`);
    h.strategyFindMany.mockResolvedValue([strategy({ config: { symbols } })]);
    h.runCommitteePass.mockResolvedValue({ decisionId: 'dec-1', finalAction: 'HOLD' });

    await runAutomatedStrategies();

    expect(h.autoRunClaimCreate).toHaveBeenCalledTimes(MAX_SYMBOLS_PER_STRATEGY);
    expect(h.runCommitteePass).toHaveBeenCalledTimes(MAX_SYMBOLS_PER_STRATEGY);
  });

  it('BUY decision: approved then executed', async () => {
    h.strategyFindMany.mockResolvedValue([strategy()]);
    h.runCommitteePass.mockResolvedValue({ decisionId: 'dec-1', finalAction: 'BUY' });
    h.executeDecision.mockResolvedValue({ orderId: 'order-1', status: 'FILLED' });

    const res = await runAutomatedStrategies();

    expect(h.runCommitteePass).toHaveBeenCalledWith({
      userId: 'user-1', symbol: 'AAPL', market: 'NASDAQ', strategyId: 'strat-1', mode: 'AUTO_PAPER',
    });
    expect(h.decisionUpdate).toHaveBeenCalledWith({ where: { id: 'dec-1' }, data: { status: 'APPROVED' } });
    expect(h.executeDecision).toHaveBeenCalledWith(
      'dec-1',
      'user-1',
      expect.objectContaining({ beforeSubmit: expect.any(Function) }),
    );
    expect(res).toEqual({ processed: true, ran: 1, executed: 1 });
  });

  it('HOLD decision: not approved, not executed', async () => {
    h.strategyFindMany.mockResolvedValue([strategy()]);
    h.runCommitteePass.mockResolvedValue({ decisionId: 'dec-1', finalAction: 'HOLD' });

    const res = await runAutomatedStrategies();

    expect(h.decisionUpdate).not.toHaveBeenCalled();
    expect(h.executeDecision).not.toHaveBeenCalled();
    expect(res).toEqual({ processed: true, ran: 1, executed: 0 });
  });

  it('kill-switch flipped mid-run stops further executions', async () => {
    h.strategyFindMany.mockResolvedValue([strategy({ id: 'strat-1', config: { symbols: ['AAPL', 'MSFT'] } })]);
    h.runCommitteePass
      .mockResolvedValueOnce({ decisionId: 'dec-1', finalAction: 'BUY' })
      .mockResolvedValueOnce({ decisionId: 'dec-2', finalAction: 'BUY' });
    // isHalted: false at start, false before 1st execution, true before 2nd execution
    h.isHalted
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    h.executeDecision.mockResolvedValue({ orderId: 'order-1', status: 'FILLED' });

    const res = await runAutomatedStrategies();

    expect(h.executeDecision).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ processed: true, ran: 2, executed: 1 });
  });
});
