// Rushd Quant — generateObject with an Opus fallback (QUANT_DESIGN.md §2.6).
// Runs the agent's assigned (free) model; if that call errors, retries ONCE on the
// strong fallback (Opus) before the caller drops to its deterministic mock. So a flaky
// free tier degrades to top quality first, and only then to a placeholder.
import { generateObject } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';

export interface FallbackArgs<S extends z.ZodTypeAny> {
  model: LanguageModel;
  fallback?: LanguageModel;
  schema: S;
  system: string;
  prompt: string;
  temperature?: number;
}

export async function generateObjectWithFallback<S extends z.ZodTypeAny>(
  args: FallbackArgs<S>,
): Promise<{ object: z.infer<S>; usedFallback: boolean }> {
  const { model, fallback, schema, system, prompt, temperature } = args;
  try {
    const r = await generateObject({ model, schema, system, prompt, temperature });
    return { object: r.object, usedFallback: false };
  } catch (err) {
    if (!fallback) throw err;
    const r = await generateObject({ model: fallback, schema, system, prompt, temperature });
    return { object: r.object, usedFallback: true };
  }
}
