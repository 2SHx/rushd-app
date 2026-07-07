// Rushd Quant — per-agent model router (QUANT_DESIGN.md §2.6 model tiering).
//
// "Perfect model for each job": each LLM agent is matched to a free, high-performance
// model chosen for THAT task, unified through one OpenAI-compatible endpoint
// (OpenRouter by default — one key unlocks Gemini / DeepSeek / Qwen / Llama, many free).
// Every choice is env-overridable, and with no key the whole committee runs on mock
// (project invariant). Deterministic agents (Quant Core, Technical, Pattern, Sharia)
// use NO model and are absent from this matrix.
//
// Selection principles (FREE models only — verified live on OpenRouter 2026-07):
//   • cheap+fast (gpt-oss-20b:free) for high-throughput classification (news, debate rounds).
//   • strong reasoning (nemotron-3-super-120b:free) for fundamentals, research, debate final, PM.
//   • fallback is the OTHER free model, so a 429 on one retries on another before the mock.
//   • temperature 0 + capped max-tokens everywhere for reproducibility (skill: agent-committee).
import type { AgentKind } from '../types';

export type LlmTier = 'cheap' | 'strong';

/** A committee role that consumes an LLM (a superset of AgentKind's LLM agents + debate roles). */
export type LlmRole =
  | 'NEWS_CATALYST'
  | 'FUNDAMENTAL'
  | 'RESEARCH'
  | 'DEBATE_ROUND'
  | 'DEBATE_FINAL'
  | 'PORTFOLIO_MANAGER';

export interface AgentModelConfig {
  role: LlmRole;
  tier: LlmTier;
  /** OpenAI-compatible model id (default: an OpenRouter slug, free where available). */
  model: string;
  /** Strong fallback tried once if the primary model errors, before the mock. Default: Opus. */
  fallbackModel: string;
  temperature: number;
  /** Why this model fits this job — doubles as documentation. */
  rationale: string;
}

/**
 * The default fallback: a DIFFERENT free model (gpt-oss-20b). When a primary free model
 * errors or is rate-limited (429), the call retries once on this other free model before
 * an agent drops to its deterministic mock — free-only, no paid safety net.
 * Global override: QUANT_FALLBACK_MODEL; per-role: QUANT_FALLBACK_<ROLE>.
 */
export const FREE_FALLBACK = 'openai/gpt-oss-20b:free';
/** The other verified free model — used when a role's fallback would equal its primary,
 *  so every agent gets a second shot on a *different* free model under 429 rate limits. */
const FREE_ALT = 'nvidia/nemotron-3-super-120b-a12b:free';

// Free / high-performance defaults, one per job. Swap any via env QUANT_MODEL_<ROLE>.
// fallbackModel is injected at resolve time (defaults to Opus), so entries omit it.
type MatrixEntry = Omit<AgentModelConfig, 'fallbackModel'>;
const MATRIX: Record<LlmRole, MatrixEntry> = {
  NEWS_CATALYST: {
    role: 'NEWS_CATALYST',
    tier: 'cheap',
    model: 'openai/gpt-oss-20b:free',
    temperature: 0,
    rationale: 'High-throughput headline classification + sentiment; free gpt-oss-20b, fast + clean structured output.',
  },
  FUNDAMENTAL: {
    role: 'FUNDAMENTAL',
    tier: 'strong',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    temperature: 0,
    rationale: 'Financial-statement reasoning + investor-persona lenses; free nemotron-120b, strong reasoning.',
  },
  RESEARCH: {
    role: 'RESEARCH',
    tier: 'strong',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    temperature: 0,
    rationale: 'Retrieval synthesis with citations; free nemotron-120b, strong long-form reasoning.',
  },
  DEBATE_ROUND: {
    role: 'DEBATE_ROUND',
    tier: 'cheap',
    model: 'openai/gpt-oss-20b:free',
    temperature: 0,
    rationale: 'Fast bull/bear argument generation for the non-final rounds; free gpt-oss-20b.',
  },
  DEBATE_FINAL: {
    role: 'DEBATE_FINAL',
    tier: 'strong',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    temperature: 0,
    rationale: 'Sharper reasoning for the decisive final round; free nemotron-120b.',
  },
  PORTFOLIO_MANAGER: {
    role: 'PORTFOLIO_MANAGER',
    tier: 'strong',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    temperature: 0,
    rationale: 'The final call: strongest free reasoning (nemotron-120b) + reliable structured output.',
  },
};

/** Default endpoint: OpenRouter (one OpenAI-compatible base URL for all the models above). */
export const DEFAULT_LLM_BASE_URL = 'https://openrouter.ai/api/v1';

/** Resolve the model config for a role, applying `QUANT_MODEL_<ROLE>` env overrides. */
export function resolveModelConfig(role: LlmRole, env: NodeJS.ProcessEnv = process.env): AgentModelConfig {
  const base = MATRIX[role];
  const model = env[`QUANT_MODEL_${role}`] ?? base.model;
  let fallbackModel = env[`QUANT_FALLBACK_${role}`] ?? env.QUANT_FALLBACK_MODEL ?? FREE_FALLBACK;
  // Ensure the fallback is a *different* free model than the primary (real second shot on 429).
  if (fallbackModel === model) fallbackModel = model === FREE_FALLBACK ? FREE_ALT : FREE_FALLBACK;
  return { ...base, model, fallbackModel };
}

/** The base URL + key the committee's LLM calls use (falls back to the app's OPENAI_* wiring). */
export function llmEndpoint(env: NodeJS.ProcessEnv = process.env): { baseURL: string; apiKey?: string } {
  return {
    baseURL: env.QUANT_LLM_BASE_URL || env.OPENAI_BASE_URL || DEFAULT_LLM_BASE_URL,
    apiKey: env.QUANT_LLM_API_KEY || env.OPENAI_API_KEY,
  };
}

/** True when no usable key is configured — the committee must run its mock fallbacks. */
export function isMockMode(env: NodeJS.ProcessEnv = process.env): boolean {
  const key = env.QUANT_LLM_API_KEY || env.OPENAI_API_KEY;
  return !key || key === 'mock-key';
}

/** Map an LLM AgentKind to its role (PM and the analysts). Non-LLM agents return null. */
export function roleForAgent(agent: AgentKind): LlmRole | null {
  switch (agent) {
    case 'NEWS_CATALYST':
      return 'NEWS_CATALYST';
    case 'FUNDAMENTAL':
      return 'FUNDAMENTAL';
    case 'RESEARCH':
      return 'RESEARCH';
    case 'PORTFOLIO_MANAGER':
      return 'PORTFOLIO_MANAGER';
    default:
      return null; // QUANT_CORE, TECHNICAL, PATTERN_ANALOG, SHARIA are deterministic
  }
}

export const MODEL_MATRIX = MATRIX;
