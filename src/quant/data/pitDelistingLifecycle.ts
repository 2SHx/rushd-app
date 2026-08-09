// src/quant/data/pitDelistingLifecycle.ts — point-in-time delisting lifecycle source from SEC
// Form 25 / Form 25-NSE filings (17 CFR 240.12d2-2), producing the LifecycleState /
// lifecycleEffectiveAt shapes `src/quant/universe/pointInTimeMembership.ts` requires. Pure: no
// network, no Date.now(), no randomness, no DB — resolves against already-fetched SEC EDGAR
// submissions JSON and Form 25 document text. See `pitDelistingFetch.ts` for the network half
// (mirrors the pitFundamentalsBackfill.ts / pitFundamentalsFetch.ts pure-core / network-wrapper
// split).
//
// CRITICAL FINDING — a bare "Form 25 exists under this CIK" signal is WRONG, and would have
// produced a majority-false-positive delisting list. Live-data proof (all fetched from real SEC
// EDGAR while building this module, still fetchable at these accessions):
//   - Apple Inc. (CIK 0000320193), accession 0001354457-25-001138, filed 2025-11-14, form 25-NSE:
//     `descriptionClassSecurity` = "0.000% Notes due 2025" — a BOND, not AAPL common stock. AAPL
//     is obviously not delisted.
//   - TE Connectivity (CIK 0001385157), 3 filings 2023-2025, form 25-NSE: `exchange.entityName` =
//     "NEW YORK STOCK EXCHANGE LLC" (not Nasdaq) and `descriptionClassSecurity` values like
//     "Guarantor of 0.000% Senior Notes due 2025" — debt/guarantor removals on a different
//     exchange entirely.
//   - W.W. Grainger (CIK 0000277135), accession 0000277135-14-000035, filed 2014-12-22, form 25:
//     legacy HTML document reads "THE CHICAGO STOCK EXCHANGE, INC." — GWW voluntarily delisted its
//     COMMON STOCK from the (regional, secondary) Chicago Stock Exchange while its NYSE primary
//     listing continued uninterrupted.
//   A first backfill pass that trusted "any Form 25/25-NSE under this CIK" as delisting evidence
//   resolved 98 of 216 CIK-matched symbols DELISTED as of today, including AAPL, MSFT, JNJ, PG —
//   an unmistakable, measured false-positive rate, not a hypothetical one.
// FIX: a filing only counts as delisting evidence when its OWN document confirms BOTH (a) the
// removing exchange is Nasdaq and (b) the security class is common stock — see
// `isConfirmedNasdaqCommonStockDelisting` below. Modern Form 25/25-NSE (roughly 2019+, confirmed
// against live filings back to at least 2019-03-14 for AAPL) is filed as structured EDGAR XML
// (`<notificationOfRemoval>` root) with exactly these two fields machine-readable. Older filings
// are plain HTML/text with no structured backing document at all (confirmed: GWW's 2014 filing's
// ONLY primary document is a bare .htm, no sibling primary_doc.xml) — this module does NOT attempt
// fragile free-text HTML parsing across decades of template drift; a legacy filing that cannot be
// structurally classified makes that SYMBOL's coverage incomplete (fail-closed to UNKNOWN, per
// acceptance #3), rather than either trusting it blindly or silently discarding it.
//
// RESIDUAL AMBIGUITY (measured, not fixed — read before treating a DELISTED verdict as "this
// company left the market"): even after the exchange+class gate, Form 25's `ruleProvision`
// checkbox 17 CFR 240.12d2-2(a)(3) — "securities have come to evidence, by operation of law or
// otherwise, OTHER securities in substitution therefor" — covers BOTH a genuine
// acquisition/merger removal (the issuer ceases separate existence) AND a same-company CUSIP
// substitution (a stock split re-certificated under a new CUSIP, or a legal NAME CHANGE) where
// trading is continuous and uninterrupted. Live-data proof: Ulta Beauty, Inc. (formerly "Ulta
// Salon, Cosmetics & Fragrance, Inc.") filed a Nasdaq Common Stock Form 25-NSE, ruleProvision
// (a)(3), 2017-01-30, accession 0001354457-17-000026 — coinciding with its 2017 corporate rename;
// ULTA trades on Nasdaq without interruption today. Monster Beverage Corp similarly filed a
// Nasdaq Common Stock Form 25-NSE, ruleProvision (a)(3), 2015-06-12, accession
// 0001354457-15-000105 — consistent with a stock-split CUSIP change; MNST trades on Nasdaq without
// interruption today. Form 25's structured XML has no field distinguishing these two cases from a
// genuine M&A-driven exit; disambiguating would require cross-referencing the issuer's Form 8-A
// listing-application history or entity-name change history, which is out of scope for this
// module (`ruleProvision` is captured on `Form25DocumentEvidence` for a future dispatch to use).
// CONSEQUENCE: this module's DELISTED verdict should be read precisely as "Nasdaq confirmed a
// common-stock registration was struck under this exact issuer CIK", which is always literally
// true, but is NOT always equivalent to "this operating company stopped trading on Nasdaq that
// day" — any wiring dispatch building `lifecycleCoverage.delisted: true` on top of this module
// should treat a DELISTED verdict as a strong candidate requiring confirmation for symbols where a
// contemporaneous entity-name change is otherwise known, not an unconditionally final answer.
//
// THE TIMESTAMP THAT MATTERS — filing date vs. effective date:
//   `filingDate` = when the Form 25 became public on EDGAR (the PIT availability gate: a decision
//   at D can only see filings with filingDate <= D — see acceptance test below).
//   `lifecycleEffectiveAt` = when the removal from listing actually took effect. The structured
//   XML document has no separate effective-date field either (only a `signatureData.signatureDate`
//   matching the filing date). The effective date is instead FIXED BY RULE: 17 CFR
//   240.12d2-2(d)(1) — "An application on Form 25 to strike a class of securities from listing on
//   a national securities exchange will be effective 10 days after Form 25 is filed with the
//   Commission" (confirmed against the live e-CFR text of the rule). This governs BOTH
//   exchange-filed removals (form "25-NSE") and issuer-filed voluntary withdrawals (form "25") —
//   same 10-calendar-day offset. So `lifecycleEffectiveAt = filingDate + 10 calendar days`, NEVER
//   `filingDate` itself: a decision date between the two must see the name as still ACTIVE
//   (announced, not yet removed), not DELISTED.
//
// COVERAGE FINDING (acceptance #4 — read before any future dispatch wires `lifecycleCoverage`):
//   Even after the exchange+class fix above, Form 25 / 25-NSE proves REMOVAL FROM LISTING/
//   REGISTRATION only, evidenced by an actual filed document. It does NOT capture:
//     - Exchange trading SUSPENSIONS that do not end in removal (SEC 12(k) trading suspensions or
//       an exchange's own temporary halt). No SEC EDGAR form exists for these at all — the
//       authoritative source is SEC's own published "Trading Suspensions" list
//       (sec.gov/litigation/suspensions), a press-release page, not a structured EDGAR filing
//       type, and out of scope for this module.
//     - Bankruptcies or mergers that end a listing WITHOUT (or before) a qualifying Form 25 being
//       filed. In practice most eventually get one, but this module only evidences the filing
//       itself, never infers delisting independently from a bankruptcy/merger event.
//     - Pre-~2019 (legacy, unstructured) Nasdaq common-stock delistings, which this module
//       deliberately refuses to auto-classify (see FIX above) rather than risk either a false
//       positive or a silently-dropped real one — these resolve the SYMBOL to UNKNOWN, not ACTIVE.
//   CONCLUSION: this source can honestly support `lifecycleCoverage.delisted: true` ONLY for the
//   modern-XML-covered era, and only when every candidate Form 25/25-NSE filing for a symbol was
//   fetched and structurally classified (fail-closed to UNKNOWN otherwise). It CANNOT honestly
//   support `lifecycleCoverage.suspended: true` — there is no suspension evidence anywhere in this
//   module. `DelistingLifecycleState` deliberately excludes `'SUSPENDED'` at the type level so
//   this module can never emit a state it has no evidence for.

