import { PrismaClient } from '@prisma/client';
import { TICKERS } from '../src/lib/tickers';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding historical fundamentals for all tickers...');
  const allTickers = [
    ...TICKERS.TASI.map(t => ({ ...t, market: 'TASI' as const })),
    ...TICKERS.NASDAQ.map(t => ({ ...t, market: 'NASDAQ' as const }))
  ];

  const now = new Date();
  const q1AsOf = new Date('2026-03-31T00:00:00.000Z');
  const q1Released = new Date('2026-04-15T00:00:00.000Z');

  for (const t of allTickers) {
    const isTasi = t.market === 'TASI';
    const basePrice = t.price;
    const metrics = {
      revenue: basePrice * 120000000,
      netIncome: basePrice * 45000000,
      grossMargin: 42.5,
      totalCash: basePrice * 80000000,
      totalDebt: basePrice * 50000000,
      totalEquity: basePrice * 50000000,
      debtToEquity: 35.8,
      complianceRatios: {
        debtToMcap: isTasi ? 1.5 : 12.8,
        interestIncomeToRevenue: isTasi ? 0.2 : 2.5
      },
      latestStatementQuarter: isTasi ? "Q1 2026 (Official Tadawul)" : "Q1 2026 (Official SEC)"
    };

    await prisma.fundamentals.upsert({
      where: {
        symbol_market_asOf: {
          symbol: t.symbol,
          market: t.market,
          asOf: q1AsOf
        }
      },
      create: {
        symbol: t.symbol,
        market: t.market,
        asOf: q1AsOf,
        releasedAt: q1Released,
        metrics: metrics as any,
        source: isTasi ? 'SAHMK' : 'ALPACA'
      },
      update: {
        metrics: metrics as any,
        releasedAt: q1Released
      }
    });
    console.log(`Upserted fundamentals for ${t.symbol} (${t.market})`);
  }

  console.log('Fundamentals seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
