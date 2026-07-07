import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../data/researchRetriever', () => ({
  retrieveDocs: vi.fn(),
}));

import { retrieveDocs } from '../data/researchRetriever';
import { researchAnalyst } from './research';
import type { PointInTimeContext } from '../data/pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');

function makeCtx(): PointInTimeContext {
  return {
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    bars: () => [],
    fundamentals: () => null,
    news: () => [],
  };
}

const docs = [
  { id: '1', title: 'Momentum Investing: A Survey', sourceRef: 'doc:momentum-92', text: 'Momentum strategies exploit trend continuation.' },
  { id: '2', title: 'Risk Management for Retail Investors', sourceRef: 'doc:risk-mgmt-01', text: 'Position sizing and diversification reduce drawdowns.' },
];

describe('researchAnalyst', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  it('returns NEUTRAL/0 with no evidence when retrieval is empty (nothing to ground)', async () => {
    (retrieveDocs as any).mockResolvedValue([]);

    const sig = await researchAnalyst.run(makeCtx());

    expect(sig.agent).toBe('RESEARCH');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.evidence).toEqual([]);
    expect(sig.failureMode).toBe('ok');
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
  });

  it('falls back to a degraded mock citing the retrieved titles when no LLM key is set', async () => {
    (retrieveDocs as any).mockResolvedValue(docs);

    const sig = await researchAnalyst.run(makeCtx());

    expect(sig.determinism).toBe('llm');
    expect(sig.modelId).toBeTruthy();
    expect(sig.failureMode).toBe('degraded');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.evidence.length).toBeGreaterThan(0);
    expect(sig.evidence.every((e) => e.kind === 'citation')).toBe(true);
    expect(sig.evidence.map((e) => e.ref).sort()).toEqual(['doc:momentum-92', 'doc:risk-mgmt-01']);
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
    expect(sig.costCents).toBe(0);
  });

  it('retrieves docs scoped to the context symbol', async () => {
    (retrieveDocs as any).mockResolvedValue([]);
    await researchAnalyst.run(makeCtx());
    expect(retrieveDocs).toHaveBeenCalledWith({ symbol: 'AAPL' });
  });
});
