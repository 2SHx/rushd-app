// Composite Sharia screener — the free, keyless replacement path for a Zoya subscription
// (which the user cannot afford). Behind the same swap-only `ShariaScreener` interface
// (src/services/marketData.ts), so nothing downstream (the gate, the run snapshot) needs to
// know this exists.
//
// Resolution order per symbol (fail-closed; never fabricates a verdict):
//   L1 (US)   — presence in an AUTHORIZED (in-stack-methodology) Sharia-screened ETF's
//               holdings ⇒ compliant=true, source='etf-holdings'. Today that is SPUS only
//               (S&P Shariah methodology, which IS in the declared AAOIFI + Al-Rajhi + S&P
//               Shariah authority stack). HLAL (FTSE Shariah methodology) is bundled in the
//               snapshot file's shape but is EXCLUDED from evidence by the
//               AUTHORIZED_ETF_METHODOLOGIES allowlist below, regardless of whether its data
//               is populated — see that allowlist for why. The fund itself already ran a real
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

// Declared authority stack (owner decision; do not add to this without a stack change):
//   AAOIFI + Al-Rajhi + S&P Shariah.
// Fund → methodology allowlist. A fund's holdings are only citable as execution-grade
// evidence if ITS OWN screening methodology is in that stack. This is enforced structurally
// (not by a comment on the data file): a fund key is unusable unless it is ALSO listed here
// with an authorized methodology, hardcoded at review time. `refresh-sharia-snapshots.ts`
// can populate any fund key it successfully fetches (including HLAL) into
// data/etf-holdings.json without asking us — this allowlist is what stops a populated
// out-of-stack snapshot from silently becoming verified evidence.
const AUTHORIZED_ETF_METHODOLOGIES: Readonly<Record<string, string>> = {
  SPUS: 'S&P Shariah', // in-stack
  // HLAL (Wahed FTSE USA Shariah ETF) is deliberately NOT listed: it tracks the FTSE Shariah
  // methodology, which is NOT in the declared authority stack. If refresh-sharia-snapshots.ts
  // ever succeeds in fetching HLAL holdings, they are ignored here by construction — adding
  // HLAL requires an explicit owner decision to expand the authority stack, not a successful
  // fetch.
};

function isAuthorizedFund(fund: string): boolean {
  return fund in AUTHORIZED_ETF_METHODOLOGIES;
}

/** Real, dated evidence: at least one AUTHORIZED fund has holdings AND the snapshot has a real asOf. */
export function isEtfHoldingsSnapshotUsable(snapshot: EtfHoldingsSnapshot = etfHoldingsSnapshot): boolean {
  if (!snapshot?.asOf) return false;
  return Object.entries(snapshot.funds ?? {})
    .some(([fund, symbols]) => isAuthorizedFund(fund) && Array.isArray(symbols) && symbols.length > 0);
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

/** Which AUTHORIZED (in-stack-methodology) funds list this US symbol, in declaration order.
 *  A fund present in the snapshot but absent from AUTHORIZED_ETF_METHODOLOGIES (e.g. HLAL)
 *  is excluded here regardless of how much data it carries. */
function fundsContaining(snapshot: EtfHoldingsSnapshot, symbol: string): string[] {
  const clean = cleanUsSymbol(symbol);
  return Object.entries(snapshot.funds ?? {})
    .filter(([fund, symbols]) => isAuthorizedFund(fund) && Array.isArray(symbols) && symbols.includes(clean))
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
