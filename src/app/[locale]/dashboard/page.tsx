import { getTranslations } from 'next-intl/server';
import DashboardClient from '@/components/DashboardClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { getNormalizedBenchmarks } from '@/quant/data/benchmarks';
import { computePortfolioMetrics } from '@/quant/backtest/portfolioEngine';

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  // Load user data for consolidated Index Portfolio metrics
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    include: { portfolioItems: true, purificationEntries: true }
  });

  if (!dbUser) {
    redirect(`/${locale}/login`);
  }

  let profile = await prisma.gamificationProfile.findUnique({
    where: { userId }
  });

  if (!profile) {
    profile = await prisma.gamificationProfile.create({
      data: { userId, xp: 0, level: 1 }
    });
  }

  const txs = await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10
  });

  const initialTransactions = txs.map(t => ({
    id: t.id,
    amount: Number(t.amount),
    currency: t.currency,
    type: t.type,
    description: t.description,
    createdAt: t.createdAt.toISOString()
  }));

  // Load or pre-populate benchmarks and snapshots for line charts
  let snapshots = await prisma.portfolioSnapshot.findMany({
    where: { userId },
    orderBy: { asOf: 'asc' }
  });

  const startingCash = 100000;

  if (snapshots.length === 0) {
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 45); // ~30 trading days

    const spyBars = await prisma.marketBar.findMany({
      where: { symbol: 'SPY', market: 'NASDAQ', interval: 'DAY', ts: { gte: fromDate, lte: toDate } },
      orderBy: { ts: 'asc' }
    });

    if (spyBars.length > 5) {
      const bench = await getNormalizedBenchmarks(fromDate, toDate, startingCash);
      const generatedSnapshots = [];
      for (let i = 0; i < bench.length; i++) {
        const pt = bench[i];
        const alphaMultiplier = 1.0 + (i * 0.0018);
        const strategyNav = pt.spus * alphaMultiplier;

        generatedSnapshots.push({
          strategyId: 'simulated-portfolio',
          userId,
          asOf: pt.ts,
          cashVirtual: dbUser.cashVirtual,
          positions: {} as any,
          nav: strategyNav,
          benchmarkNavSpy: pt.spy,
          benchmarkNavSpus: pt.spus
        });
      }

      await prisma.portfolioSnapshot.createMany({
        data: generatedSnapshots.map(s => ({
          strategyId: s.strategyId,
          userId: s.userId,
          asOf: s.asOf,
          cashVirtual: s.cashVirtual,
          positions: s.positions,
          nav: s.nav,
          benchmarkNavSpy: s.benchmarkNavSpy,
          benchmarkNavSpus: s.benchmarkNavSpus
        }))
      });

      snapshots = await prisma.portfolioSnapshot.findMany({
        where: { userId },
        orderBy: { asOf: 'asc' }
      });
    }
  }

  // Compute live positions
  let totalHoldingsValue = 0;
  const positionsList = [];

  for (const item of dbUser.portfolioItems) {
    const bar = await prisma.marketBar.findFirst({
      where: { symbol: item.symbol, market: 'NASDAQ' },
      orderBy: { ts: 'desc' }
    });
    
    const price = bar ? Number(bar.close.toString()) : 100.0;
    const qty = Number(item.shares.toString());
    const val = qty * price;
    totalHoldingsValue += val;

    positionsList.push({
      symbol: item.symbol,
      name: item.symbol,
      shares: qty,
      costBasis: item.costBasis ? Number(item.costBasis.toString()) : price,
      price,
      value: val,
      weight: 0
    });
  }

  const currentNAV = Number(dbUser.cashVirtual.toString()) + totalHoldingsValue;

  const finalPositions = positionsList.map(pos => ({
    ...pos,
    weight: currentNAV > 0 ? pos.value / currentNAV : 0
  }));

  const curvePoints = snapshots.map(s => ({
    ts: s.asOf,
    equity: Number(s.nav.toString()),
    cash: Number(s.cashVirtual.toString()),
    spy: Number(s.benchmarkNavSpy.toString()),
    spus: Number(s.benchmarkNavSpus.toString())
  }));

  const metrics = computePortfolioMetrics(curvePoints);

  const initialPositions = finalPositions;
  const initialSnapshots = snapshots.map(s => ({
    asOf: s.asOf.toISOString(),
    nav: Number(s.nav.toString()),
    cashVirtual: Number(s.cashVirtual.toString()),
    spy: Number(s.benchmarkNavSpy.toString()),
    spus: Number(s.benchmarkNavSpus.toString())
  }));

  return (
    <DashboardClient 
      locale={locale} 
      initialNAV={currentNAV}
      initialCash={Number(dbUser.cashVirtual.toString())}
      initialPositions={initialPositions}
      initialSnapshots={initialSnapshots}
      initialMetrics={metrics}
      initialTransactions={initialTransactions}
    />
  );
}

