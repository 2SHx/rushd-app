import { fetchMarketData } from '@/services/marketData';
import DashboardClient from '@/components/DashboardClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { TICKERS } from '@/components/MarketsClient';

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  // Fetch actual student/investor dashboard statistics
  let xp = 0;
  let level = 1;
  let jarBalance = 100000.00;
  let portfolioItems: any[] = [];
  let transactions: any[] = [];

  try {
    let profile = await prisma.gamificationProfile.findUnique({
      where: { userId }
    });

    if (!profile) {
      profile = await prisma.gamificationProfile.create({
        data: { userId, xp: 0, level: 1 }
      });
    }

    xp = profile.xp;
    level = profile.level;

    let jar = await prisma.savingsJar.findUnique({
      where: { userId }
    });
    if (!jar) {
      jar = await prisma.savingsJar.create({
        data: { userId, balance: 100000.00, currency: 'SAR' }
      });
    }
    jarBalance = Number(jar.balance);

    const items = await prisma.portfolioItem.findMany({
      where: { userId }
    });

    // Populate current stock valuations dynamically
    const listTickers = [...TICKERS.TASI, ...TICKERS.NASDAQ];
    for (const item of items) {
      try {
        const marketData = await fetchMarketData(item.symbol, item.market);
        const currentPrice = marketData?.price ?? 0;
        
        const tickerInfo = listTickers.find(t => t.symbol === item.symbol);
        const change = tickerInfo ? tickerInfo.change : 0;
        const pct = tickerInfo ? tickerInfo.pct : 0;
        const isCompliant = marketData?.isShariaCompliant ?? true;

        portfolioItems.push({
          id: item.id,
          symbol: item.symbol,
          shares: Number(item.shares),
          market: item.market,
          currency: item.currency,
          price: currentPrice,
          change,
          pct,
          isCompliant
        });
      } catch (err) {
        portfolioItems.push({
          id: item.id,
          symbol: item.symbol,
          shares: Number(item.shares),
          market: item.market,
          currency: item.currency,
          price: 0,
          change: 0,
          pct: 0,
          isCompliant: true
        });
      }
    }

    const txs = await prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10
    });
    transactions = txs.map(t => ({
      id: t.id,
      amount: Number(t.amount),
      currency: t.currency,
      type: t.type,
      description: t.description,
      createdAt: t.createdAt.toISOString()
    }));
  } catch (err) {
    console.error('Database loading failed on dashboard page:', err);
  }

  const tasiData = await fetchMarketData('1120.SR', 'TASI'); 
  const nasdaqData = await fetchMarketData('AAPL', 'NASDAQ');

  return (
    <DashboardClient 
      tasiData={tasiData} 
      nasdaqData={nasdaqData} 
      initialXp={xp}
      initialLevel={level}
      locale={locale}
      initialJarBalance={jarBalance}
      initialPortfolio={portfolioItems}
      initialTransactions={transactions}
    />
  );
}

