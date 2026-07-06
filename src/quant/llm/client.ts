// Rushd Quant — LLM client factory. Wraps the per-agent model router (models.ts)
// over the existing Vercel AI SDK pattern (createOpenAI + generateObject), so every
// LLM agent picks its assigned model with one call and a uniform mock-mode signal.
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { resolveModelConfig, llmEndpoint, isMockMode, type LlmRole, type AgentModelConfig } from './models';

export interface AgentModel {
  config: AgentModelConfig;
  /** The AI SDK model handle for `generateObject`/`generateText`. Undefined in mock mode. */
  model?: LanguageModel;
  /** Opus safety net, tried once if `model` errors before the caller's mock. */
  fallback?: LanguageModel;
  /** When true, the caller MUST return its deterministic mock (no key configured). */
  mock: boolean;
}

/**
 * Build the model handle for a committee role. In mock mode `model` is undefined and
 * `mock` is true — the calling agent returns its schema-valid mock instead of calling out.
 * OpenRouter attribution headers are set when that endpoint is in use.
 */
export function agentModel(role: LlmRole, env: NodeJS.ProcessEnv = process.env): AgentModel {
  const config = resolveModelConfig(role, env);
  if (isMockMode(env)) return { config, mock: true };

  const { baseURL, apiKey } = llmEndpoint(env);
  const isOpenRouter = baseURL.includes('openrouter.ai');
  const provider = createOpenAI({
    apiKey,
    baseURL,
    ...(isOpenRouter
      ? { headers: { 'HTTP-Referer': 'https://rushd.finance', 'X-Title': 'Rushd Quant' } }
      : {}),
  });
  const fallback =
    config.fallbackModel && config.fallbackModel !== config.model
      ? provider(config.fallbackModel)
      : undefined;
  return { config, model: provider(config.model), fallback, mock: false };
}
