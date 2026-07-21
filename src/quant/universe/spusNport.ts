// Captured-real SPUS membership evidence from official SEC Form N-PORT-P filings.
// N-PORT proves what the fund disclosed holding on the report date. It does NOT prove exchange
// lifecycle state or an independent per-name AAOIFI verdict, so both remain explicitly unknown.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { PointInTimeUniverseSnapshot } from './pointInTimeMembership';

export const SPUS_SEC_IDENTIFIERS = Object.freeze({
  cik: '0001742912',
  seriesId: 'S000067283',
  classId: 'C000216395',
  ticker: 'SPUS',
});

export const SPUS_NPORT_FIXTURE_DIR = path.join(
  process.cwd(),
  'src',
  'quant',
  'universe',
  'fixtures',
  'sec-spus-nport',
);

export interface SpusNportFilingReference {
  readonly accession: string;
  readonly reportDate: string;
  /** EDGAR acceptance time with the historical US/Eastern offset made explicit. */
  readonly acceptedAt: string;
  readonly primaryDocumentSha256: string;
  readonly headerDocumentSha256: string;
  readonly primaryDocumentUrl: string;
  readonly headerDocumentUrl: string;
}

const archiveUrl = (accession: string, filename: string) => {
  const compact = accession.replaceAll('-', '');
  return `https://www.sec.gov/Archives/edgar/data/1742912/${compact}/${filename}`;
};

/** Frozen official identifiers and byte hashes. Additions require captured SEC documents. */
export const SPUS_NPORT_FILINGS: readonly SpusNportFilingReference[] = Object.freeze([
  {
    accession: '0001145549-20-041804',
    reportDate: '2020-05-31',
    acceptedAt: '2020-07-28T14:40:17-04:00',
    primaryDocumentSha256: 'f7979cf82a89d684b87229927a54813f4017c458fcfdfb6e139a21513d14c107',
    headerDocumentSha256: '1dba9dd1863926c3131563a43cb5173aa2be71ce8bfee445e7e2a84e11bc75e8',
    primaryDocumentUrl: archiveUrl('0001145549-20-041804', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0001145549-20-041804',
      '0001145549-20-041804-index-headers.html',
    ),
  },
  {
    accession: '0001145549-20-063095',
    reportDate: '2020-08-31',
    acceptedAt: '2020-10-28T16:34:01-04:00',
    primaryDocumentSha256: '82b61fd2384331874686cfa318994172c3b6703f7bfadd9fc6af9ffe9b7e901f',
    headerDocumentSha256: '7007ed3f8495e6761c8aa40227b978e40e56424ec3b8cd92347d857a6cfd2d6c',
    primaryDocumentUrl: archiveUrl('0001145549-20-063095', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0001145549-20-063095',
      '0001145549-20-063095-index-headers.html',
    ),
  },
  {
    accession: '0001145549-21-004631',
    reportDate: '2020-11-30',
    acceptedAt: '2021-01-29T12:23:12-05:00',
    primaryDocumentSha256: 'cdfe007c9583863e8ec1acc94d704ce53832b446d4e67cfd0c660313437fbfa0',
    headerDocumentSha256: '12206e23ff00f203958bb8ac67ad76f59bc2da05304816ce46553f0de7b52166',
    primaryDocumentUrl: archiveUrl('0001145549-21-004631', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0001145549-21-004631',
      '0001145549-21-004631-index-headers.html',
    ),
  },
]);

export interface SpusNportHolding {
  readonly symbol: string;
  readonly name: string;
  readonly title: string;
  readonly cusip: string;
  /** Exact SEC decimal text; never coerced through binary floating point. */
  readonly balance: string;
  readonly valueUsd: string;
  readonly assetCategory: string;
  readonly issuerCategory: string;
}

export interface SpusNportSnapshot {
  readonly accession: string;
  readonly reportDate: Date;
  readonly availableAt: Date;
  readonly registrantName: string;
  readonly seriesName: string;
  readonly source: 'SEC_NPORT_P';
  readonly primaryDocumentUrl: string;
  readonly headerDocumentUrl: string;
  readonly primaryDocumentHash: string;
  readonly headerDocumentHash: string;
  readonly holdings: readonly SpusNportHolding[];
}

export class SpusNportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpusNportParseError';
  }
}

