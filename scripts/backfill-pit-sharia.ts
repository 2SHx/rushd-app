// Point-in-time AAOIFI screening inputs for the whole panel, archived to disk.
//
// WHY THIS UNBLOCKS EVERYTHING: today's measurements are bounded at 2020-11 because that is when
// SPUS's first N-PORT filing became public, and N-PORT was the only source of point-in-time
// membership. Screening the names OURSELVES removes that dependency — the bar archive already
// reaches 2016-01-04, so the window roughly doubles from 5.8 to 10.6 years. A phase-robustness
// check on QDR-24 showed an identical rule scoring 7.73%-17.27% depending only on which trading day
// of the month it decided (sd 3.62pp), which means the binding constraint on this whole programme
// is SAMPLE SIZE, not strategy design. Doubling the window is the only lever that touches it.
//
// IT ALSO REMOVES A PENALTY: N-PORT membership lags 60+ days on a quarterly cadence, so every
// point-in-time book measured today traded a universe up to five months stale. Screening at the
// decision date has no such lag.
//
// NOTHING NEW IS IMPLEMENTED HERE. The fetch/selection is `fetchPitFundamentalsHistory`, already
// tested in pitFundamentalsBackfill.test.ts, and the screen itself will be `computeAaoifiScreen`.
// This file only resolves CIKs, drives that pipeline over the panel, and writes an archive.
import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fetchPitFundamentalsHistory } from '../src/quant/data/pitFundamentalsFetch';
import type { PitFundamentalsFiling } from '../src/quant/data/pitFundamentalsBackfill';
import { resolveCik } from './backfill-gross-profitability';

export const SHARIA_ARCHIVE = path.join(process.cwd(), 'data', 'fundamentals', 'pit-sharia.json.gz');
const SPACING_MS = 140;

export interface ShariaArchive {
  fetchedAt: string;
  /** symbol -> every annual and quarterly filing, each carrying its own `releasedAt`. */
  filings: Record<string, PitFundamentalsFiling[]>;
  names: Record<string, string>;
  unresolved: { symbol: string; reason: string }[];
}

export function readShariaArchive(): ShariaArchive | null {
  if (!existsSync(SHARIA_ARCHIVE)) return null;
  return JSON.parse(gunzipSync(readFileSync(SHARIA_ARCHIVE)).toString('utf8')) as ShariaArchive;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { loadCapturedSpusNportSnapshots } = await import('../src/quant/universe/spusNport');
  const { nasdaqIngestRoster } = await import('../src/quant/universe/ingestRoster');

  const names = new Map<string, string>();
  for (const s of nasdaqIngestRoster()) names.set(s, '');
  for (const snap of loadCapturedSpusNportSnapshots() as any[]) {
    for (const h of snap.holdings ?? []) if (h.symbol) names.set(h.symbol, h.name ?? names.get(h.symbol) ?? '');
  }
  for (const skip of ['CASH&OTHER', 'SPUS', 'HLAL']) names.delete(skip);

  const tickerMap = await (await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' },
  })).json() as Record<string, { cik_str: number; ticker: string; title: string }>;
  const byTicker = new Map<string, { cik: number; title: string }>();
  for (const r of Object.values(tickerMap)) byTicker.set(r.ticker, { cik: r.cik_str, title: r.title });

  const symbols = Array.from(names.keys()).sort();
  console.log(`PIT Sharia inputs for ${symbols.length} symbols\n`);

  // RESUMABLE. An existing archive is loaded and its symbols skipped, so a network failure costs
  // one symbol rather than the whole run — the first attempt died on a timeout at symbol 94 of 324
  // and threw away every fetch before it.
  const archive: ShariaArchive = readShariaArchive()
    ?? { fetchedAt: new Date().toISOString(), filings: {}, names: {}, unresolved: [] };
  const alreadyHave = new Set(Object.keys(archive.filings));
  if (alreadyHave.size) console.log(`resuming: ${alreadyHave.size} symbols already archived\n`);
  archive.unresolved = []; // recomputed each pass; a name may resolve on a retry

  mkdirSync(path.dirname(SHARIA_ARCHIVE), { recursive: true });
  const flush = () => {
    archive.fetchedAt = new Date().toISOString();
    writeFileSync(SHARIA_ARCHIVE, gzipSync(Buffer.from(JSON.stringify(archive), 'utf8'), { level: 9 }));
  };

  let done = 0; let totalFilings = 0;
  for (const symbol of symbols) {
    done += 1;
    const label = `${String(done).padStart(3)}/${symbols.length} ${symbol.padEnd(7)}`;
    if (alreadyHave.has(symbol)) { totalFilings += archive.filings[symbol].length; continue; }
    try {
      const resolved = await resolveCik(symbol, names.get(symbol) ?? '', byTicker);
      await sleep(SPACING_MS);
      if (!resolved) {
        archive.unresolved.push({ symbol, reason: 'cik_unresolved' });
        console.log(`${label} CIK UNRESOLVED`);
        continue;
      }
      const { filings, skips } = await fetchPitFundamentalsHistory(symbol, resolved.cik);
      await sleep(SPACING_MS);
      if (filings.length === 0) {
        archive.unresolved.push({ symbol, reason: skips[0]?.reasonCode ?? 'no_filings' });
        console.log(`${label} no filings (${skips[0]?.reasonCode ?? '-'})`);
        continue;
      }
      // Sorted by public date so the consumer's "latest releasedAt <= D" scan is a simple walk.
      filings.sort((a, b) => a.releasedAt.localeCompare(b.releasedAt));
      archive.filings[symbol] = filings;
      archive.names[symbol] = resolved.name;
      totalFilings += filings.length;
      console.log(`${label} ${String(filings.length).padStart(3)} filings  ${filings[0].releasedAt} .. ${filings[filings.length - 1].releasedAt}`);
      if (done % 25 === 0) flush();
    } catch (err) {
      archive.unresolved.push({ symbol, reason: String(err).slice(0, 60) });
      console.log(`${label} FAILED ${String(err).slice(0, 50)}`);
    }
  }

  flush();
  const gz = readFileSync(SHARIA_ARCHIVE);

  const covered = Object.keys(archive.filings).length;
  console.log(`\ncovered ${covered}/${symbols.length} (${(covered / symbols.length * 100).toFixed(1)}%)`);
  console.log(`${totalFilings.toLocaleString()} filings  ${(gz.byteLength / 1024).toFixed(0)}KB`);
  if (archive.unresolved.length) {
    console.log(`\nunresolved (${archive.unresolved.length}) — each is a hole that reintroduces survivorship:`);
    for (const u of archive.unresolved) console.log(`  ${u.symbol.padEnd(8)} ${u.reason}`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
