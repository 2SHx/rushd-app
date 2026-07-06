// Rushd Quant — per-agent model router (QUANT_DESIGN.md §2.6 model tiering).
//
// "Perfect model for each job": each LLM agent is matched to a free, high-performance
// model chosen for THAT task, unified through one OpenAI-compatible endpoint
// (OpenRouter by default — one key unlocks Gemini / DeepSeek / Qwen / Llama, many free).
// Every choice is env-overridable, and with no key the whole committee runs on mock
// (project invariant). Deterministic agents (Quant Core, Technical, Pattern, Sharia)
// use NO model and are absent from this matrix.
//
// Selection principles:
//   • cheap+fast (Gemini Flash) for high-throughput classification (news).
//   • strong+Arabic (Qwen 72B) where output is learner-facing Arabic analysis.
//   • long-context (Gemini Pro) for RAG synthesis with citations.
//   • strongest reasoning (Gemini Pro / DeepSeek) for the debate finale + the PM's call.
//   • temperature 0 everywhere for reproducibility (skill: agent-committee).
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
  temperature: number;
  /** Why this model fits this job — doubles as documentation. */
  rationale: string;
}

// Free / high-performance defaults, one per job. Swap any via env QUANT_MODEL_<ROLE>.
const MATRIX: Record<LlmRole, AgentModelConfig> = {
  NEWS_CATALYST: {
    role: 'NEWS_CATALYST',
    tier: 'cheap',
    model: 'google/gemini-2.0-flash-exp:free',
    temperature: 0,
    rationale: 'High-throughput headline classification + sentiment; fast and free, adequate Arabic.',
  },
  FUNDAMENTAL: {
    role: 'FUNDAMENTAL',
    tier: 'strong',
    model: 'qwen/qwen-2.5-72b-instruct',
    temperature: 0,
    rationale: 'Financial-statement reasoning + investor-persona lenses; strong bilingual, high-quality Arabic for learners.',
  },
  RESEARCH: {
    role: 'RESEARCH',
    tier: 'strong',
    model: 'google/gemini-2.5-pro-exp',
    temperature: 0,
    rationale: 'Long-context retrieval synthesis with citations; large window suits RAG grounding.',
  },
  DEBATE_ROUND: {
    role: 'DEBATE_ROUND',
    tier: 'cheap',
    model: 'google/gemini-2.0-flash-exp:free',
    temperature: 0,
    rationale: 'Fast bull/bear argument generation for the non-final rounds; cost-capped.',
  },
  DEBATE_FINAL: {
    role: 'DEBATE_FINAL',
    tier: 'strong',
    model: 'deepseek/deepseek-chat',
    temperature: 0,
    rationale: 'Sharper reasoning for the decisive final round; very cheap, strong analysis.',
  },
  PORTFOLIO_MANAGER: {
    role: 'PORTFOLIO_MANAGER',
    tier: 'strong',
    model: 'google/gemini-2.5-pro-exp',
    temperature: 0,
    rationale: 'The final call: strongest multi-signal reasoning + reliable structured output + good Arabic narration.',
  },
};

/** Default endpoint: OpenRouter (one OpenAI-compatible base URL for all the models above). */
export const DEFAULT_LLM_BASE_URL = 'https://openrouter.ai/api/v1';

/** Resolve the model config for a role, applying `QUANT_MODEL_<ROLE>` env overrides. */
export function resolveModelConfig(role: LlmRole, env: NodeJS.ProcessEnv = process.env): AgentModelConfig {
  const base = MATRIX[role];
  const override = env[`QUANT_MODEL_${role}`];
  return override ? { ...base, model: override } : base;
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
