import { BookOpenCheck, Check, LineChart, LockKeyhole, ShieldCheck } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

const RECEIPT_ROWS = [
  { key: 'lesson', Icon: BookOpenCheck },
  { key: 'policy', Icon: LockKeyhole },
  { key: 'replay', Icon: LineChart },
] as const;

export default async function HeroVisual() {
  const t = await getTranslations('Landing');

  return (
    <div className="relative w-full max-w-xl py-4 sm:px-4">
      <div className="absolute inset-x-10 bottom-0 top-12 -rotate-2 rounded-[2rem] bg-accent/10" aria-hidden="true" />
      <div className="glass-panel relative rounded-[2rem] p-5 sm:p-7">
        <div className="flex items-start justify-between gap-5 border-b border-[var(--border-color)] pb-6">
          <div className="text-start">
            <p className="text-xs font-semibold uppercase text-foreground/45 ltr:tracking-[0.14em]">{t('visualEyebrow')}</p>
            <h2 className="mt-2 text-xl font-semibold ltr:tracking-tight sm:text-2xl">{t('visualTitle')}</h2>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-up/10 px-3 py-1.5 text-xs font-semibold text-up">
            <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
            {t('visualBadge')}
          </span>
        </div>

        <div className="space-y-3 py-5">
          {RECEIPT_ROWS.map(({ key, Icon }, index) => (
            <div key={key} className="flex items-center gap-4 rounded-2xl bg-foreground/[0.035] p-4 text-start">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-raised text-foreground/55 shadow-sm">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{t(`visual.${key}.title`)}</p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/55">{t(`visual.${key}.desc`)}</p>
              </div>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-up/10 text-up" aria-label={t('visualComplete')}>
                {index === 1 ? <LockKeyhole className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-start gap-3 rounded-2xl bg-noncompliant/10 p-4 text-start text-noncompliant">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">{t('visualGateTitle')}</p>
            <p className="mt-1 text-xs leading-relaxed opacity-80">{t('visualGateDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
