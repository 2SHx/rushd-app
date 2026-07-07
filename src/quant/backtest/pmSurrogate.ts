// Deterministic PM policy-surrogate (QDR-4, skill agent-committee "Reproducibility" —
// "backtest a deterministic policy-surrogate of the PM"). The live PM is an LLM and is
// NOT reproducibly backtestable; this pure function approximates its intent from the
// committee's signals with a fixed conviction-scoring rule, then passes the proposal
// through the SAME deterministic envelope (`applyEnvelope`) and Sharia veto the live PM
// uses — so backtested risk is identical to live. No LLM, no wall-clock, no randomness:
// same inputs always produce the same output.
import { Prisma } from '@prisma/client';
import type { CommitteeResult } from '../committee/collect';
import {
  applyEnvelope,
  type PortfolioState,
  type MarketState,
  type RiskLimits,
  type ProposedDecision,
} from '../risk/envelope';

const D = Prisma.Decimal;

export const PM_SURROGATE_ID = 'det-conviction-v1';

/** Fixed fraction of equity proposed before the envelope clamps it down to actual limits. */
const PROPOSED_FRACTION_OF_EQUITY = 0.1;
/** |net conviction score| below this ⇒ HOLD (avoids flip-flopping on weak/mixed signals). */
const DEADBAND = 0.15;

export interface SurrogateOutcome {
  proposedAction: 'BUY' | 'SELL' | 'HOLD';
  proposedQty: Prisma.Decimal;
  finalAction: 'BUY' | 'SELL' | 'HOLD';
  finalQty: Prisma.Decimal;
  adjustments: string[];
}

function stanceSign(stance: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): number {
  if (stance === 'BULLISH') return 1;
  if (stance === 'BEARISH') return -1;
  return 0;
}

/** Σ sign(stance)·conviction over non-abstaining signals, normalized by count → [-1, 1]. */
function netScore(result: CommitteeResult): number {
  const active = result.signals.filter((s) => s.failureMode !== 'abstain');
  if (active.length === 0) return 0;
  const sum = active.reduce((acc, s) => acc + stanceSign(s.stance) * s.conviction, 0);
  return sum / active.length;
}

/**
 * Deterministic stand-in for `runPortfolioManager` (src/quant/committee/pm.ts), used only
 * in backtests. Same signature-shape/envelope/veto semantics, zero LLM involvement.
 */
export function surrogateDecision(
  result: CommitteeResult,
  pf: PortfolioState,
  mkt: MarketState,
  limits: RiskLimits,
  killSwitch = false,
): SurrogateOutcome {
  const score = netScore(result);

  let proposedAction: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
  if (score > DEADBAND) proposedAction = 'BUY';
  else if (score < -DEADBAND) proposedAction = 'SELL';

  const proposedQty =
    proposedAction === 'HOLD' || mkt.price.lte(0)
      ? new D(0)
      : pf.equity.mul(PROPOSED_FRACTION_OF_EQUITY).div(mkt.price);

  // Sharia veto: a proposed BUY on a non-tradeable symbol is forced to HOLD before the
  // envelope ever sees it (belt-and-suspenders with `result.tradeable` upstream).
  if (proposedAction === 'BUY' && !result.tradeable) {
    return {
      proposedAction,
      proposedQty,
      finalAction: 'HOLD',
      finalQty: new D(0),
      adjustments: ['sharia_veto'],
    };
  }

  const proposal: ProposedDecision = { action: proposedAction, qty: proposedQty };
  const envelopeResult = applyEnvelope(proposal, pf, mkt, limits, killSwitch);

  return {
    proposedAction,
    proposedQty,
    finalAction: envelopeResult.action,
    finalQty: envelopeResult.qty,
    adjustments: envelopeResult.adjustments,
  };
}
