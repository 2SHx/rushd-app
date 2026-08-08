// src/quant/data/pitFundamentalsFetch.ts — the ONLY network-touching half of the PIT fundamentals
// backfill. Deliberately thin: resolves a symbol's CIK and fetches its raw companyfacts +
// submissions JSON, then hands off to the pure `selectAnnualFundamentalsHistory` (never
// re-implements the PIT selection logic here). Mirrors the SEC_HEADERS/fetchJson pattern already
// established in src/quant/universe/tier2XbrlFetch.ts (reused, not duplicated) and
// src/quant/data/secFundamentals.ts (same User-Agent, same keyless endpoints). Not imported by any
// test — see pitFundamentalsBackfill.test.ts for the offline-testable core this wraps.
import { SEC_HEADERS, fetchJson } from '../universe/tier2XbrlFetch';
import { selectAnnualFundamentalsHistory, type PitFundamentalsFiling, type PitFundamentalsSkip } from './pitFundamentalsBackfill';

let tickerToCikPromise: Promise<Map<string, string>> | null = null;

/** SEC's official ticker->CIK map, fetched once and cached for the process lifetime. Keyless. */
export async function loadTickerToCik(): Promise<Map<string, string>> {
  if (!tickerToCikPromise) {
    tickerToCikPromise = fetchJson('https://www.sec.gov/files/company_tickers.json').then((data) => {
      const map = new Map<string, string>();
      for (const entry of Object.values(data as Record<string, { cik_str: number; ticker: string }>)) {
        map.set(entry.ticker.toUpperCase(), String(entry.cik_str).padStart(10, '0'));
      }
      return map;
    });
  }
  return tickerToCikPromise;
}

export interface FetchSymbolHistoryResult {
  filings: PitFundamentalsFiling[];
  skips: PitFundamentalsSkip[];
}

/** One companyfacts.json + submissions.json fetch pair for an already-resolved CIK. Never throws
 * — a network/parse failure becomes a counted skip, exactly like a missing concept. */
export async function fetchPitFundamentalsHistory(symbol: string, cik: string): Promise<FetchSymbolHistoryResult> {
  try {
    const [facts, submission] = await Promise.all([
      fetchJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, 30_000),
      fetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`, 30_000),
    ]);
    return selectAnnualFundamentalsHistory(symbol, facts, submission);
  } catch (err) {
    return {
      filings: [],
      skips: [{ symbol, reasonCode: 'fetch_failed', detail: err instanceof Error ? err.message : String(err) }],
    };
  }
}

export { SEC_HEADERS };
