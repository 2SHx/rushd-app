// Identify ETFs, ETNs and closed-end funds in the archive so they can be excluded from stock screens.
//
// WHY THIS EXISTS: the first full-universe run produced a rule that appeared to beat SPUS by 12pp/yr.
// Printing its holdings showed it was buying SPY, QQQ, TQQQ (3x leveraged Nasdaq), SQQQ (3x inverse)
// and TLT (Treasury bonds) — because "largest by dollar volume" ranks ETFs above every operating
// company, and the universe never excluded them. The result was an accidental leveraged index bet,
// and TLT and SQQQ are not permissible holdings under any reading of the mandate.
//
// A stock-selection strategy that can select an index fund is not measuring stock selection. Worse,
// a LEVERAGED index fund manufactures returns that look like alpha and are actually borrowed beta.
//
// METHOD: Alpaca's asset objects carry no fund flag, but issuer and structure are almost always in
// the NAME. Matching on issuer families and structure words catches the overwhelming majority. This
// is a heuristic and it is deliberately AGGRESSIVE — excluding a handful of genuine operating
// companies costs a little breadth, while admitting one leveraged ETF corrupts the entire result.
//
// Every exclusion is written with its name so the list is auditable rather than a black box.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

/** Structure words and issuer families. Ordered roughly by how much of the space each catches. */
const FUND_PATTERNS = [
  / ETF\b/i, /\bETF$/i, / ETN\b/i, /\bINDEX FUND\b/i, /\bTRUST\b/i, /\bFUND\b/i,
  /\bSHARES\b/i, /\bPORTFOLIO\b/i, /\bDEPOSITARY RECEIPT/i, /\bUNIT SERIES\b/i,
  /\bISHARES\b/i, /\bSPDR\b/i, /\bPROSHARES\b/i, /\bDIREXION\b/i, /\bVANGUARD\b/i,
  /\bINVESCO\b/i, /\bWISDOMTREE\b/i, /\bGLOBAL X\b/i, /\bVANECK\b/i, /\bFIRST TRUST\b/i,
  /\bSCHWAB STRATEGIC\b/i, /\bJPMORGAN.*ETF/i, /\bAMPLIFY\b/i, /\bGRANITESHARES\b/i,
  /\bDEFIANCE\b/i, /\bYIELDMAX\b/i, /\bROUNDHILL\b/i, /\bSIMPLIFY\b/i, /\bTIDAL\b/i,
  /\bULTRAPRO\b/i, /\bULTRASHORT\b/i, /\bBULL \d/i, /\bBEAR \d/i, /\b\dX (LONG|SHORT)\b/i,
  /\bLEVERAGED\b/i, /\bINVERSE\b/i, /\bCLOSED[- ]END\b/i, /\bMUNICIPAL\b/i,
  /\bTREASURY\b/i, /\bBOND\b/i, /\bINCOME FUND\b/i, /\bCAPITAL APPRECIATION\b/i,
];

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
  const outDir = path.join(process.cwd(), 'data');
  mkdirSync(outDir, { recursive: true });

  const funds: { symbol: string; name: string }[] = [];
  const kept: string[] = [];
  for (const status of ['active', 'inactive']) {
    const res = await fetch(
      `https://paper-api.alpaca.markets/v2/assets?asset_class=us_equity&status=${status}`,
      { headers, signal: AbortSignal.timeout(120_000) },
    );
    if (!res.ok) throw new Error(`assets ${status}: HTTP ${res.status}`);
    for (const a of await res.json() as { symbol: string; name: string }[]) {
      const name = a.name ?? '';
      if (FUND_PATTERNS.some((p) => p.test(name))) funds.push({ symbol: a.symbol, name });
      else kept.push(a.symbol);
    }
  }

  const bySymbol = new Map<string, string>();
  for (const f of funds) bySymbol.set(f.symbol, f.name);
  const sorted = Array.from(bySymbol.entries()).sort();
  writeFileSync(path.join(outDir, 'fund-symbols.json'),
    JSON.stringify({ builtAt: new Date().toISOString(), count: sorted.length,
      symbols: Object.fromEntries(sorted) }, null, 0));
  writeFileSync(path.join(outDir, 'fund-symbols.txt'), `${sorted.map(([s]) => s).join('\n')}\n`);

  console.log(`funds/ETFs/ETNs identified  ${sorted.length}`);
  console.log(`operating companies kept    ${new Set(kept).size}`);
  console.log('\nsanity check — these MUST be flagged:');
  for (const s of ['SPY', 'QQQ', 'TQQQ', 'SQQQ', 'TLT', 'IVV', 'SPUS', 'HLAL']) {
    console.log(`  ${s.padEnd(6)} ${bySymbol.has(s) ? `FLAGGED — ${bySymbol.get(s)}` : 'NOT FLAGGED  <-- leak'}`);
  }
  console.log('\nand these must NOT be flagged:');
  for (const s of ['AAPL', 'NVDA', 'TSLA', 'AMD', 'MU', 'INOD', 'RKLB', 'SNDK', 'ASTS']) {
    console.log(`  ${s.padEnd(6)} ${bySymbol.has(s) ? `FLAGGED  <-- false positive: ${bySymbol.get(s)}` : 'kept'}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
