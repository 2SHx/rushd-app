'use client';

import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info, Minus, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { HistoricalComparisonEvidence } from '@/quant/backtest/historicalComparison';

interface HistoricalComparisonChartProps {
  comparison: HistoricalComparisonEvidence | null;
  comparisons?: ReadonlyArray<{ rank?: number; setupId: string; comparison: HistoricalComparisonEvidence }>;
  selectedSetupId?: string;
}

const CHART = { width: 820, height: 360, padX: 62, padY: 42 } as const;

export default function HistoricalComparisonChart({ comparison, comparisons = [], selectedSetupId }: HistoricalComparisonChartProps) {
  const t = useTranslations('QuantResults');
  const locale = useLocale();
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const number = (value: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 2 }).format(value);
  const change = (value: number) => new Intl.NumberFormat(numberLocale, {
    style: 'percent',
    signDisplay: 'always',
    maximumFractionDigits: 2,
  }).format(value / 100 - 1);
  const date = (value: string) => new Intl.DateTimeFormat(numberLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));

  return (
    <section
      className="relative min-w-0 overflow-hidden rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6"
      style={{ backgroundImage: 'radial-gradient(circle at 88% 0%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 34%)' }}
      aria-labelledby="historical-comparison-title"
    >
      <header className="text-start">
        <h2 id="historical-comparison-title" className="text-xl font-semibold inline-flex items-center gap-1.5">
          {t('historyTitle')}
          <div className="group relative inline-flex items-center cursor-help">
            <Info className="size-4 text-foreground/45 hover:text-foreground" />
            <div className="pointer-events-none absolute bottom-[125%] end-0 z-50 w-64 rounded-xl border border-[var(--border-color)] bg-surface-card p-2.5 text-start text-[10px] font-normal leading-relaxed text-foreground opacity-0 shadow-xl transition-opacity group-hover:opacity-100 sm:end-auto sm:start-0">
              {t('hintHistoryTitle')}
            </div>
          </div>
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-foreground/60">{t('historyDescription')}</p>
      </header>

      <div className="mt-4 flex items-start gap-2 rounded-xl bg-foreground/[0.04] p-4 text-start text-xs leading-relaxed text-foreground/70">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-noncompliant" aria-hidden="true" />
        <p>{t('historyDisclosure')}</p>
      </div>

      {comparison === null ? (
        <div className="mt-5 rounded-xl bg-foreground/[0.04] p-6 text-start" role="status">
          <h3 className="font-semibold">{t('historyUnavailableTitle')}</h3>
          <p className="mt-2 text-sm leading-relaxed text-foreground/60">{t('historyUnavailableBody')}</p>
        </div>
      ) : (
        <ComparisonPlot comparison={comparison} comparisons={comparisons} selectedSetupId={selectedSetupId} number={number} change={change} date={date} />
      )}
    </section>
  );
}

