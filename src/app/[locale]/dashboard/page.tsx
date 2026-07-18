import { getTranslations } from 'next-intl/server';
import DashboardClient from '@/components/DashboardClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { loadPortfolioViewModel } from '@/quant/portfolio/viewModel';
import { loadAlpacaPaperView } from '@/quant/portfolio/alpacaPaperView';
import PortfolioViewSwitcher from '@/components/portfolio/PortfolioViewSwitcher';

export default async function DashboardPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  const [portfolio, alpacaPaper] = await Promise.all([
    loadPortfolioViewModel(userId),
    loadAlpacaPaperView(session.user),
  ]);

  if (!portfolio) {
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

  const t = await getTranslations('Quant');
  const hasUserPositions = portfolio.initialPositions.length > 0;
  const performanceWarning = hasUserPositions ? {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: null,
  }[portfolio.performanceStatus] : null;

  return (
    <PortfolioViewSwitcher data={alpacaPaper}>
      {portfolio.unpricedSymbols.length > 0 && (
        <div className="mx-auto mt-6 max-w-6xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {t('portfolioPricingIncomplete', { symbols: portfolio.unpricedSymbols.join(', ') })}
        </div>
      )}
      {performanceWarning && (
        <div className="mx-auto mt-3 max-w-6xl rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {performanceWarning}
        </div>
      )}
      <DashboardClient
        locale={locale}
        initialNAV={portfolio.initialNAV}
        initialCash={portfolio.initialCash}
        cashCurrency={portfolio.cashCurrency}
        initialPositions={portfolio.initialPositions}
        initialSnapshots={portfolio.initialSnapshots}
        initialMetrics={portfolio.initialMetrics}
        initialTransactions={initialTransactions}
        performanceStatus={portfolio.performanceStatus}
      />
    </PortfolioViewSwitcher>
  );
}
