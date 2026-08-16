import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPointInTimeMembershipCoverage, DataQualityPitError } from './pointInTimeMembership';
import {
  hashSpusNportLifecycleArtifact,
  latestAvailableSpusNportSnapshot,
  loadCapturedSpusNportSnapshots,
  parseSpusNportDocuments,
  SPUS_DIVERSIFICATION_SURVIVORSHIP_WAIVER,
  SPUS_NPORT_FILINGS,
  SPUS_NPORT_FIXTURE_DIR,
  SpusNportParseError,
  toPointInTimeUniverseSnapshot,
  type SpusNportLifecycleArtifact,
  type SpusNportLifecycleArtifactPayload,
} from './spusNport';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

function sealLifecycleArtifact(payload: SpusNportLifecycleArtifactPayload): SpusNportLifecycleArtifact {
  return { ...payload, evidenceHash: hashSpusNportLifecycleArtifact(payload) };
}

describe('captured SPUS SEC N-PORT membership', () => {
  it('pins official identifiers, source hashes, acceptance availability, and real row counts', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    expect(snapshots.map((snapshot) => ({
      accession: snapshot.accession,
      reportDate: snapshot.reportDate.toISOString(),
      availableAt: snapshot.availableAt.toISOString(),
      holdings: snapshot.holdings.length,
      unresolvedHoldings: snapshot.unresolvedHoldings.length,
      unidentifiedHoldings: snapshot.unidentifiedHoldings.length,
    }))).toEqual([
      ['0001145549-20-041804', '2020-05-31', '2020-07-28T18:40:17.000Z', 180, 0, 0],
      ['0001145549-20-063095', '2020-08-31', '2020-10-28T20:34:01.000Z', 179, 0, 0],
      ['0001145549-21-004631', '2020-11-30', '2021-01-29T17:23:12.000Z', 184, 0, 0],
      ['0001387131-21-004867', '2021-02-28', '2021-04-23T15:48:43.000Z', 160, 30, 0],
      ['0001387131-21-007842', '2021-05-31', '2021-07-29T16:57:36.000Z', 169, 29, 0],
      ['0001387131-21-010436', '2021-08-31', '2021-10-27T20:34:21.000Z', 174, 28, 0],
      ['0001387131-22-000732', '2021-11-30', '2022-01-26T21:31:03.000Z', 181, 29, 0],
      ['0001387131-22-005323', '2022-02-28', '2022-04-26T20:22:38.000Z', 182, 30, 0],
      ['0001387131-22-008131', '2022-05-31', '2022-07-28T19:24:48.000Z', 183, 32, 0],
      ['0001387131-22-010802', '2022-08-31', '2022-10-26T18:59:20.000Z', 185, 28, 0],
      ['0001387131-23-000702', '2022-11-30', '2023-01-26T16:29:01.000Z', 186, 24, 0],
      ['0001387131-23-005252', '2023-02-28', '2023-04-26T16:26:21.000Z', 186, 22, 1],
      ['0001387131-23-008965', '2023-05-31', '2023-07-28T15:17:23.000Z', 187, 21, 1],
      ['0001387131-23-012885', '2023-08-31', '2023-10-30T17:02:03.000Z', 202, 0, 1],
      ['0002000324-24-000218', '2023-11-30', '2024-01-29T20:44:49.000Z', 203, 0, 1],
      ['0002000324-24-001338', '2024-02-29', '2024-04-26T19:37:49.000Z', 197, 0, 1],
      ['0002000324-24-001962', '2024-05-31', '2024-07-26T16:20:33.000Z', 238, 0, 1],
      ['0002000324-24-003031', '2024-08-31', '2024-10-25T17:17:39.000Z', 233, 0, 1],
      ['0002000324-25-000189', '2024-11-30', '2025-01-29T19:40:05.000Z', 225, 0, 1],
      ['0002000324-25-001560', '2025-02-28', '2025-04-29T16:04:54.000Z', 228, 0, 1],
      ['0002000324-25-002489', '2025-05-31', '2025-07-29T14:04:01.000Z', 218, 0, 1],
      ['0002000324-25-004070', '2025-08-31', '2025-10-29T14:52:28.000Z', 212, 0, 1],
      ['0002000324-26-000257', '2025-11-30', '2026-01-28T18:48:50.000Z', 213, 0, 1],
      ['0002000324-26-001717', '2026-02-28', '2026-04-27T18:11:42.000Z', 211, 0, 1],
      ['0002000324-26-003242', '2026-05-31', '2026-07-29T19:21:24.000Z', 213, 0, 2],
    ].map(([accession, reportDate, availableAt, holdings, unresolvedHoldings, unidentifiedHoldings]) => ({
      accession,
      reportDate: `${reportDate}T00:00:00.000Z`,
      availableAt,
      holdings,
      unresolvedHoldings,
      unidentifiedHoldings,
    })),
    );
    expect(snapshots[0].holdings.find(({ symbol }) => symbol === 'ABMD')?.cusip).toBe('003654100');
    expect(snapshots.every(({ holdings }) => new Set(holdings.map(({ symbol }) => symbol)).size === holdings.length))
      .toBe(true);
  });

  it('marks availableAt strictly after reportDate for every captured filing (no look-ahead)', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    expect(snapshots.length).toBeGreaterThan(0);
    for (const snapshot of snapshots) {
      expect(snapshot.availableAt.getTime()).toBeGreaterThan(snapshot.reportDate.getTime());
    }
  });

  it('recomputes every fixture hash from disk bytes and matches the pinned reference', () => {
    for (const reference of SPUS_NPORT_FILINGS) {
      const directory = path.join(reference.fixtureDirectory ?? SPUS_NPORT_FIXTURE_DIR, reference.accession);
      const xml = fs.readFileSync(path.join(directory, 'primary_doc.xml'), 'utf8');
      const header = fs.readFileSync(path.join(directory, 'index-headers.html'), 'utf8');
      expect(hash(xml)).toBe(reference.primaryDocumentSha256);
      expect(hash(header)).toBe(reference.headerDocumentSha256);
    }
  });

  it('derives different membership from different real quarters (a name in/out across filings)', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    const may2020 = snapshots.find((s) => s.accession === '0001145549-20-041804')!;
    const aug2020 = snapshots.find((s) => s.accession === '0001145549-20-063095')!;
    const mayMembers = new Set(may2020.holdings.map(({ symbol }) => symbol));
    const augMembers = new Set(aug2020.holdings.map(({ symbol }) => symbol));
    // ALK (Alaska Air) was disclosed held on 2020-05-31 and was gone by 2020-08-31.
    expect(mayMembers.has('ALK')).toBe(true);
    expect(augMembers.has('ALK')).toBe(false);
    const mayAdapted = toPointInTimeUniverseSnapshot(may2020, aug2020.availableAt, ['ALK']);
    const augAdapted = toPointInTimeUniverseSnapshot(aug2020, null, ['ALK']);
    expect(mayAdapted.records.find((r) => r.symbol === 'ALK')?.membership).toBe('IN');
    expect(augAdapted.records.find((r) => r.symbol === 'ALK')?.membership).toBe('OUT');
  });

  it('reports coverage: earliest/latest reportDate, count, and any gap longer than one quarter', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    const reportDates = snapshots.map((s) => s.reportDate.getTime());
    expect(snapshots[0].reportDate.toISOString().slice(0, 10)).toBe('2020-05-31');
    expect(snapshots[snapshots.length - 1].reportDate.toISOString().slice(0, 10)).toBe('2026-05-31');
    expect(snapshots).toHaveLength(25);
    const ONE_QUARTER_MS = 100 * 24 * 60 * 60 * 1000;
    const gaps = [];
    for (let i = 1; i < reportDates.length; i += 1) {
      const delta = reportDates[i] - reportDates[i - 1];
      if (delta > ONE_QUARTER_MS) gaps.push({ from: snapshots[i - 1].accession, to: snapshots[i].accession });
    }
    expect(gaps).toEqual([]);
  });

  it('excludes filer-marked zero-value contingent-value-right stubs without fabricating a symbol', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    const snapshot = snapshots.find((s) => s.accession === '0001387131-23-012885')!;
    expect(snapshot.holdings.find(({ name }) => name === 'ABIOMED INC')).toBeUndefined();
    expect(snapshot.unidentifiedHoldings).toEqual([
      expect.objectContaining({ name: 'ABIOMED INC', cusip: 'N/A' }),
    ]);
  });

  it('resolves ISIN-only holdings from pinned evidence and never converts open held identities to OUT', () => {
    const snapshot = loadCapturedSpusNportSnapshots()
      .find(({ accession }) => accession === '0001387131-21-004867')!;
    expect(snapshot.holdings.filter(({ symbolEvidence }) => symbolEvidence === 'CURATED_OPENFIGI_RENAME'))
      .toHaveLength(20);
    expect(snapshot.unresolvedHoldings).toHaveLength(30);
    expect(snapshot.unresolvedHoldings.every(({ isin, valueUsd }) =>
      /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin) && Number(valueUsd) > 0)).toBe(true);
    expect(snapshot.unresolvedHoldings).toContainEqual(expect.objectContaining({ name: 'Facebook Inc' }));
    expect(snapshot.membershipUnknownSymbols).toEqual(expect.arrayContaining([
      'ANET', 'COO', 'DD', 'LIN', 'LRCX', 'META', 'STX', 'TEL',
    ]));
    const adapted = toPointInTimeUniverseSnapshot(snapshot, null, ['SLB', 'ANET', 'META', 'ZZZZ']);
    expect(adapted.records.map(({ symbol, membership }) => [symbol, membership])).toEqual([
      ['ANET', 'UNKNOWN'], ['META', 'UNKNOWN'], ['SLB', 'IN'], ['ZZZZ', 'OUT'],
    ]);
  });

  it('uses only pinned injected Form-25 coverage and keeps suspended coverage explicitly waived', () => {
    const snapshot = loadCapturedSpusNportSnapshots()[0];
    const payload: SpusNportLifecycleArtifactPayload = {
      schemaVersion: 1,
      source: 'SEC_FORM_25',
      coverage: ['ABMD', 'ZZZZ'].map((symbol) => ({
        symbol, cik: `cik-${symbol}`, complete: true, observedFrom: '2019-01-01', observedTo: '2020-07-01',
      })),
      filings: [{
        symbol: 'ABMD', cik: 'cik-ABMD', formType: '25-NSE', filingDate: '2020-07-01',
        accessionNumber: 'fixture-form25', primaryDocument: 'primary_doc.xml',
        document: {
          exchangeEntityName: 'Nasdaq Stock Market LLC', securityClassDescription: 'Common Stock',
          ruleProvision: '17 CFR 240.12d2-2(a)(3)', format: 'structured-xml',
        },
      }],
    };
    const artifact = sealLifecycleArtifact(payload);
    expect(artifact.evidenceHash).toBe(hashSpusNportLifecycleArtifact(structuredClone(payload)));
    const adapted = toPointInTimeUniverseSnapshot(snapshot, null, ['ABMD', 'ZZZZ'], artifact);
    expect(adapted.lifecycleCoverage).toEqual({ delisted: true, suspended: false });
    expect(adapted.survivorshipWaiver).toEqual(SPUS_DIVERSIFICATION_SURVIVORSHIP_WAIVER);
    expect(adapted.records.find(({ symbol }) => symbol === 'ABMD')).toMatchObject({
      lifecycle: 'DELISTED', lifecycleEffectiveAt: new Date('2020-07-11T00:00:00.000Z'),
    });
    expect(adapted.records.find(({ symbol }) => symbol === 'ZZZZ')?.lifecycle).toBe('ACTIVE');
    expect(() => toPointInTimeUniverseSnapshot(snapshot, null, ['ABMD'], {
      ...artifact, evidenceHash: 'unpinned',
    })).toThrow(/pinned sha256/);
    const changedCoverage = {
      ...artifact,
      coverage: artifact.coverage.map((coverage) => coverage.symbol === 'ZZZZ'
        ? { ...coverage, complete: false, incompleteReason: 'missing captured history' }
        : coverage),
    };
    expect(() => toPointInTimeUniverseSnapshot(snapshot, null, ['ABMD', 'ZZZZ'], changedCoverage))
      .toThrow(/semantic payload hash mismatch/);
    expect(() => toPointInTimeUniverseSnapshot(snapshot, null, ['ABMD'], {
      ...artifact,
      filings: artifact.filings.map((filing) => ({ ...filing, filingDate: '2020-07-02' })),
    })).toThrow(/semantic payload hash mismatch/);
    expect(() => toPointInTimeUniverseSnapshot(snapshot, null, ['ABMD'], {
      ...artifact, filings: [],
    })).toThrow(/semantic payload hash mismatch/);
    const { evidenceHash: _oldHash, ...incompletePayload } = changedCoverage;
    const incomplete = toPointInTimeUniverseSnapshot(
      snapshot,
      null,
      ['ABMD', 'ZZZZ'],
      sealLifecycleArtifact(incompletePayload),
    );
    expect(incomplete.lifecycleCoverage.delisted).toBe(false);
    expect(incomplete.records.find(({ symbol }) => symbol === 'ZZZZ')?.lifecycle).toBe('UNKNOWN');
  });

  it('uses EDGAR acceptance, not the older report date, as point-in-time availability', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    expect(latestAvailableSpusNportSnapshot(snapshots, new Date('2020-07-28T18:40:16.999Z'))).toBeNull();
    expect(latestAvailableSpusNportSnapshot(snapshots, new Date('2020-07-28T18:40:17.000Z'))?.accession)
      .toBe('0001145549-20-041804');
    expect(latestAvailableSpusNportSnapshot(snapshots, new Date('2020-10-28T20:34:00.999Z'))?.accession)
      .toBe('0001145549-20-041804');
    expect(latestAvailableSpusNportSnapshot(snapshots, new Date('2020-10-28T20:34:01.000Z'))?.accession)
      .toBe('0001145549-20-063095');
  });

  it('fails closed on a malformed or ambiguous holding row', () => {
    const reference = SPUS_NPORT_FILINGS[0];
    const directory = path.join(SPUS_NPORT_FIXTURE_DIR, reference.accession);
    const originalXml = fs.readFileSync(path.join(directory, 'primary_doc.xml'), 'utf8');
    const header = fs.readFileSync(path.join(directory, 'index-headers.html'), 'utf8');
    const malformedXml = originalXml.replace(
      '<ticker value="ABT"/>',
      '<ticker value="ABT"/><ticker value="AMBIGUOUS"/>',
    );
    expect(() => parseSpusNportDocuments(malformedXml, header, {
      ...reference,
      primaryDocumentSha256: hash(malformedXml),
    })).toThrow(SpusNportParseError);
  });

  it('refuses byte drift before parsing source claims', () => {
    const reference = SPUS_NPORT_FILINGS[0];
    const directory = path.join(SPUS_NPORT_FIXTURE_DIR, reference.accession);
    const xml = fs.readFileSync(path.join(directory, 'primary_doc.xml'), 'utf8');
    const header = fs.readFileSync(path.join(directory, 'index-headers.html'), 'utf8');
    expect(() => parseSpusNportDocuments(`${xml}\n`, header, reference)).toThrow(/hash mismatch/);
  });

  it('preserves the terminal guard: N-PORT does not fabricate lifecycle or Sharia evidence', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    const adapted = toPointInTimeUniverseSnapshot(snapshots[0], snapshots[1].availableAt, ['ABMD', 'ZZZZ']);
    expect(adapted.lifecycleCoverage).toEqual({ delisted: false, suspended: false });
    expect(adapted.records.find(({ symbol }) => symbol === 'ABMD')).toMatchObject({
      membership: 'IN', lifecycle: 'UNKNOWN', shariaEvidence: null,
    });
    expect(adapted.records.find(({ symbol }) => symbol === 'ZZZZ')).toMatchObject({
      membership: 'OUT', lifecycle: 'UNKNOWN', shariaEvidence: null,
    });
    try {
      assertPointInTimeMembershipCoverage({
        snapshots: [adapted],
        decisionTimes: [new Date('2020-08-01T00:00:00.000Z')],
        requiredSymbols: ['ABMD', 'ZZZZ'],
      });
      throw new Error('expected terminal lifecycle coverage failure');
    } catch (error) {
      expect(error).toBeInstanceOf(DataQualityPitError);
      expect((error as DataQualityPitError).evidence.failure).toBe('LIFECYCLE_COVERAGE_MISSING');
    }
  });

  it('loads committed evidence without a network call', () => {
    const originalFetch = global.fetch;
    const fetchSpy = () => Promise.reject(new Error('network forbidden'));
    global.fetch = fetchSpy as typeof fetch;
    try {
      expect(loadCapturedSpusNportSnapshots()).toHaveLength(25);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
