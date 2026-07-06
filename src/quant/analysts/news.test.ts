import { describe, it, expect, beforeEach } from 'vitest';
import { newsCatalystAnalyst } from './news';
import type { PointInTimeContext } from '../data/pointInTime';

const asOf = new Date('2026-06-30T00:00:00.000Z');

function makeCtx(opts: { news?: any[]; bars?: any[] } = {}): PointInTimeContext {
  return {
    symbol: 'AAPL',
    market: 'NASDAQ' as any,
    asOf,
    bars: () => opts.bars ?? [],
    fundamentals: () => null,
    news: () => opts.news ?? [],
  };
}

const newsRow = (headline: string, daysAgo = 1) => ({
  id: headline,
  symbol: 'AAPL',
  market: 'NASDAQ',
  publishedAt: new Date(asOf.getTime() - daysAgo * 86_400_000),
  headline,
  summary: null,
  url: null,
  sentiment: null,
  source: 'ALPACA',
  createdAt: asOf,
});

describe('newsCatalystAnalyst', () => {
  // Force mock mode: no live model key present.
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUANT_LLM_API_KEY;
  });

  it('returns NEUTRAL/0 (ok) when there is no news to react to — before any model call', async () => {
    const sig = await newsCatalystAnalyst.run(makeCtx({ news: [] }));
    expect(sig.agent).toBe('NEWS_CATALYST');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.conviction).toBe(0);
    expect(sig.failureMode).toBe('ok');
    expect(sig.evidence).toEqual([{ kind: 'headline', ref: 'news_count', value: '0' }]);
  });

  it('falls back to a schema-valid degraded mock in mock mode (with news present)', async () => {
    const sig = await newsCatalystAnalyst.run(makeCtx({ news: [newsRow('Company beats earnings')] }));
    expect(sig.determinism).toBe('llm');
    expect(sig.modelId).toBeTruthy();
    expect(sig.failureMode).toBe('degraded');
    expect(sig.stance).toBe('NEUTRAL');
    expect(sig.rationaleAr.length).toBeGreaterThan(0);
    expect(sig.rationaleEn.length).toBeGreaterThan(0);
    expect(sig.evidence.length).toBeGreaterThan(0);
    expect(sig.costCents).toBe(0);
  });
});
