// QDR-10 BETA evidence assembly. Turns a run's OWN computed series into the measurement inputs
// `evaluateBetaCriteria` needs. Pure: no DB, no provider, no randomness.
//
// The load-bearing rule here is alignment. Captures, beta and the (c2) shortfall are all computed
// from the SAME paired blocks, so a benchmark that is silently shifted or forward-filled would
// corrupt three criteria at once and no existing gate would catch it. A block is therefore kept
// only when BOTH sides have a real observed close at BOTH of its boundary sessions; otherwise it is
// dropped from both series. Never zero-fill, never carry a stale close forward.

export interface BookPoint {
  readonly ts: Date;
  readonly equity: number;
}

export interface AlignedBlocks {
  readonly bookReturns: number[];
  readonly benchmarkReturns: number[];
  /** Blocks discarded because a boundary close was missing on either side. */
  readonly droppedBlocks: number;
}

/** UTC calendar day is the session identity: NAV marks and bar timestamps need not share a clock. */
export function sessionKey(ts: Date): string {
  return ts.toISOString().slice(0, 10);
}

/**
 * Pair the frozen non-overlapping five-session book blocks with benchmark closes at the SAME
 * boundary sessions. Block convention is identical to `nonOverlappingFiveSessionBookReturns`:
 * `[start, start+5]` stepping by 5, so the two series are index-comparable by construction.
 */
export function alignFiveSessionBlocks(
  points: readonly BookPoint[],
  benchmarkCloseBySession: ReadonlyMap<string, number>,
): AlignedBlocks {
  const bookReturns: number[] = [];
  const benchmarkReturns: number[] = [];
  let droppedBlocks = 0;

  for (let start = 0; start + 5 < points.length; start += 5) {
    const open = points[start];
    const close = points[start + 5];
    const openEquity = open.equity;
    const closeEquity = close.equity;
    const openBench = benchmarkCloseBySession.get(sessionKey(open.ts));
    const closeBench = benchmarkCloseBySession.get(sessionKey(close.ts));

    const usable = Number.isFinite(openEquity) && openEquity > 0
      && Number.isFinite(closeEquity) && closeEquity > 0
      && openBench !== undefined && closeBench !== undefined
      && Number.isFinite(openBench) && openBench > 0
      && Number.isFinite(closeBench) && closeBench > 0;

    if (!usable) {
      droppedBlocks += 1;
      continue;
    }
    bookReturns.push(closeEquity / openEquity - 1);
    benchmarkReturns.push(closeBench / openBench - 1);
  }

  return { bookReturns, benchmarkReturns, droppedBlocks };
}

/** OLS slope of book on benchmark over the paired blocks. Zero benchmark variance ⇒ 0, not NaN. */
export function betaVsBenchmark(
  bookReturns: readonly number[],
  benchmarkReturns: readonly number[],
): number {
  const n = Math.min(bookReturns.length, benchmarkReturns.length);
  if (n < 2) return 0;
  let sumB = 0;
  let sumM = 0;
  for (let i = 0; i < n; i++) { sumB += bookReturns[i]; sumM += benchmarkReturns[i]; }
  const meanB = sumB / n;
  const meanM = sumM / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    const dm = benchmarkReturns[i] - meanM;
    cov += (bookReturns[i] - meanB) * dm;
    varM += dm * dm;
  }
  return varM > 0 ? cov / varM : 0;
}

/** Annualized compound return implied by a non-overlapping block series. */
export function annualizedFromBlocks(
  returns: readonly number[],
  observationsPerYear: number,
): number {
  if (!returns.length || !Number.isFinite(observationsPerYear) || observationsPerYear <= 0) return 0;
  let growth = 1;
  for (const r of returns) {
    if (!Number.isFinite(r) || r <= -1) return -1; // a total loss is terminal, not a NaN
    growth *= 1 + r;
  }
  const years = returns.length / observationsPerYear;
  if (years <= 0 || growth <= 0) return -1;
  return Math.pow(growth, 1 / years) - 1;
}

/**
 * Realized annual turnover as a multiple of average book NAV. `turnoverNotional` accumulates the
 * notional of every executed side, which is exactly the base the engine charges costs on.
 */
export function realizedAnnualTurnover(
  turnoverNotional: number,
  averageNav: number,
  years: number,
): number {
  if (!(averageNav > 0) || !(years > 0) || !Number.isFinite(turnoverNotional)) return 0;
  return turnoverNotional / averageNav / years;
}

export interface BetaGateDeclaration {
  readonly observationsPerYear: number;
  readonly volCeiling: number;
  readonly volFloor: number;
  readonly maxAnnualTurnover: number;
  readonly maxAnnualCostDragBps: number;
  readonly sealedCostModel: {
    readonly commissionBpsPerSide: number;
    readonly slippageBpsPerSide: number;
    readonly advParticipationCap: number;
  };
}

function finitePositive(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Read the BETA thresholds a lane sealed. These are the ONLY values taken from the config — every
 * measured figure comes from the run itself. Any missing or non-positive field yields null, which
 * fails the criteria closed rather than substituting a default that was never preregistered.
 */
export function betaGateDeclaration(params: unknown): BetaGateDeclaration | null {
  if (typeof params !== 'object' || params === null) return null;
  const validation = (params as { validation?: unknown }).validation;
  if (typeof validation !== 'object' || validation === null) return null;
  const v = validation as Record<string, unknown>;

  const observationsPerYear = finitePositive(v.observationsPerYear);
  const volCeiling = finitePositive(v.volCeiling);
  const volFloor = finitePositive(v.volFloor);
  const maxAnnualTurnover = finitePositive(v.maxAnnualTurnover);
  const maxAnnualCostDragBps = finitePositive(v.maxAnnualCostDragBps);
  if (observationsPerYear === null || volCeiling === null || volFloor === null
    || maxAnnualTurnover === null || maxAnnualCostDragBps === null) return null;

  const cost = typeof v.sealedCostModel === 'object' && v.sealedCostModel !== null
    ? v.sealedCostModel as Record<string, unknown>
    : null;
  const commissionBpsPerSide = finitePositive(cost?.commissionBpsPerSide);
  const slippageBpsPerSide = finitePositive(cost?.slippageBpsPerSide);
  const advParticipationCap = finitePositive(cost?.advParticipationCap);
  if (commissionBpsPerSide === null || slippageBpsPerSide === null || advParticipationCap === null) return null;

  return {
    observationsPerYear, volCeiling, volFloor, maxAnnualTurnover, maxAnnualCostDragBps,
    sealedCostModel: { commissionBpsPerSide, slippageBpsPerSide, advParticipationCap },
  };
}

/** Cost drag in bps/yr implied by realized turnover at the engine's per-side cost. */
export function realizedAnnualCostDragBps(
  turnover: number,
  commissionBpsPerSide: number,
  slippageBpsPerSide: number,
): number {
  if (!Number.isFinite(turnover) || turnover <= 0) return 0;
  return turnover * (commissionBpsPerSide + slippageBpsPerSide);
}