function ComparisonPlot({
  comparison,
  comparisons,
  selectedSetupId,
  number,
  change,
  date,
}: {
  comparison: HistoricalComparisonEvidence;
  comparisons: ReadonlyArray<{ rank?: number; setupId: string; comparison: HistoricalComparisonEvidence }>;
  selectedSetupId?: string;
  number: (value: number) => string;
  change: (value: number) => string;
  date: (value: string) => string;
}) {
  const t = useTranslations('QuantResults');
  const [showAll, setShowAll] = useState(false);
  const rankedEntries = (comparisons.length ? comparisons : [{ setupId: selectedSetupId ?? 'selected', comparison }])
    .map((entry, index) => ({ ...entry, rank: entry.rank ?? index + 1 }))
    .filter(entry => (
      entry.comparison.start === comparison.start
      && entry.comparison.end === comparison.end
    ))
    .filter((entry, index, entries) => entries.findIndex(candidate => candidate.setupId === entry.setupId) === index);
  const topThree = rankedEntries.filter(entry => entry.rank <= 3);
  const selectedEntry = rankedEntries.find(entry => entry.setupId === selectedSetupId);
  const defaultEntries = selectedEntry && !topThree.some(entry => entry.setupId === selectedEntry.setupId)
    ? [...topThree, selectedEntry]
    : topThree;
  const modelEntries = showAll ? rankedEntries : defaultEntries;
  const hiddenCount = rankedEntries.length - defaultEntries.length;
  const allValues = [
    ...modelEntries.flatMap(entry => entry.comparison.series.model.map(point => point.value)),
    ...comparison.series.spy.map(point => point.value),
    ...comparison.series.spus.map(point => point.value),
  ];
  const rawMin = Math.min(100, ...allValues);
  const rawMax = Math.max(100, ...allValues);
  const margin = Math.max((rawMax - rawMin) * 0.08, 2);
  const minValue = rawMin - margin;
  const maxValue = rawMax + margin;
  const startTime = new Date(comparison.start).getTime();
  const endTime = new Date(comparison.end).getTime();
  const timeRange = Math.max(1, endTime - startTime);
  const plotWidth = CHART.width - CHART.padX * 2;
  const plotHeight = CHART.height - CHART.padY * 2;
  const x = (ts: string) => CHART.padX + ((new Date(ts).getTime() - startTime) / timeRange) * plotWidth;
  const y = (value: number) => CHART.height - CHART.padY - ((value - minValue) / (maxValue - minValue)) * plotHeight;
  const path = (points: HistoricalComparisonEvidence['series']['model']) => points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.ts).toFixed(1)} ${y(point.value).toFixed(1)}`)
    .join(' ');
  const oosTime = new Date(comparison.oosStart).getTime();
  const oosVisible = oosTime >= startTime && oosTime <= endTime;
  const oosX = x(comparison.oosStart);
  const modelSeries = modelEntries.map(entry => ({
    key: entry.setupId,
    label: `#${entry.rank} · ${entry.setupId}${entry.setupId === selectedSetupId ? ` · ${t('historySelected')}` : ''}`,
    hint: entry.setupId === selectedSetupId ? t('hintHistoryModel') : t('hintHistoryPeer'),
    points: entry.comparison.series.model,
    color: entry.setupId === selectedSetupId ? 'var(--accent)' : 'var(--foreground)',
    opacity: entry.setupId === selectedSetupId ? 1 : entry.rank === 1 ? 0.78 : entry.rank === 2 ? 0.58 : entry.rank === 3 ? 0.42 : 0.24,
    dash: entry.setupId === selectedSetupId || entry.rank === 1
      ? undefined
      : entry.rank === 2 ? '10 4' : entry.rank === 3 ? '3 4' : '2 6',
  }));
  const series = [
    ...modelSeries,
    { key: 'spy', label: t('historySpy'), hint: t('hintHistorySpy'), points: comparison.series.spy, color: 'var(--foreground)', dash: '7 5' },
    { key: 'spus', label: t('historySpus'), hint: t('hintHistorySpus'), points: comparison.series.spus, color: 'var(--up)', dash: '2 5' },
  ] as const;

  return (
    <div className="mt-5">
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-accent/15 bg-accent/[0.055] p-4 text-start sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-foreground">{t('historyTopThreeTitle')}</p>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-foreground/60">
            {t('historyTopThreeNote', { count: topThree.length })}
          </p>
        </div>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowAll(value => !value)}
            aria-expanded={showAll}
            aria-controls="historical-strategy-series"
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] bg-surface-card px-4 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showAll ? t('historyShowFocused') : t('historyShowAll', { count: hiddenCount })}
            <ChevronDown className={`size-4 transition-transform duration-200 motion-reduce:transition-none ${showAll ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div id="historical-strategy-series" className="overflow-x-auto" dir="ltr">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="h-auto min-w-[42rem] w-full"
          role="img"
          aria-labelledby="history-plot-title history-plot-description"
        >
          <title id="history-plot-title">{t('historyTitle')}</title>
          <desc id="history-plot-description">{t('historyPlotDescription', {
            start: date(comparison.start),
            end: date(comparison.end),
            oos: date(comparison.oosStart),
          })}</desc>
          {[0, 0.5, 1].map(ratio => {
            const value = minValue + ratio * (maxValue - minValue);
            const plotY = y(value);
            return (
              <g key={ratio}>
                <line x1={CHART.padX} y1={plotY} x2={CHART.width - CHART.padX} y2={plotY} stroke="var(--border-color)" />
                <text x={CHART.padX - 10} y={plotY + 4} textAnchor="end" className="fill-foreground/55 text-[10px] tabular-nums">
                  {number(value)}
                </text>
              </g>
            );
          })}
          <line x1={CHART.padX} y1={y(100)} x2={CHART.width - CHART.padX} y2={y(100)} stroke="var(--foreground)" strokeOpacity="0.18" strokeDasharray="3 4" />
          {oosVisible ? (
            <>
              <line x1={oosX} y1={CHART.padY} x2={oosX} y2={CHART.height - CHART.padY} stroke="var(--noncompliant)" strokeWidth="1.5" strokeDasharray="5 5" />
              <text x={oosX + 6} y={CHART.padY + 12} className="fill-noncompliant text-[10px] font-semibold">{t('historyOosBoundary')}</text>
            </>
          ) : null}
          {series.map(item => (
            <path
              key={item.key}
              d={path(item.points)}
              fill="none"
              stroke={item.color}
              strokeOpacity={'opacity' in item ? item.opacity : 0.85}
              strokeWidth={item.key === selectedSetupId ? 2.75 : item.key.startsWith('spy') || item.key.startsWith('spus') ? 2 : 1.6}
              strokeDasharray={item.dash}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <text x={CHART.padX} y={CHART.height - 12} textAnchor="start" className="fill-foreground/55 text-[10px]">{date(comparison.start)}</text>
          <text x={CHART.width - CHART.padX} y={CHART.height - 12} textAnchor="end" className="fill-foreground/55 text-[10px]">{date(comparison.end)}</text>
          <text transform={`translate(16 ${CHART.height / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground/60 text-[11px]">{t('historyNormalizedAxis')}</text>
        </svg>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {series.map(item => {
          const endingValue = item.points.at(-1)!.value;
          const totalChange = endingValue / 100 - 1;
          const TrendIcon = totalChange > 0 ? ArrowUpRight : totalChange < 0 ? ArrowDownRight : Minus;
          return (
            <li key={item.key} className="rounded-xl bg-foreground/[0.04] p-4 text-start">
              <div className="flex min-w-0 items-center gap-2 text-xs font-semibold">
                <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} aria-hidden="true" />
                <span className="min-w-0 break-all">{item.label}</span>
                <div className="group relative inline-flex items-center cursor-help">
                  <Info className="size-3 text-foreground/45 hover:text-foreground" />
                  <div className="pointer-events-none absolute bottom-[125%] end-0 z-50 w-52 rounded-xl border border-[var(--border-color)] bg-surface-card p-2.5 text-start text-[10px] font-normal leading-relaxed text-foreground opacity-0 shadow-xl transition-opacity group-hover:opacity-100 sm:end-auto sm:start-1/2 sm:-translate-x-1/2">
                    {item.hint}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 tabular-nums" dir="ltr">
                <span className="text-lg font-semibold">{number(endingValue)}</span>
                <span className={`inline-flex items-center gap-1 text-xs ${totalChange > 0 ? 'text-up' : totalChange < 0 ? 'text-down' : 'text-foreground/60'}`}>
                  <TrendIcon className="size-3.5" aria-hidden="true" />
                  {change(endingValue)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-foreground/60">{t('historyEndingValue')}</p>
            </li>
          );
        })}
      </ul>
      {!oosVisible ? (
        <p className="mt-3 text-start text-xs text-noncompliant" role="note">
          {t('historyOosOutside', { oos: date(comparison.oosStart) })}
        </p>
      ) : null}
      <p className="mt-3 text-start text-[10px] text-foreground/60">
        {t('historySources', { spy: comparison.sources.spy.join(' + '), spus: comparison.sources.spus.join(' + ') })}
      </p>
    </div>
  );
}
