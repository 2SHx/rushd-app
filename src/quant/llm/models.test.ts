import { describe, it, expect } from 'vitest';
import {
  resolveModelConfig,
  llmEndpoint,
  isMockMode,
  roleForAgent,
  MODEL_MATRIX,
  DEFAULT_LLM_BASE_URL,
  OPUS_FALLBACK,
} from './models';

describe('per-agent model matrix', () => {
  it('assigns a distinct, temp-0 config to every LLM role', () => {
    for (const [role, cfg] of Object.entries(MODEL_MATRIX)) {
      expect(cfg.role).toBe(role);
      expect(cfg.temperature).toBe(0); // reproducibility
      expect(cfg.model.length).toBeGreaterThan(0);
      expect(cfg.rationale.length).toBeGreaterThan(0);
    }
  });

  it('uses cheap/fast for news, strong for the PM', () => {
    expect(MODEL_MATRIX.NEWS_CATALYST.tier).toBe('cheap');
    expect(MODEL_MATRIX.PORTFOLIO_MANAGER.tier).toBe('strong');
  });

  it('honors a per-role env override', () => {
    const cfg = resolveModelConfig('FUNDAMENTAL', { QUANT_MODEL_FUNDAMENTAL: 'my/custom-model' } as any);
    expect(cfg.model).toBe('my/custom-model');
    expect(cfg.role).toBe('FUNDAMENTAL'); // rest of the config preserved
  });

  it('injects Opus as the default fallback, overridable globally and per-role', () => {
    expect(resolveModelConfig('NEWS_CATALYST', {} as any).fallbackModel).toBe(OPUS_FALLBACK);
    expect(resolveModelConfig('NEWS_CATALYST', { QUANT_FALLBACK_MODEL: 'x/y' } as any).fallbackModel).toBe('x/y');
    expect(
      resolveModelConfig('PORTFOLIO_MANAGER', { QUANT_FALLBACK_PORTFOLIO_MANAGER: 'p/m' } as any).fallbackModel,
    ).toBe('p/m');
  });
});

describe('endpoint + mock detection', () => {
  it('defaults to OpenRouter, falls back to OPENAI_* wiring', () => {
    expect(llmEndpoint({} as any).baseURL).toBe(DEFAULT_LLM_BASE_URL);
    expect(llmEndpoint({ OPENAI_BASE_URL: 'http://x/v1', OPENAI_API_KEY: 'k' } as any)).toEqual({
      baseURL: 'http://x/v1',
      apiKey: 'k',
    });
    expect(llmEndpoint({ QUANT_LLM_BASE_URL: 'http://or/v1', QUANT_LLM_API_KEY: 'z' } as any).baseURL).toBe(
      'http://or/v1',
    );
  });

  it('is mock mode without a key or with the mock-key sentinel', () => {
    expect(isMockMode({} as any)).toBe(true);
    expect(isMockMode({ OPENAI_API_KEY: 'mock-key' } as any)).toBe(true);
    expect(isMockMode({ QUANT_LLM_API_KEY: 'sk-real' } as any)).toBe(false);
  });
});

describe('roleForAgent', () => {
  it('maps LLM agents to roles and deterministic agents to null', () => {
    expect(roleForAgent('PORTFOLIO_MANAGER')).toBe('PORTFOLIO_MANAGER');
    expect(roleForAgent('NEWS_CATALYST')).toBe('NEWS_CATALYST');
    expect(roleForAgent('QUANT_CORE')).toBeNull();
    expect(roleForAgent('SHARIA')).toBeNull();
    expect(roleForAgent('TECHNICAL')).toBeNull();
  });
});
