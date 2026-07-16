// Composite Sharia screener — the free, keyless replacement path for a Zoya subscription
// (which the user cannot afford). Behind the same swap-only `ShariaScreener` interface
// (src/services/marketData.ts), so nothing downstream (the gate, the run snapshot) needs to
// know this exists.
//
// Resolution order per symbol (fail-closed; never fabricates a verdict):
//   L1 (US)   — presence in a published Sharia-screened ETF's holdings (SPUS and/or HLAL)
//               ⇒ compliant=true, source='etf-holdings'. The fund itself already ran a real
//               AAOIFI-style screen to admit the name; we are not re-deriving compliance, we
//               are citing evidence of an existing one.
//   L2 (TASI) — presence in the bundled quarterly Saudi Sharia-list snapshot
//               ⇒ compliant=true, source='saudi-sharia-list'.
//   L3        — no hit in the relevant snapshot ⇒ compliant=null (UNKNOWN), source='none',
//               reason='not_covered_by_free_sources'. Index/size/liquidity constraints mean a
//               fund's holdings are a strict subset of "compliant names" — ABSENCE is NEVER
//               treated as non-compliance. A manufactured `false` from absence alone would be
//               a fabricated verdict; deriveShariaState already treats compliant !== true as
//               non-promotable, so UNKNOWN correctly keeps the run UNSCREENED_EXECUTION_BLOCKED
//               for that symbol without us ever asserting a negative we can't defend.
//
// Both snapshots are bundled, dated JSON (./data/*.json) so this works fully offline with zero
// API keys/network. `scripts/refresh-sharia-snapshots.ts` refreshes them from each fund's own
// published holdings file (SPUS, HLAL) / the Saudi list publisher, when the machine is online —
// it never invents membership; a failed fetch leaves the snapshot's `asOf` untouched (or null).
import type { ShariaScreener, ShariaVerdict } from '@/services/marketData';
import etfHoldingsRaw from './data/etf-holdings.json';
import saudiShariaListRaw from './data/saudi-sharia-list.json';

export interface EtfHoldingsSnapshot {
  asOf: string | null;
  sourceUrls?: Record<string, string>;
  funds: Record<string, string[]>;
  notes?: string;
}

export interface SaudiShariaListSnapshot {
  asOf: string | null;
  publisher: string | null;
  symbols: string[];
  notes?: string;
}

/** The bundled snapshot shipped in the repo (used by default; tests inject fixtures instead). */
export const etfHoldingsSnapshot = etfHoldingsRaw as EtfHoldingsSnapshot;
/** The bundled snapshot shipped in the repo (used by default; tests inject fixtures instead). */
export const saudiShariaListSnapshot = saudiShariaListRaw as SaudiShariaListSnapshot;

function cleanTasiSymbol(symbol: string): string {
  return symbol.replace(/\.SR$/i, '').toUpperCase();
}

function cleanUsSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Real, dated evidence: at least one fund has holdings AND the snapshot carries a real asOf. */
export function isEtfHoldingsSnapshotUsable(snapshot: EtfHoldingsSnapshot = etfHoldingsSnapshot): boolean {
  if (!snapshot?.asOf) return false;
  return Object.values(snapshot.funds ?? {}).some((symbols) => Array.isArray(symbols) && symbols.length > 0);
}

/** Real, dated evidence: at least one symbol AND the snapshot carries a real asOf. */
export function isSaudiListSnapshotUsable(snapshot: SaudiShariaListSnapshot = saudiShariaListSnapshot): boolean {
  return Boolean(snapshot?.asOf) && Array.isArray(snapshot.symbols) && snapshot.symbols.length > 0;
}

/** Either bundled snapshot has real, dated data — the composite source is only "real" then. */
export function isCompositeSourceUsable(
  etf: EtfHoldingsSnapshot = etfHoldingsSnapshot,
  saudi: SaudiShariaListSnapshot = saudiShariaListSnapshot,
): boolean {
  return isEtfHoldingsSnapshotUsable(etf) || isSaudiListSnapshotUsable(saudi);
}

/** Which funds (of the ones present in the snapshot) list this US symbol, in declaration order. */
function fundsContaining(snapshot: EtfHoldingsSnapshot, symbol: string): string[] {
  const clean = cleanUsSymbol(symbol);
  return Object.entries(snapshot.funds ?? {})
    .filter(([, symbols]) => Array.isArray(symbols) && symbols.includes(clean))
    .map(([fund]) => fund);
}

export class CompositeShariaScreener implements ShariaScreener {
  constructor(
    private readonly etfSnapshot: EtfHoldingsSnapshot = etfHoldingsSnapshot,
    private readonly saudiSnapshot: SaudiShariaListSnapshot = saudiShariaListSnapshot,
  ) {}

  async screen(symbol: string, market: 'TASI' | 'NASDAQ'): Promise<ShariaVerdict> {
    if (market === 'TASI' || /\.SR$/i.test(symbol)) {
      return this.screenTasi(symbol);
    }
    return this.screenUs(symbol);
  }

  private screenTasi(symbol: string): ShariaVerdict {
    const clean = cleanTasiSymbol(symbol);
    const hasSnapshot = Boolean(this.saudiSnapshot.asOf) && this.saudiSnapshot.symbols.length > 0;
    const asOf = this.saudiSnapshot.asOf ? new Date(this.saudiSnapshot.asOf) : new Date(0);

    if (hasSnapshot && this.saudiSnapshot.symbols.map((s) => s.toUpperCase()).includes(clean)) {
      return {
        symbol,
        compliant: true,
        standard: 'AAOIFI',
        source: 'saudi-sharia-list',
        asOf,
      };
    }

    return {
      symbol,
      compliant: null,
      standard: 'AAOIFI',
      source: 'none',
      asOf,
    };
  }

  private screenUs(symbol: string): ShariaVerdict {
    const funds = fundsContaining(this.etfSnapshot, symbol);
    const asOf = this.etfSnapshot.asOf ? new Date(this.etfSnapshot.asOf) : new Date(0);

    if (funds.length > 0) {
      return {
        symbol,
        compliant: true,
        standard: 'AAOIFI',
        source: 'etf-holdings',
        asOf,
      };
    }

    return {
      symbol,
      compliant: null,
      standard: 'AAOIFI',
      source: 'none',
      asOf,
    };
  }
}
