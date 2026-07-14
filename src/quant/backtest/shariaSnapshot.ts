// Per-run Sharia verdict snapshot (QUANT_DESIGN.md §2.3 #5). The strategy validation lane
// previously persisted NO per-symbol Sharia verdict, so every report card was SHARIA_UNVERIFIABLE
// by default. This module produces an HONEST, serializable snapshot per run:
//
//   • A REAL screening source configured (Zoya, live) ⇒ screen every symbol via the existing gate
//     and derive VERIFIED_COMPLIANT / VERIFIED_NON_COMPLIANT from real per-symbol verdicts.
//   • Keyless (MockScreener) ⇒ record UNSCREENED honestly: compliant = null, source = 'none',
//     state = UNSCREENED_EXECUTION_BLOCKED. We NEVER call the mock screener and present its fixture
//     verdicts as compliance truth — that would fabricate a verdict the run cannot stand behind.
//
// The snapshot is written into the results JSON + BacktestRun so a card can show VERIFIED_COMPLIANT
// once a real source (e.g. ZOYA_API_KEY) is configured, without any code change.
import type { Market } from '@prisma/client';
import { registry, type ShariaScreener } from '@/services/marketData';
import { evaluateShariaGate, isRealShariaSourceConfigured } from '../gates/sharia';
import type { ShariaValidationState } from './reportCard';

export interface ShariaSymbolSnapshot {
  symbol: string;
  /** true / false when screened by a real source; null when UNSCREENED (no real source). */
  compliant: boolean | null;
  standard: string;
  /** 'zoya' when a real verdict; 'none' when unscreened. Never the mock verdict presented as truth. */
  source: string;
  reason: string;
}

export interface ShariaRunSnapshot {
  screened: boolean;
  source: string;
  state: ShariaValidationState;
  verdicts: ShariaSymbolSnapshot[];
  asOf: string;
}

/** Derive the card state from the screened flag and the per-symbol verdicts (fail-closed on any non-compliance). */
export function deriveShariaState(
  screened: boolean,
  verdicts: readonly { compliant: boolean | null }[],
): ShariaValidationState {
  if (!screened) return 'UNSCREENED_EXECUTION_BLOCKED';
  if (verdicts.length === 0) return 'UNSCREENED_EXECUTION_BLOCKED';
  if (verdicts.some((v) => v.compliant !== true)) return 'VERIFIED_NON_COMPLIANT';
  return 'VERIFIED_COMPLIANT';
}

export interface BuildShariaSnapshotOpts {
  /** Override the "real source configured" decision (tests inject a mocked source). */
  screened?: boolean;
  /** Inject a screener (tests). Only consulted when `screened` is true; keyless never screens. */
  screener?: ShariaScreener;
  asOf?: Date;
}

/**
 * Build a per-run Sharia snapshot for a universe of symbols. Keyless (no real source) is fully
 * network-free: it returns UNSCREENED verdicts without ever touching a screener.
 */
export async function buildShariaRunSnapshot(
  symbols: readonly string[],
  market: Market,
  opts: BuildShariaSnapshotOpts = {},
): Promise<ShariaRunSnapshot> {
  const screened = opts.screened ?? isRealShariaSourceConfigured();
  const asOf = (opts.asOf ?? new Date()).toISOString();
  const unique = Array.from(new Set(symbols)).sort();

  if (!screened) {
    const verdicts: ShariaSymbolSnapshot[] = unique.map((symbol) => ({
      symbol,
      compliant: null,
      standard: 'AAOIFI',
      source: 'none',
      reason: 'unscreened_no_real_source',
    }));
    return { screened: false, source: 'none', state: 'UNSCREENED_EXECUTION_BLOCKED', verdicts, asOf };
  }

  const screener = opts.screener ?? registry.getScreener();
  const verdicts: ShariaSymbolSnapshot[] = [];
  for (const symbol of unique) {
    const gate = await evaluateShariaGate(symbol, market, screener);
    verdicts.push({
      symbol,
      compliant: gate.compliant,
      standard: gate.standard,
      source: gate.source,
      reason: gate.reason,
    });
  }
  return { screened: true, source: verdicts[0]?.source ?? 'zoya', state: deriveShariaState(true, verdicts), verdicts, asOf };
}
