import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertPointInTimeMembershipCoverage, DataQualityPitError } from './pointInTimeMembership';
import {
  latestAvailableSpusNportSnapshot,
  loadCapturedSpusNportSnapshots,
  parseSpusNportDocuments,
  SPUS_NPORT_FILINGS,
  SPUS_NPORT_FIXTURE_DIR,
  SpusNportParseError,
  toPointInTimeUniverseSnapshot,
} from './spusNport';

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('captured SPUS SEC N-PORT membership', () => {
  it('pins official identifiers, source hashes, acceptance availability, and real row counts', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    expect(snapshots.map((snapshot) => ({
      accession: snapshot.accession,
      reportDate: snapshot.reportDate.toISOString(),
      availableAt: snapshot.availableAt.toISOString(),
      holdings: snapshot.holdings.length,
      unidentifiedHoldings: snapshot.unidentifiedHoldings.length,
    }))).toEqual([
      { accession: '0001145549-20-041804', reportDate: '2020-05-31T00:00:00.000Z', availableAt: '2020-07-28T18:40:17.000Z', holdings: 180, unidentifiedHoldings: 0 },
      { accession: '0001145549-20-063095', reportDate: '2020-08-31T00:00:00.000Z', availableAt: '2020-10-28T20:34:01.000Z', holdings: 179, unidentifiedHoldings: 0 },
      { accession: '0001145549-21-004631', reportDate: '2020-11-30T00:00:00.000Z', availableAt: '2021-01-29T17:23:12.000Z', holdings: 184, unidentifiedHoldings: 0 },
      { accession: '0001387131-23-012885', reportDate: '2023-08-31T00:00:00.000Z', availableAt: '2023-10-30T17:02:03.000Z', holdings: 202, unidentifiedHoldings: 1 },
      { accession: '0002000324-24-000218', reportDate: '2023-11-30T00:00:00.000Z', availableAt: '2024-01-29T20:44:49.000Z', holdings: 203, unidentifiedHoldings: 1 },
      { accession: '0002000324-24-001338', reportDate: '2024-02-29T00:00:00.000Z', availableAt: '2024-04-26T19:37:49.000Z', holdings: 197, unidentifiedHoldings: 1 },
      { accession: '0002000324-24-001962', reportDate: '2024-05-31T00:00:00.000Z', availableAt: '2024-07-26T16:20:33.000Z', holdings: 238, unidentifiedHoldings: 1 },
      { accession: '0002000324-24-003031', reportDate: '2024-08-31T00:00:00.000Z', availableAt: '2024-10-25T17:17:39.000Z', holdings: 233, unidentifiedHoldings: 1 },
      { accession: '0002000324-25-000189', reportDate: '2024-11-30T00:00:00.000Z', availableAt: '2025-01-29T19:40:05.000Z', holdings: 225, unidentifiedHoldings: 1 },
      { accession: '0002000324-25-001560', reportDate: '2025-02-28T00:00:00.000Z', availableAt: '2025-04-29T16:04:54.000Z', holdings: 228, unidentifiedHoldings: 1 },
      { accession: '0002000324-25-002489', reportDate: '2025-05-31T00:00:00.000Z', availableAt: '2025-07-29T14:04:01.000Z', holdings: 218, unidentifiedHoldings: 1 },
      { accession: '0002000324-25-004070', reportDate: '2025-08-31T00:00:00.000Z', availableAt: '2025-10-29T14:52:28.000Z', holdings: 212, unidentifiedHoldings: 1 },
      { accession: '0002000324-26-000257', reportDate: '2025-11-30T00:00:00.000Z', availableAt: '2026-01-28T18:48:50.000Z', holdings: 213, unidentifiedHoldings: 1 },
      { accession: '0002000324-26-001717', reportDate: '2026-02-28T00:00:00.000Z', availableAt: '2026-04-27T18:11:42.000Z', holdings: 211, unidentifiedHoldings: 1 },
      { accession: '0002000324-26-003242', reportDate: '2026-05-31T00:00:00.000Z', availableAt: '2026-07-29T19:21:24.000Z', holdings: 213, unidentifiedHoldings: 2 },
    ]);
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
      const directory = path.join(SPUS_NPORT_FIXTURE_DIR, reference.accession);
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
    expect(snapshots).toHaveLength(15);
    const ONE_QUARTER_MS = 100 * 24 * 60 * 60 * 1000;
    const gaps = [];
    for (let i = 1; i < reportDates.length; i += 1) {
      const delta = reportDates[i] - reportDates[i - 1];
      if (delta > ONE_QUARTER_MS) gaps.push({ from: snapshots[i - 1].accession, to: snapshots[i].accession });
    }
    // A real gap: 2021-02-28..2023-05-31 filings exist on EDGAR but disclose ISIN-only
    // identifiers (no <ticker/> at all), so the ticker-keyed parser correctly rejects them;
    // see SOURCES.md for the full accounting of all 25 known filings.
    expect(gaps).toEqual([{ from: '0001145549-21-004631', to: '0001387131-23-012885' }]);
  });

  it('excludes filer-marked zero-value contingent-value-right stubs without fabricating a symbol', () => {
    const snapshots = loadCapturedSpusNportSnapshots();
    const snapshot = snapshots.find((s) => s.accession === '0001387131-23-012885')!;
    expect(snapshot.holdings.find(({ name }) => name === 'ABIOMED INC')).toBeUndefined();
    expect(snapshot.unidentifiedHoldings).toEqual([
      expect.objectContaining({ name: 'ABIOMED INC', cusip: 'N/A' }),
    ]);
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
      expect(loadCapturedSpusNportSnapshots()).toHaveLength(15);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
