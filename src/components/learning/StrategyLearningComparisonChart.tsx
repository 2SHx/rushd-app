'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { BollingerLearningReplayResult } from '@/quant/learning/strategyLearningReplay';

const CHART = { width: 900, height: 330, padX: 58, padY: 38 } as const;
const KEYS = ['learner', 'team', 'spus', 'spy'] as const;
type SeriesKey = typeof KEYS[number];

export default function StrategyLearningComparisonChart({
  result,
  locale,
}: {
  result: BollingerLearningReplayResult;
  locale: string;
}) {
  const t = useTranslations('StrategyLearning');
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const number = (value: number) => new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 }).format(value);
  const percent = (value: number) => new Intl.NumberFormat(numberLocale, {
    style: 'percent',
    signDisplay: 'always',
    maximumFractionDigits: 1,
  }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(numberLocale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
  const values = KEYS.flatMap(key => result.series[key].map(point => point.value));
  const rawMin = Math.min(100, ...values);
  const rawMax = Math.max(100, ...values);
  const margin = Math.max(1.5, (rawMax - rawMin) * 0.1);
  const min = rawMin - margin;
  const max = rawMax + margin;
  const start = new Date(result.interval.start).getTime();
  const end = new Date(result.interval.end).getTime();
  const plotWidth = CHART.width - CHART.padX * 2;
  const plotHeight = CHART.height - CHART.padY * 2;
  const x = (ts: string) => CHART.padX + ((new Date(ts).getTime() - start) / Math.max(1, end - start)) * plotWidth;
  const y = (value: number) => CHART.height - CHART.padY - ((value - min) / Math.max(1, max - min)) * plotHeight;
  const path = (key: SeriesKey) => result.series[key]
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.ts).toFixed(1)} ${y(point.value).toFixed(1)}`)
    .join(' ');
  const styles: Record<SeriesKey, { color: string; dash?: string; opacity: number; width: number }> = {
    learner: { color: 'var(--accent)', opacity: 1, width: 3 },
    team: { color: 'var(--foreground)', dash: '8 4', opacity: 0.8, width: 2.25 },
    spus: { color: 'var(--up)', dash: '2 5', opacity: 0.9, width: 2.25 },
    spy: { color: 'var(--foreground)', dash: '11 5', opacity: 0.42, width: 2 },
  };

  return (
    <div>
      <div className="overflow-x-auto" dir="ltr">
        <svg
          viewBox={`0 0 ${CHART.width} ${CHART.height}`}
          className="h-auto min-w-[44rem] w-full"
          role="img"
          aria-labelledby="learning-comparison-title learning-comparison-description"
        >
          <title id="learning-comparison-title">{t('comparisonTitle')}</title>
          <desc id="learning-comparison-description">{t('comparisonDescription')}</desc>
          {[0, 0.5, 1].map(ratio => {
            const value = min + ratio * (max - min);
            return (
              <g key={ratio}>
                <line x1={CHART.padX} y1={y(value)} x2={CHART.width - CHART.padX} y2={y(value)} stroke="var(--border-color)" />
                <text x={CHART.padX - 9} y={y(value) + 4} textAnchor="end" className="fill-foreground/55 text-[10px] tabular-nums">
                  {number(value)}
                </text>
              </g>
            );
          })}
          <line x1={CHART.padX} y1={y(100)} x2={CHART.width - CHART.padX} y2={y(100)} stroke="var(--foreground)" strokeOpacity="0.2" strokeDasharray="3 4" />
          {KEYS.map(key => (
            <path
              key={key}
              d={path(key)}
              fill="none"
              stroke={styles[key].color}
              strokeOpacity={styles[key].opacity}
              strokeWidth={styles[key].width}
              strokeDasharray={styles[key].dash}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          <text x={CHART.padX} y={CHART.height - 10} textAnchor="start" className="fill-foreground/55 text-[10px]">{date(result.interval.start)}</text>
          <text x={CHART.width - CHART.padX} y={CHART.height - 10} textAnchor="end" className="fill-foreground/55 text-[10px]">{date(result.interval.end)}</text>
          <text transform={`translate(15 ${CHART.height / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground/55 text-[10px]">{t('normalizedAxis')}</text>
        </svg>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {KEYS.map(key => {
          const ending = result.series[key].at(-1)?.value ?? 100;
          const change = ending / 100 - 1;
          const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
          return (
            <li key={key} className="rounded-xl bg-foreground/[0.035] p-3 text-start">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <svg width="24" height="6" aria-hidden="true">
                  <line x1="0" y1="3" x2="24" y2="3" stroke={styles[key].color} strokeWidth="2" strokeDasharray={styles[key].dash} strokeOpacity={styles[key].opacity} />
                </svg>
                <span>{t(`series.${key}`)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 tabular-nums" dir="ltr">
                <span className="font-semibold">{number(ending)}</span>
                <span className={`inline-flex items-center gap-1 text-xs ${change > 0 ? 'text-up' : change < 0 ? 'text-down' : 'text-foreground/55'}`}>
                  <Icon className="size-3.5" aria-hidden="true" />
                  {percent(change)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
