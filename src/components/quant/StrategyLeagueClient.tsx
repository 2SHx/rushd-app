'use client';

import { useState, useEffect, useRef, type RefObject } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown, ShieldAlert, XCircle, Info } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { StrategyLeagueTeam } from '@/quant/backtest/leagueViewModel';
import HistoricalComparisonChart from './HistoricalComparisonChart';

interface StrategyLeagueClientProps {
  teams: StrategyLeagueTeam[];
}

type TFunction = ReturnType<typeof useTranslations>;
type Formatter = (value: number | null) => string;
type MoneyFormatter = (value: number) => string;
type DateFormatter = (value: string) => string;

const PLOT = { width: 720, height: 360, pad: 58 } as const;

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
}: {
  team: StrategyLeagueTeam;
  t: TFunction;
  percent: Formatter;
  decimal: Formatter;
  money: MoneyFormatter;
  dateTime: DateFormatter;
  detailRef: RefObject<HTMLElement>;
}) {
  const evidence = team.tradeEvidence;
  const statusUp = team.oos.cagr >= 0;
  const StatusIcon = statusUp ? ArrowUpRight : ArrowDownRight;

  return (
    <section
      ref={detailRef}
      id="selected-team-performance"
      className="scroll-mt-6 rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6"
      aria-labelledby="selected-team-performance-title"
    >
      <header className="flex flex-col gap-4 text-start sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-foreground/55" dir="ltr">{team.setupId}</p>
          <h2 id="selected-team-performance-title" className="mt-1 text-xl font-semibold">{t('teamPerformanceTitle')}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground/60">{t('teamPerformanceDescription')}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${team.status === 'ACCEPTED' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
          {team.status === 'ACCEPTED' ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
          {t(team.status === 'ACCEPTED' ? 'accepted' : 'rejected')}
        </span>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
          <p className="text-[11px] text-foreground/55">{t('teamOosCagr')}</p>
          <p className={`mt-2 flex items-center gap-1 font-mono text-xl font-semibold tabular-nums ${statusUp ? 'text-up' : 'text-down'}`} dir="ltr">
            <StatusIcon className="size-4" aria-hidden="true" />
            {percent(team.oos.cagr)}
          </p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
          <p className="text-[11px] text-foreground/55">{t('metricMaxDrawdown')}</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-down" dir="ltr">−{percent(Math.abs(team.full.maxDrawdown))}</p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
          <p className="text-[11px] text-foreground/55">{t('metricHitRate')}</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums" dir="ltr">{percent(team.full.hitRate)}</p>
        </div>
        <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
          <p className="text-[11px] text-foreground/55">{t('metricTrades')}</p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums" dir="ltr">{decimal(team.full.trades)}</p>
        </div>
      </div>

      {evidence === null ? (
        <div className="mt-6 rounded-xl bg-foreground/[0.04] p-5 text-start" role="status">
          <h3 className="text-sm font-semibold">{t('tradeLedgerUnavailableTitle')}</h3>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-foreground/60">{t('tradeLedgerUnavailableBody')}</p>
        </div>
      ) : evidence.totalClosedTrades === 0 ? (
        <div className="mt-6 rounded-xl bg-foreground/[0.04] p-5 text-start" role="status">
          <h3 className="text-sm font-semibold">{t('tradeLedgerEmptyTitle')}</h3>
          <p className="mt-2 text-xs leading-relaxed text-foreground/60">{t('tradeLedgerEmptyBody')}</p>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="flex flex-col gap-3 text-start sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-base font-semibold">{t('symbolPnlTitle')}</h3>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground/60">
                {t(evidence.basis === 'SHARED_BOOK' ? 'tradeBasisShared' : 'tradeBasisSleeves')}
              </p>
            </div>
            <div className="shrink-0 text-start sm:text-end">
              <p className="text-[11px] text-foreground/55">{t('realizedNetPnl')}</p>
              <p className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${evidence.totalNetPnl >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">
                {money(evidence.totalNetPnl)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl bg-foreground/[0.025]">
            <table className="w-full min-w-[42rem] text-xs">
              <thead className="text-foreground/55">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">{t('tradeSymbol')}</th>
                  <th className="px-4 py-3 text-end font-medium">{t('closedRecords')}</th>
                  <th className="px-4 py-3 text-end font-medium">{t('winRate')}</th>
                  <th className="px-4 py-3 text-end font-medium">{t('averageReturn')}</th>
                  <th className="px-4 py-3 text-end font-medium">{t('realizedNetPnl')}</th>
                </tr>
              </thead>
              <tbody>
                {evidence.bySymbol.map((row) => (
                  <tr key={row.symbol} className="border-t border-[var(--border-color)]">
                    <th scope="row" className="px-4 py-3 text-start font-mono font-semibold" dir="ltr">{row.symbol}</th>
                    <td className="px-4 py-3 text-end tabular-nums" dir="ltr">{decimal(row.closedTrades)}</td>
                    <td className="px-4 py-3 text-end tabular-nums" dir="ltr">{percent(row.wins / row.closedTrades)}</td>
                    <td className={`px-4 py-3 text-end tabular-nums ${row.averageReturn >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">{percent(row.averageReturn)}</td>
                    <td className={`px-4 py-3 text-end font-mono font-semibold tabular-nums ${row.netPnl >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">{money(row.netPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details open className="group overflow-hidden rounded-xl bg-foreground/[0.025]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-start text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
              <span>{t('exactTradeLedger', { count: evidence.totalClosedTrades })}</span>
              <ChevronDown className="size-4 text-foreground/50 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            {evidence.truncated ? (
              <p className="mx-4 mb-3 rounded-lg bg-noncompliant/10 px-3 py-2 text-xs leading-relaxed text-noncompliant" role="note">
                {t('tradeLedgerTruncated', { shown: evidence.trades.length, total: evidence.totalClosedTrades })}
              </p>
            ) : null}
            <div className="max-h-[32rem] overflow-auto border-t border-[var(--border-color)]">
              <table className="w-full min-w-[78rem] text-xs">
                <thead className="sticky top-0 bg-surface-card text-foreground/55">
                  <tr>
                    <th className="px-4 py-3 text-start font-medium">{t('tradeSymbol')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('entryTime')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('exitTime')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('quantity')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('entryPrice')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('exitPrice')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('netReturn')}</th>
                    <th className="px-4 py-3 text-end font-medium">{t('realizedNetPnl')}</th>
                    <th className="px-4 py-3 text-start font-medium">{t('exitReason')}</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.trades.map((trade, index) => (
                    <tr key={`${trade.symbol}-${trade.exitTs}-${index}`} className="border-t border-[var(--border-color)]">
                      <th scope="row" className="px-4 py-3 text-start font-mono font-semibold" dir="ltr">{trade.symbol}</th>
                      <td className="px-4 py-3 text-start tabular-nums" dir="ltr">{dateTime(trade.entryTs)}</td>
                      <td className="px-4 py-3 text-start tabular-nums" dir="ltr">{dateTime(trade.exitTs)}</td>
                      <td className="px-4 py-3 text-end tabular-nums" dir="ltr">{decimal(trade.qty)}</td>
                      <td className="px-4 py-3 text-end font-mono tabular-nums" dir="ltr">{money(trade.entryPrice)}</td>
                      <td className="px-4 py-3 text-end font-mono tabular-nums" dir="ltr">{money(trade.exitPrice)}</td>
                      <td className={`px-4 py-3 text-end tabular-nums ${trade.netReturn >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">{percent(trade.netReturn)}</td>
                      <td className={`px-4 py-3 text-end font-mono font-semibold tabular-nums ${trade.netPnl >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">{money(trade.netPnl)}</td>
                      <td className="px-4 py-3 text-start font-mono text-[11px] text-foreground/65" dir="ltr">
                        {trade.reason}{trade.partial ? ` · ${t('partialExit')}` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}

export default function StrategyLeagueClient({ teams }: StrategyLeagueClientProps) {
  const t = useTranslations('QuantResults');
  const locale = useLocale();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const rankedTeams = [...teams].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'ACCEPTED' ? -1 : 1;
    return b.oos.cagr - a.oos.cagr;
  });
  const [selectedRunId, setSelectedRunId] = useState(rankedTeams[0]?.runId ?? '');
  const detailRef = useRef<HTMLElement>(null);
  const selected = teams.find(team => team.runId === selectedRunId) ?? rankedTeams[0];
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
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({
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

  const plottableTeams = teams.filter(team => team.bootstrap.maxDrawdown.p95 !== null);
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
  const shariaStyle = SHARIA_STATE_STYLE[selected.shariaState] ?? SHARIA_STATE_STYLE.UNVERIFIED;
  const ShariaIcon = shariaStyle.Icon;

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

      <TeamPerformanceDetail
        key={selected.runId}
        team={selected}
        t={t}
        percent={percent}
        decimal={decimal}
        money={money}
        dateTime={dateTime}
        detailRef={detailRef}
      />

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
                return (
                  <g key={team.runId} aria-label={`${team.setupId}: ${t(team.status === 'ACCEPTED' ? 'accepted' : 'rejected')}`}>
                    <circle
                      cx={x(team.oos.cagr)}
                      cy={y(drawdown)}
                      r={selectedPoint ? 9 : 7}
                      fill={team.status === 'ACCEPTED' ? 'var(--up)' : 'var(--down)'}
                      stroke="var(--surface-card)"
                      strokeWidth={selectedPoint ? 4 : 2}
                    />
                    <text
                      x={x(team.oos.cagr) + 10}
                      y={y(drawdown) + (index % 2 === 0 ? -9 : 15)}
                      className="fill-foreground text-[10px] font-semibold"
                    >
                      {team.status === 'ACCEPTED' ? '✓' : '×'} {team.setupId}
                    </text>
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
            </ul>
          </>
        )}
        {plottableTeams.length > 0 && plottableTeams.length < teams.length ? (
          <p className="mt-3 text-start text-xs text-foreground/55">
            {t('plotOmittedCount', { count: teams.length - plottableTeams.length })}
          </p>
        ) : null}
      </figure>

      <figure className="min-w-0 rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6">
        <figcaption className="text-start">
          <h2 className="font-semibold">{t('plotReadingTitle')}</h2>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-foreground/60">{t('plotReadingDescription')}</p>
        </figcaption>
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label={t('plotReadingTitle')}>
          <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
            <p className="text-[11px] text-foreground/60">{t('plotSelectedTeam')}</p>
            <p className="mt-2 truncate font-mono text-sm" dir="ltr">{selected.setupId}</p>
          </div>
          <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
            <p className="text-[11px] text-foreground/60">{t('plotReturnReadout')}</p>
            <p className={`mt-2 text-lg font-semibold tabular-nums ${selected.oos.cagr >= 0 ? 'text-up' : 'text-down'}`} dir="ltr">{percent(selected.oos.cagr)}</p>
            <p className="mt-1 text-[10px] text-foreground/55">{t('plotReturnReadoutHint')}</p>
          </div>
          <div className="rounded-xl bg-foreground/[0.04] p-4 text-start">
            <p className="text-[11px] text-foreground/60">{t('plotRiskReadout')}</p>
            <p className={`mt-2 text-lg font-semibold tabular-nums ${selected.checklist.mcMaxDDWithinBreaker ? 'text-up' : 'text-noncompliant'}`} dir="ltr">{percent(mcDrawdown)}</p>
            <p className="mt-1 text-[10px] text-foreground/55">{selected.checklist.mcMaxDDWithinBreaker ? t('plotRiskWithin') : t('plotRiskOutside')}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-foreground/60">
          <span>{t('plotLowerRisk')}</span>
          <span>{t('plotHigherReturn')}</span>
          <span>{t('plotIdealQuadrant')}</span>
        </div>
      </figure>

      <HistoricalComparisonChart
        comparison={selected.comparison}
        comparisons={teams.flatMap(team => team.comparison ? [{ setupId: team.setupId, comparison: team.comparison }] : [])}
        selectedSetupId={selected.setupId}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="min-w-0 rounded-2xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 text-start">
            <div>
              <p className="font-mono text-xs text-foreground/60" dir="ltr">{selected.setupId}</p>
              <h2 className="mt-1 text-xl font-semibold">{t('selectedEvidence')}</h2>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${selected.status === 'ACCEPTED' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
              {selected.status === 'ACCEPTED' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {t(selected.status === 'ACCEPTED' ? 'accepted' : 'rejected')}
            </span>
          </div>
          <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-foreground/60">{t('period')}</dt><dd className="mt-1 tabular-nums" dir="ltr">{selected.from} — {selected.to}</dd></div>
            <div><dt className="text-foreground/60">{t('dataFeed')}</dt><dd className="mt-1 font-mono" dir="ltr">{selected.dataFeed}</dd></div>
            <div><dt className="text-foreground/60">{t('shariaState')}</dt><dd className="mt-1 inline-flex items-center gap-1.5"><ShariaIcon className={`size-4 ${shariaStyle.className}`} aria-hidden="true" />{t(`sharia.${selected.shariaState}`)}</dd></div>
            <div><dt className="text-foreground/60">{t('sourceCommit')}</dt><dd className="mt-1 font-mono" dir="ltr">{selected.gitSha}</dd></div>
          </dl>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-foreground/60">
                <tr><th className="py-2 text-start font-medium">{t('metric')}</th><th className="py-2 text-end font-medium">{t('fullPeriod')}</th><th className="py-2 text-end font-medium">{t('outOfSample')}</th></tr>
              </thead>
              <tbody>
                {comparisonRows.map(row => (
                  <tr key={row.label} className="border-t border-[var(--border-color)]">
                    <th scope="row" className="py-3 text-start font-medium">
                      <div className="inline-flex items-center gap-1.5">
                        {row.label}
                        <div className="group relative inline-flex items-center cursor-help">
                          <Info className="size-3 text-foreground/40 hover:text-foreground" />
                          <div className="absolute bottom-[125%] left-1/2 -translate-x-1/2 opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity bg-surface-card border border-[var(--border-color)] p-2.5 rounded-xl text-[10px] w-52 shadow-xl z-50 text-start leading-relaxed font-normal normal-case text-foreground whitespace-normal">
                            {row.hint}
                          </div>
                        </div>
                      </div>
                    </th>
                    <td className="py-3 text-end tabular-nums" dir="ltr">{row.full}</td>
                    <td className="py-3 text-end tabular-nums" dir="ltr">{row.oos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="min-w-0 rounded-2xl bg-surface-card p-5 text-start shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6">
          <h2 className="text-xl font-semibold">{t('gatesTitle')}</h2>
          <p className="mt-1 text-xs leading-relaxed text-foreground/60">{t('gatesDescription')}</p>
          <div className="mt-5 space-y-4">
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
      </div>
    </section>
  );
}
