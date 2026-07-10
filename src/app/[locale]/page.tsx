// src/app/[locale]/page.tsx
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Shield, LineChart, Users, GraduationCap, ArrowRight } from 'lucide-react';
import HeroVisual from '@/components/landing/HeroVisual';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const FEATURES = [
  { key: 'compliance', Icon: Shield },
  { key: 'simulator', Icon: LineChart },
  { key: 'family', Icon: Users },
  { key: 'learning', Icon: GraduationCap },
] as const;

export default async function Home({ params }: { params: { locale: string } }) {
  const locale = params.locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale, namespace: 'Landing' });
  const tDisclaimer = await getTranslations({ locale, namespace: 'Disclaimer' });

  return (
    <div className="min-h-screen flex flex-col bg-surface-paper text-foreground">
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <span className="text-lg font-bold ltr:tracking-tight">{t('title')}</span>
        <div className="flex items-center gap-4">
          <LanguageSwitcher locale={locale} inline />
          <Link
            href={`/${locale}/login`}
            className="text-sm font-medium text-foreground/70 hover:text-foreground transition-colors"
          >
            {t('ctaSecondary')}
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-12 grid gap-16 lg:grid-cols-2 lg:items-center">
        <section className="space-y-8 text-start">
          <p className="text-xs font-semibold uppercase ltr:tracking-wider text-foreground/70">
            {t('heroKicker')}
          </p>
          <h1 className="text-4xl sm:text-6xl font-extrabold ltr:tracking-tight leading-tight">
            {t('heroTitlePrefix')}{' '}
            <span className="text-accent">{t('heroTitleAccent')}</span>
          </h1>
          <p className="text-lg text-foreground/60 max-w-xl leading-relaxed">
            {t('heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-start gap-4 pt-2">
            <Link
              href={`/${locale}/register`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-4 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              <span>{t('ctaPrimary')}</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" />
            </Link>
            <Link
              href={`/${locale}/login`}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--border-color)] px-8 py-4 text-sm font-semibold text-foreground/80 hover:text-foreground transition-colors"
            >
              {t('ctaSecondary')}
            </Link>
          </div>
        </section>

        <section aria-label={t('heroVisualLabel')} className="flex justify-center lg:justify-end">
          <HeroVisual />
        </section>
      </main>

      <section className="w-full max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map(({ key, Icon }) => (
            <div key={key} className="glass-panel rounded-2xl p-6 text-start space-y-3">
              <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center text-foreground/60">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-base">{t(`feature.${key}.title`)}</h3>
              <p className="text-sm text-foreground/60 leading-relaxed">
                {t(`feature.${key}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="w-full border-t border-[var(--border-color)] py-8 px-6 text-center text-xs text-foreground/60 space-y-2">
        <p className="max-w-xl mx-auto">{tDisclaimer('banner')}</p>
        <p>
          &copy; 2026 {t('title')}. {t('rightsReserved')}
        </p>
      </footer>
    </div>
  );
}
