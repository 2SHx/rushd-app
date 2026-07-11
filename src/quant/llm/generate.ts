// Rushd Quant — generateObject with a free-model fallback (QUANT_DESIGN.md §2.6).
// Runs the agent's assigned free model; if that call errors or is rate-limited (429),
// optionally retries once on a different free model before the caller drops to its deterministic
// mock. Output is capped (maxTokens) so calls stay cheap and avoid the balance/limit
// 402s that a default 64k-token request triggers on a low free-tier balance.
import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';

/** Cap on structured-output length. Analyst signals are small; a big default max-tokens
 *  request is what prices free/cheap models out (OpenRouter 402). Override per call. */
const DEFAULT_MAX_TOKENS = 1200;

export interface FallbackArgs<S extends z.ZodTypeAny> {
  model: LanguageModel;
  fallback?: LanguageModel;
  schema: S;
  system: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

export async function generateObjectWithFallback<S extends z.ZodTypeAny>(
  args: FallbackArgs<S>,
): Promise<{ object: z.infer<S>; usedFallback: boolean }> {
  const { model, fallback, schema, system, prompt, temperature } = args;
  const maxTokens = args.maxTokens ?? DEFAULT_MAX_TOKENS;
  try {
    const r = await generateObject({ model, schema, system, prompt, temperature, maxTokens });
    return { object: r.object, usedFallback: false };
  } catch (err) {
    if (!fallback || process.env.QUANT_LLM_RETRY !== 'true') throw err;
    const r = await generateObject({ model: fallback, schema, system, prompt, temperature, maxTokens });
    return { object: r.object, usedFallback: true };
  }
}
