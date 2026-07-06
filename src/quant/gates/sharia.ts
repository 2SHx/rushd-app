// Sharia compliance gate (QUANT_DESIGN.md §2.3 #5) — a deterministic HARD VETO, not a
// graded Analyst. Evaluated by the committee envelope (§2.5), never the debate: it can
// veto a BUY/increase on a non-compliant symbol but never overrides SELL/HOLD.
// Reuses the existing AAOIFI two-stage screener (registry.getScreener() — Zoya when
// keyed, MockScreener otherwise) from src/services/marketData.ts; does not reimplement
// screening. Screener unavailable/throws ⇒ FAIL-CLOSED (treated as non-compliant).
import type { Market } from '@prisma/client';
import { registry } from '@/services/marketData';

export type ShariaGate = {
  compliant: boolean;
  reason: string;
  standard: string;
  source: string;
};

export async function evaluateShariaGate(symbol: string, market: Market): Promise<ShariaGate> {
  try {
    const screener = registry.getScreener();
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
