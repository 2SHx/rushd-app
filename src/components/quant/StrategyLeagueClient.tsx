'use client';

import { useState } from 'react';
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { StrategyLeagueTeam } from '@/quant/backtest/leagueViewModel';

interface StrategyLeagueClientProps {
  teams: StrategyLeagueTeam[];
}

const PLOT = { width: 720, height: 360, pad: 58 } as const;

export default function StrategyLeagueClient({ teams }: StrategyLeagueClientProps) {
  const t = useTranslations('QuantResults');
  const locale = useLocale();
  const [selectedRunId, setSelectedRunId] = useState(teams[0]?.runId ?? '');
  const selected = teams.find(team => team.runId === selectedRunId) ?? teams[0];
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const percent = (value: number | null) => value === null
    ? t('unavailable')
    : new Intl.NumberFormat(numberLocale, { style: 'percent', maximumFractionDigits: 2 }).format(value);
  const decimal = (value: number | null) => value === null
    ? t('unavailable')
    : new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 3 }).format(value);

  if (!selected) {
    return (
      <section className="space-y-6" aria-labelledby="strategy-league-title">
        <header className="space-y-2">
          <h1 id="strategy-league-title" className="text-3xl font-semibold ltr:tracking-tight">{t('title')}</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-foreground/60">{t('subtitle')}</p>
        </header>
        <Disclosures />
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
    { label: t('metricCagr'), full: percent(selected.full.cagr), oos: percent(selected.oos.cagr) },
    { label: t('metricSharpe'), full: decimal(selected.full.sharpe), oos: decimal(selected.oos.sharpe) },
    { label: t('metricDsr'), full: decimal(selected.full.deflatedSharpe), oos: decimal(selected.oos.deflatedSharpe) },
    { label: t('metricMaxDrawdown'), full: percent(selected.full.maxDrawdown), oos: percent(selected.oos.maxDrawdown) },
    { label: t('metricHitRate'), full: percent(selected.full.hitRate), oos: percent(selected.oos.hitRate) },
    { label: t('metricTrades'), full: decimal(selected.full.trades), oos: decimal(selected.oos.trades) },
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

  function Disclosures() {
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
            {t('acceptedCount', { count: teams.filter(team => team.status === 'ACCEPTED').length })}
          </span>
          <span className="inline-flex items-center gap-1.5 text-down">
            <XCircle className="size-4" aria-hidden="true" />
            {t('rejectedCount', { count: teams.filter(team => team.status === 'REJECTED').length })}
          </span>
        </div>
      </header>

      <Disclosures />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
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
          )}
          {plottableTeams.length > 0 && plottableTeams.length < teams.length ? (
            <p className="mt-3 text-start text-xs text-foreground/55">
              {t('plotOmittedCount', { count: teams.length - plottableTeams.length })}
            </p>
          ) : null}
        </figure>

        <div className="rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-5">
          <h2 className="text-sm font-semibold text-start">{t('teamListLabel')}</h2>
          <div className="mt-3 grid gap-2">
            {teams.map(team => {
              const active = team.runId === selected.runId;
              const StatusIcon = team.status === 'ACCEPTED' ? CheckCircle2 : XCircle;
              return (
                <button
                  key={team.runId}
                  type="button"
                  onClick={() => setSelectedRunId(team.runId)}
                  className={`flex min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-start transition-colors duration-150 ${
                    active ? 'bg-accent/10 text-foreground' : 'text-foreground/60 hover:bg-foreground/[0.04] hover:text-foreground'
                  }`}
                  aria-pressed={active}
                >
                  <StatusIcon className={`size-4 shrink-0 ${team.status === 'ACCEPTED' ? 'text-up' : 'text-down'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs" dir="ltr">{team.setupId}</span>
                    <span className="mt-0.5 block text-[10px] tabular-nums">{percent(team.oos.cagr)} {t('oosShort')}</span>
                  </span>
                  <span className={team.status === 'ACCEPTED' ? 'text-up' : 'text-down'}>{t(team.status === 'ACCEPTED' ? 'accepted' : 'rejected')}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <article className="min-w-0 rounded-2xl bg-surface-card p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 text-start">
            <div>
              <p className="font-mono text-xs text-foreground/50" dir="ltr">{selected.setupId}</p>
              <h2 className="mt-1 text-xl font-semibold">{t('selectedEvidence')}</h2>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${selected.status === 'ACCEPTED' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
              {selected.status === 'ACCEPTED' ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {t(selected.status === 'ACCEPTED' ? 'accepted' : 'rejected')}
            </span>
          </div>
          <dl className="mt-5 grid gap-3 text-xs sm:grid-cols-2">
            <div><dt className="text-foreground/50">{t('period')}</dt><dd className="mt-1 tabular-nums" dir="ltr">{selected.from} — {selected.to}</dd></div>
            <div><dt className="text-foreground/50">{t('dataFeed')}</dt><dd className="mt-1 font-mono" dir="ltr">{selected.dataFeed}</dd></div>
            <div><dt className="text-foreground/50">{t('shariaState')}</dt><dd className="mt-1 inline-flex items-center gap-1.5"><ShieldAlert className="size-4 text-noncompliant" />{t(`sharia.${selected.shariaState}`)}</dd></div>
            <div><dt className="text-foreground/50">{t('sourceCommit')}</dt><dd className="mt-1 font-mono" dir="ltr">{selected.gitSha}</dd></div>
          </dl>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead className="text-foreground/50">
                <tr><th className="py-2 text-start font-medium">{t('metric')}</th><th className="py-2 text-end font-medium">{t('fullPeriod')}</th><th className="py-2 text-end font-medium">{t('outOfSample')}</th></tr>
              </thead>
              <tbody>
                {comparisonRows.map(row => (
                  <tr key={row.label} className="border-t border-[var(--border-color)]">
                    <th scope="row" className="py-3 text-start font-medium">{row.label}</th>
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
