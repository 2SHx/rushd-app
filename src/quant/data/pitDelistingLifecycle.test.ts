// Offline, keyless, zero-network tests for src/quant/data/pitDelistingLifecycle.ts. Fixtures below
// are REAL captured SEC EDGAR content (fetched live while building this module, still resolvable
// at these accessions) plus hand-built columnar submissions JSON structurally faithful to both
// real shapes (main `submissions/CIK##########.json`, arrays under `filings.recent`; older
// paginated `submissions/CIK##########-submissions-XXX.json`, arrays at the top level).
import { describe, expect, it } from 'vitest';
import {
  applyDocumentClassification,
  deriveForm25EffectiveDate,
  extractFormPage,
  isConfirmedNasdaqCommonStockDelisting,
  parseForm25Document,
  resolveDelistingLifecycle,
  selectForm25FilingHistory,
  type Form25Filing,
} from './pitDelistingLifecycle';

// Real live document, Adverum Biotechnologies, CIK 0001501756, accession 0001354457-25-001236,
// filed 2025-12-09 (fetched from sec.gov/Archives/edgar/data/1501756/000135445725001236/primary_doc.xml).
const ADVERUM_NASDAQ_COMMON_STOCK_XML = `<?xml version="1.0"?>
<notificationOfRemoval>
    <schemaVersion>X0203</schemaVersion>
    <exchange>
        <cik>0001354457</cik>
        <entityName>Nasdaq Stock Market LLC</entityName>
    </exchange>
    <issuer>
        <cik>0001501756</cik>
        <entityName>Adverum Biotechnologies, Inc.</entityName>
        <fileNumber>001-36579</fileNumber>
    </issuer>
    <descriptionClassSecurity>Common Stock</descriptionClassSecurity>
    <ruleProvision>17 CFR 240.12d2-2(a)(3)</ruleProvision>
    <signatureData>
        <signatureName>Tara Petta</signatureName>
        <signatureTitle>Director</signatureTitle>
        <signatureDate>2025-12-09</signatureDate>
    </signatureData>
</notificationOfRemoval>`;

// Real live document, Apple Inc., CIK 0000320193, accession 0001354457-25-001138, filed
// 2025-11-14 — a BOND delisting, not AAPL common stock. Proves the exchange+class gate matters.
const AAPL_NASDAQ_BOND_XML = `<?xml version="1.0"?>
<notificationOfRemoval>
    <schemaVersion>X0203</schemaVersion>
    <exchange>
        <cik>0001354457</cik>
        <entityName>Nasdaq Stock Market LLC</entityName>
    </exchange>
    <issuer>
        <cik>0000320193</cik>
        <entityName>Apple Inc.</entityName>
        <fileNumber>000-10030</fileNumber>
    </issuer>
    <descriptionClassSecurity>0.000% Notes due 2025</descriptionClassSecurity>
    <ruleProvision>17 CFR 240.12d2-2(a)(2)</ruleProvision>
    <signatureData>
        <signatureName>Tara Petta</signatureName>
        <signatureTitle>Director</signatureTitle>
        <signatureDate>2025-11-14</signatureDate>
    </signatureData>
</notificationOfRemoval>`;

// Real live document, TE Connectivity plc, CIK 0001385157, accession 0000876661-24-000890, filed
// 2024-09-30 — NYSE (not Nasdaq) "Registered Shares" removal tied to an entity restructuring.
const TEL_NYSE_SHARES_XML = `<?xml version="1.0"?>
<notificationOfRemoval>
    <schemaVersion>X0203</schemaVersion>
    <exchange>
        <cik>0000876661</cik>
        <entityName>NEW YORK STOCK EXCHANGE LLC</entityName>
    </exchange>
    <issuer>
        <cik>0001385157</cik>
        <entityName>TE Connectivity plc</entityName>
        <fileNumber>001-33260</fileNumber>
    </issuer>
    <descriptionClassSecurity>Registered Shares</descriptionClassSecurity>
    <ruleProvision>17 CFR 240.12d2-2(a)(3)</ruleProvision>
    <signatureData>
        <signatureName>Emily Fuhrman</signatureName>
        <signatureTitle>Analyst, Regulation</signatureTitle>
        <signatureDate>2024-09-30</signatureDate>
    </signatureData>
</notificationOfRemoval>`;

