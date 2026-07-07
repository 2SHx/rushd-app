import { NextResponse } from 'next/server';
import { fetchMarketData } from '@/services/marketData';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const market = searchParams.get('market') === 'NASDAQ' ? 'NASDAQ' : 'TASI';

  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol' }, { status: 400 });
  }

  try {
    const data = await fetchMarketData(symbol, market);
    
    // Fetch user shares owned for this symbol
    let sharesOwned = 0;
    const holding = await prisma.portfolioItem.findUnique({
      where: {
        userId_symbol: {
          userId: session.user.id,
          symbol,
        },
      },
    });
    if (holding) {
      sharesOwned = Number(holding.shares);
    }

    return NextResponse.json({
      ...data,
      sharesOwned,
    });
  } catch (error) {
    console.error(`Error in /api/market-data for ${symbol}:`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
