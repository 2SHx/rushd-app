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
  const userId = session?.user?.id;

  const [portfolio, alpacaPaper] = await Promise.all([
    userId ? loadPortfolioViewModel(userId) : null,
    session?.user ? loadAlpacaPaperView(session.user) : { status: 'hidden' as const },
  ]);

  const profile = userId ? await prisma.gamificationProfile.findUnique({
    where: { userId }
  }) : null;

  const txs = userId ? await prisma.transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10
  }) : [];

  const initialTransactions = txs.map(t => ({
    id: t.id,
    amount: Number(t.amount),
    currency: t.currency,
    type: t.type,
    description: t.description,
    createdAt: t.createdAt.toISOString()
  }));

  const t = await getTranslations('Quant');
  const initialPositions = portfolio?.initialPositions ?? [];
  const hasUserPositions = initialPositions.length > 0;
  const performanceStatus = portfolio?.performanceStatus ?? 'no_snapshots';
  const performanceWarning = hasUserPositions ? {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: null,
  }[performanceStatus] : null;

  const unpricedSymbols = portfolio?.unpricedSymbols ?? [];

  return (
    <PortfolioViewSwitcher data={alpacaPaper}>
      {unpricedSymbols.length > 0 && (
        <div className="mx-auto mt-6 max-w-6xl rounded-2xl bg-noncompliant/10 p-4 text-sm leading-relaxed text-noncompliant ring-1 ring-noncompliant/20">
          {t('portfolioPricingIncomplete', { symbols: unpricedSymbols.join(', ') })}
        </div>
      )}
      {performanceWarning && (
        <div className="mx-auto mt-3 max-w-6xl rounded-2xl bg-noncompliant/10 p-4 text-sm leading-relaxed text-noncompliant ring-1 ring-noncompliant/20">
          {performanceWarning}
        </div>
      )}
      <DashboardClient
        locale={locale}
        initialNAV={portfolio?.initialNAV ?? 254853.75}
        initialCash={portfolio?.initialCash ?? 45000}
        cashCurrency={portfolio?.cashCurrency ?? 'SAR'}
        initialPositions={initialPositions}
        initialSnapshots={portfolio?.initialSnapshots ?? []}
        initialMetrics={portfolio?.initialMetrics ?? { cagr: 0.142, sharpe: 1.85, deflatedSharpe: 0.92, maxDrawdown: 0.084, alphaVsSpy: 0.038, alphaVsSpus: 0.052, irVsSpy: 1.2, irVsSpus: 1.45, trackingErrorVsSpy: 0.04, trackingErrorVsSpus: 0.035 }}
        initialTransactions={initialTransactions}
        initialXP={profile?.xp ?? 350}
        initialLevel={profile?.level ?? 1}
        performanceStatus={performanceStatus}
      />
    </PortfolioViewSwitcher>
  );
}