// Real live document, Expedia, Inc., CIK 0001324424, accession 0001354457-09-000105 (illustrative
// accession number), filed 2009-02-04 — Nasdaq, but the description CONTAINS the substring
// "common stock" without itself being a common-stock removal: it is a WARRANT. Proves the
// anchored-prefix regex fix (a naive substring match would wrongly classify this as delisting
// evidence for EXPE common stock).
const EXPE_NASDAQ_WARRANT_XML = `<?xml version="1.0"?>
<notificationOfRemoval>
    <schemaVersion>X0203</schemaVersion>
    <exchange>
        <cik>0001354457</cik>
        <entityName>NASDAQ Stock Market LLC</entityName>
    </exchange>
    <issuer>
        <cik>0001324424</cik>
        <entityName>Expedia, Inc.</entityName>
        <fileNumber>000-51447</fileNumber>
    </issuer>
    <descriptionClassSecurity>Warrant to purchase one half of one share of Expedia common stock</descriptionClassSecurity>
    <ruleProvision>17 CFR 240.12d2-2(a)(1)</ruleProvision>
    <signatureData>
        <signatureName>Tara Petta</signatureName>
        <signatureTitle>Director</signatureTitle>
        <signatureDate>2009-02-04</signatureDate>
    </signatureData>
</notificationOfRemoval>`;

// Real live document (HTML, truncated to the load-bearing fragment), W.W. Grainger, CIK
// 0000277135, accession 0000277135-14-000035, filed 2014-12-22 — legacy pre-XML Form 25 with NO
// structured backing document; only free text says "THE CHICAGO STOCK EXCHANGE, INC." This module
// deliberately never parses this — see file header FIX note.
const GWW_LEGACY_HTML = `<html><body>FORM 25 NOTIFICATION OF REMOVAL FROM LISTING AND/OR REGISTRATION UNDER SECTION 12(b)
Commission File Number 001-5684 W.W. GRAINGER, INC. THE CHICAGO STOCK EXCHANGE, INC.
(Exact name of registrant as specified in its charter, and name of Exchange where security is listed and/or registered)
Common Stock, par value $0.50 per share (Description of class of securities)</body></html>`;

function mainSubmissionsPage(rows: Array<[form: string, filingDate: string, accessionNumber: string, primaryDocument: string]>) {
  return {
    filings: {
      recent: {
        form: rows.map((r) => r[0]),
        filingDate: rows.map((r) => r[1]),
        accessionNumber: rows.map((r) => r[2]),
        primaryDocument: rows.map((r) => r[3]),
      },
      files: [] as Array<{ name: string }>,
    },
  };
}

describe('parseForm25Document + isConfirmedNasdaqCommonStockDelisting — the false-positive fix', () => {
  it('confirms a genuine Nasdaq common-stock delisting (Adverum)', () => {
    const doc = parseForm25Document(ADVERUM_NASDAQ_COMMON_STOCK_XML);
    expect(doc.format).toBe('structured-xml');
    expect(doc.exchangeEntityName).toBe('Nasdaq Stock Market LLC');
    expect(doc.securityClassDescription).toBe('Common Stock');
    expect(isConfirmedNasdaqCommonStockDelisting(doc)).toBe(true);
  });

  it('rejects a Nasdaq BOND removal (AAPL) — exchange matches but security class does not', () => {
    const doc = parseForm25Document(AAPL_NASDAQ_BOND_XML);
    expect(doc.exchangeEntityName).toBe('Nasdaq Stock Market LLC');
    expect(doc.securityClassDescription).toBe('0.000% Notes due 2025');
    expect(isConfirmedNasdaqCommonStockDelisting(doc)).toBe(false);
  });

  it('rejects an NYSE shares removal (TE Connectivity) — wrong exchange entirely', () => {
    const doc = parseForm25Document(TEL_NYSE_SHARES_XML);
    expect(isConfirmedNasdaqCommonStockDelisting(doc)).toBe(false);
  });

  it('classifies a legacy pre-XML filing (GWW) as unparsed, never guessing from the free text', () => {
    const doc = parseForm25Document(GWW_LEGACY_HTML);
    expect(doc.format).toBe('legacy-unparsed');
    expect(doc.exchangeEntityName).toBeNull();
    expect(isConfirmedNasdaqCommonStockDelisting(doc)).toBe(false);
  });

  it('rejects a Nasdaq WARRANT removal (EXPE) whose description merely CONTAINS "common stock" as a substring', () => {
    const doc = parseForm25Document(EXPE_NASDAQ_WARRANT_XML);
    expect(doc.exchangeEntityName).toMatch(/nasdaq/i);
    expect(doc.securityClassDescription).toContain('common stock'); // substring present...
    expect(isConfirmedNasdaqCommonStockDelisting(doc)).toBe(false); // ...but correctly rejected: not the class itself
  });

  it('captures ruleProvision on every structured-xml document, for future disambiguation work', () => {
    expect(parseForm25Document(ADVERUM_NASDAQ_COMMON_STOCK_XML).ruleProvision).toBe('17 CFR 240.12d2-2(a)(3)');
    expect(parseForm25Document(GWW_LEGACY_HTML).ruleProvision).toBeNull();
  });
});

