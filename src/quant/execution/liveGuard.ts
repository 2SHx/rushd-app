// Rushd Quant — the paper→live gate (QUANT_DESIGN.md §5, QDR-2).
// Real-money execution is DARK BY DEFAULT. It requires ALL THREE of: a live Alpaca
// base URL, the explicit QUANT_LIVE_EXECUTION=1 flag, and a stored CMA-license ref.
// executeDecision never calls a live broker; this guard protects the future live path
// so no code can reach a real brokerage without licensing + an explicit opt-in.
export class LiveExecutionBlocked extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveExecutionBlocked';
  }
}

/** Throws LiveExecutionBlocked unless all three live-execution conditions hold. */
export function assertLiveExecutionAllowed(env: NodeJS.ProcessEnv = process.env): void {
  const flag = env.QUANT_LIVE_EXECUTION === '1';
  const baseUrl = env.ALPACA_BASE_URL ?? '';
  const liveUrl = baseUrl.includes('api.alpaca.markets') && !baseUrl.includes('paper');
  const license = Boolean(env.QUANT_CMA_LICENSE_REF);
  if (!(flag && liveUrl && license)) {
    throw new LiveExecutionBlocked(
      'Live execution is disabled. Requires QUANT_LIVE_EXECUTION=1, a live (non-paper) ' +
        'ALPACA_BASE_URL, and a stored CMA license (QUANT_CMA_LICENSE_REF). Paper/sim only.',
    );
  }
}

export function isLiveExecutionAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    assertLiveExecutionAllowed(env);
    return true;
  } catch {
    return false;
  }
}