export type Form25FormType = '25' | '25-NSE';

/** One SEC Form 25 / 25-NSE filing candidate, as extracted from EDGAR submissions JSON metadata
 * (before its document has been fetched/classified). */
export interface Form25FilingCandidate {
  readonly symbol: string;
  readonly cik: string;
  /** '25-NSE' = filed by the exchange; '25' = filed by the issuer. Both are subject to the same
   * (d)(1) 10-day effective rule for listing removal — neither alone tells you the exchange or
   * security class, which is why `document` classification below is required. */
  readonly formType: Form25FormType;
  /** ISO YYYY-MM-DD — EDGAR accession filing date: the date this filing became public. */
  readonly filingDate: string;
  readonly accessionNumber: string;
  /** SEC's own `primaryDocument` path for this accession, e.g. "xslF25X02/primary_doc.xml"
   * (modern, structured) or "form252014-10x15.htm" (legacy, unstructured) — used by
   * `pitDelistingFetch.ts` to build the actual document URL to fetch. */
  readonly primaryDocument: string;
}

/** What this filing's own document actually says, once fetched and parsed. */
export interface Form25DocumentEvidence {
  readonly exchangeEntityName: string | null;
  readonly securityClassDescription: string | null;
  /** The checked 17 CFR 240.12d2-2 rule paragraph, e.g. "17 CFR 240.12d2-2(a)(3)" — captured for
   * transparency/future refinement (see RESIDUAL AMBIGUITY note in the file header: paragraph
   * (a)(3) covers both genuine M&A-driven removals AND same-company CUSIP/name-change
   * substitutions, and this module does not currently disambiguate between them). Not used to gate
   * `isConfirmedNasdaqCommonStockDelisting` below. */
  readonly ruleProvision: string | null;
  /** 'structured-xml' = the modern `<notificationOfRemoval>` EDGAR XML form, both fields reliably
   * machine-readable. 'legacy-unparsed' = an older filing with no structured document at all; this
   * module never attempts to guess its content from free text. */
  readonly format: 'structured-xml' | 'legacy-unparsed';
}

