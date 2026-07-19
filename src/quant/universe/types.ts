// src/quant/universe/types.ts — QUANT_DESIGN.md QDR-8 (R4 unit C1): the verified halal
// universe's shared shapes. This module NEVER decides `VERIFIED_COMPLIANT` — it only labels
// which tier produced a name and carries its per-name purification ratio when one exists. The
// i18n-fintech-expert gate (a later stitch) decides which tier(s) qualify for execution.
import type { Market } from '@prisma/client';

/** Provenance labels — never invent a fourth; Tier-3 is a key-gated stub in this unit. */
export type UniverseTier = 'index-provider-screened' | 'rushd-xbrl-screened' | 'zoya-verified';

export interface UniverseEntry {
  symbol: string;
  name: string;
  market: Market;
  tier: UniverseTier;
  /** Human-readable source citation, e.g. "SPUS holdings fixture (2026-07-17)". */
  provenance: string;
  /** AAOIFI purification ratio in bps (round(nonCompliantIncome/revenue * 10000)). Fund-level
   * Tier-1 sources (SPUS/HLAL) do not disclose a per-name ratio — never fabricate one. */
  purificationRatioBps: number | 'n/a — not computed';
  /** Informational codes even for an included name (e.g. stale XBRL tag); never hides a caveat. */
  reasonCodes: string[];
  /** ISO date (YYYY-MM-DD) of the underlying source snapshot/filing. */
  asOf: string;
}

/** A candidate excluded before or during assembly — always carries a reason, never silent. */
export interface ExclusionReason {
  symbol: string;
  reasonCode: string;
  detail?: string;
}

export interface UniverseBuildResult {
  entries: UniverseEntry[];
  excluded: ExclusionReason[];
}
