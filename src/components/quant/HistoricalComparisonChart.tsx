'use client';

import { ArrowDownRight, ArrowUpRight, Minus, ShieldAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import type { HistoricalComparisonEvidence } from '@/quant/backtest/historicalComparison';

interface HistoricalComparisonChartProps {
  comparison: HistoricalComparisonEvidence | null;
}

const CHART = { width: 820, height: 360, padX: 62, padY: 42 } as const;

export default function HistoricalComparisonChart({ comparison }: HistoricalComparisonChartProps) {
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
    <section className="rounded-2xl bg-surface-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_18px_45px_rgba(0,0,0,0.07)] sm:p-6" aria-labelledby="historical-comparison-title">
      <header className="text-start">
        <h2 id="historical-comparison-title" className="text-xl font-semibold">{t('historyTitle')}</h2>
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
        <ComparisonPlot comparison={comparison} number={number} change={change} date={date} />
      )}
    </section>
  );
}

function ComparisonPlot({
  comparison,
  number,
  change,
  date,
}: {
  comparison: HistoricalComparisonEvidence;
  number: (value: number) => string;
  change: (value: number) => string;
  date: (value: string) => string;
}) {
  const t = useTranslations('QuantResults');
  const allValues = [
    ...comparison.series.model.map(point => point.value),
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
  const series = [
    { key: 'model', label: t('historyModel'), points: comparison.series.model, color: 'var(--accent)', dash: undefined },
    { key: 'spy', label: t('historySpy'), points: comparison.series.spy, color: 'var(--foreground)', dash: '7 5' },
    { key: 'spus', label: t('historySpus'), points: comparison.series.spus, color: 'var(--up)', dash: '2 5' },
  ] as const;

  return (
    <div className="mt-5">
      <div className="overflow-x-auto" dir="ltr">
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
              strokeWidth={item.key === 'model' ? 2.75 : 2}
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

      <ul className="mt-5 grid gap-3 sm:grid-cols-3">
        {series.map(item => {
          const endingValue = item.points.at(-1)!.value;
          const totalChange = endingValue / 100 - 1;
          const TrendIcon = totalChange > 0 ? ArrowUpRight : totalChange < 0 ? ArrowDownRight : Minus;
          return (
            <li key={item.key} className="rounded-xl bg-foreground/[0.04] p-4 text-start">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="h-0.5 w-5" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {item.label}
              </div>
              <div className="mt-3 flex items-end justify-between gap-3 tabular-nums" dir="ltr">
                <span className="text-lg font-semibold">{number(endingValue)}</span>
                <span className={`inline-flex items-center gap-1 text-xs ${totalChange > 0 ? 'text-up' : totalChange < 0 ? 'text-down' : 'text-foreground/60'}`}>
                  <TrendIcon className="size-3.5" aria-hidden="true" />
                  {change(endingValue)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-foreground/50">{t('historyEndingValue')}</p>
            </li>
          );
        })}
      </ul>
      {!oosVisible ? (
        <p className="mt-3 text-start text-xs text-noncompliant" role="note">
          {t('historyOosOutside', { oos: date(comparison.oosStart) })}
        </p>
      ) : null}
      <p className="mt-3 text-start text-[10px] text-foreground/50">
        {t('historySources', { spy: comparison.sources.spy.join(' + '), spus: comparison.sources.spus.join(' + ') })}
      </p>
    </div>
  );
}
