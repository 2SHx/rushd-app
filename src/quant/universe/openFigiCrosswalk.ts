// src/quant/universe/openFigiCrosswalk.ts — a hash-pinned, offline ISIN->ticker crosswalk for
// identity resolution ONLY (QDR-14). It exists to close the 10-filing, 1,004-day SPUS N-PORT
// membership hole (src/quant/universe/fixtures/sec-spus-nport-unparseable/), where every holding
// discloses an ISIN but the SEC schema of the era did not yet require a <ticker/> element. This is
// NOT a live lookup: OpenFIGI (api.openfigi.com/v3/mapping, free/keyless at this volume) was
// queried once at authoring time, restricted to exchCode "US" (the composite NASDAQ/NYSE tape —
// the "NASDAQ-only" scope decided for this crosswalk), and every response — resolved or not — was
// captured verbatim into the hash-pinned fixture this module loads. A run of the engine or
// backtester NEVER calls OpenFIGI; resolveIsinToTicker below performs zero I/O.
//
// The ticker-reuse hazard this exists to defend against: a ticker freed by a delisting can be
// reassigned to an unrelated company, so a PRESENT-DAY ISIN->ticker map could silently attach a
// 2021 filing's ISIN to today's unrelated holder of that ticker. The mandatory defense is
// `resolveIsinToTicker`'s name cross-check: the OpenFIGI-resolved company name must match the
// filing's OWN disclosed <name> element (see `normalizeCompanyName` below for the exact rule and
// its rationale). A mismatch is EXCLUDED, never guessed past.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv } from './csv';

export const OPENFIGI_CROSSWALK_FIXTURE_PATH = path.join(
  process.cwd(),
  'src',
  'quant',
  'universe',
  'fixtures',
  'openfigi-isin-crosswalk',
  'spus-nport-unparseable-isins.json',
);

/** Pinned sha256 of the exact captured fixture file. Any drift aborts loading. */
export const OPENFIGI_CROSSWALK_FIXTURE_SHA256 =
  'e1d040f1f6dfd9fb5d99685e6a079c74208b667854539f48132f969d6a29e4cf';

export const CURATED_OPENFIGI_RENAME_FIXTURE_PATH = path.join(
  process.cwd(),
  'src',
  'quant',
  'universe',
  'fixtures',
  'openfigi-isin-crosswalk',
  'held-roster-name-mismatches.json',
);
export const CURATED_OPENFIGI_RENAME_FIXTURE_SHA256 =
  '7bc56ebea62e460de9fa09167bb967b4f09477e382909deec214632a6c804306';

const AUTHORITATIVE_SPUS_ROSTER_PATH = path.join(
  process.cwd(),
  'src',
  'quant',
  'universe',
  'fixtures',
  'spus-holdings-2026-07-17.csv',
);

export type CuratedOpenFigiRenameBasis =
  | 'US_ISIN_CUSIP_EXACT'
  | 'FOREIGN_ISIN_TICKER_AND_ROSTER_NAME';

export interface CuratedOpenFigiRenameEntry {
  readonly isin: string;
  readonly ticker: string;
  readonly rosterCusip: string;
  readonly rosterName: string;
  readonly openFigiName: string;
  readonly basis: CuratedOpenFigiRenameBasis;
}

export interface CuratedOpenFigiRenameArtifact {
  readonly schemaVersion: 1;
  readonly entryCount: 24;
  readonly sourceHashes: {
    readonly openFigiCaptureSha256: string;
    readonly authoritativeRosterSha256: string;
  };
  /** Unmapped held identities remain UNKNOWN. This artifact never supplies evidence for OUT. */
  readonly heldUnknownPolicy: 'UNMAPPED_HELD_REMAINS_MEMBERSHIP_UNKNOWN_NEVER_OUT';
  /** Separate OpenFIGI NOT_FOUND/current-roster matches; intentionally not executable mappings. */
  readonly openNotFoundRosterSymbols: readonly string[];
  readonly entries: readonly CuratedOpenFigiRenameEntry[];
}

