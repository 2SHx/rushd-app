// src/components/landing/HeroVisual.tsx
// Quiet, static, prop-free 2D composition for the landing hero. CSS only — no
// canvas, no chart library, no fabricated numbers (ui-craft §7). A later unit
// wraps this as the no-WebGL fallback for a 3D hero, so it stays self-contained.
import clsx from 'clsx';
import { getTranslations } from 'next-intl/server';

type Tone = 'neutral' | 'up' | 'noncompliant';

const bars: { height: number; tone: Tone }[] = [
  { height: 35, tone: 'neutral' },
  { height: 58, tone: 'up' },
  { height: 28, tone: 'neutral' },
  { height: 72, tone: 'up' },
  { height: 22, tone: 'noncompliant' },
  { height: 48, tone: 'neutral' },
  { height: 64, tone: 'up' },
  { height: 40, tone: 'neutral' },
];

const toneClass: Record<Tone, string> = {
  neutral: 'bg-foreground/10',
  up: 'bg-up/25',
  noncompliant: 'bg-noncompliant/25',
};

export default async function HeroVisual() {
  const t = await getTranslations('Landing');

  return (
    <div
      aria-hidden="true"
      className="w-full max-w-md rounded-2xl border border-[var(--border-color)] bg-surface-card p-8"
    >
      <div className="flex h-40 items-end justify-between gap-2">
        {bars.map((bar, i) => (
          <span
            key={i}
            className={clsx('flex-1 rounded-t-sm', toneClass[bar.tone])}
            style={{ height: `${bar.height}%` }}
          />
        ))}
      </div>
      <div className="mt-6 h-px w-full bg-[var(--border-color)]" />
      <div className="mt-4 flex items-center gap-4 text-[11px] font-medium text-foreground/70">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-up/60" />
          {t('legendCompliant')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-noncompliant/60" />
          {t('legendScreenedOut')}
        </span>
      </div>
    </div>
  );
}