export interface Form25Filing extends Form25FilingCandidate {
  readonly document: Form25DocumentEvidence;
}

/** The exchange+security-class evidence gate. Only a filing that structurally confirms BOTH "the
 * removing exchange is Nasdaq" AND "the class of securities is common stock" counts as delisting
 * evidence — see file header for the measured false-positive rate this exists to prevent. */
export function isConfirmedNasdaqCommonStockDelisting(doc: Form25DocumentEvidence): boolean {
  if (doc.format !== 'structured-xml') return false;
  const exchangeOk = !!doc.exchangeEntityName && /nasdaq/i.test(doc.exchangeEntityName);
  // Anchored to the START of the (trimmed) description, not a bare substring search: a real
  // observed EDGAR value — Expedia's warrant removal, "Warrant to purchase one half of one share
  // of Expedia common stock" — CONTAINS "common stock" without itself BEING a common-stock removal.
  // "Common Stock of Pentair, Inc." style values still match correctly (they start with it).
  const classOk = !!doc.securityClassDescription && /^common stock\b/i.test(doc.securityClassDescription);
  return exchangeOk && classOk;
}

/** Parses ONE Form 25 primary document's raw text. Recognizes the modern structured EDGAR XML
 * (`<notificationOfRemoval>` root, containing `<exchange><entityName>` and
 * `<descriptionClassSecurity>`) and returns `format: 'legacy-unparsed'` for anything else —
 * deliberately never attempts free-text HTML parsing (see file header FIX note). */
