// src/app/api/quant/autonomy/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const requireSession = vi.fn();
const strategyFindFirst = vi.fn();
const strategyUpdate = vi.fn();
const strategyCreate = vi.fn();

vi.mock('@/lib/authz', () => ({
  requireUltraTier: () => requireSession(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategy: {
      findFirst: (...args: any[]) => strategyFindFirst(...args),
      update: (...args: any[]) => strategyUpdate(...args),
      create: (...args: any[]) => strategyCreate(...args),
    },
  },
}));

beforeEach(() => {
  requireSession.mockReset();
  strategyFindFirst.mockReset();
  strategyUpdate.mockReset();
  strategyCreate.mockReset();
});

function req(body: unknown) {
  return new Request('http://x', { method: 'POST', body: JSON.stringify(body) });
}

describe('POST /api/quant/autonomy', () => {
  it('returns 401 if unauthenticated', async () => {
    requireSession.mockRejectedValue({ response: { status: 401, json: async () => ({ error: 'unauthorized' }) } });
    const res = await POST(req({ autonomyTier: 'AUTO_PAPER' }));
    expect(res.status).toBe(401);
  });

  it('rejects AUTO_PAPER with no symbols, new or pre-existing (the silent-no-op bug)', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    strategyFindFirst.mockResolvedValue({ id: 'strat_1', config: {} });

    const res = await POST(req({ autonomyTier: 'AUTO_PAPER' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('auto_paper_requires_symbols');
    expect(strategyUpdate).not.toHaveBeenCalled();
  });

  it('accepts AUTO_PAPER with symbols and persists them into config, uppercased/deduped', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    strategyFindFirst.mockResolvedValue({ id: 'strat_1', config: { other: 'x' } });
    strategyUpdate.mockResolvedValue({});

    const res = await POST(req({ autonomyTier: 'AUTO_PAPER', symbols: ['aapl', 'AAPL', 'msft'] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.symbols.sort()).toEqual(['AAPL', 'MSFT']);
    expect(data.label).toBe('unpromoted forward test — paper only');
    expect(strategyUpdate).toHaveBeenCalledWith({
      where: { id: 'strat_1' },
      data: { autonomyTier: 'AUTO_PAPER', config: { other: 'x', symbols: ['AAPL', 'MSFT'] } },
    });
  });

  it('AUTO_PAPER succeeds using a pre-existing config.symbols when none are resent', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    strategyFindFirst.mockResolvedValue({ id: 'strat_1', config: { symbols: ['NVDA'] } });
    strategyUpdate.mockResolvedValue({});

    const res = await POST(req({ autonomyTier: 'AUTO_PAPER' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.symbols).toEqual(['NVDA']);
  });

  it('switching back to HUMAN_APPROVE never requires symbols and carries no label', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    strategyFindFirst.mockResolvedValue({ id: 'strat_1', config: {} });
    strategyUpdate.mockResolvedValue({});

    const res = await POST(req({ autonomyTier: 'HUMAN_APPROVE' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.label).toBeUndefined();
  });

  it('creates a new strategy with symbols when none exists yet', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    strategyFindFirst.mockResolvedValue(null);
    strategyCreate.mockResolvedValue({});

    const res = await POST(req({ autonomyTier: 'AUTO_PAPER', symbols: ['aapl'] }));
    expect(res.status).toBe(200);
    expect(strategyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerUserId: 'user_1',
        autonomyTier: 'AUTO_PAPER',
        config: { symbols: ['AAPL'] },
      }),
    });
  });

  it('caps symbols at MAX_SYMBOLS_PER_STRATEGY and returns 400 beyond it', async () => {
    requireSession.mockResolvedValue({ id: 'user_1' });
    const res = await POST(req({ autonomyTier: 'AUTO_PAPER', symbols: Array.from({ length: 50 }, (_, i) => `S${i}`) }));
    expect(res.status).toBe(400);
  });
});
