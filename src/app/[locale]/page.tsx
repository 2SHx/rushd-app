import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import {
  ArrowRight,
  BookOpenCheck,
  ChartNoAxesCombined,
  Check,
  Compass,
  GraduationCap,
  LineChart,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import HeroVisual from '@/components/landing/HeroVisual';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';

const PROCESS = [
  { key: 'learn', Icon: BookOpenCheck },
  { key: 'decide', Icon: SlidersHorizontal },
  { key: 'simulate', Icon: LineChart },
  { key: 'reflect', Icon: GraduationCap },
] as const;

const FEATURES = [
  { key: 'compliance', Icon: ShieldCheck },
  { key: 'simulator', Icon: LineChart },
  { key: 'comparison', Icon: ChartNoAxesCombined },
  { key: 'learning', Icon: GraduationCap },
] as const;

export default async function Home({ params }: { params: { locale: string } }) {
  const locale = params.locale === 'en' ? 'en' : 'ar';
  const t = await getTranslations({ locale, namespace: 'Landing' });
  const tDisclaimer = await getTranslations({ locale, namespace: 'Disclaimer' });

  return (
    <div className="-m-4 min-h-screen overflow-hidden bg-surface-paper text-foreground md:-m-6 lg:-m-8">
      <header className="relative z-40 border-b border-[var(--border-color)] bg-surface-paper/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] w-full max-w-7xl items-center justify-between gap-5 px-5 sm:px-8">
          <Link
            href={`/${locale}`}
            className="inline-flex min-h-11 items-center gap-3 rounded-xl font-semibold ltr:tracking-tight"
            aria-label={t('title')}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-foreground text-surface-paper">
              <Compass className="h-4 w-4" aria-hidden="true" />
            </span>
            <span>{t('title')}</span>
          </Link>

          <nav aria-label={t('navLabel')} className="hidden items-center gap-7 md:flex">
            <a href="#experience" className="text-sm font-medium text-foreground/60 transition-colors duration-150 hover:text-foreground">
              {t('navExperience')}
            </a>
            <a href="#principles" className="text-sm font-medium text-foreground/60 transition-colors duration-150 hover:text-foreground">
              {t('navPrinciples')}
            </a>
          </nav>

          <div className="flex items-center gap-2 [&>button]:min-h-11 [&>button]:min-w-11">
            <LanguageSwitcher locale={locale} inline />
            <ThemeToggle inline />
            <Link
              href={`/${locale}/login`}
              className="hidden min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-foreground/70 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground sm:inline-flex"
            >
              {t('ctaSecondary')}
            </Link>
          </div>
        </div>
      </header>

      <div>
        <section className="mx-auto grid w-full max-w-7xl gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-20 lg:py-28">
          <div className="max-w-3xl text-start">
            <p className="mb-7 inline-flex items-center gap-2 text-xs font-semibold uppercase text-foreground/60 ltr:tracking-[0.16em]">
              <span className="h-2 w-2 rounded-full bg-up" aria-hidden="true" />
              {t('heroKicker')}
            </p>
            <h1 className="max-w-4xl text-[clamp(2.85rem,7vw,6.75rem)] font-semibold leading-[0.94] ltr:tracking-[-0.055em] rtl:leading-[1.16]">
              {t('heroTitlePrefix')}{' '}
              <span className="text-accent">{t('heroTitleAccent')}</span>
            </h1>
            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-foreground/65 sm:text-xl">
              {t('heroSubtitle')}
            </p>

            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Link
                href={`/${locale}/login`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white shadow-[0_8px_24px_-10px_rgba(var(--accent-color-rgb),0.8)] transition-[transform,opacity] duration-150 ease-out hover:opacity-90 motion-safe:hover:-translate-y-0.5"
              >
                <span>{t('ctaPrimary')}</span>
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
              <a
                href="#experience"
                className="inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-sm font-semibold text-foreground/70 transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
              >
                {t('ctaExperience')}
              </a>
            </div>

            <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm text-foreground/60" aria-label={t('proofLabel')}>
              {(['paper', 'screening', 'bilingual'] as const).map((key) => (
                <li key={key} className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-up" aria-hidden="true" />
                  {t(`proof.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <div aria-label={t('heroVisualLabel')} className="flex justify-center lg:justify-end">
            <HeroVisual />
          </div>
        </section>

        <section id="experience" className="scroll-mt-24 border-y border-[var(--border-color)] bg-surface-card">
          <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:py-28">
            <div className="max-w-xl text-start">
              <p className="text-xs font-semibold uppercase text-accent ltr:tracking-[0.16em]">{t('experienceEyebrow')}</p>
              <h2 className="mt-5 text-3xl font-semibold leading-tight ltr:tracking-tight sm:text-5xl">
                {t('experienceTitle')}
              </h2>
              <p className="mt-6 text-base leading-relaxed text-foreground/60 sm:text-lg">
                {t('experienceSubtitle')}
              </p>
            </div>

            <ol className="grid gap-px overflow-hidden rounded-2xl bg-[var(--border-color)] sm:grid-cols-2">
              {PROCESS.map(({ key, Icon }, index) => (
                <li key={key} className="group bg-surface-paper p-6 text-start sm:p-8">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-mono text-xs tabular-nums text-foreground/40">0{index + 1}</span>
                    <Icon className="h-5 w-5 text-foreground/40 transition-colors duration-150 group-hover:text-accent" aria-hidden="true" />
                  </div>
                  <h3 className="mt-10 text-lg font-semibold">{t(`process.${key}.title`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-foreground/60">{t(`process.${key}.desc`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="principles" className="scroll-mt-24 mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 lg:py-28">
          <div className="max-w-3xl text-start">
            <p className="text-xs font-semibold uppercase text-accent ltr:tracking-[0.16em]">{t('featureEyebrow')}</p>
            <h2 className="mt-5 text-3xl font-semibold leading-tight ltr:tracking-tight sm:text-5xl">{t('featureTitle')}</h2>
            <p className="mt-6 text-base leading-relaxed text-foreground/60 sm:text-lg">{t('featureSubtitle')}</p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ key, Icon }) => (
              <article
                key={key}
                className="glass-panel glass-panel-hover rounded-2xl p-6 text-start transition-transform duration-200 ease-out motion-safe:hover:-translate-y-1"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/5 text-foreground/60">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-8 text-base font-semibold">{t(`feature.${key}.title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-foreground/60">{t(`feature.${key}.desc`)}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-5 pb-20 sm:px-8 lg:pb-28">
          <div className="overflow-hidden rounded-[2rem] bg-foreground px-6 py-12 text-surface-paper sm:px-10 lg:flex lg:items-center lg:justify-between lg:gap-16 lg:px-14 lg:py-14">
            <div className="max-w-2xl text-start">
              <h2 className="text-3xl font-semibold leading-tight ltr:tracking-tight sm:text-4xl">{t('finalTitle')}</h2>
              <p className="mt-4 text-base leading-relaxed opacity-65">{t('finalSubtitle')}</p>
            </div>
            <div className="mt-8 flex shrink-0 flex-col gap-3 sm:flex-row lg:mt-0">
              <Link
                href={`/${locale}/login`}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
              >
                {t('ctaPrimary')}
                <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-[var(--border-color)] px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-xs text-foreground/55 sm:flex-row sm:items-center sm:justify-between">
          <p>{tDisclaimer('banner')}</p>
          <p className="shrink-0">&copy; 2026 {t('title')}. {t('rightsReserved')}</p>
        </div>
      </footer>
    </div>
  );
}