export function parseForm25Document(rawText: string): Form25DocumentEvidence {
  const rootMatch = /<notificationOfRemoval[\s\S]*?<\/notificationOfRemoval>/i.exec(rawText);
  if (!rootMatch) {
    return { exchangeEntityName: null, securityClassDescription: null, ruleProvision: null, format: 'legacy-unparsed' };
  }
  const body = rootMatch[0];
  const exchangeBlock = /<exchange>([\s\S]*?)<\/exchange>/i.exec(body)?.[1] ?? '';
  const exchangeEntityName = /<entityName>([\s\S]*?)<\/entityName>/i.exec(exchangeBlock)?.[1]?.trim() || null;
  const securityClassDescription = /<descriptionClassSecurity>([\s\S]*?)<\/descriptionClassSecurity>/i.exec(body)?.[1]?.trim() || null;
  const ruleProvision = /<ruleProvision>([\s\S]*?)<\/ruleProvision>/i.exec(body)?.[1]?.trim() || null;
  return { exchangeEntityName, securityClassDescription, ruleProvision, format: 'structured-xml' };
}

/** Honesty declaration for one symbol's filing-history fetch: "complete" must mean the ENTIRE SEC
 * filing history for the CIK (main submissions page + every paginated `files[]` page) was
 * successfully examined for a Form 25/25-NSE, AND every candidate filing found was fetched and
 * structurally classified (no legacy-unparsed document left unresolved). Fail-closed: any page
 * fetch failure, any unclassifiable document, or an unresolved CIK makes `complete` false. */
export interface SymbolLifecycleCoverage {
  readonly symbol: string;
  readonly cik: string | null;
  readonly complete: boolean;
  /** Earliest/latest filingDate observed across ALL examined pages (any form type) — the honest
   * bound of what "complete" actually verified. Null when no filings exist or CIK is unresolved. */
  readonly observedFrom: string | null;
  readonly observedTo: string | null;
  /** Present only when `complete` is false; never fabricated, always a concrete reason. */
  readonly incompleteReason?: string;
}

const MIN_EFFECTIVE_LAG_DAYS = 10; // 17 CFR 240.12d2-2(d)(1) — verified against live e-CFR text

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface Form25EffectiveDate {
  readonly filingDate: string;
  readonly effectiveAt: string;
  readonly rule: string;
}

/** Derives the EFFECTIVE date of a Form 25 delisting from its filing date — never the filing date
 * itself. See file header for the rule citation and live-filing verification. */
export function deriveForm25EffectiveDate(filingDate: string): Form25EffectiveDate {
  return {
    filingDate,
    effectiveAt: addDaysIso(filingDate, MIN_EFFECTIVE_LAG_DAYS),
    rule: '17 CFR 240.12d2-2(d)(1): effective 10 days after Form 25 is filed with the Commission',
  };
}

/** Deliberately excludes 'SUSPENDED' — see COVERAGE FINDING above. UNKNOWN is the fail-closed
 * default; ACTIVE/DELISTED are only ever emitted with concrete, exchange+class-confirmed evidence. */
export type DelistingLifecycleState = 'ACTIVE' | 'DELISTED' | 'UNKNOWN';

export type DelistingReasonCode =
  | 'no_cik'
  | 'coverage_incomplete'
  | 'no_form25_found_active'
  | 'delisting_filed_not_yet_effective'
  | 'delisted_effective';

export interface ResolvedDelistingLifecycle {
  readonly symbol: string;
  readonly lifecycle: DelistingLifecycleState;
  readonly lifecycleEffectiveAt: string | null;
  readonly evidence: Form25Filing | null;
  readonly reasonCode: DelistingReasonCode;
}

