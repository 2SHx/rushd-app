'use client';

import { useState, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Activity, AlertTriangle, ArrowRight, BookOpen, Check, CheckCircle2, ChevronDown, Info, LockKeyhole, RefreshCw, ShieldAlert, TrendingDown, TrendingUp, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { StrategyLeagueTeam } from '@/quant/backtest/leagueViewModel';
import { isStrategyLearningSetupId } from '@/quant/learning/strategyLearningSetupIds';
import HistoricalComparisonChart from './HistoricalComparisonChart';

interface StrategyLeagueClientProps {
  teams: StrategyLeagueTeam[];
}

type TFunction = ReturnType<typeof useTranslations>;
type Formatter = (value: number | null) => string;
type MoneyFormatter = (value: number) => string;
type DateFormatter = (value: string) => string;
type PerformanceRow = { label: string; hint: string; full: string; oos: string };

const PLOT = { width: 720, height: 360, pad: 58 } as const;
type LearningGateStatus = 'checking' | 'locked' | 'unlocked' | 'error';

// Sharia state -> {icon, semantic token}. Only VERIFIED_NON_COMPLIANT gets the
// noncompliant (amber) token per DR-12; unscreened states are neutral, not amber.
const SHARIA_STATE_STYLE: Record<string, { Icon: typeof CheckCircle2; className: string }> = {
  VERIFIED_COMPLIANT: { Icon: CheckCircle2, className: 'text-up' },
  VERIFIED_NON_COMPLIANT: { Icon: ShieldAlert, className: 'text-noncompliant' },
  UNSCREENED_EXECUTION_BLOCKED: { Icon: AlertTriangle, className: 'text-foreground/70' },
  UNVERIFIED: { Icon: AlertTriangle, className: 'text-foreground/70' },
};

function Disclosures({ t }: { t: TFunction }) {
  return (
    <div className="grid gap-3 text-start sm:grid-cols-2">
      <p className="rounded-xl bg-foreground/[0.04] p-4 text-xs leading-relaxed text-foreground/70">
        {t('simulatedDisclosure')}
      </p>
      <p className="rounded-xl bg-foreground/[0.04] p-4 text-xs leading-relaxed text-foreground/70">
        {t('shariaDisclosure')}
      </p>
    </div>
  );
}

function TeamLearningGate({
  team,
  locale,
  status,
  onRetry,
}: {
  team: StrategyLeagueTeam;
  locale: string;
  status: LearningGateStatus;
  onRetry: () => void;
}) {
  const t = useTranslations('QuantResults');

  return (
    <section className="rounded-3xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-7" aria-labelledby="team-learning-gate-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-accent">
            <BookOpen className="size-4" aria-hidden="true" />
            <p className="text-[10px] font-semibold uppercase ltr:tracking-[0.14em]">{t('learningGate.eyebrow')}</p>
          </div>
          <h2 id="team-learning-gate-title" className="mt-3 text-xl font-semibold">{t('learningGate.title')}</h2>
          <p className="mt-1 font-mono text-xs text-foreground/55" dir="ltr">{team.setupId}</p>
        </div>
        {status === 'unlocked' ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-up/10 px-3 py-2 text-xs font-semibold text-up">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('learningGate.complete')}
          </span>
        ) : status === 'locked' ? (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-foreground/[0.05] px-3 py-2 text-xs font-semibold text-foreground/65">
            <LockKeyhole className="size-4" aria-hidden="true" />
            {t('learningGate.locked')}
          </span>
        ) : null}
      </div>

      {status === 'checking' ? (
        <div className="mt-6 space-y-3" role="status" aria-label={t('learningGate.checking')}>
          <div className="h-4 w-56 animate-pulse rounded bg-foreground/[0.07] motion-reduce:animate-none" />
          <div className="h-12 animate-pulse rounded-xl bg-foreground/[0.045] motion-reduce:animate-none" />
        </div>
      ) : null}

      {status === 'locked' ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-sm leading-relaxed text-foreground/65">{t('learningGate.lockedBody')}</p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-3">
              {(['learn', 'seal', 'compare'] as const).map((step, index) => (
                <li key={step} className="rounded-xl bg-foreground/[0.035] p-3 text-xs leading-relaxed text-foreground/65">
                  <span className="me-2 font-mono text-[10px] font-semibold text-accent" dir="ltr">0{index + 1}</span>
                  {t(`learningGate.steps.${step}`)}
                </li>
              ))}
            </ol>
          </div>
          <Link
            href={`/${locale}/academy/apply?setupId=${encodeURIComponent(team.setupId)}`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t('learningGate.start')}
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      ) : null}

      {status === 'unlocked' ? (
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-foreground/60">{t('learningGate.unlockedBody')}</p>
      ) : null}

      {status === 'error' ? (
        <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-down/10 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <div className="flex items-start gap-3">
            <RefreshCw className="mt-0.5 size-4 shrink-0 text-down" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">{t('learningGate.errorTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/60">{t('learningGate.errorBody')}</p>
            </div>
          </div>
          <button type="button" onClick={onRetry} className="self-start rounded-full px-4 py-2 text-xs font-semibold text-foreground ring-1 ring-foreground/15 hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:self-auto">
            {t('learningGate.retry')}
          </button>
        </div>
      ) : null}

    </section>
  );
}

