// Committee signal-collector (QUANT_DESIGN.md §2.3–2.5) — runs the analyst roster
// over a point-in-time context in parallel, integrates the Sharia gate (a VETO on
// the tradeable universe, not a debate vote), and returns one structured,
// tradeability-annotated result. Dependency-injected so it's unit-testable
// without a DB or LLM keys.
//
// RESEARCH (#7, RAG) grounds its stance in retrieved literature; it INFORMS the
// committee's rationale and never overrides the Sharia gate below.
import type { Analyst, AnalystSignal, AgentKind } from '../types';
import type { PointInTimeContext } from '../data/pointInTime';
import { evaluateShariaGate, type ShariaGate } from '../gates/sharia';
import { quantCoreAnalyst } from '../analysts/quantCore';
import { technicalAnalyst } from '../analysts/technical';
import { newsCatalystAnalyst } from '../analysts/news';
import { fundamentalAnalyst } from '../analysts/fundamental';
import { patternAnalyst } from '../analysts/pattern';
import { researchAnalyst } from '../analysts/research';

export const DEFAULT_ANALYSTS: Analyst[] = [
  quantCoreAnalyst,
  technicalAnalyst,
  newsCatalystAnalyst,
  fundamentalAnalyst,
  patternAnalyst,
  researchAnalyst,
];

export interface CommitteeResult {
  symbol: string;
  market: PointInTimeContext['market'];
  asOf: Date;
  signals: AnalystSignal[];
  shariaGate: ShariaGate;
  tradeable: boolean;
}

/** Synthesize a contained abstain signal for an analyst whose run() rejected. */
function abstainOnFailure(agent: AgentKind, ctx: PointInTimeContext, err: unknown): AnalystSignal {
  const message = err instanceof Error ? err.message : String(err);
  return {
    agent,
    symbol: ctx.symbol,
    market: ctx.market,
    asOf: ctx.asOf,
    stance: 'NEUTRAL',
    conviction: 0,
    horizonDays: 0,
    rationaleEn: `Analyst failed and was contained: ${message}`,
    rationaleAr: `فشل المحلل وتم احتواء الخطأ: ${message}`,
    evidence: [],
    determinism: 'deterministic',
    failureMode: 'abstain',
    costCents: 0,
  };
}

export async function collectSignals(
  ctx: PointInTimeContext,
  opts?: { analysts?: Analyst[]; gate?: (symbol: string, market: PointInTimeContext['market']) => Promise<ShariaGate> },
): Promise<CommitteeResult> {
  const analysts = opts?.analysts ?? DEFAULT_ANALYSTS;
  // Default here is PERMISSIVE, for direct/keyless analysis and research callers (e.g.
  // backtest/engine.ts) that never persist an executable Decision. Any caller whose result
  // CAN reach an order — runCommitteePass (both AUTO_PAPER and HUMAN_APPROVE persist an
  // executable Decision) — passes `opts.gate` bound to 'strict' explicitly; see
  // committee/runner.ts. Do not treat this default as safe for an execution-adjacent path.
  const gateFn = opts?.gate
    ?? ((symbol: string, market: PointInTimeContext['market']) =>
      evaluateShariaGate(symbol, market, undefined, 'permissive'));

  const [settled, shariaGate] = await Promise.all([
    Promise.allSettled(analysts.map((a) => a.run(ctx))),
    gateFn(ctx.symbol, ctx.market),
  ]);

  // Deterministic ordering: fixed agent order (the order `analysts` was supplied in).
  const signals: AnalystSignal[] = settled.map((result, i) =>
    result.status === 'fulfilled' ? result.value : abstainOnFailure(analysts[i].agent, ctx, result.reason),
  );

  return {
    symbol: ctx.symbol,
    market: ctx.market,
    asOf: ctx.asOf,
    signals,
    shariaGate,
    tradeable: shariaGate.compliant,
  };
}
