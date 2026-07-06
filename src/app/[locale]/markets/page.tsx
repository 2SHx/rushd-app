import { fetchMarketData } from '@/services/marketData';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import MarketsClient from '@/components/MarketsClient';

interface MarketsPageProps {
  searchParams: {
    symbol?: string;
    market?: string;
  };
  params: {
    locale: string;
  };
}

export default async function MarketsPage({ searchParams, params }: MarketsPageProps) {
  const session = await auth();
  const rawMarket = searchParams.market === 'NASDAQ' ? 'NASDAQ' : 'TASI';
  const defaultSymbol = rawMarket === 'TASI' ? '2222.SR' : 'NVDA';
  const symbol = searchParams.symbol || defaultSymbol;

  const currentData = await fetchMarketData(symbol, rawMarket);
  const isParent = session?.user?.role === 'PARENT';

  const userId = session?.user?.id;
  let jarBalance = 0;
  let sharesOwned = 0;

  if (userId) {
    try {
      const jar = await prisma.savingsJar.findUnique({
        where: { userId }
      });
      if (jar) {
        jarBalance = Number(jar.balance);
      }

      const holding = await prisma.portfolioItem.findUnique({
        where: {
          userId_symbol: {
            userId,
            symbol
          }
        }
      });
      if (holding) {
        sharesOwned = Number(holding.shares);
      }
    } catch (err) {
      console.error('Failed to load user jar/portfolio for markets page:', err);
    }
  }

  return (
    <MarketsClient 
      currentData={currentData}
      locale={params.locale}
      isParent={isParent}
      initialActiveSymbol={searchParams.symbol || null}
      initialJarBalance={jarBalance}
      initialSharesOwned={sharesOwned}
    />
  );
}
