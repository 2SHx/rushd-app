import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2, GraduationCap, XCircle, AlertTriangle } from 'lucide-react';
import CommitteeClient from '@/components/quant/CommitteeClient';
import IncubationCockpit, { IncubationCockpitFallback } from '@/components/quant/IncubationCockpit';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { loadPortfolioViewModel } from '@/quant/portfolio/viewModel';
import { loadStrategyLeagueViewModel } from '@/quant/backtest/leagueViewModel';
import { SHOW_STRATEGY_TEAMS } from '@/lib/featureFlags';
import { STRATEGY_SETUP_CATALOG } from '@/quant/strategies/catalog';
import type { RunnableSetup } from '@/components/quant/RunLabPanel';

export default async function QuantPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams?: { section?: string };
}) {
  const locale = params.locale || 'en';
  const session = await auth();
  const userId = session?.user?.id;

  const portfolio = userId ? await loadPortfolioViewModel(userId) : null;
  const purificationEntries = userId ? await prisma.purificationEntry.findMany({ where: { userId } }) : [];
  const initialPurification = purificationEntries.map(e => ({
    id: e.id,
    symbol: e.symbol,
    amount: Number(e.amount.toString()),
    ratio: Number(e.ratio.toString()),
    profit: Number(e.profit.toString()),
    createdAt: e.createdAt.toISOString()
  }));

  const trades = userId ? await prisma.transaction.findMany({
    where: { userId, type: 'TRADE' },
    orderBy: { createdAt: 'desc' }
  }) : [];

  const initialTrades = trades.map(t => ({
    id: t.id,
    amount: Number(t.amount.toString()),
    currency: t.currency,
    description: t.description || '',
    createdAt: t.createdAt.toISOString()
  }));

  const strategy = userId ? await prisma.strategy.findFirst({
    where: { ownerUserId: userId },
    select: { id: true, autonomyTier: true }
  }) : null;
  const initialAutonomyTier = strategy?.autonomyTier || 'HUMAN_APPROVE';

  const decisions = userId ? await prisma.decision.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { signals: true }
  }) : [];

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

  const league = SHOW_STRATEGY_TEAMS ? await loadStrategyLeagueViewModel() : null;
  const runnableSetups = SHOW_STRATEGY_TEAMS
    ? Object.values(STRATEGY_SETUP_CATALOG).map((setup): RunnableSetup => ({
        id: setup.id,
        version: setup.version,
        cadence: setup.cadence,
        universeCompatibility: setup.universeCompatibility ?? 'halal-only',
      }))
    : [];
  const initialSection = searchParams?.section === 'teams' && SHOW_STRATEGY_TEAMS
    ? 'teams'
    : searchParams?.section === 'portfolio'
      ? 'portfolio'
      : 'advisor';
  const leagueAcceptedCount = league ? league.teams.filter(team => team.status === 'ACCEPTED').length : 0;
  const leagueRejectedCount = league ? league.teams.filter(team => team.status === 'REJECTED').length : 0;

  const t = await getTranslations('Quant');
  const resultsT = SHOW_STRATEGY_TEAMS ? await getTranslations('QuantResults') : null;
  const ForwardIcon = locale === 'ar' ? ArrowLeft : ArrowRight;
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const count = (value: number) => new Intl.NumberFormat(numberLocale).format(value);
  const performanceStatus = portfolio?.performanceStatus ?? 'no_snapshots';
  const performanceWarning = {
    no_snapshots: t('portfolioPerformanceNoSnapshots'),
    multiple_strategies: t('portfolioPerformanceMultipleStrategies'),
    mixed_currencies: t('portfolioPerformanceMixedCurrencies'),
    available: null,
  }[performanceStatus];

  const initialPositions = portfolio?.initialPositions ?? [];
  const canRenderCommittee = true;
  const unpricedSymbols = portfolio?.unpricedSymbols ?? [];
  const readinessMessages = [
    unpricedSymbols.length > 0
      ? t('portfolioPricingIncomplete', { symbols: unpricedSymbols.join(', ') })
      : null,
    performanceWarning,
    !canRenderCommittee ? t('portfolioInteractiveUnavailable') : null,
  ].filter((message): message is string => Boolean(message));

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:space-y-8 lg:p-8">
      <section className="relative isolate overflow-hidden rounded-[2rem] bg-surface-card p-6 shadow-[0_24px_80px_-48px_rgba(79,70,229,0.55)] ring-1 ring-border-color sm:p-8">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-accent/[0.10] via-transparent to-up/[0.08]" />
        <div className="pointer-events-none absolute -end-20 -top-24 -z-10 size-72 rounded-full bg-accent/10 blur-3xl" />
        <div className={`grid items-end gap-8 ${SHOW_STRATEGY_TEAMS ? 'lg:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
          <div className="max-w-3xl text-start">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-up/[0.10] px-3 py-1.5 text-xs font-semibold text-up ring-1 ring-inset ring-up/20">
              <GraduationCap className="size-4" aria-hidden="true" />
              <span>{t('paperDisclaimer')}</span>
            </div>
            <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('title')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/65 sm:text-base">{t('subtitle')}</p>
            <p className="mt-5 max-w-2xl text-xs leading-5 text-foreground/50">{t('ultraNote')}</p>
          </div>

          {SHOW_STRATEGY_TEAMS ? (
          <Link
            href={`/${locale}/quant?section=teams#quant-workspace`}
            className="group flex min-h-36 items-center justify-between gap-4 rounded-3xl bg-surface-card/80 p-5 text-start shadow-[0_18px_55px_-40px_rgba(15,23,42,0.65)] ring-1 ring-border-color backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:ring-accent/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex min-w-0 items-start gap-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                <BarChart3 className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{resultsT!('eyebrow')}</p>
                <h2 className="mt-1 text-base font-bold text-foreground">{resultsT!('navLabel')}</h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold tabular-nums">
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-up/10 px-2 py-1 text-up">
                    <CheckCircle2 className="size-3" aria-hidden="true" />
                    {resultsT!('acceptedCount', { count: count(leagueAcceptedCount) })}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-lg bg-down/10 px-2 py-1 text-down">
                    <XCircle className="size-3" aria-hidden="true" />
                    {resultsT!('rejectedCount', { count: count(leagueRejectedCount) })}
                  </span>
                </div>
              </div>
            </div>
            <ForwardIcon className="size-5 shrink-0 text-foreground/35 transition-transform duration-200 group-hover:translate-x-1 rtl:group-hover:-translate-x-1" aria-hidden="true" />
          </Link>
          ) : null}
        </div>
      </section>

      {readinessMessages.length > 0 ? (
        <section className="rounded-3xl bg-amber-500/[0.07] p-5 text-start ring-1 ring-inset ring-amber-500/20 sm:p-6" aria-labelledby="quant-readiness-title">
          <div className="flex items-start gap-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="quant-readiness-title" className="text-sm font-bold text-foreground">{t('readinessTitle')}</h2>
              <p className="mt-1 text-xs leading-5 text-foreground/55">{t('readinessBody')}</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-foreground/70">
                {readinessMessages.map(message => (
                  <li key={message} className="flex gap-2 before:mt-2 before:size-1 before:shrink-0 before:rounded-full before:bg-amber-500">
                    <span>{message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      <Suspense fallback={<IncubationCockpitFallback locale={locale} />}>
        <IncubationCockpit locale={locale} />
      </Suspense>

      <section id="quant-workspace" className="scroll-mt-6">
        <CommitteeClient
          locale={locale}
          initialNAV={portfolio?.initialNAV ?? null}
          initialCash={portfolio?.initialCash ?? 0}
          initialCashCurrency={portfolio?.cashCurrency ?? null}
          initialPositions={initialPositions}
          initialSnapshots={portfolio?.initialSnapshots ?? []}
          initialPurification={initialPurification}
          initialMetrics={portfolio?.initialMetrics}
          initialPerformanceStatus={performanceStatus}
          initialTrades={initialTrades}
          initialDecisions={initialDecisions}
          initialAutonomyTier={initialAutonomyTier as any}
          initialInternalPortfolioAvailable={canRenderCommittee}
          initialStrategyTeams={league?.teams}
          initialRunnableSetups={runnableSetups}
          initialSection={initialSection}
        />
      </section>
    </div>
  );
}
