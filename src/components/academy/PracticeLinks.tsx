import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { PracticeLink } from '@/academy/registry';
import { practiceLinkHref } from './academyAccess';

export default function PracticeLinks({ locale, links }: { locale: string; links: PracticeLink[] }) {
  const t = useTranslations('Academy');
  return <aside className="mt-8 rounded-2xl bg-accent/[0.07] p-5 shadow-[0_12px_35px_rgba(0,0,0,0.06)]" aria-label={t('practiceTitle')}><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent rtl:tracking-normal">{t('practiceEyebrow')}</p><h2 className="mt-2 text-lg font-semibold">{t('practiceTitle')}</h2><p className="mt-1 text-sm leading-7 text-foreground/60">{t('practiceBody')}</p><div className="mt-4 flex flex-wrap gap-2">{links.map((link) => { const href = practiceLinkHref(link); return <Link key={href} href={`/${locale}${href}`} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2">{t(link.kind === 'strategySetup' ? 'openStrategy' : 'openQuiz')}<ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" /></Link>; })}</div></aside>;
}
