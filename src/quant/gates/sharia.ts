// Sharia compliance gate (QUANT_DESIGN.md §2.3 #5) — a deterministic HARD VETO, not a
// graded Analyst. Evaluated by the committee envelope (§2.5), never the debate: it can
// veto a BUY/increase on a non-compliant symbol but never overrides SELL/HOLD.
// Reuses the existing AAOIFI two-stage screener (registry.getScreener() — Zoya when
// keyed, MockScreener otherwise) from src/services/marketData.ts; does not reimplement
// screening. Screener unavailable/throws ⇒ FAIL-CLOSED (treated as non-compliant).
//
// NOT YET WIRED to the `Fundamentals` Prisma table (grepped 2026-08-20: no caller of this file
// reads `prisma.fundamentals`; that join is the pending `shariaVerdict()` addition to
// `PointInTimeContext`, see pointInTime.ts's "join in Q3" comment). Recorded here so the period
// decision travels with the gate it is FOR, not just with the reader: when that join lands, it
// must call `PointInTimeStore.fundamentals(symbol, market, asOf, 'QUARTERLY')` — explicitly
// QUARTERLY, never the store's `ANNUAL_DEFAULT`. Rationale (mirrors this file's existing
// `MAX_EXECUTION_EVIDENCE_AGE_DAYS` freshness posture below): AAOIFI-aligned index providers
// rescreen constituents quarterly, and `computeAaoifiScreen` (tier2AaoifiScreener.ts) already
// fails closed on any null required ratio input — so quarterly's thinner debt-field coverage
// (measured 47.4% vs annual's 53.9% non-null) can only ever produce MORE conservative
// (non-)compliant verdicts, never a false pass. A compliance gate that must fail closed should
// prefer the freshest evidence and let missing fields fail closed, not prefer stale-but-complete
// annual evidence that may misstate today's balance sheet.
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
// AAOIFI-aligned index providers (S&P Shariah, MSCI Islamic) rescreen constituents QUARTERLY,
// not annually — a fiscal-year horizon (previously 550d) was never the right standard, only a
// convenient one. Now that quarterly fundamentals are in the database (8,393 quarterly rows,
// ~91d staleness at any decision date, vs 180-320d for annual), there is no reason to accept
// evidence older than one quarterly rescreen cycle. 135d = one quarter (90d) + the SEC's own
// maximum 10-Q filing deadline (45d, non-accelerated filers) — the same buffer a quarterly-
// rescreen posture would need to avoid flagging a compliant name as stale the day before its
// filing lands. This tightens (not loosens) the gate: evidence aged 136-550d, which passed
// before, now fails closed.
const MAX_EXECUTION_EVIDENCE_AGE_DAYS = 135;
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

// STRICT (default) is the money-moving/track-record posture: an unverified-source or
// stale-evidence "compliant" verdict is rewritten to non-compliant (the 66451d3 intent).
// PERMISSIVE is the analysis posture (committee demo/dev, backtest research): the same
// verdict is honored so keyless/mock mode still produces BUY signals, but `reason` keeps
// the unverified/stale status visible in the returned gate — never silently relabels a
// mock verdict as verified. Every execution- or shadow-paper-adjacent caller MUST pass
// 'strict' explicitly; callers that pass nothing get 'strict' by default (fail-safe).
export type ShariaGateMode = 'strict' | 'permissive';

export async function evaluateShariaGate(
  symbol: string,
  market: Market,
  screener: ShariaScreener = registry.getScreener(),
  mode: ShariaGateMode = 'strict',
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
      const stale = VERIFIED_EXECUTION_SOURCES.has(verdict.source);
      if (mode === 'strict') {
        return {
          compliant: false,
          reason: stale ? 'stale_evidence_fail_closed' : 'unverified_source_fail_closed',
          standard: verdict.standard,
          source: verdict.source,
        };
      }
      return {
        compliant: true,
        reason: stale ? 'stale_evidence_permissive' : 'unverified_source_permissive',
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
