import { DataSource, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computePortfolioMetrics } from '@/quant/backtest/portfolioEngine';

const MAX_MARK_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export async function loadPortfolioViewModel(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      cashVirtual: true,
      portfolioItems: {
        select: { symbol: true, shares: true, market: true, costBasis: true },
      },
      strategies: { select: { id: true } },
    },
  });

  if (!user) return null;

  const nasdaqSymbols = user.portfolioItems
    .filter((item) => item.market === 'NASDAQ')
    .map((item) => item.symbol);
  const tasiSymbols = user.portfolioItems
    .filter((item) => item.market === 'TASI')
    .map((item) => item.symbol);
  const strategyIds = user.strategies.map((strategy) => strategy.id);
  const freshAfter = new Date(now.getTime() - MAX_MARK_AGE_MS);

  const [bars, snapshots] = await Promise.all([
    user.portfolioItems.length === 0
      ? []
      : prisma.marketBar.findMany({
          where: {
            interval: 'DAY',
            ts: { gte: freshAfter, lte: now },
            OR: [
              ...(nasdaqSymbols.length > 0
                ? [{ market: 'NASDAQ' as const, source: DataSource.ALPACA, symbol: { in: nasdaqSymbols } }]
                : []),
              ...(tasiSymbols.length > 0
                ? [
                    {
                      market: 'TASI' as const,
                      source: { in: [DataSource.SAHMK, DataSource.TWELVEDATA] },
                      symbol: { in: tasiSymbols },
                    },
                  ]
                : []),
            ],
          },
          orderBy: { ts: 'desc' },
          distinct: ['symbol', 'market'],
        }),
    strategyIds.length === 0
      ? []
      : prisma.portfolioSnapshot.findMany({
          where: { userId, strategyId: { in: strategyIds } },
          orderBy: { asOf: 'asc' },
        }),
  ]);

  const prices = new Map(
    bars.map((bar) => [`${bar.market}:${bar.symbol}`, bar.close] as const),
  );
  let markedHoldings = new Prisma.Decimal(0);
  const positions = [];
  const unpricedSymbols: string[] = [];

  for (const item of user.portfolioItems) {
    const price = prices.get(`${item.market}:${item.symbol}`);
    if (!price) {
      unpricedSymbols.push(item.symbol);
      continue;
    }

    const value = item.shares.mul(price);
    markedHoldings = markedHoldings.add(value);
    positions.push({
      symbol: item.symbol,
      name: item.symbol,
      shares: Number(item.shares.toString()),
      costBasis: Number((item.costBasis ?? price).toString()),
      price: Number(price.toString()),
      value: Number(value.toString()),
      weight: 0,
    });
  }

  const cash = user.cashVirtual;
  const nav = cash.add(markedHoldings);
  const navNumber = Number(nav.toString());
  const finalPositions = positions.map((position) => ({
    ...position,
    weight: nav.isPositive() ? position.value / navNumber : 0,
  }));
  const initialSnapshots = snapshots.map((snapshot) => ({
    asOf: snapshot.asOf.toISOString(),
    nav: Number(snapshot.nav.toString()),
    cashVirtual: Number(snapshot.cashVirtual.toString()),
    spy: Number(snapshot.benchmarkNavSpy.toString()),
    spus: Number(snapshot.benchmarkNavSpus.toString()),
  }));
  const curve = snapshots.map((snapshot) => ({
    ts: snapshot.asOf,
    equity: Number(snapshot.nav.toString()),
    cash: Number(snapshot.cashVirtual.toString()),
    spy: Number(snapshot.benchmarkNavSpy.toString()),
    spus: Number(snapshot.benchmarkNavSpus.toString()),
  }));

  return {
    initialNAV: navNumber,
    initialCash: Number(cash.toString()),
    initialPositions: finalPositions,
    initialSnapshots,
    initialMetrics: computePortfolioMetrics(curve),
    unpricedSymbols,
  };
}
