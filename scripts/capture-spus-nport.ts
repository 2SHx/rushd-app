#!/usr/bin/env node
// Explicit, bounded capture of frozen official SEC filings. This is never imported by runtime code.
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  parseSpusNportDocuments,
  SPUS_NPORT_FILINGS,
  SPUS_NPORT_FIXTURE_DIR,
} from '../src/quant/universe/spusNport';

const SEC_HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };

function maxFilings(): number {
  const raw = process.argv.find((value) => value.startsWith('--max='))?.slice('--max='.length);
  if (raw === undefined) return SPUS_NPORT_FILINGS.length;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > SPUS_NPORT_FILINGS.length) {
    throw new Error(`--max must be an integer from 1 to ${SPUS_NPORT_FILINGS.length}`);
  }
  return parsed;
}

async function download(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: SEC_HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`SEC download failed (${response.status}): ${url}`);
  return response.text();
}

async function writeImmutable(filePath: string, contents: string): Promise<'captured' | 'verified'> {
  try {
    const existing = await fs.readFile(filePath, 'utf8');
    if (existing !== contents) throw new Error(`refusing to overwrite changed immutable fixture: ${filePath}`);
    return 'verified';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.writeFile(filePath, contents, { flag: 'wx' });
  return 'captured';
}

export async function captureSpusNport(): Promise<void> {
  for (const reference of SPUS_NPORT_FILINGS.slice(0, maxFilings())) {
    const [primaryXml, headerHtml] = await Promise.all([
      download(reference.primaryDocumentUrl),
      download(reference.headerDocumentUrl),
    ]);
    const snapshot = parseSpusNportDocuments(primaryXml, headerHtml, reference);
    const directory = path.join(SPUS_NPORT_FIXTURE_DIR, reference.accession);
    await fs.mkdir(directory, { recursive: true });
    const primaryStatus = await writeImmutable(path.join(directory, 'primary_doc.xml'), primaryXml);
    const headerStatus = await writeImmutable(path.join(directory, 'index-headers.html'), headerHtml);
    console.log(
      `${reference.accession}: ${snapshot.holdings.length} holdings, report=${reference.reportDate}, `
      + `available=${snapshot.availableAt.toISOString()}, files=${primaryStatus}/${headerStatus}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  captureSpusNport().catch((error) => {
    console.error(`capture-spus-nport failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
