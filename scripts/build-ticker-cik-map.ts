// Ticker -> CIK for every symbol in the bar archive, INCLUDING delisted ones.
//
// WHY NOT JUST company_tickers.json: that file lists only CURRENTLY listed registrants. Using it
// alone would silently drop every company that delisted — which is precisely the survivorship bias
// the SIP archive was built to remove. A fundamentals-driven strategy tested on a
// current-listings-only map would inherit the same 13.55pp/yr distortion this program already
// measured on prices.
//
// So: bulk-map from company_tickers.json (one request), then resolve the REMAINDER individually via
// the submissions endpoint, which retains tickers for dead registrants.
//
// Network: SEC only. Writes data/fundamentals/ticker-cik.json. No DB writes.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { listArchivedSymbols } from './backfill-alpaca-sip';

const HEADERS = { 'User-Agent': 'RUSHD-Quant/0.1 research@rushd.app' };
// Deliberately slower than the 10/s SEC ceiling: the revenue-frames sweep may be running in
// parallel, and two jobs sharing one User-Agent is how a 403 block happens.
const SPACING_MS = 220;
const OUT = path.join(process.cwd(), 'data', 'fundamentals', 'ticker-cik.json');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(path.dirname(OUT), { recursive: true });
  const map: Record<string, string> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
  const archived = listArchivedSymbols();

  // Bulk pass.
  const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: HEADERS });
  const bulk = await res.json() as Record<string, { cik_str: number; ticker: string }>;
  const byTicker = new Map<string, string>();
  for (const v of Object.values(bulk)) {
    byTicker.set(v.ticker.toUpperCase(), String(v.cik_str).padStart(10, '0'));
  }
  let fromBulk = 0;
  for (const s of archived) {
    if (map[s]) continue;
    const cik = byTicker.get(s);
    if (cik) { map[s] = cik; fromBulk += 1; }
  }
  writeFileSync(OUT, JSON.stringify(map, null, 0));
  console.log(`archived symbols        ${archived.length}`);
  console.log(`mapped from bulk file   ${fromBulk}  (currently listed registrants)`);

  // NO INDIVIDUAL FALLBACK PASS. An earlier version resolved the remainder through
  // `browse-edgar?company=<SYMBOL>`, which searches company NAMES, not tickers — so a dead ticker
  // would match an unrelated filer and inject that filer's revenue into the panel under the wrong
  // symbol. Silent wrong data is far worse than acknowledged missing data, and there is no free SEC
  // endpoint that maps a delisted TICKER back to a CIK.
  //
  // The consequence is recorded rather than papered over: fundamentals coverage is limited to
  // currently listed registrants, so any fundamentals-driven strategy carries survivorship bias in
  // its SIGNAL even though its PRICES do not. Callers must report the coverage gap on the liquid
  // universe and, where it matters, re-run a price-only control on the same restricted set to bound
  // how much the restriction distorts the answer.
  const unmapped = archived.filter((s) => !map[s]);
  writeFileSync(OUT, JSON.stringify(map, null, 0));
  const usable = Object.values(map).filter(Boolean).length;
  console.log(`\ntotal mapped   ${usable} / ${archived.length}`);
  console.log(`unmapped       ${unmapped.length}  (delisted registrants — a KNOWN, UNCLOSED gap)`);
  console.log(`written -> ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
