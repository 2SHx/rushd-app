import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  strategyFindFirst: vi.fn(),
  strategyCreate: vi.fn(),
  strategyUpdate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    strategy: {
      findFirst: (...a: unknown[]) => h.strategyFindFirst(...a),
      create: (...a: unknown[]) => h.strategyCreate(...a),
      update: (...a: unknown[]) => h.strategyUpdate(...a),
    },
  },
}));

import { ensureStrategy, INCUBATION_BOOKS, INCUBATION_LABEL } from './incubationBooks';

const BOOK = INCUBATION_BOOKS[0];
const OWNER = 'paper-owner';

describe('HIGH: ensureStrategy tier backfill (security gate 2026-07-19)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a fresh INCUBATION_PAPER strategy when none exists', async () => {
    h.strategyFindFirst.mockResolvedValue(null);
    h.strategyCreate.mockResolvedValue({ id: 'new-1', autonomyTier: 'INCUBATION_PAPER' });

    const strategy = await ensureStrategy(BOOK, OWNER);

    expect(strategy.id).toBe('new-1');
    expect(h.strategyCreate.mock.calls[0][0].data.autonomyTier).toBe('INCUBATION_PAPER');
    expect(h.strategyCreate.mock.calls[0][0].data.config).toMatchObject({ label: INCUBATION_LABEL });
    expect(h.strategyUpdate).not.toHaveBeenCalled();
  });

  it('migrates a legacy AUTO_PAPER incubation row in place instead of duplicating it', async () => {
    h.strategyFindFirst.mockResolvedValue({ id: 'legacy-1', autonomyTier: 'AUTO_PAPER' });
    h.strategyUpdate.mockResolvedValue({ id: 'legacy-1', autonomyTier: 'INCUBATION_PAPER' });

    const strategy = await ensureStrategy(BOOK, OWNER);

    expect(strategy.id).toBe('legacy-1');
    expect(h.strategyUpdate).toHaveBeenCalledWith({
      where: { id: 'legacy-1' },
      data: { autonomyTier: 'INCUBATION_PAPER' },
    });
    expect(h.strategyCreate).not.toHaveBeenCalled();
  });

  it('reuses an already-migrated INCUBATION_PAPER row untouched', async () => {
    h.strategyFindFirst.mockResolvedValue({ id: 'ready-1', autonomyTier: 'INCUBATION_PAPER' });

    const strategy = await ensureStrategy(BOOK, OWNER);

    expect(strategy.id).toBe('ready-1');
    expect(h.strategyCreate).not.toHaveBeenCalled();
    expect(h.strategyUpdate).not.toHaveBeenCalled();
  });
});
