// src/quant/universe/buildVerifiedUniverse.ts — QDR-8 assembly: Tier-1 (SPUS fixture) ->
// Tier-2 (RUSHD AAOIFI screen over caller-supplied XBRL inputs) -> Tier-3 (Zoya, key-gated
// stub only). Pure, synchronous, no network, no persistence. This module NEVER marks a tier as
// `VERIFIED_COMPLIANT` — every entry is labeled by tier + provenance only; that promotion
// decision belongs to the i18n-fintech-expert gate (a later stitch), per QDR-8.
import type { ExclusionReason, UniverseBuildResult, UniverseEntry } from './types';
import { tier1EntriesFromSpus } from './tier1SpusFixture';
import { computeAaoifiScreen, type Tier2Inputs } from './tier2AaoifiScreener';

export interface BuildVerifiedUniverseOptions {
  /** Overrides the SPUS fixture path (tests only; defaults to the committed fixture). */
  spusFilePath?: string;
  /** Names to additionally screen under Tier-2, with already-fetched XBRL inputs (no network is
   * performed here — see tier2XbrlFetch.ts for the optional live source). Names already present
   * in Tier-1 are skipped (Tier-1 is authoritative; Tier-2 only widens coverage). */
  tier2Candidates?: Tier2Inputs[];
  /** Tier-3 (Zoya) is a key-gated stub in this unit — true only records the intent; no network
   * call is ever made here, and no entry is ever produced for it (avoids fabricating a verdict
   * this module cannot back with real data). */
  zoyaKeyConfigured?: boolean;
}

/** Builds the labeled universe. Every exclusion (fixture row rejects, Tier-2 fails) is returned,
 * never silently dropped. Duplicate symbols across tiers keep the Tier-1 (higher-trust) entry. */
export function buildVerifiedUniverse(options: BuildVerifiedUniverseOptions = {}): UniverseBuildResult {
  const excluded: ExclusionReason[] = [];

  const tier1 = tier1EntriesFromSpus({ filePath: options.spusFilePath });
  excluded.push(...tier1.excluded);

  const seen = new Set(tier1.entries.map((e) => e.symbol));
  const entries: UniverseEntry[] = [...tier1.entries];

  for (const candidate of options.tier2Candidates ?? []) {
    const symbol = candidate.symbol.trim().toUpperCase();
    if (seen.has(symbol)) continue; // Tier-1 already covers this name

    const screen = computeAaoifiScreen({ ...candidate, symbol });
    if (!screen.compliant) {
      excluded.push({ symbol, reasonCode: screen.reasonCodes.join(',') || 'tier2_screen_failed' });
      continue;
    }

    seen.add(symbol);
    entries.push({
      symbol,
      name: candidate.name,
      market: 'NASDAQ',
      tier: 'rushd-xbrl-screened',
      provenance: `RUSHD AAOIFI screen over SEC XBRL fundamentals (as of ${candidate.asOf})`,
      purificationRatioBps: screen.purificationRatioBps,
      reasonCodes: candidate.notes ?? [],
      asOf: candidate.asOf,
    });
  }

  // Tier-3 (Zoya): key-gated stub only — deliberately produces zero entries in this unit.
  if (options.zoyaKeyConfigured) {
    excluded.push({ symbol: '(zoya)', reasonCode: 'zoya_tier3_not_implemented_in_this_unit' });
  }

  return { entries, excluded };
}

/** Fail-closed lookup: a symbol absent from the built universe is excluded with a reason, never
 * silently treated as compliant. */
export function lookupInUniverse(
  result: UniverseBuildResult,
  symbol: string,
): UniverseEntry | ExclusionReason {
  const clean = symbol.trim().toUpperCase();
  const found = result.entries.find((e) => e.symbol === clean);
  if (found) return found;
  return result.excluded.find((e) => e.symbol === clean) ?? { symbol: clean, reasonCode: 'not_in_verified_universe' };
}
