import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireSession = vi.fn();
const findMany = vi.fn();
const generateObject = vi.fn();
const createOpenAI = vi.fn((_config?: unknown) => vi.fn(() => ({ id: 'app-model' })));

vi.mock('@/lib/authz', () => ({ requireSession: () => requireSession() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { portfolioItem: { findMany: (...args: unknown[]) => findMany(...args) } },
}));
vi.mock('ai', () => ({ generateObject: (...args: unknown[]) => generateObject(...args) }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: (...args: unknown[]) => createOpenAI(args[0]) }));

import { POST } from './route';

function request(symbol = 'MSFT') {
  return new Request('http://localhost/api/signals', {
    method: 'POST',
    body: JSON.stringify({ symbol, market: 'NASDAQ', currentPrice: 420 }),
  });
}

beforeEach(() => {
  requireSession.mockReset().mockResolvedValue({ id: 'u1' });
  findMany.mockReset().mockResolvedValue([]);
  generateObject.mockReset();
  createOpenAI.mockClear();
  delete process.env.APP_LLM_MODE;
  delete process.env.APP_LLM_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe('POST /api/signals LLM opt-in', () => {
  it('returns a symbol-bound educational HOLD with zero model calls by default', async () => {
    process.env.OPENAI_API_KEY = 'generic-key';
    const res = await POST(request('MSFT'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      action: 'HOLD',
      asset: 'MSFT',
      complianceTag: 'EDUCATIONAL_ONLY',
    });
    expect(generateObject).not.toHaveBeenCalled();
    expect(createOpenAI).not.toHaveBeenCalled();
  });

  it('generates only when explicitly enabled with an app key', async () => {
    process.env.APP_LLM_MODE = 'live';
    process.env.APP_LLM_API_KEY = 'app-key';
    const object = {
      action: 'HOLD',
      asset: 'MSFT',
      reasoningArabic: 'تعليمي',
      reasoningEnglish: 'Educational',
      educationalConcept: 'Risk',
      xpReward: 0,
      complianceTag: 'EDUCATIONAL_ONLY',
    };
    generateObject.mockResolvedValue({ object });
    const res = await POST(request('MSFT'));
    expect(await res.json()).toEqual(object);
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(createOpenAI).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'app-key' }));
  });

  it('binds live model output to the requested asset and blocks unverified buys', async () => {
    process.env.APP_LLM_MODE = 'live';
    process.env.APP_LLM_API_KEY = 'app-key';
    generateObject.mockResolvedValue({
      object: {
        action: 'BUY',
        asset: 'TSLA',
        reasoningArabic: 'تعليمي',
        reasoningEnglish: 'Educational',
        educationalConcept: 'Risk',
        xpReward: 10,
        complianceTag: 'HALAL',
      },
    });

    const res = await POST(request('MSFT'));

    expect(await res.json()).toMatchObject({
      action: 'HOLD',
      asset: 'MSFT',
      complianceTag: 'EDUCATIONAL_ONLY',
    });
  });
});
