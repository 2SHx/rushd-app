// Pull real Alpaca news into NewsItem so the News/Catalyst analyst contributes.
//   npx tsx scripts/quant-ingest-news.ts [SYMBOL:MARKET ...]
import { PrismaClient } from '@prisma/client';

process.loadEnvFile?.('.env');
const prisma = new PrismaClient();
const key = process.env.ALPACA_API_KEY;
const secret = process.env.ALPACA_API_SECRET ?? '';

const pairs = (process.argv.slice(2).length ? process.argv.slice(2) : ['MSFT:NASDAQ', 'NVDA:NASDAQ']).map(
  (p) => p.split(':') as [string, 'TASI' | 'NASDAQ'],
);

async function main() {
  if (!key) {
    console.error('✗ ALPACA_API_KEY not set — see docs/ENV.md.');
    process.exit(1);
  }
  for (const [symbol, market] of pairs) {
    const res = await fetch(
      `https://data.alpaca.markets/v1beta1/news?symbols=${symbol}&limit=50`,
      { headers: { 'APCA-API-KEY-ID': key, 'APCA-API-SECRET-KEY': secret } },
    );
    if (!res.ok) {
      console.error(`✗ ${symbol}: news HTTP ${res.status} ${await res.text().catch(() => '')}`);
      continue;
    }
    const { news = [] } = (await res.json()) as { news: any[] };
    let added = 0;
    for (const n of news) {
      const url = n.url ?? `alpaca:${n.id}`;
      if (await prisma.newsItem.findFirst({ where: { url } })) continue; // idempotent by url
      await prisma.newsItem.create({
        data: {
          symbol, market,
          publishedAt: new Date(n.created_at),
          headline: n.headline ?? '(no headline)',
          summary: n.summary || null,
          url,
          source: 'ALPACA',
        },
      });
      added++;
    }
    const total = await prisma.newsItem.count({ where: { symbol, market } });
    console.log(`✓ ${symbol}/${market}: +${added} news (${total} stored)`);
  }
}

main()
  .catch((e) => { console.error('✗', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