export interface OpenFigiFoundEntry {
  readonly isin: string;
  readonly status: 'FOUND';
  readonly ticker: string;
  readonly openFigiName: string;
  readonly figi: string;
  readonly compositeFigi: string;
  readonly exchCode: string;
  readonly marketSector: string;
  readonly securityType2: string;
}

export interface OpenFigiNotFoundEntry {
  readonly isin: string;
  readonly status: 'NOT_FOUND';
  readonly reason: string;
}

export type OpenFigiCrosswalkEntry = OpenFigiFoundEntry | OpenFigiNotFoundEntry;

export interface OpenFigiCrosswalkCapture {
  readonly schemaVersion: number;
  readonly capturedAt: string;
  readonly source: string;
  readonly endpoint: string;
  readonly entryCount: number;
  readonly foundCount: number;
  readonly notFoundCount: number;
  readonly entries: readonly OpenFigiCrosswalkEntry[];
}

export class OpenFigiCrosswalkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenFigiCrosswalkError';
  }
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Reads and hash-verifies the captured fixture. Never touches the network. Throws
 * `OpenFigiCrosswalkError` if the file is missing, malformed, or its bytes have drifted from the
 * pinned hash — a silent edit to captured evidence must never pass unnoticed.
 */
export function loadOpenFigiCrosswalkCapture(
  fixturePath = OPENFIGI_CROSSWALK_FIXTURE_PATH,
): OpenFigiCrosswalkCapture {
  let raw: string;
  try {
    raw = fs.readFileSync(fixturePath, 'utf8');
  } catch (err) {
    throw new OpenFigiCrosswalkError(
      `openFigiCrosswalk: unable to read fixture at ${fixturePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const hash = sha256(raw);
  if (hash !== OPENFIGI_CROSSWALK_FIXTURE_SHA256) {
    throw new OpenFigiCrosswalkError(
      `openFigiCrosswalk: fixture hash mismatch (expected ${OPENFIGI_CROSSWALK_FIXTURE_SHA256}, got ${hash}) — captured evidence must not be edited`,
    );
  }
  const parsed = JSON.parse(raw) as OpenFigiCrosswalkCapture;
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    throw new OpenFigiCrosswalkError('openFigiCrosswalk: fixture has no entries');
  }
  return Object.freeze({ ...parsed, entries: Object.freeze(parsed.entries) });
}

/** Builds an ISIN-keyed lookup Map from a loaded capture. */
export function indexCrosswalkByIsin(
  capture: OpenFigiCrosswalkCapture,
): ReadonlyMap<string, OpenFigiCrosswalkEntry> {
  const map = new Map<string, OpenFigiCrosswalkEntry>();
  for (const entry of capture.entries) {
    if (map.has(entry.isin)) {
      throw new OpenFigiCrosswalkError(`openFigiCrosswalk: duplicate ISIN in fixture: ${entry.isin}`);
    }
    map.set(entry.isin, entry);
  }
  return map;
}

/**
 * Builds the separately reviewed override index. Duplicate ISINs and two ISINs claiming the same
 * current ticker are rejected rather than resolved by ordering. Open NOT_FOUND items never enter
 * this map, so later membership wiring cannot accidentally treat them as resolved.
 */
export function indexCuratedOpenFigiRenamesByIsin(
  artifact: CuratedOpenFigiRenameArtifact,
): ReadonlyMap<string, CuratedOpenFigiRenameEntry> {
  const byIsin = new Map<string, CuratedOpenFigiRenameEntry>();
  const isinByTicker = new Map<string, string>();
  for (const entry of artifact.entries) {
    const prior = byIsin.get(entry.isin);
    if (prior) {
      const kind = prior.ticker === entry.ticker ? 'duplicate' : 'conflicting';
      throw new OpenFigiCrosswalkError(
        `openFigiCrosswalk: ${kind} curated ISIN mapping for ${entry.isin}`,
      );
    }
    const priorIsin = isinByTicker.get(entry.ticker);
    if (priorIsin) {
      throw new OpenFigiCrosswalkError(
        `openFigiCrosswalk: conflicting curated ticker ${entry.ticker} for ${priorIsin} and ${entry.isin}`,
      );
    }
    byIsin.set(entry.isin, entry);
    isinByTicker.set(entry.ticker, entry.isin);
  }
  return byIsin;
}

function curatedError(message: string): never {
  throw new OpenFigiCrosswalkError(`openFigiCrosswalk: curated rename artifact ${message}`);
}

/** Validates every curated decision against both byte-pinned source artifacts. */
export function validateCuratedOpenFigiRenameArtifact(
  artifact: CuratedOpenFigiRenameArtifact,
  openFigiCapture = loadOpenFigiCrosswalkCapture(),
  rosterText = fs.readFileSync(AUTHORITATIVE_SPUS_ROSTER_PATH, 'utf8'),
): CuratedOpenFigiRenameArtifact {
  if (artifact.schemaVersion !== 1 || artifact.entryCount !== 24 || artifact.entries.length !== 24) {
    curatedError('must contain exactly 24 schema-v1 decisions');
  }
  if (artifact.heldUnknownPolicy !== 'UNMAPPED_HELD_REMAINS_MEMBERSHIP_UNKNOWN_NEVER_OUT') {
    curatedError('must preserve unresolved held identities as MEMBERSHIP_UNKNOWN');
  }
  const expectedOpen = ['ANET', 'COO', 'DD', 'LIN', 'LRCX', 'STX', 'TEL'];
  if (artifact.openNotFoundRosterSymbols.join(',') !== expectedOpen.join(',')) {
    curatedError('must retain the seven NOT_FOUND roster matches as open items');
  }
  if (artifact.sourceHashes.openFigiCaptureSha256 !== OPENFIGI_CROSSWALK_FIXTURE_SHA256) {
    curatedError('references an unexpected OpenFIGI source hash');
  }
  if (sha256(rosterText) !== artifact.sourceHashes.authoritativeRosterSha256) {
    curatedError('authoritative 217-name roster hash mismatch');
  }

  const rawByIsin = indexCrosswalkByIsin(openFigiCapture);
  const rosterByTicker = new Map(
    parseCsv(rosterText).rows.map((row) => [row.StockTicker, row] as const),
  );
  const index = indexCuratedOpenFigiRenamesByIsin(artifact);
  for (const entry of artifact.entries) {
    if (!/^[A-Z]{2}[A-Z0-9]{10}$/.test(entry.isin) || !/^[A-Z][A-Z0-9.-]{0,15}$/.test(entry.ticker)) {
      curatedError(`has malformed identifiers for ${entry.isin}`);
    }
    const raw = rawByIsin.get(entry.isin);
    if (!raw || raw.status !== 'FOUND' || raw.ticker !== entry.ticker || raw.openFigiName !== entry.openFigiName) {
      curatedError(`${entry.isin} does not exactly match the pinned OpenFIGI capture`);
    }
    const roster = rosterByTicker.get(entry.ticker);
    if (!roster || roster.CUSIP !== entry.rosterCusip || roster.SecurityName !== entry.rosterName) {
      curatedError(`${entry.isin} does not exactly match the pinned authoritative roster row`);
    }
    if (entry.isin.startsWith('US')) {
      if (entry.basis !== 'US_ISIN_CUSIP_EXACT' || entry.isin.slice(2, 11) !== entry.rosterCusip) {
        curatedError(`${entry.isin} lacks exact ISIN-derived CUSIP evidence`);
      }
    } else if (entry.basis !== 'FOREIGN_ISIN_TICKER_AND_ROSTER_NAME') {
      curatedError(`${entry.isin} lacks foreign-ISIN ticker plus roster-name evidence`);
    }
  }
  for (const symbol of artifact.openNotFoundRosterSymbols) {
    if (artifact.entries.some((entry) => entry.ticker === symbol)) {
      curatedError(`${symbol} open item leaked into the resolved index`);
    }
  }
  return Object.freeze({
    ...artifact,
    sourceHashes: Object.freeze({ ...artifact.sourceHashes }),
    openNotFoundRosterSymbols: Object.freeze([...artifact.openNotFoundRosterSymbols]),
    entries: Object.freeze(artifact.entries.map((entry) => Object.freeze({ ...entry }))),
  });
}

/** Loads the 24 reviewed rename decisions. Offline only; any byte/source drift fails closed. */
export function loadCuratedOpenFigiRenameArtifact(
  fixturePath = CURATED_OPENFIGI_RENAME_FIXTURE_PATH,
): CuratedOpenFigiRenameArtifact {
  let raw: string;
  try {
    raw = fs.readFileSync(fixturePath, 'utf8');
  } catch (err) {
    throw new OpenFigiCrosswalkError(
      `openFigiCrosswalk: unable to read curated rename fixture at ${fixturePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const hash = sha256(raw);
  if (hash !== CURATED_OPENFIGI_RENAME_FIXTURE_SHA256) {
    throw new OpenFigiCrosswalkError(
      `openFigiCrosswalk: curated rename fixture hash mismatch (expected ${CURATED_OPENFIGI_RENAME_FIXTURE_SHA256}, got ${hash})`,
    );
  }
  let parsed: CuratedOpenFigiRenameArtifact;
  try {
    parsed = JSON.parse(raw) as CuratedOpenFigiRenameArtifact;
  } catch (err) {
    throw new OpenFigiCrosswalkError(
      `openFigiCrosswalk: malformed curated rename fixture: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!parsed || !Array.isArray(parsed.entries) || !Array.isArray(parsed.openNotFoundRosterSymbols)) {
    curatedError('is missing required arrays');
  }
  return validateCuratedOpenFigiRenameArtifact(parsed);
}

// A fixed, conservative list of trailing legal-entity boilerplate tokens. Stripped repeatedly
// from the end of a normalized name so "X INC", "X INCORPORATED", "X CORP", "X CORPORATION",
// "X CO", "X COMPANY", "X LTD", "X LIMITED", "X PLC", "X LLC", "X HOLDINGS", "X HOLDING",
// "X GROUP" all collapse to "X". Deliberately does NOT include anything that carries identity
// information (no industry words, no geography, no product terms) — see normalizeCompanyName's
// doc comment for why this list stops here and goes no further.
const TRAILING_LEGAL_SUFFIXES = [
  'INCORPORATED', 'INC', 'CORPORATION', 'CORP', 'COMPANY', 'CO', 'LIMITED', 'LTD', 'PLC', 'LLC',
  'HOLDINGS', 'HOLDING', 'GROUP',
];

/**
 * Normalizes a company name for the mandatory ticker-reuse cross-check.
 *
 * Rule: NORMALIZED EXACT MATCH — never fuzzy/edit-distance. Steps: uppercase; drop an SEC
 * jurisdiction suffix after a trailing "/" (e.g. "...INC/DELAWARE" -> "...INC"); collapse "&" to
 * " AND "; drop periods, commas, and apostrophes; collapse whitespace; strip a leading "THE "; then
 * repeatedly strip one trailing legal-entity token (see TRAILING_LEGAL_SUFFIXES) until none match.
 *
 * Why exact-after-normalization and not fuzzy: this check exists to catch ticker reuse — a freed
 * ticker reassigned to an unrelated company. Two unrelated companies can easily have names a small
 * edit distance apart (e.g. "Cerner Corp" vs "Ceridian Corp"), so any distance-threshold fuzzy
 * match would materially weaken the exact defense this crosswalk was built for. Exact-after-
 * normalization only forgives punctuation/boilerplate noise (".", "&"/"and", "Inc."/"Inc",
 * "/Delaware" jurisdiction suffixes, case) — never a genuine difference in what the company is
 * called. The deliberate cost: a same-entity RENAME (e.g. "Facebook Inc" -> "Meta Platforms Inc",
 * "Cabot Oil & Gas Corp" -> "Coterra Energy Inc" post-merger, "NortonLifeLock Inc" -> "Gen Digital
 * Inc") also fails this check and is EXCLUDED even though it is not reuse. That is intentional:
 * this module cannot mechanically distinguish "same entity, renamed" from "different entity, same
 * ticker" without external verification it does not have, so it fails closed on both rather than
 * guess. A later, separately-reviewed pass may special-case confirmed renames; this module never
 * does so implicitly.
 */
export function normalizeCompanyName(rawName: string): string {
  let name = rawName.toUpperCase().trim();
  name = name.replace(/\/[A-Z .]+$/, ''); // drop trailing "/Delaware", "/The", "/MD", etc.
  name = name.replace(/&/g, ' AND ');
  name = name.replace(/[.,']/g, '');
  name = name.replace(/\s+/g, ' ').trim();
  if (name.startsWith('THE ')) name = name.slice(4);
  let stripped = true;
  while (stripped) {
    stripped = false;
    for (const suffix of TRAILING_LEGAL_SUFFIXES) {
      const withSuffix = ` ${suffix}`;
      if (name.endsWith(withSuffix)) {
        name = name.slice(0, -withSuffix.length).trim();
        stripped = true;
        break;
      }
    }
  }
  return name;
}

export type CrosswalkResolution =
  | {
      readonly status: 'RESOLVED';
      readonly isin: string;
      readonly ticker: string;
      readonly filingName: string;
      readonly openFigiName: string;
    }
  | {
      readonly status: 'EXCLUDED';
      readonly isin: string;
      readonly filingName: string;
      readonly reason: 'NOT_IN_CROSSWALK' | 'NO_US_COMPOSITE_LISTING' | 'NAME_MISMATCH';
      readonly detail: string;
    };

/**
 * Pure identity resolution: given an ISIN a filing disclosed and the company name that SAME
 * filing disclosed for it, returns the crosswalk-resolved ticker or a recorded exclusion reason.
 * Performs no I/O — `crosswalk` must come from `indexCrosswalkByIsin(loadOpenFigiCrosswalkCapture())`.
 * Never fabricates: an ISIN absent from the captured fixture, one OpenFIGI had no US composite
 * listing for, and one whose name fails the mandatory cross-check are each a distinct, honest
 * EXCLUDED reason — never silently coerced into a guess.
 */
export function resolveIsinToTicker(
  isin: string,
  filingName: string,
  crosswalk: ReadonlyMap<string, OpenFigiCrosswalkEntry>,
): CrosswalkResolution {
  const entry = crosswalk.get(isin);
  if (!entry) {
    return {
      status: 'EXCLUDED',
      isin,
      filingName,
      reason: 'NOT_IN_CROSSWALK',
      detail: `${isin} was never captured into the OpenFIGI crosswalk fixture`,
    };
  }
  if (entry.status === 'NOT_FOUND') {
    return {
      status: 'EXCLUDED',
      isin,
      filingName,
      reason: 'NO_US_COMPOSITE_LISTING',
      detail: entry.reason,
    };
  }
  const normalizedFiling = normalizeCompanyName(filingName);
  const normalizedOpenFigi = normalizeCompanyName(entry.openFigiName);
  if (normalizedFiling !== normalizedOpenFigi) {
    return {
      status: 'EXCLUDED',
      isin,
      filingName,
      reason: 'NAME_MISMATCH',
      detail: `filing name "${filingName}" (normalized "${normalizedFiling}") does not match OpenFIGI name "${entry.openFigiName}" (normalized "${normalizedOpenFigi}") for ${isin}`,
    };
  }
  return {
    status: 'RESOLVED',
    isin,
    ticker: entry.ticker,
    filingName,
    openFigiName: entry.openFigiName,
  };
}
