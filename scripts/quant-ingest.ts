// One-off: pull real daily bars from the provider registry (Alpaca when keyed, else
// Yahoo/mock) into MarketBar so the committee + backtests run on real data.
//   npx tsx scripts/quant-ingest.ts [SYMBOL:MARKET ...]
import { PrismaClient, Prisma } from '@prisma/client';
import { registry } from '../src/services/marketData';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();
const D = Prisma.Decimal;

const sourceOf = (name: string) =>
  name.includes('Alpaca') ? 'ALPACA' : name.includes('Yahoo') ? 'YAHOO' : 'MOCK';

const pairs = (process.argv.slice(2).length ? process.argv.slice(2) : ['MSFT:NASDAQ', 'NVDA:NASDAQ']).map(
  (p) => p.split(':') as [string, 'TASI' | 'NASDAQ'],
);

async function main() {
  for (const [symbol, market] of pairs) {
    const provider = registry.getProvider(market);
    const source = sourceOf(provider.constructor.name) as 'ALPACA' | 'YAHOO' | 'MOCK';
    const candles = await provider.getCandles(symbol, market, 300);
    let n = 0;
    for (const c of candles) {
      const ts = new Date(`${c.time}T00:00:00.000Z`);
      const data = {
        open: new D(c.open.toFixed(6)),
        high: new D(c.high.toFixed(6)),
        low: new D(c.low.toFixed(6)),
        close: new D(c.close.toFixed(6)),
        volume: new D((c.value ?? 0).toFixed(4)),
        source,
      };
      await prisma.marketBar.upsert({
        where: { symbol_market_interval_ts: { symbol, market, interval: 'DAY', ts } },
        create: { symbol, market, interval: 'DAY', ts, ...data },
        update: data,
      });
      n++;
    }
    const total = await prisma.marketBar.count({ where: { symbol, market } });
    const last = await prisma.marketBar.findFirst({ where: { symbol, market }, orderBy: { ts: 'desc' } });
    console.log(`✓ ${symbol}/${market}: ingested ${n} bars from ${source}; ${total} stored; latest ${last?.ts.toISOString().slice(0, 10)} close $${last?.close}`);
  }
}

main()
  .catch((e) => {
    console.error('✗ ingest failed:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
