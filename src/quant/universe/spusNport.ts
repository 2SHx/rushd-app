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
  {
    accession: '0001387131-23-012885',
    reportDate: '2023-08-31',
    acceptedAt: '2023-10-30T13:02:03-04:00',
    primaryDocumentSha256: '25afeec12f2b93e1737078ac09a7e34dbb1f5718f1a7ee10cf46d40d38693036',
    headerDocumentSha256: 'e9f7f810dffd5b7b95ab620f30db3a2af59f3ef754e61d0acfa93957cc2f64de',
    primaryDocumentUrl: archiveUrl('0001387131-23-012885', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0001387131-23-012885',
      '0001387131-23-012885-index-headers.html',
    ),
  },
  {
    accession: '0002000324-24-000218',
    reportDate: '2023-11-30',
    acceptedAt: '2024-01-29T15:44:49-05:00',
    primaryDocumentSha256: 'd030ddc0dedc54cb67fc240b8189680a8700e3385cfee97e862fc7fbd45559a2',
    headerDocumentSha256: '6dd1dcde7df36a270a7a4299405d3577a55bac3d16c8240f6fa84c3a45bbb540',
    primaryDocumentUrl: archiveUrl('0002000324-24-000218', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-24-000218',
      '0002000324-24-000218-index-headers.html',
    ),
  },
  {
    accession: '0002000324-24-001338',
    reportDate: '2024-02-29',
    acceptedAt: '2024-04-26T15:37:49-04:00',
    primaryDocumentSha256: 'b60c6c9d5c4cd01119c83e1720bbbe328034453a21e014647b012a73ce58b6ca',
    headerDocumentSha256: '6a31c669f2c3a1aed72b24d4e1a3967a4d739d8e9a8107951d0b4e9a4cea45ea',
    primaryDocumentUrl: archiveUrl('0002000324-24-001338', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-24-001338',
      '0002000324-24-001338-index-headers.html',
    ),
  },
  {
    accession: '0002000324-24-001962',
    reportDate: '2024-05-31',
    acceptedAt: '2024-07-26T12:20:33-04:00',
    primaryDocumentSha256: '120b74100e9e39fa89f6d364cc680eeee1c1e2a07baf2edc474875ec1da69726',
    headerDocumentSha256: '02d27a96d8ee377a9b3f4a4dd64ed86ade95a33e8124f449ebaea1a72b59e834',
    primaryDocumentUrl: archiveUrl('0002000324-24-001962', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-24-001962',
      '0002000324-24-001962-index-headers.html',
    ),
  },
  {
    accession: '0002000324-24-003031',
    reportDate: '2024-08-31',
    acceptedAt: '2024-10-25T13:17:39-04:00',
    primaryDocumentSha256: '852d9586d8d0a5b5048c1e8cfd2a4f7750de504976ef0a482858d0b0e6439131',
    headerDocumentSha256: '82d5b9495fc0552ad66d01d88bab97a4a210e5345d94f09055f346785ba95eae',
    primaryDocumentUrl: archiveUrl('0002000324-24-003031', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-24-003031',
      '0002000324-24-003031-index-headers.html',
    ),
  },
  {
    accession: '0002000324-25-000189',
    reportDate: '2024-11-30',
    acceptedAt: '2025-01-29T14:40:05-05:00',
    primaryDocumentSha256: 'ff9a105a658de3b0fe7ab80bbfd0ad147861874596c28a60d9cd848675171fb7',
    headerDocumentSha256: '666390cb95baaf8082f528faaaf5e332e66f508e17fd95ba242b6f658842e02b',
    primaryDocumentUrl: archiveUrl('0002000324-25-000189', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-25-000189',
      '0002000324-25-000189-index-headers.html',
    ),
  },
  {
    accession: '0002000324-25-001560',
    reportDate: '2025-02-28',
    acceptedAt: '2025-04-29T12:04:54-04:00',
    primaryDocumentSha256: 'e8abcf0f2ecbf52bb1d116d2c817754f30bb09318ada7e1f6add5a4abdfad2aa',
    headerDocumentSha256: '543102db5bb27d0bf7f0e87707271ec05d0666989d47dfef521b7e2196ef62ce',
    primaryDocumentUrl: archiveUrl('0002000324-25-001560', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-25-001560',
      '0002000324-25-001560-index-headers.html',
    ),
  },
  {
    accession: '0002000324-25-002489',
    reportDate: '2025-05-31',
    acceptedAt: '2025-07-29T10:04:01-04:00',
    primaryDocumentSha256: '5695de6a3f5483254780255e066fc332af1697028d86049cb0930dc5c0fc9cc4',
    headerDocumentSha256: 'a2470d764fcf06c37a9d495ef61dec500f8277d315f8082178e30c34261ce2e9',
    primaryDocumentUrl: archiveUrl('0002000324-25-002489', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-25-002489',
      '0002000324-25-002489-index-headers.html',
    ),
  },
  {
    accession: '0002000324-25-004070',
    reportDate: '2025-08-31',
    acceptedAt: '2025-10-29T10:52:28-04:00',
    primaryDocumentSha256: 'cc825c8fdad03c442d24b549da1a20e2c2ddc100225f5cbe33976b3103d6f698',
    headerDocumentSha256: 'b89af07c632f7e0f8ef417737f8404366eccb9c00d06ecfba460a9732121fb46',
    primaryDocumentUrl: archiveUrl('0002000324-25-004070', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-25-004070',
      '0002000324-25-004070-index-headers.html',
    ),
  },
  {
    accession: '0002000324-26-000257',
    reportDate: '2025-11-30',
    acceptedAt: '2026-01-28T13:48:50-05:00',
    primaryDocumentSha256: '0a454820b48a8314478d73c2b8e36fdb4075312023edbcceeaf513312b62cc59',
    headerDocumentSha256: 'd9f7b5b261bd4222f89c65b706a237ee2bb1519560cdee323d967e010392a0ae',
    primaryDocumentUrl: archiveUrl('0002000324-26-000257', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-26-000257',
      '0002000324-26-000257-index-headers.html',
    ),
  },
  {
    accession: '0002000324-26-001717',
    reportDate: '2026-02-28',
    acceptedAt: '2026-04-27T14:11:42-04:00',
    primaryDocumentSha256: 'c999e563b342723ed9f0d15d2c4be5679958608e968bb5c32793e8d22016aacb',
    headerDocumentSha256: 'ac45538f727ef6066499285ef4c4a66564136e73d3ae07615f75f53ff8b9997e',
    primaryDocumentUrl: archiveUrl('0002000324-26-001717', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-26-001717',
      '0002000324-26-001717-index-headers.html',
    ),
  },
  {
    accession: '0002000324-26-003242',
    reportDate: '2026-05-31',
    acceptedAt: '2026-07-29T15:21:24-04:00',
    primaryDocumentSha256: 'a17d9ff488d8802b8afe944999306146b296eead2fcc99e35933e182663dd55c',
    headerDocumentSha256: '4dfb5245f6c122f619c6f7e950ab9a5bb8d807106a2c0f14c49c16a98db672ec',
    primaryDocumentUrl: archiveUrl('0002000324-26-003242', 'primary_doc.xml'),
    headerDocumentUrl: archiveUrl(
      '0002000324-26-003242',
      '0002000324-26-003242-index-headers.html',
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

/**
 * A row the filer itself marked as carrying no tradable security identifier
 * (cusip literal "N/A", no ticker, valUSD "0" — e.g. a merger contingent-value-right).
 * Kept for provenance; never contributes to universe membership.
 */
export interface SpusNportUnidentifiedHolding {
  readonly name: string;
  readonly title: string;
  readonly cusip: string;
  readonly balance: string;
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
  readonly unidentifiedHoldings: readonly SpusNportUnidentifiedHolding[];
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

function zeroOrOneSelfClosingAttribute(
  xml: string,
  tag: string,
  attribute: string,
  context: string,
): string | null {
  const elements = Array.from(xml.matchAll(new RegExp(`<${tag}\\b([^>]*)\\/>`, 'g')));
  if (elements.length === 0) return null;
  if (elements.length !== 1) fail(`${context}: expected zero or one <${tag}/>, found ${elements.length}`);
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
  const unidentified: SpusNportUnidentifiedHolding[] = [];
  const holdings = holdingBlocks.flatMap((holding, index): SpusNportHolding[] => {
    const context = `${reference.accession}.holding[${index}]`;
    const identifiers = oneBlock(holding, 'identifiers', context);
    const tickerValue = zeroOrOneSelfClosingAttribute(identifiers, 'ticker', 'value', context);
    const cusipRaw = oneText(holding, 'cusip', context).toUpperCase();
    const valueRaw = oneText(holding, 'valUSD', context);

    // A tiny, real, recurring SEC artifact: a merger contingent-value-right (e.g. ABIOMED, TPG
    // CVRs) is filed with valUSD "0" and either no ticker at all or a non-market internal code
    // in the ticker field (the filer's own explicit "worthless stub, not an investable position"
    // signal) — not ambiguous or malformed data. A $0 line item can never carry point-in-time
    // universe-membership meaning, so it is captured separately and excluded from `holdings`
    // instead of aborting the whole snapshot. Any nonzero-value holding still fails closed below.
    if (valueRaw === '0') {
      unidentified.push(Object.freeze({
        name: oneText(holding, 'name', context),
        title: oneText(holding, 'title', context),
        cusip: cusipRaw,
        balance: oneText(holding, 'balance', context),
        assetCategory: oneText(holding, 'assetCat', context),
        issuerCategory: oneText(holding, 'issuerCat', context),
      }));
      return [];
    }
    if (tickerValue === null) {
      fail(`${context}: missing ticker for an identifiable holding (cusip ${cusipRaw}, valUSD ${valueRaw})`);
    }

    const symbol = tickerValue.toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,15}$/.test(symbol)) fail(`${context}: invalid ticker ${symbol}`);
    if (seen.has(symbol)) fail(`${context}: duplicate ticker ${symbol}`);
    seen.add(symbol);
    // Foreign-domiciled issuers legitimately have no CUSIP and file the literal sentinel "N/A"
    // instead (alongside an ISIN, which this parser does not need for symbol identity since a
    // valid ticker is already present). Any other non-conforming CUSIP still fails closed.
    if (cusipRaw !== 'N/A' && !/^[0-9A-Z*@#]{9}$/.test(cusipRaw)) fail(`${context}: invalid CUSIP ${cusipRaw}`);
    return [Object.freeze({
      symbol,
      name: oneText(holding, 'name', context),
      title: oneText(holding, 'title', context),
      cusip: cusipRaw,
      balance: positiveDecimal(oneText(holding, 'balance', context), `${context}.balance`),
      valueUsd: positiveDecimal(valueRaw, `${context}.valUSD`),
      assetCategory: oneText(holding, 'assetCat', context),
      issuerCategory: oneText(holding, 'issuerCat', context),
    })];
  });
  if (holdings.length === 0) fail(`${reference.accession}: filing contains no identified holdings`);

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
    unidentifiedHoldings: Object.freeze(unidentified),
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