function Standings({
  t,
  rankedTeams,
  selectedRunId,
  onSelect,
  percent,
  decimal,
}: {
  t: TFunction;
  rankedTeams: StrategyLeagueTeam[];
  selectedRunId: string;
  onSelect: (runId: string) => void;
  percent: Formatter;
  decimal: Formatter;
}) {
  return (
    <section className="min-w-0 rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6" aria-labelledby="league-standings-title">
      <div className="text-start">
        <h2 id="league-standings-title" className="text-lg font-semibold">{t('teamListLabel')}</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-foreground/60">{t('standingsDescription')}</p>
      </div>

      <div className="mt-5 overflow-x-auto">
        <div className="min-w-[46rem]">
          <div
            className="grid grid-cols-[2.5rem_minmax(10rem,1.4fr)_6.5rem_6rem_5.5rem_5.5rem_7rem_5rem] gap-3 border-b border-[var(--border-color)] pb-2 text-[11px] font-medium text-foreground/60"
          >
            <span>{t('standingsRank')}</span>
            <span className="text-start">{t('standingsTeam')}</span>
            <span className="text-start">{t('standingsStatus')}</span>
            <span className="text-end flex items-center justify-end gap-1">
              {t('oosShort')}
              <div className="group relative inline-flex items-center cursor-help">
                <Info className="size-3 text-foreground/40 hover:text-foreground" />
                <div className="absolute bottom-[125%] right-0 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity bg-surface-card border border-[var(--border-color)] p-2.5 rounded-xl text-[10px] w-52 shadow-xl z-50 text-start leading-relaxed font-normal normal-case text-foreground whitespace-normal">
                  {t('hintOos')}
                </div>
              </div>
            </span>
            <span className="text-end flex items-center justify-end gap-1">
              {t('metricSharpe')}
              <div className="group relative inline-flex items-center cursor-help">
                <Info className="size-3 text-foreground/40 hover:text-foreground" />
                <div className="absolute bottom-[125%] right-0 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity bg-surface-card border border-[var(--border-color)] p-2.5 rounded-xl text-[10px] w-52 shadow-xl z-50 text-start leading-relaxed font-normal normal-case text-foreground whitespace-normal">
                  {t('hintSharpe')}
                </div>
              </div>
            </span>
            <span className="text-end flex items-center justify-end gap-1">
              {t('metricDsr')}
              <div className="group relative inline-flex items-center cursor-help">
                <Info className="size-3 text-foreground/40 hover:text-foreground" />
                <div className="absolute bottom-[125%] right-0 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity bg-surface-card border border-[var(--border-color)] p-2.5 rounded-xl text-[10px] w-52 shadow-xl z-50 text-start leading-relaxed font-normal normal-case text-foreground whitespace-normal">
                  {t('hintDsr')}
                </div>
              </div>
            </span>
            <span className="text-end flex items-center justify-end gap-1">
              {t('standingsMcDrawdown')}
              <div className="group relative inline-flex items-center cursor-help">
                <Info className="size-3 text-foreground/40 hover:text-foreground" />
                <div className="absolute bottom-[125%] right-0 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity bg-surface-card border border-[var(--border-color)] p-2.5 rounded-xl text-[10px] w-52 shadow-xl z-50 text-start leading-relaxed font-normal normal-case text-foreground whitespace-normal">
                  {t('hintMcDrawdown')}
                </div>
              </div>
            </span>
            <span className="text-end flex items-center justify-end gap-1">
              {t('metricTrades')}
              <div className="group relative inline-flex items-center cursor-help">
                <Info className="size-3 text-foreground/40 hover:text-foreground" />
                <div className="absolute bottom-[125%] right-0 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity bg-surface-card border border-[var(--border-color)] p-2.5 rounded-xl text-[10px] w-52 shadow-xl z-50 text-start leading-relaxed font-normal normal-case text-foreground whitespace-normal">
                  {t('hintTrades')}
                </div>
              </div>
            </span>
          </div>
          <div className="divide-y divide-[var(--border-color)]">
            {rankedTeams.map((team, index) => {
              const active = team.runId === selectedRunId;
              const StatusIcon = team.status === 'ACCEPTED' ? CheckCircle2 : XCircle;
              return (
                <button
                  key={team.runId}
                  type="button"
                  onClick={() => onSelect(team.runId)}
                  aria-pressed={active}
                  aria-controls="selected-team-performance"
                  className={`grid w-full grid-cols-[2.5rem_minmax(10rem,1.4fr)_6.5rem_6rem_5.5rem_5.5rem_7rem_5rem] items-center gap-3 py-3 text-start transition-colors duration-150 ${
                    active ? 'bg-accent/10' : 'hover:bg-foreground/[0.04]'
                  }`}
                >
                  <span className="text-xs tabular-nums text-foreground/60">{index + 1}</span>
                  <span className="min-w-0 truncate font-mono text-xs" dir="ltr">{team.setupId}</span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${team.status === 'ACCEPTED' ? 'text-up' : 'text-down'}`}>
                    <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    {t(team.status === 'ACCEPTED' ? 'accepted' : 'rejected')}
                  </span>
                  <span className="text-end text-sm font-semibold tabular-nums" dir="ltr">{percent(team.oos.cagr)}</span>
                  <span className="text-end text-xs tabular-nums text-foreground/70" dir="ltr">{decimal(team.oos.sharpe)}</span>
                  <span className="text-end text-xs tabular-nums text-foreground/70" dir="ltr">{decimal(team.oos.deflatedSharpe)}</span>
                  <span className="text-end text-xs tabular-nums text-foreground/70" dir="ltr">{percent(team.bootstrap.maxDrawdown.p95)}</span>
                  <span className="text-end text-xs tabular-nums text-foreground/70" dir="ltr">{decimal(team.full.trades)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamPerformanceDetail({
  team,
  t,
  percent,
  decimal,
  money,
  dateTime,
  detailRef,
  comparisonRows,
}: {
  team: StrategyLeagueTeam;
  t: TFunction;
  percent: Formatter;
  decimal: Formatter;
  money: MoneyFormatter;
  dateTime: DateFormatter;
  detailRef: RefObject<HTMLElement>;
  comparisonRows: PerformanceRow[];
}) {
  const evidence = team.tradeEvidence;
  const shariaStyle = SHARIA_STATE_STYLE[team.shariaState] ?? SHARIA_STATE_STYLE.UNVERIFIED;
  const ShariaIcon = shariaStyle.Icon;

  const [pnlViewMode, setPnlViewMode] = useState<'stocks' | 'ledger'>('stocks');
  const [copiedSha, setCopiedSha] = useState(false);
  const [tradeFilter, setTradeFilter] = useState('');

  const handleCopySha = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(team.gitSha);
      setCopiedSha(true);
      setTimeout(() => setCopiedSha(false), 2000);
    }
  };

  const filteredTrades = evidence?.trades?.filter((tr) => {
    if (!tradeFilter.trim()) return true;
    const q = tradeFilter.toLowerCase();
    return (
      tr.symbol.toLowerCase().includes(q) ||
      tr.reason.toLowerCase().includes(q)
    );
  }) || [];

  return (
    <section
      ref={detailRef}
      id="selected-team-performance"
      className="scroll-mt-6 rounded-3xl bg-surface-card p-6 shadow-xl border border-[var(--border-color)] space-y-6 relative overflow-hidden text-start"
      aria-labelledby="selected-team-performance-title"
    >
      {/* Background Accent Glow */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-accent/[0.06] via-transparent to-emerald-500/[0.04]" />

      {/* ── Top Hero Header ── */}
      <header className="flex flex-col gap-4 border-b border-[var(--border-color)] pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center space-x-2 rtl:space-x-reverse flex-wrap">
            <span className="font-mono text-xs font-bold text-accent bg-accent/10 px-2.5 py-0.5 rounded-full border border-accent/20" dir="ltr">
              {team.setupId}
            </span>
            <span className="text-[10px] text-foreground/50 uppercase tracking-widest font-mono">
              Run #{team.runId.slice(0, 8)}
            </span>
          </div>
          <h2 id="selected-team-performance-title" className="text-2xl font-black text-foreground">
            {t('teamPerformanceTitle')}
          </h2>
          <p className="max-w-3xl text-xs leading-relaxed text-foreground/70">
            {t('teamPerformanceDescription')}
          </p>
        </div>

        <div className="flex items-center space-x-3 rtl:space-x-reverse self-start">
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-black tracking-wide border shadow-sm ${
              team.status === 'ACCEPTED'
                ? 'bg-up/10 text-up border-up/20 ring-1 ring-up/30'
                : 'bg-down/10 text-down border-down/20 ring-1 ring-down/30'
            }`}
          >
            {team.status === 'ACCEPTED' ? (
              <CheckCircle2 className="size-4 animate-pulse" aria-hidden="true" />
            ) : (
              <XCircle className="size-4" aria-hidden="true" />
            )}
            <span>{t(team.status === 'ACCEPTED' ? 'accepted' : 'rejected')}</span>
          </span>
        </div>
      </header>

      {/* ── 4 Quick KPI Stat Cards Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Out of Sample CAGR */}
        <div className="p-4 rounded-2xl bg-foreground/[0.025] dark:bg-white/[0.025] border border-[var(--border-color)] space-y-1">
          <span className="text-[10px] text-foreground/60 font-semibold uppercase tracking-wider">{t('oosShort')} CAGR</span>
          <div className="flex items-baseline justify-between">
            <p className={`text-2xl font-black font-mono tabular-nums ${team.oos.cagr >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">
              {percent(team.oos.cagr)}
            </p>
            {team.oos.cagr >= 0 ? <TrendingUp className="w-5 h-5 text-up" /> : <TrendingDown className="w-5 h-5 text-down" />}
          </div>
          <p className="text-[10px] text-foreground/50">Full: {percent(team.full.cagr)}</p>
        </div>

        {/* Sharpe Ratio */}
        <div className="p-4 rounded-2xl bg-foreground/[0.025] dark:bg-white/[0.025] border border-[var(--border-color)] space-y-1">
          <span className="text-[10px] text-foreground/60 font-semibold uppercase tracking-wider">{t('metricSharpe')}</span>
          <p className="text-2xl font-black font-mono tabular-nums text-foreground" dir="ltr">
            {decimal(team.oos.sharpe)}
          </p>
          <p className="text-[10px] text-foreground/50">DSR: {decimal(team.oos.deflatedSharpe)}</p>
        </div>

        {/* Max Drawdown */}
        <div className="p-4 rounded-2xl bg-foreground/[0.025] dark:bg-white/[0.025] border border-[var(--border-color)] space-y-1">
          <span className="text-[10px] text-foreground/60 font-semibold uppercase tracking-wider">95% MC Drawdown</span>
          <p className="text-2xl font-black font-mono tabular-nums text-down" dir="ltr">
            {percent(team.bootstrap.maxDrawdown.p95)}
          </p>
          <p className="text-[10px] text-foreground/50">OOS DD: {percent(team.oos.maxDrawdown)}</p>
        </div>

        {/* Realized Net PnL */}
        <div className="p-4 rounded-2xl bg-foreground/[0.025] dark:bg-white/[0.025] border border-[var(--border-color)] space-y-1">
          <span className="text-[10px] text-foreground/60 font-semibold uppercase tracking-wider">{t('realizedNetPnl')}</span>
          <p className={`text-2xl font-black font-mono tabular-nums ${evidence && evidence.totalNetPnl >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">
            {evidence ? money(evidence.totalNetPnl) : '$0.00'}
          </p>
          <p className="text-[10px] text-foreground/50">Trades: {decimal(team.full.trades)}</p>
        </div>
      </div>

      {/* ── Main Detail Content: Performance Table & Run Facts Sidebar ── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        {/* Performance Metrics Table */}
        <div className="min-w-0 space-y-3">
          <div>
            <h3 className="text-base font-extrabold text-foreground">{t('performanceTableTitle')}</h3>
            <p className="mt-0.5 text-xs text-foreground/60">{t('performanceTableDescription')}</p>
          </div>

          <div className="overflow-x-auto rounded-2xl bg-foreground/[0.02] border border-[var(--border-color)] shadow-sm">
            <table className="w-full min-w-[30rem] text-xs">
              <thead className="bg-foreground/[0.03] text-foreground/60 border-b border-[var(--border-color)]">
                <tr>
                  <th className="px-4 py-3 text-start font-bold uppercase tracking-wider">{t('metric')}</th>
                  <th className="px-4 py-3 text-end font-bold uppercase tracking-wider">{t('fullPeriod')}</th>
                  <th className="px-4 py-3 text-end font-bold uppercase tracking-wider text-accent">{t('outOfSample')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {comparisonRows.map((row) => (
                  <tr key={row.label} className="hover:bg-foreground/[0.02] transition-colors">
                    <th scope="row" className="px-4 py-3 text-start font-semibold text-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {row.label}
                        <span className="group relative inline-flex cursor-help items-center">
                          <Info className="size-3.5 text-foreground/40 hover:text-foreground" aria-hidden="true" />
                          <span className="pointer-events-none absolute bottom-[125%] start-1/2 z-50 w-56 -translate-x-1/2 rounded-2xl border border-[var(--border-color)] bg-surface-card p-3 text-start text-[11px] font-normal leading-relaxed text-foreground opacity-0 shadow-2xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            {row.hint}
                          </span>
                        </span>
                      </span>
                    </th>
                    <td className="px-4 py-3 text-end font-mono font-medium tabular-nums text-foreground/80" dir="ltr">
                      {row.full}
                    </td>
                    <td className="px-4 py-3 text-end font-mono font-black tabular-nums text-foreground" dir="ltr">
                      <span className="bg-accent/10 text-accent px-2 py-0.5 rounded-md border border-accent/20">
                        {row.oos}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Technical Run Facts Card */}
        <aside className="rounded-2xl bg-foreground/[0.03] dark:bg-white/[0.03] p-5 space-y-4 border border-[var(--border-color)] h-fit" aria-labelledby="run-provenance-title">
          <div className="flex items-center space-x-2 rtl:space-x-reverse border-b border-[var(--border-color)] pb-3">
            <Info className="w-4 h-4 text-accent" />
            <h3 id="run-provenance-title" className="text-sm font-extrabold text-foreground">{t('runFactsTitle')}</h3>
          </div>

          <dl className="divide-y divide-[var(--border-color)] text-xs space-y-3">
            <div className="pt-2 first:pt-0">
              <dt className="text-foreground/50 font-medium">{t('period')}</dt>
              <dd className="mt-1 font-mono font-bold text-foreground" dir="ltr">
                {team.from} — {team.to}
              </dd>
            </div>

            <div className="pt-3">
              <dt className="text-foreground/50 font-medium">{t('dataFeed')}</dt>
              <dd className="mt-1 font-mono font-bold text-foreground bg-foreground/5 px-2 py-1 rounded-md border border-foreground/10 inline-block" dir="ltr">
                {team.dataFeed}
              </dd>
            </div>

            <div className="pt-3">
              <dt className="text-foreground/50 font-medium">{t('shariaState')}</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-foreground/5 border border-foreground/10">
                <ShariaIcon className={`size-4 ${shariaStyle.className}`} aria-hidden="true" />
                <span>{t(`sharia.${team.shariaState}`)}</span>
              </dd>
            </div>

            <div className="pt-3">
              <dt className="text-foreground/50 font-medium">{t('sourceCommit')}</dt>
              <dd className="mt-1 flex items-center justify-between gap-2 font-mono text-[11px] bg-foreground/5 p-2 rounded-xl border border-foreground/10" dir="ltr">
                <span className="truncate max-w-[140px] text-foreground/80">{team.gitSha}</span>
                <button
                  onClick={handleCopySha}
                  className="p-1 rounded-lg hover:bg-foreground/10 text-accent transition-colors shrink-0"
                  title="Copy Commit SHA"
                >
                  {copiedSha ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Info className="w-3.5 h-3.5" />}
                </button>
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      {/* ── Ultra-Clean Realized PnL & Trade Ledger Section ── */}
      {evidence === null ? (
        <div className="rounded-2xl bg-foreground/[0.03] p-5 text-start border border-[var(--border-color)]" role="status">
          <h3 className="text-sm font-bold text-foreground">{t('tradeLedgerUnavailableTitle')}</h3>
          <p className="mt-1.5 text-xs text-foreground/60">{t('tradeLedgerUnavailableBody')}</p>
        </div>
      ) : evidence.totalClosedTrades === 0 ? (
        <div className="rounded-2xl bg-foreground/[0.03] p-5 text-start border border-[var(--border-color)]" role="status">
          <h3 className="text-sm font-bold text-foreground">{t('tradeLedgerEmptyTitle')}</h3>
          <p className="mt-1.5 text-xs text-foreground/60">{t('tradeLedgerEmptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-4 pt-4 border-t border-[var(--border-color)]">
          {/* Section Header with Segmented View Switcher */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-foreground">{t('symbolPnlTitle')}</h3>
              <p className="text-xs text-foreground/60">
                {t(evidence.basis === 'SHARED_BOOK' ? 'tradeBasisShared' : 'tradeBasisSleeves')}
              </p>
            </div>

            {/* Segmented Control Bar */}
            <div className="flex items-center p-1 bg-foreground/[0.04] dark:bg-white/[0.04] rounded-2xl border border-[var(--border-color)] self-start">
              <button
                onClick={() => setPnlViewMode('stocks')}
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  pnlViewMode === 'stocks'
                    ? 'bg-accent text-white shadow-md'
                    : 'text-foreground/60 hover:text-foreground'
                }`}
              >
                Stock Breakdown ({evidence.bySymbol.length})
              </button>
              <button
                onClick={() => setPnlViewMode('ledger')}
                className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  pnlViewMode === 'ledger'
                    ? 'bg-accent text-white shadow-md'
                    : 'text-foreground/60 hover:text-foreground'
                }`}
              >
                Trade Ledger ({evidence.totalClosedTrades})
              </button>
            </div>
          </div>

          {/* Mode 1: Stock Cards Grid View */}
          {pnlViewMode === 'stocks' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {evidence.bySymbol.map((stock) => {
                const winRatePct = stock.closedTrades > 0 ? (stock.wins / stock.closedTrades) * 100 : 0;
                const isProfitable = stock.netPnl >= 0;

                return (
                  <div
                    key={stock.symbol}
                    className="p-5 rounded-3xl glass-panel border border-[var(--border-color)] space-y-4 hover:border-accent/40 transition-all shadow-sm"
                  >
                    {/* Header: Symbol + Trades count */}
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-black text-foreground bg-foreground/5 px-3 py-1 rounded-xl border border-foreground/10" dir="ltr">
                        {stock.symbol}
                      </span>
                      <span className="text-[11px] font-bold text-foreground/50">
                        {stock.closedTrades} Trades
                      </span>
                    </div>

                    {/* Realized PnL Hero Amount */}
                    <div className="space-y-0.5">
                      <span className="text-[10px] text-foreground/50 font-bold uppercase tracking-wider">Realized PnL</span>
                      <p className={`text-2xl font-black font-mono tabular-nums ${isProfitable ? 'text-up' : 'text-down'}`} dir="ltr">
                        {money(stock.netPnl)}
                      </p>
                    </div>

                    {/* Win Rate Meter Bar */}
                    <div className="space-y-1.5 pt-2 border-t border-[var(--border-color)] text-xs">
                      <div className="flex justify-between font-medium">
                        <span className="text-foreground/60">Win Rate</span>
                        <span className="font-mono font-bold text-foreground">{winRatePct.toFixed(0)}% ({stock.wins}/{stock.closedTrades})</span>
                      </div>
                      <div className="w-full bg-foreground/10 h-2 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${winRatePct}%` }} />
                      </div>
                    </div>

                    {/* Avg Return Tag */}
                    <div className="flex justify-between items-center text-xs pt-1">
                      <span className="text-foreground/50">Avg Return:</span>
                      <span className={`font-mono font-extrabold px-2 py-0.5 rounded-lg ${
                        stock.averageReturn >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                      }`} dir="ltr">
                        {percent(stock.averageReturn)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Mode 2: Searchable Trade Ledger */}
          {pnlViewMode === 'ledger' && (
            <div className="space-y-3 pt-2">
              {evidence.truncated && (
                <p className="rounded-xl bg-noncompliant/10 px-3 py-2 text-xs text-noncompliant font-medium" role="note">
                  {t('tradeLedgerTruncated', { shown: evidence.trades.length, total: evidence.totalClosedTrades })}
                </p>
              )}

              {/* Trade Filter Bar */}
              <div className="flex items-center space-x-2 rtl:space-x-reverse bg-surface-card px-3.5 py-2.5 rounded-2xl border border-[var(--border-color)] max-w-md shadow-sm">
                <Activity className="w-4 h-4 text-accent" />
                <input
                  type="text"
                  value={tradeFilter}
                  onChange={(e) => setTradeFilter(e.target.value)}
                  placeholder="Filter trades by symbol or exit reason..."
                  className="bg-transparent text-xs text-foreground placeholder:text-foreground/40 focus:outline-none w-full"
                />
              </div>

              {/* Trades Table */}
              <div className="max-h-[32rem] overflow-auto rounded-2xl border border-[var(--border-color)] bg-foreground/[0.02] shadow-sm">
                <table className="w-full min-w-[78rem] text-xs">
                  <thead className="sticky top-0 bg-surface-card text-foreground/60 border-b border-[var(--border-color)]">
                    <tr>
                      <th className="px-4 py-3 text-start font-bold uppercase tracking-wider">{t('tradeSymbol')}</th>
                      <th className="px-4 py-3 text-start font-bold uppercase tracking-wider">{t('entryTime')}</th>
                      <th className="px-4 py-3 text-start font-bold uppercase tracking-wider">{t('exitTime')}</th>
                      <th className="px-4 py-3 text-end font-bold uppercase tracking-wider">{t('quantity')}</th>
                      <th className="px-4 py-3 text-end font-bold uppercase tracking-wider">{t('entryPrice')}</th>
                      <th className="px-4 py-3 text-end font-bold uppercase tracking-wider">{t('exitPrice')}</th>
                      <th className="px-4 py-3 text-end font-bold uppercase tracking-wider">{t('netReturn')}</th>
                      <th className="px-4 py-3 text-end font-bold uppercase tracking-wider">{t('realizedNetPnl')}</th>
                      <th className="px-4 py-3 text-start font-bold uppercase tracking-wider">{t('exitReason')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-color)]">
                    {filteredTrades.map((trade, index) => (
                      <tr key={`${trade.symbol}-${trade.exitTs}-${index}`} className="hover:bg-foreground/[0.02] transition-colors">
                        <th scope="row" className="px-4 py-3 text-start font-mono font-extrabold text-foreground" dir="ltr">
                          {trade.symbol}
                        </th>
                        <td className="px-4 py-3 text-start font-mono tabular-nums text-foreground/70" dir="ltr">
                          {dateTime(trade.entryTs)}
                        </td>
                        <td className="px-4 py-3 text-start font-mono tabular-nums text-foreground/70" dir="ltr">
                          {dateTime(trade.exitTs)}
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums text-foreground/80" dir="ltr">
                          {decimal(trade.qty)}
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums text-foreground/80" dir="ltr">
                          {money(trade.entryPrice)}
                        </td>
                        <td className="px-4 py-3 text-end font-mono tabular-nums text-foreground/80" dir="ltr">
                          {money(trade.exitPrice)}
                        </td>
                        <td className={`px-4 py-3 text-end font-mono font-bold tabular-nums ${trade.netReturn >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">
                          {percent(trade.netReturn)}
                        </td>
                        <td className={`px-4 py-3 text-end font-mono font-black tabular-nums ${trade.netPnl >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">
                          {money(trade.netPnl)}
                        </td>
                        <td className="px-4 py-3 text-start font-mono text-[11px]" dir="ltr">
                          <span className="bg-foreground/5 text-foreground/80 px-2 py-0.5 rounded-md border border-foreground/10">
                            {trade.reason}{trade.partial ? ` · ${t('partialExit')}` : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function StrategyLeagueClient({ teams }: StrategyLeagueClientProps) {
  const t = useTranslations('QuantResults');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rankedTeams = useMemo(() => [...teams].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ACCEPTED' ? -1 : 1;
    if (a.oos.cagr !== b.oos.cagr) return b.oos.cagr - a.oos.cagr;
    if (a.oos.deflatedSharpe !== b.oos.deflatedSharpe) {
      return b.oos.deflatedSharpe - a.oos.deflatedSharpe;
    }
    const drawdownDifference = (a.bootstrap.maxDrawdown.p95 ?? Number.POSITIVE_INFINITY)
      - (b.bootstrap.maxDrawdown.p95 ?? Number.POSITIVE_INFINITY);
    if (drawdownDifference !== 0) return drawdownDifference;
    return a.setupId.localeCompare(b.setupId) || a.runId.localeCompare(b.runId);
  }), [teams]);
  const [selectedRunId, setSelectedRunId] = useState(rankedTeams[0]?.runId ?? '');
  const [learningGateStatus, setLearningGateStatus] = useState<LearningGateStatus>('checking');
  const [learningGateRevision, setLearningGateRevision] = useState(0);
  const selectedTeamRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const selected = teams.find(team => team.runId === selectedRunId) ?? rankedTeams[0];

  useEffect(() => {
    const requestedSetupId = searchParams.get('setup');
    if (!requestedSetupId) return;
    const requestedTeam = rankedTeams.find(team => team.setupId === requestedSetupId);
    if (requestedTeam) setSelectedRunId(requestedTeam.runId);
  }, [rankedTeams, searchParams]);

  useEffect(() => {
    if (!selected) return;
    if (!isStrategyLearningSetupId(selected.setupId)) {
      // No learning module exists for this setup — there is nothing to complete, so the
      // performance detail is not gated.
      setLearningGateStatus('unlocked');
      return;
    }

    const controller = new AbortController();
    setLearningGateStatus('checking');
    void fetch(
      `/api/learning/strategy-attempts/latest?setupId=${encodeURIComponent(selected.setupId)}&summary=1`,
      { signal: controller.signal },
    ).then(response => {
      if (response.status === 204) setLearningGateStatus('locked');
      else if (response.ok) setLearningGateStatus('unlocked');
      else setLearningGateStatus('error');
    }).catch(error => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setLearningGateStatus('error');
      }
    });
    return () => controller.abort();
  }, [selected, learningGateRevision]);
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const percent = (value: number | null) => value === null
    ? t('unavailable')
    : new Intl.NumberFormat(numberLocale, { style: 'percent', maximumFractionDigits: 2 }).format(value);
  const decimal = (value: number | null) => value === null
    ? t('unavailable')
    : new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 3 }).format(value);
  const count = (value: number) => new Intl.NumberFormat(numberLocale).format(value);
  const money = (value: number) => new Intl.NumberFormat(numberLocale, {
    style: 'currency', currency: 'USD', maximumFractionDigits: 2,
  }).format(value);
  const dateTime = (value: string) => new Intl.DateTimeFormat(numberLocale, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
  }).format(new Date(value));
  const handleTeamSelect = (runId: string) => {
    setSelectedRunId(runId);
    requestAnimationFrame(() => selectedTeamRef.current?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    }));
  };

  if (!mounted) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-1/3 bg-foreground/10 rounded-xl" />
        <div className="h-4 w-2/3 bg-foreground/10 rounded-xl" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="h-20 bg-foreground/5 rounded-xl" />
          <div className="h-20 bg-foreground/5 rounded-xl" />
        </div>
        <div className="h-[400px] bg-foreground/5 rounded-2xl" />
      </div>
    );
  }

  if (!selected) {
    return (
      <section className="space-y-6" aria-labelledby="strategy-league-title">
        <header className="space-y-2">
          <h1 id="strategy-league-title" className="text-3xl font-semibold ltr:tracking-tight">{t('title')}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/60">{t('subtitle')}</p>
        </header>
        <Disclosures t={t} />
        <div className="rounded-2xl bg-surface-card p-8 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)]">
          <h2 className="text-lg font-semibold">{t('emptyTitle')}</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-foreground/60">{t('emptyBody')}</p>
        </div>
      </section>
    );
  }

  const plottableTeams = rankedTeams.filter(team => team.bootstrap.maxDrawdown.p95 !== null);
  const xValues = plottableTeams.map(team => team.oos.cagr);
  const yValues = plottableTeams.map(team => team.bootstrap.maxDrawdown.p95 as number);
  const rawMinX = Math.min(0, ...xValues);
  const rawMaxX = Math.max(0, ...xValues);
  const xMargin = Math.max((rawMaxX - rawMinX) * 0.1, 0.02);
  const minX = rawMinX - xMargin;
  const maxX = rawMaxX + xMargin;
  const maxY = Math.max(0.01, ...yValues) * 1.1;
  const chartWidth = PLOT.width - PLOT.pad * 2;
  const chartHeight = PLOT.height - PLOT.pad * 2;
  const x = (value: number) => PLOT.pad + ((value - minX) / (maxX - minX)) * chartWidth;
  const y = (value: number) => PLOT.height - PLOT.pad - (value / maxY) * chartHeight;

  const comparisonRows = [
    { label: t('metricCagr'), hint: t('hintCagr'), full: percent(selected.full.cagr), oos: percent(selected.oos.cagr) },
    { label: t('metricSharpe'), hint: t('hintSharpe'), full: decimal(selected.full.sharpe), oos: decimal(selected.oos.sharpe) },
    { label: t('metricDsr'), hint: t('hintDsr'), full: decimal(selected.full.deflatedSharpe), oos: decimal(selected.oos.deflatedSharpe) },
    { label: t('metricMaxDrawdown'), hint: t('hintMaxDrawdown'), full: percent(selected.full.maxDrawdown), oos: percent(selected.oos.maxDrawdown) },
    { label: t('metricHitRate'), hint: t('hintHitRate'), full: percent(selected.full.hitRate), oos: percent(selected.oos.hitRate) },
    { label: t('metricTrades'), hint: t('hintTrades'), full: decimal(selected.full.trades), oos: decimal(selected.oos.trades) },
  ];
  const mcDrawdown = selected.bootstrap.maxDrawdown.p95;
  const riskOfRuin = selected.bootstrap.riskOfRuin;
  const gates: Array<{ label: string; value: string | null; pass: boolean; progress: number }> = [
    {
      label: t('gateWalkForward'), value: null,
      pass: selected.checklist.walkForward, progress: selected.checklist.walkForward ? 1 : 0,
    },
    {
      label: t('gateOosHoldout'), value: percent(selected.checklist.oosHoldoutPct),
      pass: selected.checklist.oosHoldoutOk, progress: selected.checklist.oosHoldoutOk ? 1 : 0,
    },
    {
      label: t('gateOosReturn'), value: percent(selected.oos.cagr),
      pass: selected.oos.cagr > 0, progress: selected.oos.cagr > 0 ? 1 : 0,
    },
    { label: t('gateDsr'), value: decimal(selected.oos.deflatedSharpe), pass: selected.checklist.deflatedSharpeOk, progress: selected.checklist.deflatedSharpeOk ? 1 : 0 },
    { label: t('gateDrawdown'), value: percent(mcDrawdown), pass: selected.checklist.mcMaxDDWithinBreaker, progress: selected.checklist.mcMaxDDWithinBreaker ? 1 : 0 },
    { label: t('gateRuin'), value: percent(riskOfRuin), pass: selected.checklist.mcRiskOfRuinWithinLimit, progress: selected.checklist.mcRiskOfRuinWithinLimit ? 1 : 0 },
    { label: t('gateTrades'), value: decimal(selected.full.trades), pass: selected.checklist.enoughTrades, progress: selected.checklist.enoughTrades ? 1 : 0 },
  ];
  return (
    <section className="min-w-0 max-w-full space-y-8" aria-labelledby="strategy-league-title">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 text-start">
          <h1 id="strategy-league-title" className="text-3xl font-semibold ltr:tracking-tight">{t('title')}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/60">{t('subtitle')}</p>
        </div>
        <div className="flex gap-4 text-xs tabular-nums" aria-label={t('statusSummary')}>
          <span className="inline-flex items-center gap-1.5 text-up">
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('acceptedCount', { count: count(teams.filter(team => team.status === 'ACCEPTED').length) })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-down">
            <XCircle className="size-4" aria-hidden="true" />
            {t('rejectedCount', { count: count(teams.filter(team => team.status === 'REJECTED').length) })}
          </span>
        </div>
      </header>

      <Disclosures t={t} />

      <Standings
        t={t}
        rankedTeams={rankedTeams}
        selectedRunId={selected.runId}
        onSelect={handleTeamSelect}
        percent={percent}
        decimal={decimal}
      />

      <div ref={selectedTeamRef} className="scroll-mt-6">
        {isStrategyLearningSetupId(selected.setupId) ? (
        <TeamLearningGate
          team={selected}
          locale={locale}
          status={learningGateStatus}
          onRetry={() => setLearningGateRevision(revision => revision + 1)}
        />
        ) : null}
      </div>

      {learningGateStatus === 'unlocked' ? (
        <>
          <TeamPerformanceDetail
            key={selected.runId}
            team={selected}
            t={t}
            percent={percent}
            decimal={decimal}
            money={money}
            dateTime={dateTime}
            detailRef={detailRef}
            comparisonRows={comparisonRows}
          />

          <HistoricalComparisonChart
            comparison={selected.comparison}
            comparisons={rankedTeams.flatMap((team, index) => team.comparison
              ? [{ rank: index + 1, setupId: team.setupId, comparison: team.comparison }]
              : [])}
            selectedSetupId={selected.setupId}
          />
        </>
      ) : null}

      <figure className="min-w-0 rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6">
        <figcaption className="text-start">
          <h2 className="font-semibold">{t('plotTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">{t('plotDescription')}</p>
        </figcaption>
        {plottableTeams.length === 0 ? (
          <p className="mt-5 rounded-xl bg-foreground/[0.04] p-5 text-start text-sm leading-relaxed text-foreground/65" role="status">
            {t('plotUnavailable')}
          </p>
        ) : (
          <>
            <div className="mt-5 overflow-x-auto" dir="ltr">
              <svg
              viewBox={`0 0 ${PLOT.width} ${PLOT.height}`}
              className="h-auto min-w-[36rem] w-full"
              role="img"
              aria-labelledby="league-plot-title league-plot-description"
            >
              <title id="league-plot-title">{t('plotTitle')}</title>
              <desc id="league-plot-description">{t('plotDescription')}</desc>
              {[0, 0.5, 1].map(ratio => {
                const plotY = PLOT.height - PLOT.pad - ratio * chartHeight;
                return (
                  <g key={ratio}>
                    <line x1={PLOT.pad} y1={plotY} x2={PLOT.width - PLOT.pad} y2={plotY} stroke="var(--border-color)" />
                    <text x={PLOT.pad - 10} y={plotY + 4} textAnchor="end" className="fill-foreground/50 text-[10px] tabular-nums">
                      {percent(maxY * ratio)}
                    </text>
                  </g>
                );
              })}
              <line x1={x(0)} y1={PLOT.pad} x2={x(0)} y2={PLOT.height - PLOT.pad} stroke="var(--foreground)" strokeOpacity="0.18" strokeDasharray="4 4" />
              {plottableTeams.map((team, index) => {
                const drawdown = team.bootstrap.maxDrawdown.p95 as number;
                const selectedPoint = team.runId === selected.runId;
                const pointX = x(team.oos.cagr);
                const pointY = y(drawdown);
                const labelOnStart = pointX < PLOT.width * 0.68;
                return (
                  <g key={team.runId} aria-label={`${team.setupId}: ${t(team.status === 'ACCEPTED' ? 'accepted' : 'rejected')}`}>
                    <circle
                      cx={pointX}
                      cy={pointY}
                      r={selectedPoint ? 11 : 9}
                      fill={team.status === 'ACCEPTED' ? 'var(--up)' : 'var(--down)'}
                      stroke="var(--surface-card)"
                      strokeWidth={selectedPoint ? 4 : 2}
                    />
                    <text
                      x={pointX}
                      y={pointY + 3}
                      textAnchor="middle"
                      className="[fill:var(--surface-card)] text-[8px] font-bold"
                    >
                      {index + 1}
                    </text>
                    {selectedPoint ? (
                      <text
                        x={pointX + (labelOnStart ? 16 : -16)}
                        y={pointY - 13}
                        textAnchor={labelOnStart ? 'start' : 'end'}
                        className="fill-foreground text-[10px] font-semibold"
                      >
                        {team.setupId}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <text x={PLOT.width / 2} y={PLOT.height - 10} textAnchor="middle" className="fill-foreground/60 text-[11px]">
                {t('xAxis')}
              </text>
              <text transform={`translate(15 ${PLOT.height / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground/60 text-[11px]">
                {t('yAxis')}
              </text>
              </svg>
            </div>
            <ul className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-foreground/60" aria-hidden="true">
              <li className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--up)' }} />
                {t('accepted')}
              </li>
              <li className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: 'var(--down)' }} />
                {t('rejected')}
              </li>
              <li>{t('plotRankHint')}</li>
            </ul>
          </>
        )}
        {plottableTeams.length > 0 && plottableTeams.length < teams.length ? (
          <p className="mt-3 text-start text-xs text-foreground/55">
            {t('plotOmittedCount', { count: teams.length - plottableTeams.length })}
          </p>
        ) : null}
        <div className="mt-6 border-t border-[var(--border-color)] pt-5 text-start">
          <h3 className="text-sm font-semibold">{t('plotReadingTitle')}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground/60">{t('plotReadingDescription')}</p>
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-3" aria-label={t('plotReadingTitle')}>
            <div>
              <dt className="text-[11px] text-foreground/55">{t('plotSelectedTeam')}</dt>
              <dd className="mt-1 truncate font-mono text-sm" dir="ltr">{selected.setupId}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-foreground/55">{t('plotReturnReadout')}</dt>
              <dd className={`mt-1 font-semibold tabular-nums ${selected.oos.cagr >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">{percent(selected.oos.cagr)}</dd>
              <p className="mt-1 text-[10px] text-foreground/55">{t('plotReturnReadoutHint')}</p>
            </div>
            <div>
              <dt className="text-[11px] text-foreground/55">{t('plotRiskReadout')}</dt>
              <dd className={`mt-1 font-semibold tabular-nums ${selected.checklist.mcMaxDDWithinBreaker ? 'text-up' : 'text-noncompliant'}`} dir="ltr">{percent(mcDrawdown)}</dd>
              <p className="mt-1 text-[10px] text-foreground/55">{selected.checklist.mcMaxDDWithinBreaker ? t('plotRiskWithin') : t('plotRiskOutside')}</p>
            </div>
          </dl>
          <p className="mt-4 text-[11px] leading-relaxed text-foreground/60">
            {t('plotLowerRisk')} · {t('plotHigherReturn')} · {t('plotIdealQuadrant')}
          </p>
        </div>
      </figure>

      <article className="min-w-0 rounded-2xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6">
          <h2 className="text-xl font-semibold">{t('gatesTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">{t('gatesDescription')}</p>
          <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
            {gates.map(gate => (
              <div key={gate.label}>
                <div className="flex items-center justify-between gap-4 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    {gate.pass ? <CheckCircle2 className="size-4 text-up" /> : <XCircle className="size-4 text-down" />}
                    {gate.label}
                  </span>
                  <span className={`tabular-nums ${gate.pass ? 'text-up' : 'text-down'}`} dir="ltr">
                    {gate.value ? `${gate.value} · ` : ''}{t(gate.pass ? 'passed' : 'failed')}
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                  <div className={`h-full rounded-full ${gate.pass ? 'bg-up' : 'bg-down'}`} style={{ width: `${Math.max(4, gate.progress * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 border-t border-[var(--border-color)] pt-5">
            <h3 className="text-sm font-semibold">{t(selected.status === 'REJECTED' ? 'rejectionReasons' : 'acceptedOutcome')}</h3>
            {selected.rejectionReasonCodes.length > 0 ? (
              <ul className="mt-3 space-y-2 text-xs leading-relaxed text-foreground/70">
                {selected.rejectionReasonCodes.map(code => (
                  <li key={code} className="flex items-start gap-2">
                    <XCircle className="mt-0.5 size-3.5 shrink-0 text-down" aria-hidden="true" />
                    <span>{t(`reason.${code}`)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 inline-flex items-start gap-2 text-xs leading-relaxed text-up">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {t('noRejectionReasons')}
              </p>
            )}
          </div>
      </article>
    </section>
  );
}
