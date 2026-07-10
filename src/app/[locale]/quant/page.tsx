import { getTranslations } from 'next-intl/server';
import { GraduationCap } from 'lucide-react';
import CommitteeClient from '@/components/quant/CommitteeClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { loadPortfolioViewModel } from '@/quant/portfolio/viewModel';

export default async function QuantPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'en';
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  const portfolio = await loadPortfolioViewModel(userId);

  if (!portfolio) {
    redirect(`/${locale}/login`);
  }

  const purificationEntries = await prisma.purificationEntry.findMany({ where: { userId } });
  const initialPurification = purificationEntries.map(e => ({
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

      {portfolio.unpricedSymbols.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          {t('portfolioPricingIncomplete', { symbols: portfolio.unpricedSymbols.join(', ') })}
        </div>
      )}

      <CommitteeClient 
        locale={locale} 
        initialNAV={portfolio.initialNAV}
        initialCash={portfolio.initialCash}
        initialPositions={portfolio.initialPositions}
        initialSnapshots={portfolio.initialSnapshots}
        initialPurification={initialPurification}
        initialMetrics={portfolio.initialMetrics}
        initialTrades={initialTrades}
      />
    </div>
  );
}
