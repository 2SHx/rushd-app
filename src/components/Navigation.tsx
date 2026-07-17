'use client';

import { useTranslations } from 'next-intl';
import { Wallet, LineChart, GraduationCap, User, Trophy } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';
import { SHOW_STRATEGY_TEAMS } from '@/lib/featureFlags';

export default function Navigation({
  locale,
  children,
}: {
  locale: string;
  children: React.ReactNode;
}) {
  const t = useTranslations('Nav');
  const pathname = usePathname();

  const isAuthOrLanding =
    pathname === `/${locale}` ||
    pathname === `/${locale}/login` ||
    pathname === `/${locale}/register` ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register';

  // 'use client': needs usePathname to decide sidebar visibility per route,
  // and to gate the main-content inline-start padding here instead of the
  // previous document.body classList hack.
  if (isAuthOrLanding) {
    return <>{children}</>;
  }

  // Single source of truth for both the desktop sidebar and mobile dock —
  // shortLabel is only used where the dock's narrow columns need it.
  const navItems = [
    { href: `/${locale}/dashboard`, icon: Wallet, label: t('portfolio'), shortLabel: t('portfolio') },
    { href: `/${locale}/markets`, icon: LineChart, label: t('stocks'), shortLabel: t('stocks') },
    { href: `/${locale}/academy`, icon: GraduationCap, label: t('academy'), shortLabel: t('academyShort') },
    ...(SHOW_STRATEGY_TEAMS
      ? [{ href: `/${locale}/quant/league`, icon: Trophy, label: t('teams'), shortLabel: t('teamsShort') }]
      : []),
    { href: `/${locale}/profile`, icon: User, label: t('profile'), shortLabel: t('profile') },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed top-4 bottom-4 start-4 w-64 glass-panel z-50 rounded-2xl p-4 justify-between">
        <div className="space-y-6">
          <div className="px-4 py-2 border-b border-[var(--border-color)] pb-4">
            <h1 className="text-lg font-bold ltr:tracking-tight">{t('title')}</h1>
            <p className="text-[10px] text-foreground/70 font-semibold uppercase ltr:tracking-wider mt-1">
              {t('tagline')}
            </p>
            <Link
              href={`/${locale}/profile`}
              className="mt-3 flex items-center justify-between rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 transition-all hover:bg-accent/10"
            >
              <div className="flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-lg bg-accent text-[10px] font-extrabold text-white">
                  L3
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground leading-tight">
                    {locale === 'ar' ? 'مستثمر واعد' : 'Level 3'}
                  </p>
                  <p className="text-[9px] font-mono font-semibold text-accent">350 / 500 XP</p>
                </div>
              </div>
              <div className="h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                <div className="h-full rounded-full bg-accent" style={{ width: '70%' }} />
              </div>
            </Link>
          </div>

          <nav className="space-y-1">
            {navItems.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-accent/10 text-accent font-semibold border-s-2 border-accent'
                      : 'text-foreground/60 hover:text-foreground hover:bg-foreground/5'
                  }`}
                >
                  <link.icon className="w-5 h-5" />
                  <span className="text-sm">{link.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop bottom utilities */}
        <div className="pt-4 border-t border-[var(--border-color)] space-y-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <LanguageSwitcher locale={locale} inline={true} />
            <ThemeToggle inline={true} />
          </div>
          <div className="text-[10px] text-foreground/70 text-center font-mono">
            {t('version')}
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-4 inset-x-3 max-w-lg mx-auto glass-panel rounded-full z-50 h-16 flex items-center px-1.5 sm:inset-x-4 sm:px-2">
        {navItems.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 ${
                isActive ? 'text-accent' : 'text-foreground/70'
              }`}
            >
              {isActive && (
                <span className="absolute inset-0 bg-accent/10 rounded-2xl -z-10" />
              )}
              <link.icon className="w-5 h-5" />
              <span className="max-w-full truncate px-0.5 text-xs font-semibold ltr:tracking-tight">{link.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      <div className="md:ps-72 pb-safe">
        <div className="pb-24 md:pb-0">{children}</div>
      </div>
    </>
  );
}
