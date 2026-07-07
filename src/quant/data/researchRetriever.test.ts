import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    researchDoc: { findMany: vi.fn() },
  },
}));

import { prisma } from '@/lib/prisma';
import { retrieveDocs } from './researchRetriever';

const momentumDoc = { id: '1', title: 'Momentum Investing', sourceRef: 'doc:momentum-92', text: 'text', tags: ['momentum'] };

describe('retrieveDocs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries by overlapping tags with a deterministic id order', async () => {
    (prisma.researchDoc.findMany as any).mockResolvedValue([momentumDoc]);

    const docs = await retrieveDocs({ tags: ['momentum'] });

    expect(prisma.researchDoc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: expect.arrayContaining([{ tags: { hasSome: ['momentum'] } }]) },
        orderBy: { id: 'asc' },
        take: 5,
      }),
    );
    expect(docs).toEqual([{ id: '1', title: 'Momentum Investing', sourceRef: 'doc:momentum-92', text: 'text' }]);
  });

  it('queries by keyword text against title/text', async () => {
    (prisma.researchDoc.findMany as any).mockResolvedValue([momentumDoc]);

    const docs = await retrieveDocs({ text: 'momentum' });

    const call = (prisma.researchDoc.findMany as any).mock.calls[0][0];
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { title: { contains: 'momentum', mode: 'insensitive' } },
        { text: { contains: 'momentum', mode: 'insensitive' } },
      ]),
    );
    expect(docs).toHaveLength(1);
  });

  it('returns [] when nothing matches', async () => {
    (prisma.researchDoc.findMany as any).mockResolvedValue([]);
    const docs = await retrieveDocs({ tags: ['nonexistent-topic'] });
    expect(docs).toEqual([]);
  });

  it('returns [] without hitting the DB when the query is empty', async () => {
    const docs = await retrieveDocs({});
    expect(docs).toEqual([]);
    expect(prisma.researchDoc.findMany).not.toHaveBeenCalled();
  });
});
