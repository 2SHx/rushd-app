import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CURATED_OPENFIGI_RENAME_FIXTURE_PATH,
  CURATED_OPENFIGI_RENAME_FIXTURE_SHA256,
  indexCuratedOpenFigiRenamesByIsin,
  indexCrosswalkByIsin,
  loadCuratedOpenFigiRenameArtifact,
  loadOpenFigiCrosswalkCapture,
  normalizeCompanyName,
  OPENFIGI_CROSSWALK_FIXTURE_PATH,
  OPENFIGI_CROSSWALK_FIXTURE_SHA256,
  OpenFigiCrosswalkError,
  resolveIsinToTicker,
} from './openFigiCrosswalk';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('OpenFIGI ISIN->ticker crosswalk (identity resolution only, QDR-14)', () => {
  const expectedCuratedMappings = {
    AN8068571086: 'SLB',
    IE00BY7QL619: 'JCI',
    US02079K3059: 'GOOGL',
    US1273871087: 'CDNS',
    US1598641074: 'CRL',
    US1924461023: 'CTSH',
    US3021301094: 'EXPD',
    US3156161024: 'FFIV',
    US4456581077: 'JBHT',
    US45687V1061: 'IR',
    US5184391044: 'EL',
    US5797802064: 'MKC',
    US5926881054: 'MTD',
    US59522J1034: 'MAA',
    US6092071058: 'MDLZ',
    US6541061031: 'NKE',
    US7140461093: 'RVTY',
    US79466L3024: 'CRM',
    US8318652091: 'AOS',
    US8725401090: 'TJX',
    US9113121068: 'UPS',
    US9297401088: 'WAB',
    US9553061055: 'WST',
    US9892071054: 'ZBRA',
  } as const;

  it('recomputes the pinned fixture hash from the exact bytes on disk', () => {
    const raw = fs.readFileSync(OPENFIGI_CROSSWALK_FIXTURE_PATH, 'utf8');
    expect(hash(raw)).toBe(OPENFIGI_CROSSWALK_FIXTURE_SHA256);
  });

  it('rejects a fixture whose bytes have drifted from the pinned hash', () => {
    const raw = fs.readFileSync(OPENFIGI_CROSSWALK_FIXTURE_PATH, 'utf8');
    const tmp = `${OPENFIGI_CROSSWALK_FIXTURE_PATH}.drift-test.json`;
    fs.writeFileSync(tmp, `${raw}\n`);
    try {
      expect(() => loadOpenFigiCrosswalkCapture(tmp)).toThrow(OpenFigiCrosswalkError);
      expect(() => loadOpenFigiCrosswalkCapture(tmp)).toThrow(/hash mismatch/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('pins and validates all 24 curated held-roster rename decisions', () => {
    const raw = fs.readFileSync(CURATED_OPENFIGI_RENAME_FIXTURE_PATH, 'utf8');
    expect(hash(raw)).toBe(CURATED_OPENFIGI_RENAME_FIXTURE_SHA256);
    const artifact = loadCuratedOpenFigiRenameArtifact();
    const index = indexCuratedOpenFigiRenamesByIsin(artifact);
    expect(Object.fromEntries(Array.from(index, ([isin, entry]) => [isin, entry.ticker])))
      .toEqual(expectedCuratedMappings);
    expect(artifact.entries.filter((entry) => entry.basis === 'US_ISIN_CUSIP_EXACT')).toHaveLength(22);
    expect(artifact.entries.filter((entry) => entry.basis === 'FOREIGN_ISIN_TICKER_AND_ROSTER_NAME'))
      .toHaveLength(2);
    expect(artifact.openNotFoundRosterSymbols).toEqual(['ANET', 'COO', 'DD', 'LIN', 'LRCX', 'STX', 'TEL']);
    expect(artifact.entries.some((entry) => artifact.openNotFoundRosterSymbols.includes(entry.ticker)))
      .toBe(false);
  });

  it('rejects tampering with the curated evidence bytes', () => {
    const raw = fs.readFileSync(CURATED_OPENFIGI_RENAME_FIXTURE_PATH, 'utf8');
    const tmp = `${CURATED_OPENFIGI_RENAME_FIXTURE_PATH}.drift-test.json`;
    fs.writeFileSync(tmp, raw.replace('"SLB"', '"SLX"'));
    try {
      expect(() => loadCuratedOpenFigiRenameArtifact(tmp)).toThrow(/curated rename fixture hash mismatch/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('rejects duplicate and conflicting curated identity decisions', () => {
    const artifact = loadCuratedOpenFigiRenameArtifact();
    const first = artifact.entries[0];
    expect(() => indexCuratedOpenFigiRenamesByIsin({
      ...artifact,
      entries: [...artifact.entries, first],
    })).toThrow(/duplicate curated ISIN mapping/);
    expect(() => indexCuratedOpenFigiRenamesByIsin({
      ...artifact,
      entries: [...artifact.entries, { ...first, ticker: 'CONFLICT' }],
    })).toThrow(/conflicting curated ISIN mapping/);
  });

  it('loads the captured evidence and reports the real found/not-found counts (244 ISINs total)', () => {
    const capture = loadOpenFigiCrosswalkCapture();
    expect(capture.entryCount).toBe(244);
    expect(capture.foundCount).toBe(216);
    expect(capture.notFoundCount).toBe(28);
    expect(capture.entries).toHaveLength(244);
    expect(capture.entries.filter((e) => e.status === 'FOUND')).toHaveLength(216);
    expect(capture.entries.filter((e) => e.status === 'NOT_FOUND')).toHaveLength(28);
  });

  it('never calls fetch — resolution is pure, offline replay of captured evidence', () => {
    const originalFetch = global.fetch;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    try {
      const capture = loadOpenFigiCrosswalkCapture();
      const crosswalk = indexCrosswalkByIsin(capture);
      resolveIsinToTicker('US0378331005', 'Apple Inc', crosswalk);
      resolveIsinToTicker('US30303M1027', 'Facebook Inc', crosswalk);
      resolveIsinToTicker('US0036541003', 'ABIOMED Inc', crosswalk);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('resolves a real ISIN to its ticker when the disclosed name matches (AAPL)', () => {
    const crosswalk = indexCrosswalkByIsin(loadOpenFigiCrosswalkCapture());
    const result = resolveIsinToTicker('US0378331005', 'Apple Inc', crosswalk);
    expect(result).toEqual({
      status: 'RESOLVED',
      isin: 'US0378331005',
      ticker: 'AAPL',
      filingName: 'Apple Inc',
      openFigiName: 'APPLE INC',
    });
  });

  it('tolerates punctuation/legal-suffix/case formatting noise (Cisco Systems Inc/Delaware)', () => {
    const crosswalk = indexCrosswalkByIsin(loadOpenFigiCrosswalkCapture());
    const result = resolveIsinToTicker('US17275R1023', 'Cisco Systems Inc/Delaware', crosswalk);
    expect(result.status).toBe('RESOLVED');
    if (result.status === 'RESOLVED') expect(result.ticker).toBe('CSCO');
  });

  it('REJECTS a resolution whose OpenFIGI company name does not match the filing disclosed name — the mandatory ticker-reuse defense', () => {
    const crosswalk = indexCrosswalkByIsin(loadOpenFigiCrosswalkCapture());
    // Real case from the captured evidence: the ISIN's OpenFIGI-resolved name today is
    // "META PLATFORMS INC-CLASS A" (post-rename), but several of the ten filings still
    // disclosed the pre-rename name "Facebook Inc" for this exact ISIN.
    const result = resolveIsinToTicker('US30303M1027', 'Facebook Inc', crosswalk);
    expect(result).toMatchObject({ status: 'EXCLUDED', reason: 'NAME_MISMATCH' });
    if (result.status === 'EXCLUDED') {
      expect(result.detail).toContain('does not match');
    }
  });

  it('EXCLUDES an ISIN OpenFIGI had no US composite listing for, with the reason recorded verbatim (ABIOMED — acquired, delisted)', () => {
    const crosswalk = indexCrosswalkByIsin(loadOpenFigiCrosswalkCapture());
    const result = resolveIsinToTicker('US0036541003', 'ABIOMED Inc', crosswalk);
    expect(result).toEqual({
      status: 'EXCLUDED',
      isin: 'US0036541003',
      filingName: 'ABIOMED Inc',
      reason: 'NO_US_COMPOSITE_LISTING',
      detail: 'No identifier found.',
    });
  });

  it('EXCLUDES an ISIN never captured into the fixture rather than guessing', () => {
    const crosswalk = indexCrosswalkByIsin(loadOpenFigiCrosswalkCapture());
    const result = resolveIsinToTicker('US0000000000', 'Not A Real Company', crosswalk);
    expect(result).toEqual({
      status: 'EXCLUDED',
      isin: 'US0000000000',
      filingName: 'Not A Real Company',
      reason: 'NOT_IN_CROSSWALK',
      detail: 'US0000000000 was never captured into the OpenFIGI crosswalk fixture',
    });
  });

  describe('normalizeCompanyName', () => {
    it('folds case, "&"/"and", punctuation, and trailing legal suffixes to the same key', () => {
      expect(normalizeCompanyName('Eli Lilly and Co')).toBe(normalizeCompanyName('Eli Lilly & Co'));
      expect(normalizeCompanyName('DexCom Inc')).toBe(normalizeCompanyName('Dexcom Inc'));
      expect(normalizeCompanyName('Becton Dickinson and Co')).toBe(normalizeCompanyName('Becton Dickinson & Co'));
    });

    it('drops an SEC jurisdiction suffix after a trailing slash', () => {
      expect(normalizeCompanyName('Cooper Cos Inc/The')).toBe(normalizeCompanyName('Cooper Cos Inc'));
      expect(normalizeCompanyName('McCormick & Co Inc/MD')).toBe(normalizeCompanyName('McCormick & Co Inc'));
    });

    it('does NOT collapse two names that differ in more than boilerplate — the reuse-defense floor', () => {
      // Deliberately real near-neighbors: two unrelated real companies from the captured names.
      expect(normalizeCompanyName('Cerner Corp')).not.toBe(normalizeCompanyName('Ceridian HCM Holding Inc'));
      // A genuine corporate rename is intentionally NOT forgiven either (see doc comment on
      // normalizeCompanyName): this module cannot mechanically tell "renamed" from "reused".
      expect(normalizeCompanyName('Facebook Inc')).not.toBe(normalizeCompanyName('Meta Platforms Inc-Class A'));
    });
  });

  it('rejects a duplicate-ISIN fixture rather than silently picking one', () => {
    const capture = loadOpenFigiCrosswalkCapture();
    const withDuplicate = { ...capture, entries: [...capture.entries, capture.entries[0]] };
    expect(() => indexCrosswalkByIsin(withDuplicate)).toThrow(OpenFigiCrosswalkError);
  });
});
