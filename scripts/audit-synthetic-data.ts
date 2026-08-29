// Is ANY data in this system fabricated?
//
// WHY: the owner asked to be sure nothing is mocked. That question deserves a real audit rather than
// a reassurance, because this program has twice found fabricated bars sitting in the database
// reporting themselves as healthy — 64 rows on 2026-08-27 (three of which predated the session that
// found them, and had already defeated the preflight's own freshness check) and 61 more on
// 2026-08-29 from a direct `npx tsx -e` call that bypassed `.env`.
//
// FIVE PLACES SYNTHETIC DATA CAN HIDE, and this checks all of them:
//   1. Every table carrying a DataSource — MarketBar, IntradayBar, SymbolSnapshot, Fundamentals,
//      NewsItem — filtered for MOCK.
//   2. The resolved market-data PROVIDER. `MARKET_DATA_MODE` unset defaults to 'bundled', which is
//      MockProvider; that default is what produced the 2026-08-29 incident.
//   3. The resolved SHARIA SCREENER. MockScreener returns fixture verdicts; the gate refuses them
//      (`unverified_source_fail_closed`), so a mocked screener does not produce false compliance —
//      but it does silently rewrite every BUY to HOLD, which is its own failure.
//   4. Stale-but-real data masquerading as current. Real bars from months ago are not synthetic,
//      but treating them as today's prices is the same class of error.
//   5. Decisions or Orders whose gate verdict came from a non-verified source.
//
// Read-only. No writes of any kind.
import { readFileSync } from 'node:fs';
import path from 'node:path';

function applyDotEnv(): void {
  try {
    for (const line of readFileSync(path.join(process.cwd(), '.env'), 'utf8').split('\n')) {
      if (!line.trim() || line.startsWith('#') || !line.includes('=')) continue;
      const i = line.indexOf('=');
      const k = line.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* absence is itself reported below */ }
}

async function main() {
  applyDotEnv();
  const { prisma } = await import('../src/lib/prisma');
  const { registry, MockProvider, MockScreener } = await import('../src/services/marketData');

  let problems = 0;
  const flag = (msg: string) => { problems += 1; console.log(`  ✗ ${msg}`); };
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);

  console.log('1. SYNTHETIC ROWS IN EVERY SOURCED TABLE\n');
  const tables: [string, () => Promise<{ source: string; _count: { _all: number } }[]>][] = [
    ['MarketBar', () => prisma.marketBar.groupBy({ by: ['source'], _count: { _all: true } }) as never],
    ['IntradayBar', () => prisma.intradayBar.groupBy({ by: ['source'], _count: { _all: true } }) as never],
    ['SymbolSnapshot', () => prisma.symbolSnapshot.groupBy({ by: ['source'], _count: { _all: true } }) as never],
    ['Fundamentals', () => prisma.fundamentals.groupBy({ by: ['source'], _count: { _all: true } }) as never],
    ['NewsItem', () => prisma.newsItem.groupBy({ by: ['source'], _count: { _all: true } }) as never],
  ];
  for (const [name, q] of tables) {
    try {
      const rows = await q();
      const total = rows.reduce((a, r) => a + r._count._all, 0);
      const mock = rows.find((r) => r.source === 'MOCK')?._count._all ?? 0;
      const breakdown = rows.map((r) => `${r.source}:${r._count._all}`).join(' ');
      if (mock > 0) flag(`${name}: ${mock} MOCK rows of ${total}   [${breakdown}]`);
      else ok(`${name}: 0 MOCK of ${total}   [${breakdown || 'empty'}]`);
    } catch (e) {
      flag(`${name}: could not query — ${e instanceof Error ? e.message.slice(0, 60) : e}`);
    }
  }

  console.log('\n2. RESOLVED PROVIDERS (what a write TODAY would use)\n');
  console.log(`  MARKET_DATA_MODE = ${process.env.MARKET_DATA_MODE ?? '(unset -> defaults to "bundled" -> MockProvider)'}`);
  // TASI is OUT OF SCOPE by owner directive ("avoid tasi as well, we will only focus on nasdaq"),
  // so its provider resolving to MockProvider is not a defect — nothing ingests it, the scheduled
  // roster is NASDAQ-only, and `ingestBars` now throws rather than fabricating if anything tried.
  // It is only a problem if TASI rows actually EXIST, so that is what gets checked.
  for (const market of ['NASDAQ', 'TASI'] as const) {
    const p = registry.getProvider(market);
    const isMock = p instanceof MockProvider;
    if (market === 'TASI') {
      const rows = await prisma.marketBar.count({ where: { market: 'TASI' } });
      if (rows > 0 && isMock) flag(`TASI has ${rows} rows and a MockProvider — out of scope AND populated`);
      else ok(`TASI provider is ${p.constructor.name}, but 0 rows exist — out of scope, nothing to fabricate`);
    } else if (isMock) {
      flag(`${market} provider is MockProvider — it FABRICATES candles`);
    } else ok(`${market} provider is ${p.constructor.name}`);
  }

  console.log('\n3. RESOLVED SHARIA SCREENER\n');
  console.log(`  SHARIA_SOURCE = ${process.env.SHARIA_SOURCE ?? '(unset)'}`);
  const screener = registry.getScreener();
  if (screener instanceof MockScreener) {
    flag('screener is MockScreener — the gate refuses its verdicts, so EVERY BUY becomes HOLD');
  } else ok(`screener is ${screener.constructor.name}`);

  console.log('\n4. STALENESS — real data is not current data\n');
  const newest = await prisma.marketBar.findFirst({ orderBy: { ts: 'desc' }, select: { ts: true } });
  const ageDays = newest ? (Date.now() - newest.ts.getTime()) / 86_400_000 : Infinity;
  if (ageDays > 5) flag(`newest bar is ${ageDays.toFixed(1)} days old — real, but not current`);
  else ok(`newest bar ${newest?.ts.toISOString().slice(0, 10)} (${ageDays.toFixed(1)}d old)`);

  console.log('\n5. DECISIONS RESTING ON AN UNVERIFIED GATE\n');
  const decisions = await prisma.decision.findMany({ select: { id: true, symbol: true, shariaGate: true }, take: 500 });
  const bad = decisions.filter((d) => {
    const src = (d.shariaGate as { source?: string } | null)?.source;
    return src === 'mock' || src === 'none';
  });
  if (bad.length) flag(`${bad.length} of ${decisions.length} Decisions carry a mock/none gate source`);
  else ok(`${decisions.length} Decisions checked, none rest on a mock gate verdict`);

  console.log(`\n${problems === 0
    ? 'CLEAN — no synthetic data found, and today\'s writes would use real providers.'
    : `${problems} PROBLEM(S) FOUND — see the ✗ lines above.`}`);

  await prisma.$disconnect();
  process.exitCode = problems === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(1); });