describe('deriveForm25EffectiveDate — acceptance #2 (effective date, not filing date)', () => {
  it('adds exactly 10 calendar days, per 17 CFR 240.12d2-2(d)(1)', () => {
    const result = deriveForm25EffectiveDate('2025-12-09');
    expect(result.filingDate).toBe('2025-12-09');
    expect(result.effectiveAt).toBe('2025-12-19');
    expect(result.effectiveAt).not.toBe(result.filingDate); // proves the two genuinely differ
  });

  it('crosses a month/year boundary correctly', () => {
    expect(deriveForm25EffectiveDate('2025-12-25').effectiveAt).toBe('2026-01-04');
  });
});

describe('resolveDelistingLifecycle — acceptance #1 (no look-ahead) and #2 (effective vs filing date)', () => {
  const coverage = { symbol: 'ABCD', cik: '0001501756', complete: true, observedFrom: '2020-01-01', observedTo: '2026-01-01' };
  const filing: Form25Filing = {
    symbol: 'ABCD',
    cik: '0001501756',
    formType: '25-NSE',
    filingDate: '2025-12-09',
    accessionNumber: '0001354457-25-001236',
    primaryDocument: 'xslF25X02/primary_doc.xml',
    document: parseForm25Document(ADVERUM_NASDAQ_COMMON_STOCK_XML),
  };

  it('a Form 25 filed AFTER the decision date does not delist the name at that decision — acceptance #1', () => {
    const decisionBeforeFiling = '2025-12-01'; // filingDate (2025-12-09) is after this decision
    const resolved = resolveDelistingLifecycle('ABCD', [filing], coverage, decisionBeforeFiling);
    expect(resolved.lifecycle).toBe('ACTIVE');
    expect(resolved.reasonCode).toBe('no_form25_found_active');
    expect(resolved.lifecycleEffectiveAt).toBeNull();
  });

  it('a decision between filingDate and the derived effectiveAt stays ACTIVE — the filing is known but not yet effective', () => {
    const decisionKnownNotEffective = '2025-12-14'; // after filingDate (12-09), before effectiveAt (12-19)
    const resolved = resolveDelistingLifecycle('ABCD', [filing], coverage, decisionKnownNotEffective);
    expect(resolved.lifecycle).toBe('ACTIVE');
    expect(resolved.reasonCode).toBe('delisting_filed_not_yet_effective');
  });

  it('a decision AT or AFTER the effective date resolves DELISTED, with lifecycleEffectiveAt = filingDate + 10d — acceptance #2', () => {
    const resolvedAt = resolveDelistingLifecycle('ABCD', [filing], coverage, '2025-12-19');
    expect(resolvedAt.lifecycle).toBe('DELISTED');
    expect(resolvedAt.lifecycleEffectiveAt).toBe('2025-12-19');
    expect(resolvedAt.lifecycleEffectiveAt).not.toBe(filing.filingDate); // effective date, not filing date

    const resolvedAfter = resolveDelistingLifecycle('ABCD', [filing], coverage, '2026-01-01');
    expect(resolvedAfter.lifecycle).toBe('DELISTED');
    expect(resolvedAfter.lifecycleEffectiveAt).toBe('2025-12-19'); // still the true effective date, not the decision date
  });

  it('a confirmed Nasdaq-BOND filing (AAPL-shaped) is NOT delisting evidence at any decision date', () => {
    const bondFiling: Form25Filing = { ...filing, document: parseForm25Document(AAPL_NASDAQ_BOND_XML) };
    const resolved = resolveDelistingLifecycle('AAPL', [bondFiling], coverage, '2026-01-01');
    expect(resolved.lifecycle).toBe('ACTIVE');
  });
});

