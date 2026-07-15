import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2, GraduationCap, XCircle } from 'lucide-react';
import CommitteeClient from '@/components/quant/CommitteeClient';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { loadPortfolioViewModel } from '@/quant/portfolio/viewModel';
import { loadStrategyLeagueViewModel } from '@/quant/backtest/leagueViewModel';

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

  const strategy = await prisma.strategy.findFirst({
    where: { ownerUserId: userId },
    select: { id: true, autonomyTier: true }
  });
  const initialAutonomyTier = strategy?.autonomyTier || 'HUMAN_APPROVE';

  const decisions = await prisma.decision.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { signals: true }
  });

  const initialDecisions = decisions.map(d => ({
    id: d.id,
    symbol: d.symbol,
    market: d.market,
    asOf: d.asOf.toISOString(),
    proposedAction: d.proposedAction,
    proposedQty: Number(d.proposedQty?.toString() || '0'),
    finalAction: d.finalAction,
    finalQty: Number(d.finalQty?.toString() || '0'),
    shariaGate: d.shariaGate as any,
    riskAdjustments: d.riskAdjustments as any,
    debateTranscript: d.debateTranscript as any,
    status: d.status,
    costCents: d.costCents,
    createdAt: d.createdAt.toISOString(),
    signals: d.signals.map(s => ({
      id: s.id,
      agent: s.agent,
      stance: s.stance,
      conviction: Number(s.conviction.toString()),
      rationaleEn: s.rationaleEn,
      rationaleAr: s.rationaleAr,
      evidence: s.evidence,
      failureMode: s.failureMode,
    })),
  }));

  const league = await loadStrategyLeagueViewModel();
  const leagueAcceptedCount = league.teams.filter(team => team.status === 'ACCEPTED').length;
  const leagueRejectedCount = league.teams.filter(team => team.status === 'REJECTED').length;

  const t = await getTranslations('Quant');
  const resultsT = await getTranslations('QuantResults');
  const ForwardIcon = locale === 'ar' ? ArrowLeft : ArrowRight;
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const count = (value: number) => new Intl.NumberFormat(numberLocale).format(value);
  const performanceWarning = {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: null,
  }[portfolio.performanceStatus];
  const committeePositions = portfolio.initialPositions.every(
    position => position.costBasis !== null && position.weight !== null,
  )
    ? portfolio.initialPositions.map(position => ({
        ...position,
        costBasis: position.costBasis as number,
        weight: position.weight as number,
      }))
    : null;
  const canRenderCommittee = portfolio.initialNAV !== null && committeePositions !== null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-foreground ltr:tracking-tight">{t('title')}</h1>
        <p className="text-sm leading-6 text-foreground/65">{t('subtitle')}</p>
      </div>

      <Link
        href={`/${locale}/quant/league`}
        className="group flex items-center justify-between gap-4 rounded-2xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] transition-colors duration-150 hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <BarChart3 className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-accent ltr:tracking-[0.14em]">{resultsT('eyebrow')}</p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">{resultsT('navLabel')}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs tabular-nums">
              <span className="inline-flex items-center gap-1.5 text-up">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                {resultsT('acceptedCount', { count: count(leagueAcceptedCount) })}
              </span>
              <span className="inline-flex items-center gap-1.5 text-down">
                <XCircle className="size-3.5" aria-hidden="true" />
                {resultsT('rejectedCount', { count: count(leagueRejectedCount) })}
              </span>
            </div>
          </div>
        </div>
        <ForwardIcon className="size-5 shrink-0 text-foreground/40" aria-hidden="true" />
      </Link>

      <div className="flex items-start gap-3 rounded-2xl bg-up/5 p-4 text-start shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
        <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-up" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{t('disclaimer')}</p>
          <p className="text-xs leading-relaxed text-foreground/60">{t('ultraNote')}</p>
        </div>
      </div>

      {portfolio.unpricedSymbols.length > 0 && (
        <div className="rounded-2xl border border-noncompliant/30 bg-noncompliant/10 p-4 text-sm text-noncompliant">
          {t('portfolioPricingIncomplete', { symbols: portfolio.unpricedSymbols.join(', ') })}
        </div>
      )}

      {performanceWarning && (
        <div className="rounded-2xl border border-noncompliant/30 bg-noncompliant/10 p-4 text-sm text-noncompliant">
          {performanceWarning}
        </div>
      )}

      {!canRenderCommittee ? (
        <div className="rounded-2xl border border-noncompliant/30 bg-noncompliant/10 p-4 text-sm text-noncompliant">
          {t('portfolioInteractiveUnavailable')}
        </div>
      ) : null}

      <CommitteeClient
        locale={locale}
        initialNAV={portfolio.initialNAV ?? 0}
        initialCash={portfolio.initialCash}
        initialPositions={committeePositions ?? []}
        initialSnapshots={portfolio.initialSnapshots}
        initialPurification={initialPurification}
        initialMetrics={portfolio.initialMetrics}
        initialTrades={initialTrades}
        initialDecisions={initialDecisions}
        initialAutonomyTier={initialAutonomyTier}
        initialInternalPortfolioAvailable={canRenderCommittee}
      />
    </div>
  );
}
