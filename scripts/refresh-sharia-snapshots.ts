// Refreshes the bundled, dated Sharia-screening snapshots used by CompositeShariaScreener
// (src/quant/gates/etfHoldingsScreener.ts) from each source's OWN published data — never
// invents membership. Fully optional / online-only: the app works keyless with whatever is
// already bundled (possibly empty) in src/quant/gates/data/*.json.
//
//   npx tsx scripts/refresh-sharia-snapshots.ts
//
// Per-source behavior: each of the three fetches (SPUS holdings, HLAL holdings, Saudi Sharia
// list) is attempted independently with a short timeout. A successful fetch replaces that
// source's data + bumps its slice of asOf. A failed fetch/parse LEAVES the existing bundled
// data untouched and logs an honest failure — it never overwrites real (or empty) data with a
// guess, and never fabricates a list from memory.
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = join(__dirname, '..', 'src', 'quant', 'gates', 'data');
const ETF_HOLDINGS_PATH = join(DATA_DIR, 'etf-holdings.json');
const SAUDI_LIST_PATH = join(DATA_DIR, 'saudi-sharia-list.json');
const FETCH_TIMEOUT_MS = 8000;

interface EtfHoldingsSnapshot {
  asOf: string | null;
  sourceUrls?: Record<string, string>;
  funds: Record<string, string[]>;
  notes?: string;
}

interface SaudiShariaListSnapshot {
  asOf: string | null;
  publisher: string | null;
  symbols: string[];
  notes?: string;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 RushdSnapshotRefresh/1.0' } });
  } finally {
    clearTimeout(timer);
  }
}

/** Parses the Tidal-Financial-Group-style holdings CSV (StockTicker column) SPUS publishes. */
function parseTidalHoldingsCsv(csv: string): { tickers: string[]; asOf: string | null } {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return { tickers: [], asOf: null };
  const header = lines[0].split(',');
  const dateIdx = header.indexOf('Date');
  const tickerIdx = header.indexOf('StockTicker');
  if (tickerIdx === -1) return { tickers: [], asOf: null };

  const tickers = new Set<string>();
  let asOf: string | null = null;
  for (const line of lines.slice(1)) {
    const cols = line.split(',');
    const ticker = cols[tickerIdx]?.trim();
    // Real equity tickers only — drops cash lines, SEDOL placeholders, CVR line items, etc.
    if (ticker && /^[A-Z]{1,5}$/.test(ticker)) tickers.add(ticker);
    if (dateIdx !== -1 && !asOf && cols[dateIdx]) {
      const [mm, dd, yyyy] = cols[dateIdx].trim().split('/');
      if (mm && dd && yyyy) asOf = `${yyyy}-${mm}-${dd}`;
    }
  }
  return { tickers: Array.from(tickers).sort(), asOf };
}

async function refreshSpus(): Promise<{ tickers: string[]; asOf: string; url: string } | null> {
  const url = 'https://www.sp-funds.com/wp-content/uploads/data/TidalFG_Holdings_SPUS.csv';
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const { tickers, asOf } = parseTidalHoldingsCsv(csv);
    if (tickers.length === 0 || !asOf) throw new Error('parsed 0 tickers or missing date — refusing to overwrite');
    return { tickers, asOf, url };
  } catch (err) {
    console.warn(`[SPUS] fetch/parse failed, leaving bundled snapshot untouched: ${(err as Error).message}`);
    return null;
  }
}

async function refreshHlal(): Promise<{ tickers: string[]; asOf: string; url: string } | null> {
  // HLAL (Wahed FTSE USA Shariah ETF) has no confirmed free, programmatically-retrievable
  // holdings CSV at time of writing (wahedinvest.com returned 403 AccessDenied on every
  // attempted URL during initial seeding). Left as a stub for a future real endpoint — MUST
  // parse an actual published holdings file, never fabricate membership.
  const candidateUrls = [
    'https://www.wahedinvest.com/wp-content/uploads/data/TidalFG_Holdings_HLAL.csv',
  ];
  for (const url of candidateUrls) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const csv = await res.text();
      const { tickers, asOf } = parseTidalHoldingsCsv(csv);
      if (tickers.length === 0 || !asOf) throw new Error('parsed 0 tickers or missing date');
      return { tickers, asOf, url };
    } catch (err) {
      console.warn(`[HLAL] ${url} failed: ${(err as Error).message}`);
    }
  }
  console.warn('[HLAL] no working source found, leaving bundled snapshot untouched.');
  return null;
}

async function refreshSaudiList(): Promise<{ symbols: string[]; asOf: string; publisher: string } | null> {
  // No confirmed free, programmatically-retrievable Saudi Sharia-compliant list at time of
  // writing (Saudi Exchange + S&P index pages returned 403). Left as a stub — MUST parse an
  // actual published list, never transcribe one from memory.
  console.warn('[Saudi Sharia list] no working free source configured, leaving bundled snapshot untouched.');
  return null;
}

async function main() {
  const etfSnapshot: EtfHoldingsSnapshot = JSON.parse(readFileSync(ETF_HOLDINGS_PATH, 'utf8'));
  const saudiSnapshot: SaudiShariaListSnapshot = JSON.parse(readFileSync(SAUDI_LIST_PATH, 'utf8'));

  const [spus, hlal, saudi] = await Promise.all([refreshSpus(), refreshHlal(), refreshSaudiList()]);

  let etfChanged = false;
  if (spus) {
    console.log(`[SPUS] refreshed ${spus.tickers.length} tickers as of ${spus.asOf}`);
    etfSnapshot.funds.SPUS = spus.tickers;
    etfSnapshot.sourceUrls = { ...etfSnapshot.sourceUrls, SPUS: spus.url };
    etfSnapshot.asOf = spus.asOf;
    etfChanged = true;
  }
  if (hlal) {
    console.log(`[HLAL] refreshed ${hlal.tickers.length} tickers as of ${hlal.asOf}`);
    etfSnapshot.funds.HLAL = hlal.tickers;
    etfSnapshot.sourceUrls = { ...etfSnapshot.sourceUrls, HLAL: hlal.url };
    etfSnapshot.asOf = spus?.asOf ?? hlal.asOf; // most recent successful fetch wins the shared asOf
    etfChanged = true;
  }
  if (etfChanged) {
    writeFileSync(ETF_HOLDINGS_PATH, JSON.stringify(etfSnapshot, null, 2) + '\n');
    console.log(`Wrote ${ETF_HOLDINGS_PATH}`);
  } else {
    console.log('etf-holdings.json unchanged (no successful fetch).');
  }

  if (saudi) {
    console.log(`[Saudi list] refreshed ${saudi.symbols.length} symbols as of ${saudi.asOf} (${saudi.publisher})`);
    saudiSnapshot.symbols = saudi.symbols;
    saudiSnapshot.asOf = saudi.asOf;
    saudiSnapshot.publisher = saudi.publisher;
    writeFileSync(SAUDI_LIST_PATH, JSON.stringify(saudiSnapshot, null, 2) + '\n');
    console.log(`Wrote ${SAUDI_LIST_PATH}`);
  } else {
    console.log('saudi-sharia-list.json unchanged (no successful fetch).');
  }
}

main().catch((err) => {
  console.error('refresh-sharia-snapshots failed:', err);
  process.exit(1);
});
