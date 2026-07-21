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
    }))).toEqual([
      {
        accession: '0001145549-20-041804',
        reportDate: '2020-05-31T00:00:00.000Z',
        availableAt: '2020-07-28T18:40:17.000Z',
        holdings: 180,
      },
      {
        accession: '0001145549-20-063095',
        reportDate: '2020-08-31T00:00:00.000Z',
        availableAt: '2020-10-28T20:34:01.000Z',
        holdings: 179,
      },
      {
        accession: '0001145549-21-004631',
        reportDate: '2020-11-30T00:00:00.000Z',
        availableAt: '2021-01-29T17:23:12.000Z',
        holdings: 184,
      },
    ]);
    expect(snapshots[0].holdings.find(({ symbol }) => symbol === 'ABMD')?.cusip).toBe('003654100');
    expect(snapshots.every(({ holdings }) => new Set(holdings.map(({ symbol }) => symbol)).size === holdings.length))
      .toBe(true);
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
      expect(loadCapturedSpusNportSnapshots()).toHaveLength(3);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
