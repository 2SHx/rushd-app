import { fetchMarketData } from '@/services/marketData';
import { auth } from '@/auth';
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

  return (
    <MarketsClient 
      currentData={currentData}
      locale={params.locale}
      isParent={isParent}
    />
  );
}
