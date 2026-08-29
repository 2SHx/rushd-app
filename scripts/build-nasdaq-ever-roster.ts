// Enumerate every NASDAQ symbol that has EVER been listed, from Alpaca's asset registry.
//
// WHY THIS EXISTS: every backtest in this repo has run on the SPUS-ever-held universe — roughly 320
// large and mid caps. The owner's actual winners (SNDK, INOD, ASTS, RKLB) were never in it. A
// strategy cannot select a name its universe excludes, so the entire measured underperformance of
// this program's three strategy families is confounded with a universe restriction that was never a
// deliberate research choice.
//
// SURVIVORSHIP: `status=inactive` is the delisted set, and it is the whole point. Enumerating only
// active assets would rebuild the exact bias the SIP archive was created to remove.
//
// KNOWN GAP, recorded rather than hidden: Alpaca reports `exchange` for only 1,318 of its 19,189
// inactive US equities as NASDAQ, which is implausibly few given the true delisting rate. The
// exchange field is evidently unreliable (often blank) for long-dead assets. `--include-unknown`
// therefore also takes inactive assets whose exchange is blank or unrecognised, at the cost of
// pulling in some non-NASDAQ names. Names outside NASDAQ are dropped later at the universe layer,
// where the NASDAQ-only directive is enforced; a spurious extra symbol costs one fetch, while a
// missing delisted symbol costs a permanent bias.
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface Asset {
  symbol: string;
  exchange: string;
  status: string;
  tradable: boolean;
  class: string;
}

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
  );
}

async function main() {
  const env = { ...loadEnv(), ...process.env } as Record<string, string | undefined>;
  const headers = {
    'APCA-API-KEY-ID': env.ALPACA_API_KEY!,
    'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET!,
  };
  const includeUnknown = process.argv.includes('--include-unknown');
  const out = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1]
    ?? path.join(process.cwd(), 'data', 'nasdaq-ever-roster.txt');

  const symbols = new Set<string>();
  let activeN = 0; let inactiveN = 0; let unknownN = 0;

  for (const status of ['active', 'inactive']) {
    const res = await fetch(
      `https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity&status=${status}`,
      { headers, signal: AbortSignal.timeout(120_000) },
    );
    if (!res.ok) throw new Error(`assets ${status}: HTTP ${res.status}`);
    const assets = await res.json() as Asset[];
    for (const a of assets) {
      // Alpaca uses '.' and '/' for class shares and units; the bars endpoint accepts them, but a
      // warrant or unit is not an equity position this program would ever take.
      if (/[/]/.test(a.symbol)) continue;
      if (a.exchange === 'NASDAQ') {
        symbols.add(a.symbol);
        if (status === 'active') activeN += 1; else inactiveN += 1;
      } else if (includeUnknown && status === 'inactive' && (!a.exchange || a.exchange === 'OTC')) {
        symbols.add(a.symbol);
        unknownN += 1;
      }
    }
  }

  const sorted = Array.from(symbols).sort();
  writeFileSync(out, `${sorted.join('\n')}\n`);
  console.log(`NASDAQ active           ${activeN}`);
  console.log(`NASDAQ inactive         ${inactiveN}  (delisted — the survivorship correction)`);
  if (includeUnknown) console.log(`inactive, exchange blank ${unknownN}  (--include-unknown)`);
  console.log(`total written           ${sorted.length}  -> ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
