// src/quant/universe/tier1SpusFixture.ts — QDR-8 Tier-1: published SPUS fund holdings
// (index-provider AAOIFI screening). Pure fixture read — no network, no persistence. HLAL Tier-1
// full holdings are NOT shipped: Wahed publishes no machine-readable daily holdings file; the
// bundled HLAL fixture is fund-level *dividend purification* only (never per-name membership).
// See README.md "HLAL N-PORT status" for the TODO instead of fabricating holdings.
import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { parseCsv } from './csv';
import type { ExclusionReason, UniverseEntry } from './types';

export const SPUS_FIXTURE_PATH = path.join(
  process.cwd(),
  'src',
  'quant',
  'universe',
  'fixtures',
  'spus-holdings-2026-07-17.csv',
);
export const HLAL_PURIFICATION_FIXTURE_PATH = path.join(
  process.cwd(),
  'src',
  'quant',
  'universe',
  'fixtures',
  'hlal-purification-q2-2026.csv',
);

export interface Tier1Row {
  symbol: string;
  name: string;
  weightPct: number;
  marketValueUsd: Prisma.Decimal;
  priceUsd: Prisma.Decimal;
  asOf: string; // ISO YYYY-MM-DD, derived from the fixture's Date column
}

/** 'MM/DD/YYYY' -> 'YYYY-MM-DD'. Fixture-local helper; never guesses a format it can't parse. */
function toIsoDate(mdY: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(mdY.trim());
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

/**
 * Parses the committed SPUS holdings CSV. Fail-closed row-by-row: a row missing a ticker, name,
 * or a positive tradable price/market value is excluded WITH a reason code, never silently
 * dropped and never included with a fabricated value.
 */
export function loadSpusTier1(opts: { filePath?: string } = {}): {
  rows: Tier1Row[];
  excluded: ExclusionReason[];
} {
  const filePath = opts.filePath ?? SPUS_FIXTURE_PATH;
  const text = fs.readFileSync(filePath, 'utf-8');
  const { rows } = parseCsv(text);

  const included: Tier1Row[] = [];
  const excluded: ExclusionReason[] = [];

  for (const r of rows) {
    const symbol = (r.StockTicker ?? '').trim().toUpperCase();
    const name = (r.SecurityName ?? '').trim();
    const price = Number(r.Price);
    const marketValue = Number(r.MarketValue);
    const weightPct = Number((r.Weightings ?? '').replace('%', ''));
    const asOf = toIsoDate(r.Date ?? '');

    if (!symbol) {
      excluded.push({ symbol: '(blank)', reasonCode: 'missing_ticker' });
      continue;
    }
    if (!name) {
      excluded.push({ symbol, reasonCode: 'missing_security_name' });
      continue;
    }
    if (!Number.isFinite(price) || price <= 0) {
      excluded.push({ symbol, reasonCode: 'zero_or_invalid_price_not_tradable' });
      continue;
    }
    if (!Number.isFinite(marketValue) || marketValue <= 0) {
      excluded.push({ symbol, reasonCode: 'zero_or_invalid_market_value' });
      continue;
    }
    if (!asOf) {
      excluded.push({ symbol, reasonCode: 'unparseable_asof_date' });
      continue;
    }

    included.push({
      symbol,
      name,
      weightPct: Number.isFinite(weightPct) ? weightPct : 0,
      marketValueUsd: new Prisma.Decimal(r.MarketValue),
      priceUsd: new Prisma.Decimal(r.Price),
      asOf,
    });
  }

  return { rows: included, excluded };
}

/** Tier-1 entries ready for assembly (buildVerifiedUniverse.ts). Market is always NASDAQ — SPUS
 * is a US-listed fund; TASI Tier-1 has no equivalent free fixture in this unit. */
export function tier1EntriesFromSpus(opts: { filePath?: string } = {}): {
  entries: UniverseEntry[];
  excluded: ExclusionReason[];
} {
  const { rows, excluded } = loadSpusTier1(opts);

  /**
   * An ETF holdings file lists everything the fund holds, and not all of it is a security. SPUS
   * discloses a `CASH&OTHER` line for its cash and accrued balances, and it was flowing straight
   * through into the tradeable universe: 217 "symbols", one of which cannot be bought.
   *
   * Two concrete harms, both of the silent-no-op class this program keeps finding:
   *   • the scheduled ingest called ingestBars('CASH&OTHER') on every run and took an HTTP 400;
   *   • any equal-weight sleeve drawn from this universe could allocate a slot to it, and the
   *     allocation would then die at execution with `no_market_data` — a position that reports
   *     success and never exists.
   *
   * Removing it is a data-artefact fix, not a universe change: a cash line was never a holding
   * decision, so no strategy's frozen prior depends on it. The exclusion is RECORDED rather than
   * silently dropped, so the count is reconcilable against the source file.
   *
   * Shape rule: tickers are uppercase alphanumerics, optionally with a dot or hyphen for class
   * shares (BRK.B, BF-B). Anything else is a line item, not a security.
   */
  const TICKER_SHAPE = /^[A-Z][A-Z0-9]*(?:[.-][A-Z0-9]+)?$/;
  const tradeable = rows.filter((r) => {
    if (TICKER_SHAPE.test(r.symbol)) return true;
    excluded.push({ symbol: r.symbol, reasonCode: 'not_a_tradeable_security' });
    return false;
  });

  const entries: UniverseEntry[] = tradeable.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    market: 'NASDAQ',
    tier: 'index-provider-screened',
    provenance: `SPUS holdings fixture (${r.asOf})`,
    // SPUS discloses fund-level AAOIFI screening only; no per-name purification ratio is
    // published for index-provider holdings — never fabricate one here. Structured (not prose)
    // reason code: QUANT_DESIGN.md QDR-8 is being amended to record this as a documented
    // exception (see README.md).
    purificationRatioBps: 'n/a — not computed',
    reasonCodes: ['FUND_LEVEL_PURIFICATION_ONLY'],
    asOf: r.asOf,
  }));
  return { entries, excluded };
}

