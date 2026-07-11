import { Currency, DataSource, Market, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { computePortfolioMetrics } from '@/quant/backtest/portfolioEngine';

const MAX_MARK_AGE_MS = 5 * 24 * 60 * 60 * 1000;

export type PortfolioPerformanceStatus =
  | 'available'
  | 'no_snapshots'
  | 'multiple_strategies'
  | 'mixed_currencies';

export interface PortfolioPositionView {
  symbol: string;
  name: string;
  market: Market;
  currency: Currency;
  shares: number;
  costBasis: number | null;
  price: number;
  value: number;
  weight: number | null;
  complianceStatus: 'VERIFIED_COMPLIANT' | 'VERIFIED_NON_COMPLIANT' | 'UNVERIFIED';
}

export interface PortfolioCurrencyTotal {
  currency: Currency;
  positionsValue: number;
  cashValue: number | null;
  totalValue: number | null;
}

function complianceStatus(shariaGate: Prisma.JsonValue): PortfolioPositionView['complianceStatus'] {
  if (!shariaGate || typeof shariaGate !== 'object' || Array.isArray(shariaGate)) {
    return 'UNVERIFIED';
  }
  if (
    shariaGate.source === 'mock'
    || shariaGate.source === 'portfolio-construction'
    || shariaGate.source === 'none'
    || shariaGate.reason === 'screener_unavailable_fail_closed'
  ) {
    return 'UNVERIFIED';
  }
  if (shariaGate.compliant === true) return 'VERIFIED_COMPLIANT';
  if (shariaGate.compliant === false) return 'VERIFIED_NON_COMPLIANT';
  return 'UNVERIFIED';
}

export async function loadPortfolioViewModel(userId: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      cashVirtual: true,
      portfolioItems: {
        select: { symbol: true, shares: true, market: true, currency: true, costBasis: true },
      },
      strategies: { select: { id: true } },
    },
  });

  if (!user) return null;

  const nasdaqSymbols = user.portfolioItems
    .filter((item) => item.market === Market.NASDAQ)
    .map((item) => item.symbol);
  const tasiSymbols = user.portfolioItems
    .filter((item) => item.market === Market.TASI)
    .map((item) => item.symbol);
  const strategyIds = user.strategies.map((strategy) => strategy.id);
  const freshAfter = new Date(now.getTime() - MAX_MARK_AGE_MS);

  const positionFilters = user.portfolioItems.map((item) => ({
    symbol: item.symbol,
    market: item.market,
  }));

  const [bars, snapshots, complianceDecisions] = await Promise.all([
    user.portfolioItems.length === 0
      ? []
      : prisma.marketBar.findMany({
          where: {
            interval: 'DAY',
            ts: { gte: freshAfter, lte: now },
            OR: [
              ...(nasdaqSymbols.length > 0
                ? [{ market: Market.NASDAQ, source: DataSource.ALPACA, symbol: { in: nasdaqSymbols } }]
                : []),
              ...(tasiSymbols.length > 0
                ? [
                    {
                      market: Market.TASI,
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
    positionFilters.length === 0
      ? []
      : prisma.decision.findMany({
          where: { userId, OR: positionFilters },
          select: { symbol: true, market: true, shariaGate: true },
          orderBy: { createdAt: 'desc' },
          distinct: ['symbol', 'market'],
          take: positionFilters.length,
        }),
  ]);

  const snapshotStrategyIds = new Set(snapshots.map((snapshot) => snapshot.strategyId));
  const singleStrategySnapshots = snapshotStrategyIds.size === 1 ? snapshots : [];
  const positionCurrencies = new Set(user.portfolioItems.map((item) => item.currency));
  const snapshotCurrencies = new Set(singleStrategySnapshots.map((snapshot) => snapshot.currency));
  const hasMixedPositions = positionCurrencies.size > 1;
  const hasMixedSnapshotCurrencies = snapshotCurrencies.size > 1;
  const solePositionCurrency = positionCurrencies.size === 1
    ? positionCurrencies.values().next().value as Currency
    : null;
  const soleSnapshotCurrency = snapshotCurrencies.size === 1
    ? snapshotCurrencies.values().next().value as Currency
    : null;
  const hasCurrencyMismatch = !!solePositionCurrency
    && !!soleSnapshotCurrency
    && solePositionCurrency !== soleSnapshotCurrency;
  const combinedCurrency = snapshotStrategyIds.size === 1 && !hasMixedSnapshotCurrencies
    ? soleSnapshotCurrency
    : null;

  let performanceStatus: PortfolioPerformanceStatus;
  if (hasMixedPositions) {
    performanceStatus = 'mixed_currencies';
  } else if (snapshots.length < 2) {
    performanceStatus = 'no_snapshots';
  } else if (snapshotStrategyIds.size > 1) {
    performanceStatus = 'multiple_strategies';
  } else if (hasMixedSnapshotCurrencies || hasCurrencyMismatch) {
    performanceStatus = 'mixed_currencies';
  } else {
    performanceStatus = 'available';
  }

  const prices = new Map(
    bars.map((bar) => [`${bar.market}:${bar.symbol}`, bar.close] as const),
  );
  const complianceByPosition = new Map(
    complianceDecisions.map((decision) => [
      `${decision.market}:${decision.symbol}`,
      complianceStatus(decision.shariaGate),
    ] as const),
  );
  const holdingsByCurrency = new Map<Currency, Prisma.Decimal>();
  const positions: PortfolioPositionView[] = [];
  const unpricedSymbols: string[] = [];

  for (const item of user.portfolioItems) {
    const price = prices.get(`${item.market}:${item.symbol}`);
    if (!price) {
      unpricedSymbols.push(item.symbol);
      continue;
    }

    const value = item.shares.mul(price);
    holdingsByCurrency.set(
      item.currency,
      (holdingsByCurrency.get(item.currency) ?? new Prisma.Decimal(0)).add(value),
    );
    positions.push({
      symbol: item.symbol,
      name: item.symbol,
      market: item.market,
      currency: item.currency,
      shares: Number(item.shares.toString()),
      costBasis: item.costBasis === null ? null : Number(item.costBasis.toString()),
      price: Number(price.toString()),
      value: Number(value.toString()),
      weight: null,
      complianceStatus: complianceByPosition.get(`${item.market}:${item.symbol}`) ?? 'UNVERIFIED',
    });
  }

  const latestSnapshot = singleStrategySnapshots.at(-1) ?? null;
  const cash = latestSnapshot?.cashVirtual ?? user.cashVirtual;
  const nav = latestSnapshot?.nav ?? null;
  const navNumber = nav ? Number(nav.toString()) : null;
  const finalPositions = positions.map((position) => ({
    ...position,
    weight: nav?.isPositive() && position.currency === combinedCurrency
      ? position.value / Number(nav.toString())
      : null,
  }));

  const currencies = new Set<Currency>([
    ...Array.from(positionCurrencies),
    ...(combinedCurrency ? [combinedCurrency] : []),
  ]);
  const currencyTotals: PortfolioCurrencyTotal[] = Array.from(currencies).map((currency) => {
    const positionsValue = Number((holdingsByCurrency.get(currency) ?? new Prisma.Decimal(0)).toString());
    const cashValue = latestSnapshot?.currency === currency
      ? Number(latestSnapshot.cashVirtual.toString())
      : null;
    return {
      currency,
      positionsValue,
      cashValue,
      totalValue: cashValue === null ? null : cashValue + positionsValue,
    };
  });

  const performanceSnapshots = performanceStatus === 'available' ? singleStrategySnapshots : [];
  const initialSnapshots = performanceSnapshots.map((snapshot) => ({
    asOf: snapshot.asOf.toISOString(),
    nav: Number(snapshot.nav.toString()),
    cashVirtual: Number(snapshot.cashVirtual.toString()),
    currency: snapshot.currency,
    spy: Number(snapshot.benchmarkNavSpy.toString()),
    spus: Number(snapshot.benchmarkNavSpus.toString()),
  }));
  const curve = performanceSnapshots.map((snapshot) => ({
    ts: snapshot.asOf,
    equity: Number(snapshot.nav.toString()),
    cash: Number(snapshot.cashVirtual.toString()),
    spy: Number(snapshot.benchmarkNavSpy.toString()),
    spus: Number(snapshot.benchmarkNavSpus.toString()),
  }));

  return {
    initialNAV: navNumber,
    initialCash: Number(cash.toString()),
    cashCurrency: combinedCurrency,
    initialPositions: finalPositions,
    initialSnapshots,
    initialMetrics: computePortfolioMetrics(curve),
    performanceStatus,
    combinedValueStatus: combinedCurrency ? 'available' as const : 'mixed_currencies' as const,
    currencyTotals,
    unpricedSymbols,
  };
}
