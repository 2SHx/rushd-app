'use client';

import { useState } from 'react';
import { ArrowRight, Check, Gauge, Scale, ShieldCheck, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { StrategyLearningSetupId } from '@/quant/learning/strategyLearningSetupIds';

type RiskChoice = 'lower' | 'balanced' | 'higher';

const RISK_OPTIONS = [
  { key: 'lower', setupId: 'ts-momentum-halal-basket-v3', Icon: ShieldCheck },
  { key: 'balanced', setupId: 'bollinger-mr-long-v2', Icon: Scale },
  { key: 'higher', setupId: 'stocks-in-play-orb', Icon: Gauge },
] as const satisfies readonly { key: RiskChoice; setupId: StrategyLearningSetupId; Icon: LucideIcon }[];

const PROCESS_STEPS = ['risk', 'match', 'answer', 'compare'] as const;
const COMPARISON_SERIES = ['learner', 'strategy', 'spus', 'spy'] as const;

export default function StrategyPracticeEntry({ locale }: { locale: string }) {
  const t = useTranslations('Academy.labEntry');
  const [selectedRisk, setSelectedRisk] = useState<RiskChoice | null>(null);
  const selected = RISK_OPTIONS.find((option) => option.key === selectedRisk) ?? null;

  return (
    <section
      data-testid="academy-strategy-entry"
      aria-labelledby="strategy-entry-title"
      className="mt-10 overflow-hidden rounded-3xl bg-surface-card shadow-[0_2px_5px_rgba(0,0,0,0.05),0_24px_70px_rgba(0,0,0,0.07)]"
    >
      <div className="p-5 sm:p-7">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-accent rtl:tracking-normal">{t('eyebrow')}</p>
        <h2 id="strategy-entry-title" className="mt-3 text-2xl font-extrabold tracking-[-0.025em] text-foreground rtl:tracking-normal sm:text-3xl">
          {t('title')}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/65">{t('body')}</p>

        <ol className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-foreground/[0.08] sm:grid-cols-4" aria-label={t('processLabel')}>
          {PROCESS_STEPS.map((step, index) => (
            <li key={step} className="bg-background/80 p-3 text-start sm:p-4">
              <span className="font-mono text-[10px] font-bold tabular-nums text-accent" dir="ltr">0{index + 1}</span>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-foreground/70">{t(`steps.${step}`)}</p>
            </li>
          ))}
        </ol>

        <fieldset className="mt-7" aria-describedby="strategy-risk-help">
          <legend className="text-base font-bold leading-relaxed text-foreground">{t('riskQuestion')}</legend>
          <p id="strategy-risk-help" className="mt-1.5 text-xs leading-relaxed text-foreground/55">{t('riskHelp')}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {RISK_OPTIONS.map(({ key, Icon }) => {
              const isSelected = selectedRisk === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={isSelected}
                  aria-describedby={`strategy-risk-${key}`}
                  onClick={() => setSelectedRisk(key)}
                  className={`min-h-36 rounded-2xl p-4 text-start transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.99] motion-reduce:transform-none ${isSelected ? 'bg-accent/10 shadow-[inset_0_0_0_2px_var(--accent-color)]' : 'bg-foreground/[0.035] hover:bg-foreground/[0.06]'}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className={`grid size-9 place-items-center rounded-xl ${isSelected ? 'bg-accent text-white' : 'bg-background text-foreground/55'}`}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {isSelected ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                        <Check className="size-3" aria-hidden="true" />
                        {t('selected')}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-4 block text-sm font-bold text-foreground">{t(`riskOptions.${key}.title`)}</span>
                  <span id={`strategy-risk-${key}`} className="mt-1.5 block text-xs leading-relaxed text-foreground/60">{t(`riskOptions.${key}.body`)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="bg-foreground/[0.018] p-5 sm:p-7" aria-live="polite">
        {selected ? (
          <div data-testid="academy-strategy-match">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="max-w-xl text-start">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('matchEyebrow')}</p>
                  <span className="rounded-full bg-foreground/[0.055] px-2.5 py-1 text-[10px] font-semibold text-foreground/60">{t(`riskOptions.${selected.key}.title`)}</span>
                </div>
                <h3 className="mt-3 text-xl font-extrabold leading-relaxed text-foreground">{t(`strategies.${selected.key}.title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/65">{t(`strategies.${selected.key}.body`)}</p>
                <p className="mt-3 text-xs leading-relaxed text-foreground/55">{t(`strategies.${selected.key}.reason`)}</p>
              </div>
              <Link
                href={`/${locale}/academy/apply?setupId=${encodeURIComponent(selected.setupId)}`}
                className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-white transition-[transform,opacity] duration-150 ease-out hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:hover:-translate-y-0.5"
              >
                {t('cta')}
                <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-5 border-t border-foreground/[0.08] pt-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/50 rtl:tracking-normal">{t('comparisonLabel')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {COMPARISON_SERIES.map((series) => (
                  <span key={series} dir={series === 'spus' || series === 'spy' ? 'ltr' : undefined} className="rounded-full bg-foreground/[0.055] px-3 py-1.5 text-[11px] font-semibold text-foreground/65">
                    {t(`series.${series}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-foreground/[0.035] p-4 text-start">
            <p className="text-sm font-bold text-foreground">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed text-foreground/55">{t('emptyBody')}</p>
          </div>
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-foreground/50">{t('disclosure')}</p>
      </div>
    </section>
  );
}