/** Fail-closed membership check used by callers before trusting a symbol as Tier-1 verified. */
export function isInSpusFixture(symbol: string, entries: readonly UniverseEntry[]): boolean {
  const clean = symbol.trim().toUpperCase();
  return entries.some((e) => e.symbol === clean);
}

export interface HlalPurificationQuarter {
  quarter: string; // e.g. 'Q2 2026', 'FY 2020' — label as printed in the fixture
  dividendPerShare: number;
  purificationPerShare: number;
}

/**
 * HLAL fund-level dividend purification factors (never per-name; never holdings). The fixture is
 * a small hand-shaped grid (not tabular CSV): each "DVD per share" row is immediately followed by
 * its "Purification[...]" row, with quarter labels one line above. Parsed defensively — any cell
 * that doesn't parse as a finite number is skipped, never coerced to 0.
 */
export function loadHlalPurificationFactors(opts: { filePath?: string } = {}): HlalPurificationQuarter[] {
  const filePath = opts.filePath ?? HLAL_PURIFICATION_FIXTURE_PATH;
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/);
  const quarters: HlalPurificationQuarter[] = [];

  for (let i = 1; i < lines.length - 1; i++) {
    const cells = lines[i].split(',');
    if ((cells[0] ?? '').trim() !== 'DVD per share') continue;
    const labelCells = lines[i - 1]?.split(',') ?? [];
    const purifCells = lines[i + 1]?.split(',') ?? [];

    for (let col = 1; col < cells.length; col++) {
      const label = (labelCells[col] ?? '').trim();
      const dvd = Number(cells[col]);
      const purif = Number(purifCells[col]);
      if (label && Number.isFinite(dvd) && Number.isFinite(purif)) {
        quarters.push({ quarter: label, dividendPerShare: dvd, purificationPerShare: purif });
      }
    }
  }

  return quarters;
}
