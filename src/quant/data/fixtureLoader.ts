// src/quant/data/fixtureLoader.ts — the keyless/CI tier of the QDR-6 intraday spine.
//
// Loads REAL captured minute bars committed under `fixtures/intraday/*.json` (produced by
// `scripts/capture-intraday-fixtures.ts` against live Alpaca IEX data). This module contains
// NO data-generation code path — it only reads and zod-validates files that already exist on
// disk under FIXTURES_DIR. Synthetic/generated bars are prohibited in this lane (QDR-6); this
// is the mechanism that keeps that true even when API keys are absent (tests/CI/demo).
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

export const FIXTURES_DIR = path.join(process.cwd(), 'src', 'quant', 'data', 'fixtures', 'intraday');

const sessionSchema = z.enum(['PRE', 'REGULAR', 'POST']);

const barSchema = z.object({
  ts: z.string().datetime(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
  session: sessionSchema,
});

export const fixtureSchema = z.object({
  symbol: z.string(),
  market: z.literal('NASDAQ'),
  date: z.string(), // YYYY-MM-DD, US/Eastern trading day this fixture captures
  source: z.enum(['ALPACA', 'YAHOO']), // provenance of the ORIGINAL real download
  capturedAt: z.string().datetime(),
  bars: z.array(barSchema).min(1),
  verification: z.object({
    premarketMovePct: z.number().nullable(),
    cumVolume: z.number(),
    classification: z.enum(['gapper', 'control']),
    priorClose: z.number().nullable(),
    priorCloseTs: z.string().datetime().nullable(),
  }),
  fundamentals: z.object({
    marketCap: z.number().positive(),
    sharesOutstanding: z.number().positive(),
    asOf: z.string().datetime(),
    releasedAt: z.string().datetime(),
    source: z.literal('SEC_XBRL'),
  }).nullable(),
});

export type IntradayFixture = z.infer<typeof fixtureSchema>;
export type IntradayFixtureBar = z.infer<typeof barSchema>;

/** Every fixture filename under FIXTURES_DIR, sorted for determinism. No other directory is ever read. */
export function listFixtureFiles(): string[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

function readFixtureFile(file: string): IntradayFixture {
  const raw = fs.readFileSync(path.join(FIXTURES_DIR, file), 'utf-8');
  return fixtureSchema.parse(JSON.parse(raw));
}

/** All committed fixtures, deterministically ordered by filename. */
export function loadAllFixtures(): IntradayFixture[] {
  return listFixtureFiles().map(readFixtureFile);
}

/** Fixtures for one symbol (any captured date), deterministically ordered. */
export function loadFixturesForSymbol(symbol: string): IntradayFixture[] {
  return loadAllFixtures().filter((f) => f.symbol === symbol);
}

/** One symbol+date fixture, or null if it was never captured. */
export function loadFixture(symbol: string, date: string): IntradayFixture | null {
  const file = `${symbol}_${date}.json`;
  if (!listFixtureFiles().includes(file)) return null;
  return readFixtureFile(file);
}
