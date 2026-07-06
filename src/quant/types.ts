// Rushd Quant — the committee contract (QUANT_DESIGN.md §2.1–2.2).
// Every analyst emits one `AnalystSignal` shape; the Portfolio Manager consumes them.
// A `Stance` is an opinion (BULLISH/BEARISH/NEUTRAL) — NOT an order; only the PM
// produces an action (BUY/SELL/HOLD), and only inside the deterministic envelope.
import type { Market } from '@prisma/client';
import type { PointInTimeContext } from './data/pointInTime';

export type AgentKind =
  | 'QUANT_CORE'
  | 'NEWS_CATALYST'
  | 'TECHNICAL'
  | 'PATTERN_ANALOG'
  | 'SHARIA'
  | 'FUNDAMENTAL'
  | 'RESEARCH'
  | 'PORTFOLIO_MANAGER';

export type Stance = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

/** One auditable feature or citation behind a signal. Persisted with the signal. */
export interface Evidence {
  kind: 'feature' | 'citation' | 'ratio' | 'headline' | 'analog';
  ref: string; // e.g. 'RSI(14)', 'filing:2222/Q1-2026', 'doc:momentum-92'
  value: string; // stringified so it survives JSON persistence
}

export interface AnalystSignal {
  agent: AgentKind;
  symbol: string;
  market: Market;
  asOf: Date; // the point-in-time cutoff the signal was computed at
  stance: Stance;
  conviction: number; // 0..1
  horizonDays: number; // intended holding horizon
  rationaleEn: string;
  rationaleAr: string; // Arabic-first (parent DR-6); MSA, non-empty
  evidence: Evidence[]; // never empty for a non-abstaining signal
  determinism: 'deterministic' | 'llm'; // reproducibility class
  modelId?: string; // set iff determinism === 'llm'
  failureMode: 'ok' | 'degraded' | 'abstain';
  costCents: number; // LLM spend (0 for deterministic agents)
}

export interface Analyst {
  agent: AgentKind;
  run(ctx: PointInTimeContext): Promise<AnalystSignal>;
}
