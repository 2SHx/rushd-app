// Rushd Quant — keyword/tag retriever for the RESEARCH analyst (#7, RAG, QUANT_DESIGN.md §2.3).
// MVP retrieval is DB keyword/tag matching, not vector search (ResearchDoc.embedding is unused
// here — reserved for a future embedding-based upgrade). Deterministic order (by id) so results
// are reproducible; returns [] when nothing matches (the caller must abstain/neutral on that).
import { prisma } from '@/lib/prisma';

export interface RetrievedDoc {
  id: string;
  title: string;
  sourceRef: string;
  text: string;
}

export interface RetrieveQuery {
  symbol?: string;
  tags?: string[];
  text?: string;
}

export async function retrieveDocs(query: RetrieveQuery, limit = 5): Promise<RetrievedDoc[]> {
  const { symbol, tags, text } = query;
  const or: Record<string, unknown>[] = [];

  if (tags && tags.length > 0) {
    or.push({ tags: { hasSome: tags } });
  }
  if (text && text.trim().length > 0) {
    or.push({ title: { contains: text, mode: 'insensitive' } });
    or.push({ text: { contains: text, mode: 'insensitive' } });
  }
  if (symbol && symbol.trim().length > 0) {
    or.push({ tags: { has: symbol.toLowerCase() } });
    or.push({ title: { contains: symbol, mode: 'insensitive' } });
  }

  if (or.length === 0) return [];

  const rows = await prisma.researchDoc.findMany({
    where: { OR: or },
    orderBy: { id: 'asc' },
    take: limit,
  });

  return rows.map((r) => ({ id: r.id, title: r.title, sourceRef: r.sourceRef, text: r.text }));
}
