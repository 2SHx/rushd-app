// scripts/calibrate-iex-ratio.ts — QDR-6 gapper-orb IEX-feed calibration (G3b fix).
//
// WHY: v1's `minCumVolume=10e6` was calibrated for the CONSOLIDATED tape. Our real backtest
// spine is Alpaca's IEX feed, which prints only a few % of consolidated volume, so ZERO
// symbol-days clear a 10e6 IEX cumVolume screen (measured, G3b). This script derives the
// v1-iex threshold the ONLY honest way: measure it.
//
// METHOD (no mock, no guess): for every symbol×trading-day in the backfilled IntradayBar spine,
//   ratio = (IEX full-day volume = Σ IntradayBar.volume, all sessions) / (Yahoo CONSOLIDATED
//   daily volume, keyless public chart endpoint). Take the MEDIAN ratio across all symbol-days.
//   v1-iex minCumVolume = round(10e6 × median). Also prints the v1-iex screen funnel (how many
//   symbol-days pass each filter leg) so the selection is auditable.
//
// Run: npx tsx scripts/calibrate-iex-ratio.ts   (needs DATABASE_URL + network for Yahoo)
import { prisma } from '../src/lib/prisma';
import { nasdaqDateKey } from '../src/quant/data/snapshot';
import { median, deriveIexMinCumVolume } from '../src/quant/strategies/gapperCalibration';

const SYMBOLS = 'ACHR AMC BBAI CHPT CLSK DNA FCEL GME HUT IONQ JOBY LUNR MARA OPEN PLUG RGTI RIOT SMCI SNDL SOUN'.split(' ');
const CONSOLIDATED_BASELINE = 10_000_000; // v1 minCumVolume (consolidated tape reference)

interface YahooDay { close: number; volume: number }

/** Keyless public Yahoo chart. Fails LOUDLY (no mock fallback) — calibration must use real data. */
async function fetchYahooDaily(symbol: string): Promise<Map<string, YahooDay>> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
  const data = (await res.json()) as {
    chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: (number | null)[]; volume?: (number | null)[] }> } }> };
  };
  const r = data.chart?.result?.[0];
  const ts = r?.timestamp ?? [];
  const q = r?.indicators?.quote?.[0];
  if (!r || !ts.length || !q?.volume) throw new Error(`Yahoo ${symbol}: empty/invalid response (refusing mock fallback)`);
  const out = new Map<string, YahooDay>();
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    const volume = q.volume?.[i];
    if (close == null || volume == null) continue;
    // Yahoo timestamps are the session date; nasdaqDateKey keeps the Eastern trading-day convention.
    out.set(nasdaqDateKey(new Date(ts[i] * 1000)), { close, volume });
  }
  return out;
}

