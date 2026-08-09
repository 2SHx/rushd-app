// src/quant/data/pitDelistingFetch.ts — the ONLY network-touching half of the Form 25 delisting
// lifecycle backfill. Deliberately thin: resolves a symbol's CIK (reusing `loadTickerToCik` from
// pitFundamentalsFetch.ts rather than re-deriving the ticker->CIK map), fetches the SEC submissions
// JSON for that CIK PLUS every older paginated `files[]` page (stage A — so "complete" page
// coverage is actually true, not just true for the most recent page), then fetches EACH Form
// 25/25-NSE candidate's own primary document (stage B — the exchange+security-class evidence a
// bare form-type/date signal cannot provide; see pitDelistingLifecycle.ts's file-header FINDING),
// then hands off to the pure `selectForm25FilingHistory` / `applyDocumentClassification` — never
// re-implements that logic here. Mirrors the SEC_HEADERS/fetchJson pattern already established in
// tier2XbrlFetch.ts (reused, not duplicated). Not imported by any test — see
// pitDelistingLifecycle.test.ts for the offline-testable core this wraps.
import { SEC_HEADERS, fetchJson } from '../universe/tier2XbrlFetch';
import { loadTickerToCik } from './pitFundamentalsFetch';
import {
  applyDocumentClassification,
  selectForm25FilingHistory,
  type Form25Filing,
  type SymbolLifecycleCoverage,
} from './pitDelistingLifecycle';

export interface FetchForm25HistoryResult {
  filings: Form25Filing[];
  coverage: SymbolLifecycleCoverage;
}

/** Fetches one Form 25 candidate's raw primary-document text. Never throws — `undefined` on any
 * failure, which `applyDocumentClassification` then correctly treats as unresolved (fail-closed),
 * exactly like an unparseable legacy document. The modern structured XML lives at
 * `{accessionFolder}/primary_doc.xml` (NOT the `xslF25X02/primary_doc.xml` path from submissions
 * JSON, which serves an XSLT-rendered HTML view of the same data, not the raw XML) — confirmed
 * against a live filing (Adverum Biotechnologies, accession 0001354457-25-001236). */
async function fetchForm25DocumentText(cik: string, accessionNumber: string, primaryDocument: string): Promise<string | undefined> {
  const cikNum = String(Number(cik));
  const accessionNoDashes = accessionNumber.replace(/-/g, '');
  const docPath = primaryDocument.startsWith('xslF25X02/') ? 'primary_doc.xml' : primaryDocument;
  if (!docPath) return undefined;
  try {
    const res = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikNum}/${accessionNoDashes}/${docPath}`, {
      headers: SEC_HEADERS,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  }
}

/** One symbol's full Form 25/25-NSE filing history, with every candidate's document fetched and
 * classified: main submissions page + every paginated `files[]` entry (stage A), then one document
 * fetch per candidate filing found (stage B). Never throws — any fetch failure (main, a page, or a
 * document) is reflected honestly in `coverage.complete = false`, never silently dropped. */
export async function fetchForm25History(symbol: string, cik: string): Promise<FetchForm25HistoryResult> {
  let main: any;
  try {
    main = await fetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`, 30_000);
  } catch (err) {
    return {
      filings: [],
      coverage: {
        symbol,
        cik,
        complete: false,
        observedFrom: null,
        observedTo: null,
        incompleteReason: `main_fetch_failed: ${err instanceof Error ? err.message : String(err)}`,
      },
    };
  }

  const filePages: Array<{ name: string }> = Array.isArray(main?.filings?.files) ? main.filings.files : [];
  const expectedPageCount = 1 + filePages.length;
  const pages: unknown[] = [main];

  for (const file of filePages) {
    try {
      const page = await fetchJson(`https://data.sec.gov/submissions/${file.name}`, 30_000);
      pages.push(page);
    } catch {
      // Deliberately do not push a page for a failed fetch — selectForm25FilingHistory's
      // pages.length < expectedPageCount check turns this into an honest `complete: false`.
    }
  }

  const { candidates, coverage: pageCoverage } = selectForm25FilingHistory(symbol, cik, pages, expectedPageCount);
  if (!pageCoverage.complete || candidates.length === 0) {
    return { filings: [], coverage: pageCoverage };
  }

  const documentTexts = new Map<string, string>();
  for (const candidate of candidates) {
    const text = await fetchForm25DocumentText(candidate.cik, candidate.accessionNumber, candidate.primaryDocument);
    if (text !== undefined) documentTexts.set(candidate.accessionNumber, text);
  }

  return applyDocumentClassification(candidates, pageCoverage, documentTexts);
}

export { loadTickerToCik, SEC_HEADERS };
