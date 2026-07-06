import { describe, it, expect, beforeEach } from 'vitest';
import { fundamentalAnalyst } from './fundamental';
import type { PointInTimeContext } from '../data/pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');

function makeCtx(opts: { fundamentals?: any; bars?: any[] } = {}): PointInTimeContext {
  return {
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    bars: () => opts.bars ?? [],
    fundamentals: () => opts.fundamentals ?? null,
    news: () => [],
  };
}

const fundamentals = {
  id: 'f1',
  symbol: 'AAPL',
  market: 'NASDAQ',
  asOf: new Date('2026-03-31T00:00:00Z'),
  releasedAt: new Date('2026-05-01T00:00:00Z'),
  metrics: { peRatio: 22, debtToMarketCap: 0.12, revenueGrowth: 0.08 },
  source: 'FUNDAMENTALS',
  createdAt: asOf,
};

describe('fundamentalAnalyst', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  it('abstains when no fundamentals are disclosed as of this date', async () => {
    const sig = await fundamentalAnalyst.run(makeCtx({ fundamentals: null }));
    expect(sig.agent).toBe('FUNDAMENTAL');
    expect(sig.failureMode).toBe('abstain');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.evidence).toEqual([]);
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
  });

  it('falls back to a schema-valid degraded mock in mock mode (fundamentals present)', async () => {
    const sig = await fundamentalAnalyst.run(makeCtx({ fundamentals }));
    expect(sig.determinism).toBe('llm');
    expect(sig.modelId).toBeTruthy();
    expect(sig.failureMode).toBe('degraded');
    expect(sig.stance).toBe('NEUTRAL');
    // four persona lenses carried as evidence
    expect(sig.evidence).toHaveLength(4);
    expect(sig.evidence.map((e) => e.ref).sort()).toEqual(['GROWTH', 'GULF_TASI', 'QUALITY', 'SHARIA_VALUE']);
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
    expect(sig.costCents).toBe(0);
  });
});