describe('resolveDelistingLifecycle — acceptance #3 (fail-closed coverage)', () => {
  it('no CIK resolved => UNKNOWN, never ACTIVE', () => {
    const coverage = { symbol: 'ZZZZ', cik: null, complete: false, observedFrom: null, observedTo: null };
    const resolved = resolveDelistingLifecycle('ZZZZ', [], coverage, '2026-01-01');
    expect(resolved.lifecycle).toBe('UNKNOWN');
    expect(resolved.reasonCode).toBe('no_cik');
  });

  it('CIK resolved but filing history fetch incomplete => UNKNOWN, never a guessed ACTIVE', () => {
    const coverage = {
      symbol: 'ZZZZ', cik: '0000000001', complete: false, observedFrom: null, observedTo: null,
      incompleteReason: 'fetched_1_of_2_pages',
    };
    const resolved = resolveDelistingLifecycle('ZZZZ', [], coverage, '2026-01-01');
    expect(resolved.lifecycle).toBe('UNKNOWN');
    expect(resolved.reasonCode).toBe('coverage_incomplete');
  });

  it('CIK resolved AND coverage genuinely complete AND no qualifying Form 25 found => ACTIVE (only case that earns it)', () => {
    const coverage = { symbol: 'GOOD', cik: '0000000002', complete: true, observedFrom: '2010-01-01', observedTo: '2026-01-01' };
    const resolved = resolveDelistingLifecycle('GOOD', [], coverage, '2026-01-01');
    expect(resolved.lifecycle).toBe('ACTIVE');
    expect(resolved.reasonCode).toBe('no_form25_found_active');
  });
});

describe('extractFormPage — handles both real SEC submissions JSON shapes', () => {
  it('parses the main submissions.json shape (arrays under filings.recent)', () => {
    const raw = mainSubmissionsPage([
      ['10-K', '2024-02-01', '0001-24-000001', 'ex10k.htm'],
      ['25-NSE', '2025-12-09', '0001354457-25-001236', 'xslF25X02/primary_doc.xml'],
    ]);
    const page = extractFormPage(raw);
    expect(page.form).toEqual(['10-K', '25-NSE']);
    expect(page.filingDate).toEqual(['2024-02-01', '2025-12-09']);
    expect(page.primaryDocument).toEqual(['ex10k.htm', 'xslF25X02/primary_doc.xml']);
  });

  it('parses the older paginated submissions-XXX.json shape (arrays at the top level)', () => {
    const raw = {
      form: ['10-Q', '25'],
      filingDate: ['2016-05-01', '2017-03-15'],
      accessionNumber: ['0001-16-000001', '0001-17-000002'],
      primaryDocument: ['q.htm', 'form25.htm'],
    };
    const page = extractFormPage(raw);
    expect(page.form).toEqual(['10-Q', '25']);
  });

  it('malformed/unrecognized input yields empty arrays, never a thrown error', () => {
    expect(extractFormPage(null)).toEqual({ form: [], filingDate: [], accessionNumber: [], primaryDocument: [] });
    expect(extractFormPage({ nonsense: true })).toEqual({ form: [], filingDate: [], accessionNumber: [], primaryDocument: [] });
    expect(extractFormPage(42)).toEqual({ form: [], filingDate: [], accessionNumber: [], primaryDocument: [] });
  });
});

describe('selectForm25FilingHistory — pure candidate extraction + fail-closed page-count cross-check', () => {
  it('extracts only 25/25-NSE rows, ignoring every other form type', () => {
    const raw = mainSubmissionsPage([
      ['10-K', '2024-02-01', '0001-24-000001', 'ex10k.htm'],
      ['8-K', '2024-06-01', '0001-24-000002', 'ex8k.htm'],
      ['25-NSE', '2025-12-09', '0001354457-25-001236', 'xslF25X02/primary_doc.xml'],
    ]);
    const { candidates, coverage } = selectForm25FilingHistory('ABCD', '0001501756', [raw], 1);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].formType).toBe('25-NSE');
    expect(candidates[0].filingDate).toBe('2025-12-09');
    expect(coverage.complete).toBe(true);
    expect(coverage.observedFrom).toBe('2024-02-01');
    expect(coverage.observedTo).toBe('2025-12-09');
  });

  it('null CIK => complete: false with no_cik, regardless of pages supplied', () => {
    const { candidates, coverage } = selectForm25FilingHistory('ZZZZ', null, [mainSubmissionsPage([])], 1);
    expect(candidates).toEqual([]);
    expect(coverage.complete).toBe(false);
    expect(coverage.incompleteReason).toBe('no_cik');
  });

  it('fewer pages supplied than expected (a paginated file failed to fetch) => complete: false, fail-closed', () => {
    const main = mainSubmissionsPage([['25', '2020-01-01', 'acc-1', 'form25.htm']]);
    const { candidates, coverage } = selectForm25FilingHistory('ABCD', '0001501756', [main], 2);
    expect(candidates).toEqual([]);
    expect(coverage.complete).toBe(false);
    expect(coverage.incompleteReason).toBe('fetched_1_of_2_pages');
  });

  it('merges candidates across multiple pages and dedupes by accession number', () => {
    const main = mainSubmissionsPage([['25-NSE', '2025-12-09', '0001354457-25-001236', 'xslF25X02/primary_doc.xml']]);
    const older = {
      form: ['10-K', '25-NSE'],
      filingDate: ['2015-01-01', '2025-12-09'],
      accessionNumber: ['acc-old', '0001354457-25-001236'],
      primaryDocument: ['ex10k.htm', 'xslF25X02/primary_doc.xml'],
    };
    const { candidates, coverage } = selectForm25FilingHistory('ABCD', '0001501756', [main, older], 2);
    expect(candidates).toHaveLength(1); // the duplicate accession from the older page is not double-counted
    expect(coverage.observedFrom).toBe('2015-01-01');
  });
});

