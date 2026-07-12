import Link from 'next/link';
import { ArrowLeft, ArrowRight, BarChart3 } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import StrategyLeagueClient from '@/components/quant/StrategyLeagueClient';
import { loadStrategyLeagueViewModel } from '@/quant/backtest/leagueViewModel';

export default async function QuantResultsPage({ params }: { params: { locale: string } }) {
  const locale = params.locale || 'ar';
  const session = await auth();
  if (!session?.user?.id) redirect(`/${locale}/login`);

  const [t, league] = await Promise.all([
    getTranslations('QuantResults'),
    loadStrategyLeagueViewModel(),
  ]);
  const BackIcon = locale === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-10 space-y-5">
        <Link
          href={`/${locale}/quant`}
          className="inline-flex items-center gap-2 text-sm font-medium text-foreground/65 transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <BackIcon className="h-4 w-4" aria-hidden="true" />
          {t('backToCommittee')}
        </Link>
        <div className="flex items-center gap-3 text-accent">
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-semibold uppercase ltr:tracking-[0.16em]">{t('eyebrow')}</span>
        </div>
      </header>

      <StrategyLeagueClient teams={league.teams} />
    </main>
  );
}
