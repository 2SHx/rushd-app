// Sharia compliance gate (QUANT_DESIGN.md §2.3 #5) — a deterministic HARD VETO, not a
// graded Analyst. Evaluated by the committee envelope (§2.5), never the debate: it can
// veto a BUY/increase on a non-compliant symbol but never overrides SELL/HOLD.
// Reuses the existing AAOIFI two-stage screener (registry.getScreener() — Zoya when
// keyed, MockScreener otherwise) from src/services/marketData.ts; does not reimplement
// screening. Screener unavailable/throws ⇒ FAIL-CLOSED (treated as non-compliant).
import type { Market } from '@prisma/client';
import { registry, type ShariaScreener } from '@/services/marketData';
import { isCompositeSourceUsable } from './etfHoldingsScreener';

export type ShariaGate = {
  // Kept as `boolean` (not nullable) — this is the veto/enforcement boundary every existing
  // caller (collect.ts, gateAllowsAction) treats as a strict fail-closed flag. An UNKNOWN
  // verdict (compliant: null at the ShariaVerdict layer, e.g. "not covered by the free
  // composite source") is folded into `false` HERE, with `reason` distinguishing it from an
  // actual screen failure — the enforcement outcome (BUY blocked) is identical either way, so
  // no fail-closed guarantee is weakened; only the honesty-preserving `reason`/`source` differ.
  compliant: boolean;
  reason: string;
  standard: string;
  source: string;
};

const VERIFIED_EXECUTION_SOURCES = new Set(['zoya', 'etf-holdings', 'saudi-sharia-list']);
// Reuse the repo's declared PIT fundamentals horizon: one fiscal year plus ordinary filing lag.
const MAX_EXECUTION_EVIDENCE_AGE_DAYS = 550;
const DAY_MS = 86_400_000;

function hasCurrentEvidence(asOf: Date, decisionAt = new Date()): boolean {
  const evidenceMs = asOf.getTime();
  const ageMs = decisionAt.getTime() - evidenceMs;
  return Number.isFinite(evidenceMs)
    && Number.isFinite(ageMs)
    && ageMs >= 0
    && ageMs <= MAX_EXECUTION_EVIDENCE_AGE_DAYS * DAY_MS;
}

/**
 * Is a REAL (non-mock) Sharia screening source configured? Only then is a per-symbol verdict
 * TRUSTWORTHY. Keyless, the registry falls back to MockScreener, whose verdicts are fixtures — so a
 * keyless run must record UNSCREENED honestly and NEVER present a mock verdict as compliance truth.
 * Two real sources are recognized: Zoya (paid, keyed) — the original gate — and the free composite
 * screener (SHARIA_SOURCE=composite), which only counts as "real" once its bundled snapshots actually
 * carry dated, non-empty evidence (an empty/fetch-failed snapshot must NOT be presented as screened).
 */
export function isRealShariaSourceConfigured(): boolean {
  if (process.env.MARKET_DATA_MODE === 'live' && process.env.ZOYA_API_KEY) return true;
  if (process.env.SHARIA_SOURCE === 'composite' && isCompositeSourceUsable()) return true;
  return false;
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
    if (verdict.compliant === null) {
      return { compliant: false, reason: 'not_covered_by_free_sources', standard: verdict.standard, source: verdict.source };
    }
    if (verdict.compliant && (
      !VERIFIED_EXECUTION_SOURCES.has(verdict.source)
      || !hasCurrentEvidence(verdict.asOf)
    )) {
      return {
        compliant: false,
        reason: VERIFIED_EXECUTION_SOURCES.has(verdict.source)
          ? 'stale_evidence_fail_closed'
          : 'unverified_source_fail_closed',
        standard: verdict.standard,
        source: verdict.source,
      };
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