async function main() {
  // ── mcap per symbol-day from the SEC-XBRL-backed SymbolSnapshot (100% coverage).
  const snaps = await prisma.symbolSnapshot.findMany({
    where: { symbol: { in: SYMBOLS }, mcap: { not: null } },
    select: { symbol: true, asOf: true, mcap: true },
  });
  const mcapByDay = new Map<string, number>(); // `${sym}|${day}` -> mcap
  for (const s of snaps) mcapByDay.set(`${s.symbol}|${nasdaqDateKey(s.asOf)}`, Number(s.mcap));

  // ── prior-day close per symbol-day from the DAY spine (drives day-move & premarket-move).
  const dayBars = await prisma.marketBar.findMany({
    where: { symbol: { in: SYMBOLS }, interval: 'DAY' },
    orderBy: { ts: 'asc' },
    select: { symbol: true, ts: true, close: true },
  });
  const priorClose = new Map<string, number>(); // `${sym}|${day}` -> prior trading day's close
  const bySym = new Map<string, Array<{ day: string; close: number }>>();
  for (const b of dayBars) {
    const arr = bySym.get(b.symbol) ?? [];
    // DAY bars are stored at 00:00 UTC labeled with their trading date → key by UTC calendar date
    // (NOT nasdaqDateKey, which would shift midnight-UTC back to the prior Eastern day).
    arr.push({ day: b.ts.toISOString().slice(0, 10), close: Number(b.close) });
    bySym.set(b.symbol, arr);
  }
  for (const [sym, arr] of Array.from(bySym.entries())) {
    for (let i = 1; i < arr.length; i++) priorClose.set(`${sym}|${arr[i].day}`, arr[i - 1].close);
  }

  const ratios: number[] = [];
  let symbolDays = 0;
  const perSymbol: Array<{ sym: string; days: number; medRatio: number }> = [];

  // Funnel legs evaluated per symbol-day (descriptive; full-day cumVolume, regular close day-move).
  type Leg = { pmMove: number | null; dayMove: number | null; cumVol: number; mcap: number | null };
  const legs: Array<{ sym: string; day: string } & Leg> = [];

  for (const sym of SYMBOLS) {
    const yahoo = await fetchYahooDaily(sym);
    // Pull all intraday bars for this symbol, grouped by trading day.
    const bars = await prisma.intradayBar.findMany({
      where: { symbol: sym },
      orderBy: { ts: 'asc' },
      select: { ts: true, close: true, volume: true, session: true },
    });
    type IBar = (typeof bars)[number];
    const days = new Map<string, IBar[]>();
    for (const b of bars) {
      const k = nasdaqDateKey(b.ts);
      const a = days.get(k) ?? [];
      a.push(b);
      days.set(k, a);
    }
    const symRatios: number[] = [];
    for (const [day, dbars] of Array.from(days.entries())) {
      const iexVol = dbars.reduce((s: number, b: IBar) => s + Number(b.volume), 0);
      const y = yahoo.get(day);
      const pc = priorClose.get(`${sym}|${day}`) ?? null;
      const lastReg = [...dbars].reverse().find((b) => b.session === 'REGULAR');
      const lastPre = [...dbars].reverse().find((b) => b.session === 'PRE');
      const dayMove = pc && lastReg ? ((Number(lastReg.close) - pc) / pc) * 100 : null;
      const pmMove = pc && lastPre ? ((Number(lastPre.close) - pc) / pc) * 100 : null;
      legs.push({ sym, day, pmMove, dayMove, cumVol: iexVol, mcap: mcapByDay.get(`${sym}|${day}`) ?? null });
      if (y && y.volume > 0 && iexVol > 0) {
        const r = iexVol / y.volume;
        ratios.push(r);
        symRatios.push(r);
        symbolDays++;
      }
    }
    perSymbol.push({ sym, days: symRatios.length, medRatio: median(symRatios) });
  }

  const { median: med, raw: rawThreshold, rounded: derived } = deriveIexMinCumVolume(ratios, CONSOLIDATED_BASELINE);

  console.log('\n═══ IEX / CONSOLIDATED VOLUME CALIBRATION (gapper-orb → v1-iex) ═══');
  console.log(`symbol-days measured:      ${symbolDays}  (across ${SYMBOLS.length} symbols)`);
  console.log(`ratio min/median/max:      ${(Math.min(...ratios) * 100).toFixed(2)}% / ${(med * 100).toFixed(2)}% / ${(Math.max(...ratios) * 100).toFixed(2)}%`);
  console.log(`per-symbol median ratio:`);
  for (const p of perSymbol) console.log(`   ${p.sym.padEnd(5)} n=${String(p.days).padStart(3)}  median=${(p.medRatio * 100).toFixed(2)}%`);
  console.log(`\nconsolidated baseline:     ${CONSOLIDATED_BASELINE.toLocaleString()} shares (v1)`);
  console.log(`10e6 × median ratio:       ${Math.round(rawThreshold).toLocaleString()} shares (raw)`);
  console.log(`→ v1-iex minCumVolume:     ${derived.toLocaleString()} shares (rounded to nearest 50k)`);

  // ── v1-iex screen funnel (mcap band unchanged; volume leg uses the derived threshold).
  const pass = { mcap: 0, premarket: 0, dayMove: 0, volume: 0, all: 0, evaluable: 0 };
  for (const l of legs) {
    const mcapOk = l.mcap != null && l.mcap >= 10_000_000 && l.mcap <= 400_000_000;
    const pmOk = l.pmMove != null && l.pmMove >= 5;
    const dmOk = l.dayMove != null && l.dayMove >= 5;
    const volOk = l.cumVol >= derived;
    if (mcapOk) pass.mcap++;
    if (pmOk) pass.premarket++;
    if (dmOk) pass.dayMove++;
    if (volOk) pass.volume++;
    if (l.mcap != null && l.pmMove != null && l.dayMove != null) pass.evaluable++;
    if (mcapOk && pmOk && dmOk && volOk) pass.all++;
  }
  console.log(`\n═══ v1-iex SCREEN FUNNEL (symbol-days, n=${legs.length}) ═══`);
  console.log(`   mcap∈[10e6,400e6]:      ${pass.mcap}`);
  console.log(`   premarketMove ≥ 5%:     ${pass.premarket}`);
  console.log(`   dayMove ≥ 5%:           ${pass.dayMove}`);
  console.log(`   cumVolume ≥ ${derived.toLocaleString()}: ${pass.volume}`);
  console.log(`   ALL FOUR (screen pass): ${pass.all}   (fully-evaluable days: ${pass.evaluable})`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