function fail(message: string): never {
  throw new SpusNportParseError(message);
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}\\s*>`, 'g');
  return Array.from(xml.matchAll(pattern), (match) => match[1]);
}

function oneBlock(xml: string, tag: string, context: string): string {
  const matches = blocks(xml, tag);
  if (matches.length !== 1) fail(`${context}: expected exactly one <${tag}>, found ${matches.length}`);
  return matches[0];
}

function decodeXml(value: string, context: string): string {
  const decoded = value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (entity, code: string) => {
    if (code === 'amp') return '&';
    if (code === 'lt') return '<';
    if (code === 'gt') return '>';
    if (code === 'quot') return '"';
    if (code === 'apos') return "'";
    const point = code.startsWith('#x')
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) {
      fail(`${context}: invalid XML entity ${entity}`);
    }
    return String.fromCodePoint(point);
  });
  if (/&(?:#[xX]?[0-9A-Za-z]+|[A-Za-z][A-Za-z0-9]+);/.test(decoded)) {
    fail(`${context}: unsupported XML entity`);
  }
  return decoded;
}

function oneText(xml: string, tag: string, context: string): string {
  const raw = oneBlock(xml, tag, context).trim();
  if (!raw || /[<>]/.test(raw)) fail(`${context}: malformed or empty <${tag}>`);
  return decodeXml(raw, `${context}.<${tag}>`);
}

function oneSelfClosingAttribute(
  xml: string,
  tag: string,
  attribute: string,
  context: string,
): string {
  const elements = Array.from(xml.matchAll(new RegExp(`<${tag}\\b([^>]*)\\/>`, 'g')));
  if (elements.length !== 1) fail(`${context}: expected exactly one <${tag}/>, found ${elements.length}`);
  const attributes = Array.from(elements[0][1].matchAll(new RegExp(`\\b${attribute}="([^"]*)"`, 'g')));
  if (attributes.length !== 1) fail(`${context}: expected exactly one ${tag}.${attribute}`);
  return decodeXml(attributes[0][1], `${context}.${tag}.${attribute}`).trim();
}

function headerValue(headerHtml: string, key: string): string {
  const matches = Array.from(headerHtml.matchAll(new RegExp(`<${key}>([^\\r\\n<]+)`, 'g')));
  if (matches.length !== 1) fail(`SEC header: expected exactly one ${key}, found ${matches.length}`);
  return matches[0][1].trim();
}

function compactAcceptance(acceptedAt: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})[+-]\d{2}:\d{2}$/.exec(acceptedAt);
  if (!match) fail(`invalid frozen acceptedAt: ${acceptedAt}`);
  return match.slice(1).join('');
}

function positiveDecimal(value: string, field: string): string {
  if (!/^\d+(?:\.\d+)?$/.test(value) || !/[1-9]/.test(value)) fail(`${field}: expected positive decimal`);
  return value;
}

/** Parse one byte-pinned SEC filing. Any malformed or ambiguous holding aborts the full snapshot. */
export function parseSpusNportDocuments(
  primaryXml: string,
  headerHtml: string,
  reference: SpusNportFilingReference,
): SpusNportSnapshot {
  const xmlHash = sha256(primaryXml);
  const headerHash = sha256(headerHtml);
  if (xmlHash !== reference.primaryDocumentSha256) fail(`${reference.accession}: primary document hash mismatch`);
  if (headerHash !== reference.headerDocumentSha256) fail(`${reference.accession}: header document hash mismatch`);

  const headerData = oneBlock(primaryXml, 'headerData', reference.accession);
  const issuerCredentials = oneBlock(headerData, 'issuerCredentials', reference.accession);
  const seriesClassInfo = oneBlock(headerData, 'seriesClassInfo', reference.accession);
  const formData = oneBlock(primaryXml, 'formData', reference.accession);
  const general = oneBlock(formData, 'genInfo', reference.accession);

  const exactIdentifiers: Array<[string, string]> = [
    [oneText(issuerCredentials, 'cik', reference.accession), SPUS_SEC_IDENTIFIERS.cik],
    [oneText(seriesClassInfo, 'seriesId', reference.accession), SPUS_SEC_IDENTIFIERS.seriesId],
    [oneText(seriesClassInfo, 'classId', reference.accession), SPUS_SEC_IDENTIFIERS.classId],
    [oneText(general, 'regCik', reference.accession), SPUS_SEC_IDENTIFIERS.cik],
    [oneText(general, 'seriesId', reference.accession), SPUS_SEC_IDENTIFIERS.seriesId],
    [oneText(general, 'repPdDate', reference.accession), reference.reportDate],
    [headerValue(headerHtml, 'ACCESSION-NUMBER'), reference.accession],
    [headerValue(headerHtml, 'TYPE'), 'NPORT-P'],
    [headerValue(headerHtml, 'PERIOD'), reference.reportDate.replaceAll('-', '')],
    [headerValue(headerHtml, 'CIK'), SPUS_SEC_IDENTIFIERS.cik],
    [headerValue(headerHtml, 'SERIES-ID'), SPUS_SEC_IDENTIFIERS.seriesId],
    [headerValue(headerHtml, 'CLASS-CONTRACT-ID'), SPUS_SEC_IDENTIFIERS.classId],
    [headerValue(headerHtml, 'CLASS-CONTRACT-TICKER-SYMBOL'), SPUS_SEC_IDENTIFIERS.ticker],
    [headerValue(headerHtml, 'ACCEPTANCE-DATETIME'), compactAcceptance(reference.acceptedAt)],
  ];
  const mismatch = exactIdentifiers.find(([actual, expected]) => actual !== expected);
  if (mismatch) fail(`${reference.accession}: identifier mismatch ${mismatch[0]} != ${mismatch[1]}`);
  if (oneText(headerData, 'submissionType', reference.accession) !== 'NPORT-P') {
    fail(`${reference.accession}: primary document is not NPORT-P`);
  }

  const holdingsRoot = oneBlock(formData, 'invstOrSecs', reference.accession);
  const holdingBlocks = blocks(holdingsRoot, 'invstOrSec');
  if (holdingBlocks.length === 0) fail(`${reference.accession}: filing contains no holdings`);
  const seen = new Set<string>();
  const holdings = holdingBlocks.map((holding, index): SpusNportHolding => {
    const context = `${reference.accession}.holding[${index}]`;
    const identifiers = oneBlock(holding, 'identifiers', context);
    const symbol = oneSelfClosingAttribute(identifiers, 'ticker', 'value', context).toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)) fail(`${context}: invalid ticker ${symbol}`);
    if (seen.has(symbol)) fail(`${context}: duplicate ticker ${symbol}`);
    seen.add(symbol);
    const cusip = oneText(holding, 'cusip', context).toUpperCase();
    if (!/^[0-9A-Z*@#]{9}$/.test(cusip)) fail(`${context}: invalid CUSIP ${cusip}`);
    return Object.freeze({
      symbol,
      name: oneText(holding, 'name', context),
      title: oneText(holding, 'title', context),
      cusip,
      balance: positiveDecimal(oneText(holding, 'balance', context), `${context}.balance`),
      valueUsd: positiveDecimal(oneText(holding, 'valUSD', context), `${context}.valUSD`),
      assetCategory: oneText(holding, 'assetCat', context),
      issuerCategory: oneText(holding, 'issuerCat', context),
    });
  });

  return Object.freeze({
    accession: reference.accession,
    reportDate: new Date(`${reference.reportDate}T00:00:00.000Z`),
    availableAt: new Date(reference.acceptedAt),
    registrantName: oneText(general, 'regName', reference.accession),
    seriesName: oneText(general, 'seriesName', reference.accession),
    source: 'SEC_NPORT_P',
    primaryDocumentUrl: reference.primaryDocumentUrl,
    headerDocumentUrl: reference.headerDocumentUrl,
    primaryDocumentHash: `sha256:${xmlHash}`,
    headerDocumentHash: `sha256:${headerHash}`,
    holdings: Object.freeze(holdings),
  });
}

