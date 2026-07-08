import { getTranslations, getMessages } from 'next-intl/server';
import { GraduationCap } from 'lucide-react';
import CommitteeClient from '@/components/quant/CommitteeClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { getNormalizedBenchmarks } from '@/quant/data/benchmarks';
import { computePortfolioMetrics } from '@/quant/backtest/portfolioEngine';

export default async function QuantPage({ params }: { params: { locale: string } }) {
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

  const initialPurification = dbUser.purificationEntries.map(e => ({
    id: e.id,
    symbol: e.symbol,
    amount: Number(e.amount.toString()),
    ratio: Number(e.ratio.toString()),
    profit: Number(e.profit.toString()),
    createdAt: e.createdAt.toISOString()
  }));

  const trades = await prisma.transaction.findMany({
    where: { userId, type: 'TRADE' },
    orderBy: { createdAt: 'desc' }
  });

  const initialTrades = trades.map(t => ({
    id: t.id,
    amount: Number(t.amount.toString()),
    currency: t.currency,
    description: t.description || '',
    createdAt: t.createdAt.toISOString()
  }));

  const t = await getTranslations('Quant');

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-extrabold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
          {t('title')}
        </h1>
        <p className="text-gray-400 mt-1 text-sm">{t('subtitle')}</p>
      </div>

      <div className="glass-panel p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex items-start gap-3 text-start">
        <GraduationCap className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-emerald-300 font-bold text-sm">{t('disclaimer')}</p>
          <p className="text-gray-400 text-xs leading-relaxed">{t('ultraNote')}</p>
        </div>
      </div>

      <CommitteeClient 
        locale={locale} 
        initialNAV={currentNAV}
        initialCash={Number(dbUser.cashVirtual.toString())}
        initialPositions={initialPositions}
        initialSnapshots={initialSnapshots}
        initialPurification={initialPurification}
        initialMetrics={metrics}
        initialTrades={initialTrades}
      />
    </div>
  );
}