/**
 * Resolves one symbol's delisting lifecycle state AT decision date `asOfIso`, using only:
 *  (a) Form 25/25-NSE filings whose `filingDate` is <= asOfIso AND whose OWN document confirms a
 *      Nasdaq common-stock removal — a filing the market could not yet have seen, or one that
 *      documents a bond/other-exchange/other-class removal, never affects the verdict
 *      (acceptance #1, and the false-positive fix above);
 *  (b) whether `coverage.complete` can honestly vouch for "no qualifying Form 25 exists" — fail-
 *      closed to UNKNOWN otherwise, never a guessed ACTIVE (acceptance #3).
 * A qualifying filing that is known but not yet EFFECTIVE at `asOfIso` (announced, 10-day clock
 * still running) resolves ACTIVE, not DELISTED (acceptance #2: the effective-date distinction
 * doing real work, not the filing date).
 */
export function resolveDelistingLifecycle(
  symbol: string,
  filings: readonly Form25Filing[],
  coverage: SymbolLifecycleCoverage,
  asOfIso: string,
): ResolvedDelistingLifecycle {
  if (!coverage.cik) {
    return { symbol, lifecycle: 'UNKNOWN', lifecycleEffectiveAt: null, evidence: null, reasonCode: 'no_cik' };
  }
  if (!coverage.complete) {
    return { symbol, lifecycle: 'UNKNOWN', lifecycleEffectiveAt: null, evidence: null, reasonCode: 'coverage_incomplete' };
  }

  const knownAtDecision = filings
    .filter((f) => f.filingDate <= asOfIso && isConfirmedNasdaqCommonStockDelisting(f.document))
    .slice()
    .sort((a, b) => (a.filingDate < b.filingDate ? 1 : -1)); // most recent filingDate first

  for (const filing of knownAtDecision) {
    const { effectiveAt } = deriveForm25EffectiveDate(filing.filingDate);
    if (effectiveAt <= asOfIso) {
      return { symbol, lifecycle: 'DELISTED', lifecycleEffectiveAt: effectiveAt, evidence: filing, reasonCode: 'delisted_effective' };
    }
  }

  return {
    symbol,
    lifecycle: 'ACTIVE',
    lifecycleEffectiveAt: null,
    evidence: null,
    reasonCode: knownAtDecision.length ? 'delisting_filed_not_yet_effective' : 'no_form25_found_active',
  };
}

// --- Pure extraction from raw SEC EDGAR submissions JSON -------------------------------------

interface RawFormPage {
  form?: unknown;
  filingDate?: unknown;
  accessionNumber?: unknown;
  primaryDocument?: unknown;
}

/** Normalizes ONE raw SEC submissions JSON page to its columnar form/filingDate/accessionNumber/
 * primaryDocument arrays. Accepts BOTH shapes SEC actually serves: the main
 * `submissions/CIK##########.json` document (arrays nested under `filings.recent`) and an older
 * paginated `submissions/CIK##########-submissions-XXX.json` file (arrays at the top level) —
 * confirmed against live EDGAR data for both formats. Unrecognized/malformed input yields empty
 * arrays, never a thrown error. */
export function extractFormPage(
  raw: unknown,
): { form: string[]; filingDate: string[]; accessionNumber: string[]; primaryDocument: string[] } {
  const empty = { form: [] as string[], filingDate: [] as string[], accessionNumber: [] as string[], primaryDocument: [] as string[] };
  if (!raw || typeof raw !== 'object') return empty;
  const withFilings = raw as { filings?: { recent?: RawFormPage } };
  const page: RawFormPage = withFilings.filings?.recent ?? (raw as RawFormPage);
  if (!Array.isArray(page.form) || !Array.isArray(page.filingDate) || !Array.isArray(page.accessionNumber)) {
    return empty;
  }
  return {
    form: page.form as string[],
    filingDate: page.filingDate as string[],
    accessionNumber: page.accessionNumber as string[],
    primaryDocument: Array.isArray(page.primaryDocument) ? (page.primaryDocument as string[]) : [],
  };
}

function isValidDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Pure core, stage A: builds a symbol's Form 25/25-NSE filing CANDIDATE set (metadata only — no
 * document classification yet) plus a page-fetch coverage declaration, from one or more
 * already-fetched raw SEC submissions JSON pages (the main document plus every paginated
 * `files[]` entry, if any — see `pitDelistingFetch.ts`). `complete` here reflects only whether
 * every expected PAGE was fetched; `applyDocumentClassification` (stage B, below) folds in
 * whether every CANDIDATE's document was itself fetched and structurally classified.
 */
export function selectForm25FilingHistory(
  symbol: string,
  cik: string | null,
  pages: readonly unknown[],
  expectedPageCount: number,
): { candidates: Form25FilingCandidate[]; coverage: SymbolLifecycleCoverage } {
  if (!cik) {
    return {
      candidates: [],
      coverage: { symbol, cik: null, complete: false, observedFrom: null, observedTo: null, incompleteReason: 'no_cik' },
    };
  }

  if (pages.length < expectedPageCount) {
    return {
      candidates: [],
      coverage: {
        symbol,
        cik,
        complete: false,
        observedFrom: null,
        observedTo: null,
        incompleteReason: `fetched_${pages.length}_of_${expectedPageCount}_pages`,
      },
    };
  }

  const candidates: Form25FilingCandidate[] = [];
  let observedFrom: string | null = null;
  let observedTo: string | null = null;
  const seenAccessions = new Set<string>();

  for (const raw of pages) {
    const { form, filingDate, accessionNumber, primaryDocument } = extractFormPage(raw);
    const n = Math.min(form.length, filingDate.length, accessionNumber.length);
    for (let i = 0; i < n; i += 1) {
      const date = filingDate[i];
      if (!isValidDateKey(date)) continue;
      if (observedFrom === null || date < observedFrom) observedFrom = date;
      if (observedTo === null || date > observedTo) observedTo = date;

      const formType = form[i];
      if (formType !== '25' && formType !== '25-NSE') continue;
      const accession = accessionNumber[i];
      if (typeof accession !== 'string' || seenAccessions.has(accession)) continue;
      seenAccessions.add(accession);
      candidates.push({
        symbol,
        cik,
        formType,
        filingDate: date,
        accessionNumber: accession,
        primaryDocument: primaryDocument[i] ?? '',
      });
    }
  }

  return {
    candidates: candidates.sort((a, b) => (a.filingDate < b.filingDate ? -1 : 1)),
    coverage: { symbol, cik, complete: true, observedFrom, observedTo },
  };
}

/**
 * Pure core, stage B: attaches document classification to each candidate and folds "was every
 * candidate's document actually fetched and structurally classifiable" into the final coverage
 * declaration. `documentTexts` maps accessionNumber -> raw fetched document text; a candidate
 * missing from the map (its document fetch failed) is treated exactly like an unparseable legacy
 * document — fail-closed, never silently dropped.
 */
export function applyDocumentClassification(
  candidates: readonly Form25FilingCandidate[],
  pageCoverage: SymbolLifecycleCoverage,
  documentTexts: ReadonlyMap<string, string>,
): { filings: Form25Filing[]; coverage: SymbolLifecycleCoverage } {
  if (!pageCoverage.complete) return { filings: [], coverage: pageCoverage };

  const filings: Form25Filing[] = candidates.map((candidate) => {
    const text = documentTexts.get(candidate.accessionNumber);
    const document = text === undefined
      ? { exchangeEntityName: null, securityClassDescription: null, ruleProvision: null, format: 'legacy-unparsed' as const }
      : parseForm25Document(text);
    return { ...candidate, document };
  });

  const unresolved = filings.filter((f) => f.document.format === 'legacy-unparsed');
  if (unresolved.length > 0) {
    return {
      filings,
      coverage: {
        ...pageCoverage,
        complete: false,
        incompleteReason: `unclassified_form25_documents:${unresolved.map((f) => f.accessionNumber).join(',')}`,
      },
    };
  }

  return { filings, coverage: pageCoverage };
}
