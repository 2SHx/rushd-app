// R3-4 deep wide backfill — pull ~8.5y of REAL daily bars (Yahoo keyless tier)
// for every NASDAQ symbol already present in MarketBar, so the wide-universe
// cross-sectional factor has ranking history. Resumable + rate-limited:
//   MARKET_DATA_MODE=keyless npx tsx scripts/backfill-wide-daily.ts [--min-have 2000] [--limit N]
// - Skips symbols that already hold ≥ --min-have real bars (re-run = resume).
// - NEVER writes MOCK rows: aborts a symbol if the resolved provider is mock.
// - createMany(skipDuplicates) per symbol; delisted/errored symbols are logged
//   and skipped, never fabricated.
import { PrismaClient, Prisma } from '@prisma/client';
import { registry } from '../src/services/marketData';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();
const D = Prisma.Decimal;

const DAYS = 3100; // calendar days ≈ 8.5y → Yahoo returns ~2,150 trading days
const RATE_MS = 1200;

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const minHave = arg('min-have', 2000);
  const limit = arg('limit', Number.MAX_SAFE_INTEGER);

  const provider = registry.getProvider('NASDAQ');
  if (!provider.constructor.name.includes('Yahoo') && !provider.constructor.name.includes('Alpaca')) {
    throw new Error(`resolved provider ${provider.constructor.name} is not a real-data provider — set MARKET_DATA_MODE=keyless (no-mock directive)`);
  }
  const source = provider.constructor.name.includes('Alpaca') ? 'ALPACA' as const : 'YAHOO' as const;

  const counts: { symbol: string; n: number }[] = await prisma.$queryRawUnsafe(
    `SELECT symbol, count(*)::int AS n FROM "MarketBar"
     WHERE interval='DAY' AND market='NASDAQ' AND source != 'MOCK'
     GROUP BY symbol ORDER BY symbol`
  );
  const todo = counts.filter((row) => row.n < minHave).slice(0, limit);
  console.log(`${counts.length} NASDAQ symbols in MarketBar; ${todo.length} below ${minHave} bars → backfilling via ${source}`);

  let ok = 0;
  let failed = 0;
  let written = 0;
  const startedAt = Date.now();
  for (let index = 0; index < todo.length; index++) {
    const row = todo[index];
    try {
      const candles = await provider.getCandles(row.symbol, 'NASDAQ', DAYS);
      const rows = candles
        .filter((c) => Number.isFinite(c.open) && Number.isFinite(c.close) && c.close > 0)
        .map((c) => ({
          symbol: row.symbol,
          market: 'NASDAQ' as const,
          interval: 'DAY' as const,
          ts: new Date(`${c.time}T00:00:00.000Z`),
          open: new D(c.open.toFixed(6)),
          high: new D(c.high.toFixed(6)),
          low: new D(c.low.toFixed(6)),
          close: new D(c.close.toFixed(6)),
          volume: new D((c.value ?? 0).toFixed(4)),
          source,
        }));
      const res = rows.length
        ? await prisma.marketBar.createMany({ data: rows, skipDuplicates: true })
        : { count: 0 };
      written += res.count;
      ok++;
      if (index % 50 === 0 || index === todo.length - 1) {
        const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
        console.log(`[${index + 1}/${todo.length}] ${row.symbol}: +${res.count} bars (total new ${written}; ok ${ok}, failed ${failed}; ${elapsedMin}m)`);
      }
    } catch (err) {
      failed++;
      console.log(`✗ ${row.symbol}: ${(err as Error).message.slice(0, 120)}`);
    }
    await sleep(RATE_MS);
  }
  console.log(`DONE: ${ok} symbols backfilled, ${failed} failed, ${written} new real bars.`);
}

main()
  .catch((e) => {
    console.error('✗ backfill failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
