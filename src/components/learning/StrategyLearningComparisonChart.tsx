'use client';

import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { StrategyLearningReplayResult } from '@/quant/learning/strategyLearningReplay';

const CHART = { width: 900, height: 350, padX: 65, padY: 45 } as const;
const KEYS = ['learner', 'team', 'spus', 'spy'] as const;
type SeriesKey = typeof KEYS[number];

export default function StrategyLearningComparisonChart({
  result,
  locale,
}: {
  result: StrategyLearningReplayResult;
  locale: string;
}) {
  const t = useTranslations('StrategyLearning');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const values = useMemo(() => KEYS.flatMap(key => result.series[key].map(point => point.value)), [result]);
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

  const styles: Record<SeriesKey, { color: string; dash?: string; opacity: number; width: number; label: string }> = {
    learner: { color: 'var(--accent)', opacity: 1, width: 3, label: locale === 'ar' ? 'خيارك (سياسة المتعلم)' : 'Learner Policy' },
    team: { color: 'var(--foreground)', dash: '8 4', opacity: 0.85, width: 2.25, label: locale === 'ar' ? 'فريق الاستراتيجية' : 'Strategy Team' },
    spus: { color: 'var(--up)', dash: '2 5', opacity: 0.95, width: 2.25, label: locale === 'ar' ? 'مؤشر SPUS الإسلامي' : 'SPUS Benchmark' },
    spy: { color: 'var(--foreground)', dash: '11 5', opacity: 0.45, width: 2, label: locale === 'ar' ? 'مؤشر SPY العام' : 'SPY ETF' },
  };

  const learnerSeries = result.series.learner;
  const hoverPoint = hoverIndex !== null ? learnerSeries[hoverIndex] : null;

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const svgX = (mouseX / rect.width) * CHART.width;
    const clampedX = Math.max(CHART.padX, Math.min(CHART.width - CHART.padX, svgX));
    
    // Find nearest point index in series
    let closestIndex = 0;
    let minDistance = Infinity;
    learnerSeries.forEach((pt, idx) => {
      const ptX = x(pt.ts);
      const dist = Math.abs(ptX - clampedX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = idx;
      }
    });
    setHoverIndex(closestIndex);
  };

  const learnerTrades = result.metrics.learner.trades;

  return (
    <div className="space-y-4">
      {learnerTrades === 0 && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-accent/10 border border-accent/25 p-3.5 text-xs text-foreground/80">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>
            {locale === 'ar'
              ? 'تنبيه: أظهرت خيارات سياستك عدم تنفيذ أي صفقات (0 صفقات) خلال فترة الاختبار البالغة 6 أشهر بسبب عدم توفر شروط الدخول المناسبة، ولذلك ظهر خط أداءك ثابتاً عند 100.'
              : 'Note: Your chosen policy resulted in 0 trades during the 6-month replay period because entry rules were not triggered, keeping performance flat at 100.'}
          </p>
        </div>
      )}

      <div className="relative rounded-2xl border border-foreground/10 bg-background/50 p-4 shadow-inner">
        <div className="overflow-x-auto" dir="ltr">
          <svg
            viewBox={`0 0 ${CHART.width} ${CHART.height}`}
            className="h-auto min-w-[44rem] w-full cursor-crosshair select-none"
            role="img"
            aria-labelledby="learning-comparison-title learning-comparison-description"
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIndex(null)}
          >
            <title id="learning-comparison-title">{t('comparisonTitle')}</title>
            <desc id="learning-comparison-description">{t('comparisonDescription')}</desc>

            {/* Gridlines */}
            {[0, 0.5, 1].map(ratio => {
              const value = min + ratio * (max - min);
              return (
                <g key={ratio}>
                  <line x1={CHART.padX} y1={y(value)} x2={CHART.width - CHART.padX} y2={y(value)} stroke="var(--border-color)" strokeOpacity="0.5" />
                  <text x={CHART.padX - 10} y={y(value) + 4} textAnchor="end" className="fill-foreground/55 text-[10px] font-mono tabular-nums">
                    {number(value)}
                  </text>
                </g>
              );
            })}

            {/* Baseline 100 Line */}
            <line x1={CHART.padX} y1={y(100)} x2={CHART.width - CHART.padX} y2={y(100)} stroke="var(--foreground)" strokeOpacity="0.25" strokeDasharray="4 4" />

            {/* Series Paths */}
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

            {/* Hover Crosshair & Data Dots */}
            {hoverIndex !== null && hoverPoint ? (
              <g>
                <line
                  x1={x(hoverPoint.ts)}
                  y1={CHART.padY}
                  x2={x(hoverPoint.ts)}
                  y2={CHART.height - CHART.padY}
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
                {KEYS.map(key => {
                  const pt = result.series[key][hoverIndex];
                  if (!pt) return null;
                  return (
                    <circle
                      key={key}
                      cx={x(pt.ts)}
                      cy={y(pt.value)}
                      r={key === 'learner' ? "5" : "4"}
                      fill={styles[key].color}
                      stroke="var(--background)"
                      strokeWidth="2"
                    />
                  );
                })}
              </g>
            ) : null}

            {/* Axis Dates */}
            <text x={CHART.padX} y={CHART.height - 12} textAnchor="start" className="fill-foreground/60 text-[10px] font-medium">{date(result.interval.start)}</text>
            <text x={CHART.width - CHART.padX} y={CHART.height - 12} textAnchor="end" className="fill-foreground/60 text-[10px] font-medium">{date(result.interval.end)}</text>
            <text transform={`translate(16 ${CHART.height / 2}) rotate(-90)`} textAnchor="middle" className="fill-foreground/55 text-[10px] font-medium">{t('normalizedAxis')}</text>
          </svg>
        </div>

        {/* Hover Floating Tooltip */}
        {hoverIndex !== null && hoverPoint ? (
          <div
            className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-accent/30 bg-surface-card p-3 shadow-lg animate-in fade-in duration-150"
            dir={locale === 'ar' ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <span>📅 {date(hoverPoint.ts)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              {KEYS.map(key => {
                const pt = result.series[key][hoverIndex];
                if (!pt) return null;
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: styles[key].color }} />
                    <span className="font-semibold text-foreground/75">{styles[key].label}:</span>
                    <span className="font-extrabold text-foreground">{number(pt.value)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center text-[11px] text-foreground/50">
            {locale === 'ar' ? '💡 حرك المؤشر فوق الرسم البياني لعرض القيم والأسماء بالتفصيل' : '💡 Hover over the chart to inspect series values and names in detail'}
          </p>
        )}
      </div>

      {/* Series Cards Legend */}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KEYS.map(key => {
          const ending = result.series[key].at(-1)?.value ?? 100;
          const change = ending / 100 - 1;
          const Icon = change > 0 ? ArrowUpRight : change < 0 ? ArrowDownRight : Minus;
          return (
            <li key={key} className="group rounded-2xl border border-foreground/10 bg-surface-card p-4 text-start shadow-sm transition-all hover:border-accent/40 hover:shadow-md">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <svg width="24" height="6" aria-hidden="true" className="shrink-0">
                  <line x1="0" y1="3" x2="24" y2="3" stroke={styles[key].color} strokeWidth="2.5" strokeDasharray={styles[key].dash} strokeOpacity={styles[key].opacity} />
                </svg>
                <span className="truncate">{styles[key].label}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 tabular-nums" dir="ltr">
                <span className="font-mono text-base font-extrabold text-foreground">{number(ending)}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-bold ${
                  change > 0 ? 'bg-up/10 text-up' : change < 0 ? 'bg-down/10 text-down' : 'bg-foreground/5 text-foreground/60'
                }`}>
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
