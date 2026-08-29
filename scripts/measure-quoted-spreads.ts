// W3 (corrected) — measure REAL quoted spreads from Alpaca SIP quotes instead of estimating them.
//
// WHY THE REWRITE: both range-based estimators failed their sanity check. Corwin-Schultz put SPY's
// spread at 4.0bps and Abdi-Ranaldo at 93.7bps; the true figure is around 0.2bps. Modern US equity
// spreads are far smaller than the noise in a daily high/low bar, so range estimators — designed and
// calibrated in an era of 20-100bps spreads — have no resolution left. Estimating a quantity that is
// directly observable was the error.
//
// SANITY CHECK, declared before running: SPY must come out near 0.2-0.5bps and AAPL near 0.5-1.5bps.
// If they do not, the endpoint is returning raw per-venue quotes rather than the consolidated NBBO,
// every number here is inflated, and the result must be discarded rather than reported.
//
// SAMPLING: mid-session windows only. Spreads at the open and the close are several times wider than
// mid-day, so sampling those would overstate the cost of a strategy that does not trade there — and
// sampling only mid-day would understate it for one that does. Mid-session is declared as the
// assumption, not hidden as a default.
//
// Network: Alpaca market data (SIP entitlement already on the account). No DB writes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { anchor, declareBasis } from './lib/research-assertions';

const QUOTES_URL = 'https://data.alpaca.markets/v2/stocks';
/** Mid-session UTC times: 15:00 = 10:00 ET, 17:00 = 12:00 ET, 19:00 = 14:00 ET. */
const SAMPLE_TIMES = ['15:00', '17:00', '19:00'];
const QUOTES_PER_WINDOW = 1000;

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
  );
}

interface Quote { t: string; ap: number; bp: number; as: number; bs: number }

async function sampleSpreadBps(symbol: string, headers: Record<string, string>, days: string[]): Promise<{
  medianBps: number; p90Bps: number; n: number;
} | null> {
  const spreads: number[] = [];
  for (const day of days) {
    for (const time of SAMPLE_TIMES) {
      const start = `${day}T${time}:00Z`;
      const end = `${day}T${time.slice(0, 2)}:${String(Number(time.slice(3)) + 1).padStart(2, '0')}:00Z`;
      const url = new URL(`${QUOTES_URL}/${encodeURIComponent(symbol)}/quotes`);
      url.searchParams.set('start', start);
      url.searchParams.set('end', end);
      url.searchParams.set('limit', String(QUOTES_PER_WINDOW));
      url.searchParams.set('feed', 'sip');
      let res: Response;
      try {
        res = await fetch(url, { headers, signal: AbortSignal.timeout(45_000) });
      } catch { continue; }
      if (res.status === 429) { await new Promise((r) => setTimeout(r, 15_000)); continue; }
      if (!res.ok) continue;
      const body = await res.json() as { quotes?: Quote[] };
      for (const q of body.quotes ?? []) {
        // A crossed or locked book, or a one-sided quote, is not a tradeable spread.
        if (!(q.ap > 0 && q.bp > 0 && q.ap > q.bp)) continue;
        const mid = (q.ap + q.bp) / 2;
        spreads.push(((q.ap - q.bp) / mid) * 10_000);
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  if (spreads.length < 100) return null;
  spreads.sort((a, b) => a - b);
  return {
    medianBps: spreads[Math.floor(spreads.length / 2)],
    p90Bps: spreads[Math.floor(spreads.length * 0.9)],
    n: spreads.length,
  };
}

async function main() {
  const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
  const headers = {
    'APCA-API-KEY-ID': env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET!,
  };
  const symbols = (process.argv.find((a) => a.startsWith('--symbols='))?.split('=')[1]
    ?? 'SPY,AAPL,GOOGL,MU,AMD,NVDA,MRVL,SPUS,QQQ,HIMS,RKLB,SNDK,ASTS,INOD')
    .split(',').map((s) => s.trim().toUpperCase());
  // Four ordinary mid-week sessions spread across recent months, avoiding month-end and holidays.
  // Overridable with --days=, because applying 2026 spreads to a 2016 backtest would understate
  // costs: US spreads have tightened materially over the sample this program backtests on.
  const days = (process.argv.find((a) => a.startsWith('--days='))?.split('=')[1]
    ?? '2026-05-13,2026-06-17,2026-07-15,2026-08-12').split(',');

  console.log(`Alpaca SIP quotes — median quoted spread, mid-session sampling`);
  console.log(`days: ${days.join(', ')}   times (UTC): ${SAMPLE_TIMES.join(', ')}\n`);
  console.log('symbol   median bps   p90 bps   half-spread bps   quotes');

  const out: { s: string; half: number }[] = [];
  for (const s of symbols) {
    const r = await sampleSpreadBps(s, headers, days);
    if (!r) { console.log(`${s.padEnd(8)} insufficient quotes`); continue; }
    out.push({ s, half: r.medianBps / 2 });
    console.log(`${s.padEnd(8)} ${r.medianBps.toFixed(2).padStart(10)}  ${r.p90Bps.toFixed(2).padStart(8)}  `
      + `${(r.medianBps / 2).toFixed(2).padStart(16)}   ${r.n.toLocaleString().padStart(7)}`);
  }

  declareBasis({
    quotes: 'Alpaca SIP NBBO, feed=sip (consolidated across venues, not a single exchange book)',
    sampling: 'mid-session only (10:00/12:00/14:00 ET) — open/close spreads run several times wider',
    window: `${days.join(', ')}`,
  });

  // SPY's spread is public knowledge independent of this script: retail brokerages routinely quote
  // it at a fraction of a cent wide. If this run does not land near that, the endpoint is returning
  // raw per-venue quotes instead of the consolidated NBBO and every figure above is inflated —
  // anchor() throws rather than let the run be reported.
  const spy = out.find((o) => o.s === 'SPY');
  anchor('SPY quoted half-spread', spy?.half ?? NaN, 0.25, 0.6);

  console.log('\nCOST DRAG AT MEASURED HALF-SPREADS, by monthly turnover');
  console.log('turnover/mo    ' + out.map((o) => o.s.padStart(7)).join(''));
  for (const turn of [0.25, 0.5, 1.0, 2.0, 3.0]) {
    const cells = out.map((o) => `${(turn * 12 * o.half / 100).toFixed(2)}%`.padStart(7)).join('');
    console.log(`${(turn * 100).toFixed(0).padStart(9)}%    ${cells}`);
  }
  console.log('\n(cost drag %/yr = monthly turnover x 12 x half-spread. Compare to the 15bps flat');
  console.log(' assumption used everywhere in this repo, which implies 5.52%/yr at 306%/mo turnover.)');
}

main().catch((e) => { console.error(e); process.exit(1); });