export function loadCapturedSpusNportSnapshots(
  fixtureDir = SPUS_NPORT_FIXTURE_DIR,
): readonly SpusNportSnapshot[] {
  return Object.freeze(SPUS_NPORT_FILINGS.map((reference) => {
    const directory = path.join(fixtureDir, reference.accession);
    return parseSpusNportDocuments(
      fs.readFileSync(path.join(directory, 'primary_doc.xml'), 'utf8'),
      fs.readFileSync(path.join(directory, 'index-headers.html'), 'utf8'),
      reference,
    );
  }));
}

/** Latest filing actually public at decision time. Future-accepted filings are never returned. */
export function latestAvailableSpusNportSnapshot(
  snapshots: readonly SpusNportSnapshot[],
  decisionAt: Date,
): SpusNportSnapshot | null {
  const cutoff = decisionAt.getTime();
  if (!Number.isFinite(cutoff)) fail('decisionAt: invalid timestamp');
  return [...snapshots]
    .filter((snapshot) => snapshot.availableAt.getTime() <= cutoff)
    .sort((a, b) => b.availableAt.getTime() - a.availableAt.getTime())[0] ?? null;
}

/**
 * Adapter into the existing terminal guard. Membership IN/OUT is evidenced by the complete filing;
 * lifecycle and independent Sharia evidence stay unknown, so terminal validation remains blocked.
 */
export function toPointInTimeUniverseSnapshot(
  snapshot: SpusNportSnapshot,
  effectiveTo: Date | null,
  requiredSymbols: readonly string[] = [],
): PointInTimeUniverseSnapshot {
  const members = new Set(snapshot.holdings.map(({ symbol }) => symbol));
  const domain = Array.from(new Set([
    ...Array.from(members),
    ...requiredSymbols.map((symbol) => symbol.trim().toUpperCase()),
  ])).sort();
  return Object.freeze({
    id: `sec-nport:${snapshot.accession}`,
    source: `${snapshot.source}:${snapshot.primaryDocumentUrl}`,
    hash: snapshot.primaryDocumentHash,
    asOf: snapshot.reportDate,
    availableAt: snapshot.availableAt,
    effectiveFrom: snapshot.availableAt,
    effectiveTo,
    lifecycleCoverage: Object.freeze({ delisted: false, suspended: false }),
    records: Object.freeze(domain.map((symbol) => Object.freeze({
      symbol,
      membership: members.has(symbol) ? 'IN' as const : 'OUT' as const,
      lifecycle: 'UNKNOWN' as const,
      lifecycleEffectiveAt: null,
      shariaEvidence: null,
    }))),
  });
}
