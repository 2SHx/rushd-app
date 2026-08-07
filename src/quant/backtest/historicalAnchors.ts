// QDR-12: comparator anchors for incumbents that predate the manifest protocol.
//
// A DIVERSIFICATION lane (QDR-11) must name a real prior committed comparator. `halal-risk-parity-
// core@v1` is one — frozen by commit 6e5a095 on 2026-07-20, whose message reads "feat: preregister
// halal-risk-parity-core v1" — but it carries no manifest FILE, because
// `src/quant/backtest/experimentProtocol.ts` did not exist until cf41f13 on 2026-07-21. The gap is a
// protocol-migration artifact ONE DAY WIDE, not a missing commitment.
//
// WHAT AN ANCHOR IS: identity and A/B isolation. It establishes that the comparator rule is a real
// prior mechanism rather than a strawman constructed for the occasion, and it supplies the config
// the one-variable diff runs against.
//
// WHAT AN ANCHOR IS NOT: evidence. It contributes no metric, no card, no league row, no allocation,
// and may never be cited in support of any claim. The comparator ARM is still a fresh run under the
// identical PIT schedule — the anchor supplies the RULE, never a result.
//
// WHY THIS FILE IS CODE AND NOT DATA: a JSON file under docs/quant-experiments/ could be dropped in
// by anyone with write access and would look, to the resolver, exactly like a real manifest. A
// frozen const cannot be introduced without a code review that shows this whole comment.
//
// THE SET CANNOT GROW. Admissibility is decided by a date that already happened — see
// MANIFEST_PROTOCOL_EPOCH. Every version preregistered from 2026-07-21 onward had the protocol
// available and has no excuse. `historicalAnchors.test.ts` pins the closure.
import type { JsonValue } from './experimentProtocol';

/**
 * The commit that introduced the manifest protocol (`cf41f13`, "feat: harden quant experiment
 * governance"). An anchor is admissible only if its preregistration commit is dated STRICTLY
 * BEFORE this. The date is a historical fact, so the admissible set is closed by arithmetic rather
 * than by anyone's discipline — which is the point.
 */
export const MANIFEST_PROTOCOL_EPOCH = '2026-07-21';

export interface HistoricalComparatorAnchor {
  /** `setupId@version`, the form `comparatorVersionId` uses. */
  readonly versionId: string;
  readonly setupId: string;
  readonly version: string;
  /** The commit that FROZE the mechanism, before it ran. Must predate MANIFEST_PROTOCOL_EPOCH. */
  readonly preregistrationSha: string;
  readonly preregisteredAt: string;
  /** The published terminal run. Recorded so the anchor is auditable, never so it can be cited. */
  readonly terminalRunId: string;
  /** Always REJECTED here — recorded so no reader mistakes an anchor for an admitted strategy. */
  readonly terminalStatus: 'REJECTED';
  readonly ledgerRow: string;
  /**
   * Reconstructed from the committed code at `preregistrationSha`, in the same block shape a
   * manifest config uses, so the QDR-11 A/B diff runs against it unchanged. Auditable: a reader can
   * check every field against the code at that SHA.
   */
  readonly config: JsonValue;
}

/**
 * `halal-risk-parity-core@v1`, reconstructed from `src/quant/strategies/halalRiskParityCore.ts` at
 * 6e5a095: HALAL_RISK_PARITY_CORE_V1 (lookbackDays 252, minRankable 15, perNameCap 0.20, maxNames
 * 40, validationTrials 9), `halalRiskParityCoreBookPolicy` (maxGrossFraction 1), the month-end
 * rebalance in `wideDecision`, the engine's own 10/5 bps per side, and the 3x3
 * {231,252,273}x{0.15,0.20,0.25} plateau in `plateauNeighborhood`.
 *
 * `signal: null` is the mechanism's defining property, not an omission: this lane's whole hypothesis
 * was that a NEW mechanism class with no directional signal could fix concentration-driven tail
 * drawdown. It is what makes the lane a clean universe-rule comparator in the first place.
 */
const HALAL_RISK_PARITY_CORE_V1_CONFIG: JsonValue = {
  seed: 42,
  signal: null,
  portfolio: {
    weighting: 'inverse-volatility',
    lookbackDays: 252,
    perNameCap: 0.20,
    breadthFloor: 15,
    maxNames: 40,
    rebalance: 'monthly-month-end',
  },
  execution: { commissionBpsPerSide: 10, slippageBpsPerSide: 5 },
  plateau: {
    axes: ['lookbackDays', 'perNameCap'],
    lookbackDays: [231, 252, 273],
    perNameCap: [0.15, 0.20, 0.25],
    trials: 9,
  },
};

export const HISTORICAL_COMPARATOR_ANCHORS: readonly HistoricalComparatorAnchor[] = Object.freeze([
  Object.freeze({
    versionId: 'halal-risk-parity-core@v1',
    setupId: 'halal-risk-parity-core',
    version: 'v1',
    preregistrationSha: '6e5a095',
    preregisteredAt: '2026-07-20',
    terminalRunId: '214b6a94-9437-4a18-bf9d-efe42652d197',
    terminalStatus: 'REJECTED',
    ledgerRow: 'docs/STRATEGY_LAB.md — halal-risk-parity-core | T2 | R-RP1',
    config: HALAL_RISK_PARITY_CORE_V1_CONFIG,
  }),
]);

/**
 * Every anchor must predate the protocol epoch. Exported and asserted rather than merely documented,
 * because "the set is closed" is only true if something refuses to open it.
 */
export function assertAnchorAdmissible(anchor: HistoricalComparatorAnchor): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor.preregisteredAt)) {
    throw new Error(`historical anchor ${anchor.versionId}: preregisteredAt must be an ISO date`);
  }
  if (anchor.preregisteredAt >= MANIFEST_PROTOCOL_EPOCH) {
    throw new Error(
      `historical anchor ${anchor.versionId} was preregistered ${anchor.preregisteredAt}, on or after the `
      + `manifest protocol epoch ${MANIFEST_PROTOCOL_EPOCH}. Versions from that date onward had the `
      + 'protocol available and must carry a real sealed manifest — QDR-12 closes this set by a date '
      + 'that already happened, so this is refused by arithmetic, not by judgement',
    );
  }
  if (anchor.versionId !== `${anchor.setupId}@${anchor.version}`) {
    throw new Error(`historical anchor ${anchor.versionId}: versionId must be setupId@version`);
  }
  for (const [field, value] of [
    ['preregistrationSha', anchor.preregistrationSha],
    ['terminalRunId', anchor.terminalRunId],
    ['ledgerRow', anchor.ledgerRow],
  ] as [string, string][]) {
    // An anchor that cannot be audited against its own SHA and ledger row is not admissible.
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`historical anchor ${anchor.versionId}: ${field} is required for auditability`);
    }
  }
}

/** The admissible anchors, keyed by `versionId`. Throws if the registry itself is inadmissible. */
export function historicalAnchorIndex(): ReadonlyMap<string, HistoricalComparatorAnchor> {
  const index = new Map<string, HistoricalComparatorAnchor>();
  for (const anchor of HISTORICAL_COMPARATOR_ANCHORS) {
    assertAnchorAdmissible(anchor);
    if (index.has(anchor.versionId)) {
      throw new Error(`historical anchor ${anchor.versionId} is declared twice`);
    }
    index.set(anchor.versionId, anchor);
  }
  return index;
}
