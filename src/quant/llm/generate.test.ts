import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

const genMock = vi.hoisted(() => vi.fn());
vi.mock('ai', () => ({ generateObject: genMock }));

import { generateObjectWithFallback } from './generate';

const schema = z.object({ ok: z.boolean() });
const primary = { id: 'primary' } as any;
const fallback = { id: 'opus' } as any;
const args = { schema, system: 's', prompt: 'p', temperature: 0 };

describe('generateObjectWithFallback', () => {
  beforeEach(() => {
    genMock.mockReset();
    delete process.env.QUANT_LLM_RETRY;
  });

  it('uses the primary model when it succeeds', async () => {
    genMock.mockResolvedValueOnce({ object: { ok: true } });
    const r = await generateObjectWithFallback({ model: primary, fallback, ...args });
    expect(r).toEqual({ object: { ok: true }, usedFallback: false });
    expect(genMock).toHaveBeenCalledTimes(1);
    expect(genMock.mock.calls[0][0].model).toBe(primary);
  });

  it('does not retry by default when the primary errors', async () => {
    genMock.mockRejectedValueOnce(new Error('free tier down'));
    await expect(generateObjectWithFallback({ model: primary, fallback, ...args })).rejects.toThrow('free tier down');
    expect(genMock).toHaveBeenCalledTimes(1);
  });

  it('retries once on the fallback when explicitly enabled', async () => {
    process.env.QUANT_LLM_RETRY = 'true';
    genMock.mockRejectedValueOnce(new Error('free tier down')).mockResolvedValueOnce({ object: { ok: false } });
    const r = await generateObjectWithFallback({ model: primary, fallback, ...args });
    expect(r).toEqual({ object: { ok: false }, usedFallback: true });
    expect(genMock).toHaveBeenCalledTimes(2);
    expect(genMock.mock.calls[1][0].model).toBe(fallback);
  });

  it('rethrows when the primary errors and there is no fallback', async () => {
    genMock.mockRejectedValueOnce(new Error('boom'));
    await expect(generateObjectWithFallback({ model: primary, ...args })).rejects.toThrow('boom');
    expect(genMock).toHaveBeenCalledTimes(1);
  });
});
