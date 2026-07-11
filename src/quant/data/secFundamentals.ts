// src/quant/data/secFundamentals.ts — QDR-6 (G1 backfill): keyless, point-in-time-correct
// SEC-XBRL shares-outstanding lookup. Mirrors the pattern captured in
// scripts/capture-intraday-fixtures.ts (fetchHistoricalFundamentals), generalized to resolve the
// CIK dynamically from SEC's own ticker map instead of a hand-maintained list. Used by
// scripts/backfill-snapshots.ts to compute mcap = shares outstanding (latest filing with
// `filed` <= the trading day, PIT-correct) x prior real close. Never fabricates: returns null —
// which the caller must leave as a null `SymbolSnapshot.mcap` — when SEC has no CIK for the
// symbol or no eligible filing, rather than inventing a number.
const SEC_HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };

let tickerToCikPromise: Promise<Map<string, string>> | null = null;

interface SecFactPoint {
  val: number;
  filed: string; // YYYY-MM-DD, when the filing became public — the PIT gate
  end: string; // YYYY-MM-DD, the fiscal period end the value describes
}

/** SEC's official ticker->CIK map (company_tickers.json), fetched once and cached. Keyless. */
async function loadTickerToCik(): Promise<Map<string, string>> {
  if (!tickerToCikPromise) {
    tickerToCikPromise = fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: SEC_HEADERS,
      signal: AbortSignal.timeout(20_000),
    }).then(async (res) => {
      if (!res.ok) throw new Error(`SEC company_tickers.json failed: HTTP ${res.status}`);
      const data = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
      const map = new Map<string, string>();
      for (const entry of Object.values(data)) {
        map.set(entry.ticker.toUpperCase(), String(entry.cik_str).padStart(10, '0'));
      }
      return map;
    });
  }
  return tickerToCikPromise;
}

const companyFactsCache = new Map<string, Promise<any>>();

async function fetchCompanyFactsOnce(cik: string, timeoutMs: number): Promise<any> {
  const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
    headers: SEC_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`SEC company facts failed for CIK${cik}: HTTP ${res.status}`);
  return res.json();
}

/**
 * One companyfacts.json fetch per CIK, cached for the process lifetime — every historical day
 * for a symbol reuses it. Retries a few times (SEC occasionally times out under automated
 * traffic even though the endpoint is healthy); only a *successful* fetch is cached — a
 * transient failure is never memoized as a permanent "no data", so a later call (e.g. the next
 * historical day in the same backfill run) gets a fresh attempt instead of a fast, poisoned fail.
 */
async function loadCompanyFacts(cik: string): Promise<any> {
  const cached = companyFactsCache.get(cik);
  if (cached) return cached;

  const request = (async () => {
    let lastErr: unknown;
    for (const timeoutMs of [20_000, 30_000, 45_000]) {
      try {
        return await fetchCompanyFactsOnce(cik, timeoutMs);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  })();

  companyFactsCache.set(cik, request);
  request.catch(() => companyFactsCache.delete(cik)); // never poison the cache with a rejection
  return request;
}

/**
 * Point-in-time shares outstanding for `symbol` as of `dateKey` (YYYY-MM-DD, Eastern trading
 * date): the latest filing with `filed` <= `dateKey`, most-recent fiscal `end` breaking ties.
 * Checks both `dei.EntityCommonStockSharesOutstanding` and `us-gaap.CommonStockSharesOutstanding`
 * (coverage varies by filer). Returns null — never fabricated — when SEC has no CIK or no
 * eligible filing.
 */
export async function lookupSecSharesOutstanding(
  symbol: string,
  dateKey: string,
): Promise<{ shares: number; filedDate: string } | null> {
  try {
    const tickerMap = await loadTickerToCik();
    const cik = tickerMap.get(symbol.toUpperCase());
    if (!cik) return null;
    const facts = await loadCompanyFacts(cik);
    const lists: SecFactPoint[][] = [
      facts.facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares,
      facts.facts?.['us-gaap']?.CommonStockSharesOutstanding?.units?.shares,
    ].filter(Boolean);

    let best: SecFactPoint | null = null;
    for (const list of lists) {
      for (const fact of list) {
        if (fact.val <= 0 || fact.filed > dateKey) continue;
        if (!best || fact.filed > best.filed || (fact.filed === best.filed && fact.end > best.end)) {
          best = fact;
        }
      }
    }
    return best ? { shares: best.val, filedDate: best.filed } : null;
  } catch (err) {
    console.warn(`SEC shares-outstanding lookup failed for ${symbol}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

export interface SecMarketCap {
  mcap: number;
  sharesOutstanding: number;
  filedDate: string;
}

/** mcap = shares outstanding (PIT filing <= dateKey) x priorClose. Null propagates honestly. */
export async function lookupSecMcap(
  symbol: string,
  dateKey: string,
  priorClose: number | null,
): Promise<SecMarketCap | null> {
  if (priorClose == null) return null;
  const shares = await lookupSecSharesOutstanding(symbol, dateKey);
  if (!shares) return null;
  return { mcap: shares.shares * priorClose, sharesOutstanding: shares.shares, filedDate: shares.filedDate };
}
