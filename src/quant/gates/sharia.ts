// Sharia compliance gate (QUANT_DESIGN.md §2.3 #5) — a deterministic HARD VETO, not a
// graded Analyst. Evaluated by the committee envelope (§2.5), never the debate: it can
// veto a BUY/increase on a non-compliant symbol but never overrides SELL/HOLD.
// Reuses the existing AAOIFI two-stage screener (registry.getScreener() — Zoya when
// keyed, MockScreener otherwise) from src/services/marketData.ts; does not reimplement
// screening. Screener unavailable/throws ⇒ FAIL-CLOSED (treated as non-compliant).
import type { Market } from '@prisma/client';
import { registry, type ShariaScreener } from '@/services/marketData';

export type ShariaGate = {
  compliant: boolean;
  reason: string;
  standard: string;
  source: string;
};

/**
 * Is a REAL (non-mock) Sharia screening source configured? Only then is a per-symbol verdict
 * TRUSTWORTHY. Keyless, the registry falls back to MockScreener, whose verdicts are fixtures — so a
 * keyless run must record UNSCREENED honestly and NEVER present a mock verdict as compliance truth.
 * Pure read of the same env gate `ProviderRegistry.getScreener()` uses to pick the Zoya adapter.
 */
export function isRealShariaSourceConfigured(): boolean {
  return Boolean(process.env.MARKET_DATA_MODE === 'live' && process.env.ZOYA_API_KEY);
}

export async function evaluateShariaGate(
  symbol: string,
  market: Market,
  screener: ShariaScreener = registry.getScreener(),
): Promise<ShariaGate> {
  try {
    const verdict = await screener.screen(symbol, market as 'TASI' | 'NASDAQ');
    if (!verdict) {
      return { compliant: false, reason: 'screener_unavailable_fail_closed', standard: 'AAOIFI', source: 'none' };
    }
    return {
      compliant: verdict.compliant,
      reason: verdict.compliant ? 'aaoifi_screen_pass' : 'aaoifi_screen_fail',
      standard: verdict.standard,
      source: verdict.source,
    };
  } catch {
    return { compliant: false, reason: 'screener_unavailable_fail_closed', standard: 'AAOIFI', source: 'none' };
  }
}

export function gateAllowsAction(gate: ShariaGate, action: 'BUY' | 'SELL' | 'HOLD'): boolean {
  if (gate.compliant) return true;
  return action === 'SELL' || action === 'HOLD';
}