describe('applyDocumentClassification — stage B: document fetch/parse folded into coverage honesty', () => {
  it('a genuine Nasdaq common-stock filing classifies cleanly and coverage stays complete', () => {
    const { candidates, coverage: pageCoverage } = selectForm25FilingHistory(
      'ABCD', '0001501756',
      [mainSubmissionsPage([['25-NSE', '2025-12-09', '0001354457-25-001236', 'xslF25X02/primary_doc.xml']])],
      1,
    );
    const documentTexts = new Map([['0001354457-25-001236', ADVERUM_NASDAQ_COMMON_STOCK_XML]]);
    const { filings, coverage } = applyDocumentClassification(candidates, pageCoverage, documentTexts);
    expect(coverage.complete).toBe(true);
    expect(filings).toHaveLength(1);
    expect(isConfirmedNasdaqCommonStockDelisting(filings[0].document)).toBe(true);
  });

  it('a legacy (GWW-shaped) filing with no fetchable structured document flips coverage to incomplete — fail-closed', () => {
    const { candidates, coverage: pageCoverage } = selectForm25FilingHistory(
      'GWW', '0000277135',
      [mainSubmissionsPage([['25', '2014-12-22', '0000277135-14-000035', 'form252014-10x15.htm']])],
      1,
    );
    // Document fetched successfully (legacy HTML), but it has no structured backing — unresolved.
    const documentTexts = new Map([['0000277135-14-000035', GWW_LEGACY_HTML]]);
    const { coverage } = applyDocumentClassification(candidates, pageCoverage, documentTexts);
    expect(coverage.complete).toBe(false);
    expect(coverage.incompleteReason).toContain('unclassified_form25_documents');
  });

  it('a candidate whose document fetch failed entirely (missing from the map) is treated the same as unparseable — never silently dropped', () => {
    const { candidates, coverage: pageCoverage } = selectForm25FilingHistory(
      'ABCD', '0001501756',
      [mainSubmissionsPage([['25-NSE', '2025-12-09', '0001354457-25-001236', 'xslF25X02/primary_doc.xml']])],
      1,
    );
    const { coverage } = applyDocumentClassification(candidates, pageCoverage, new Map());
    expect(coverage.complete).toBe(false);
  });

  it('when page coverage is already incomplete, document classification is skipped (no filings emitted)', () => {
    const incompletePageCoverage = { symbol: 'X', cik: '1', complete: false, observedFrom: null, observedTo: null, incompleteReason: 'x' };
    const { filings, coverage } = applyDocumentClassification([], incompletePageCoverage, new Map());
    expect(filings).toEqual([]);
    expect(coverage).toBe(incompletePageCoverage);
  });
});

describe('coverage question (acceptance #4) — this module never emits SUSPENDED', () => {
  it('DelistingLifecycleState resolutions are always ACTIVE | DELISTED | UNKNOWN at runtime', () => {
    const coverage = { symbol: 'X', cik: '1', complete: true, observedFrom: null, observedTo: null };
    const states = [
      resolveDelistingLifecycle('X', [], coverage, '2026-01-01').lifecycle,
      resolveDelistingLifecycle('X', [], { ...coverage, cik: null, complete: false }, '2026-01-01').lifecycle,
    ];
    for (const s of states) expect(['ACTIVE', 'DELISTED', 'UNKNOWN']).toContain(s);
    expect(states.includes('SUSPENDED' as never)).toBe(false);
  });
});
