'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Wallet, LineChart, BookOpen, User, Briefcase, Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import ThemeToggle from './ThemeToggle';
import LanguageSwitcher from './LanguageSwitcher';

export default function Navigation({ locale }: { locale: string }) {
  const t = useTranslations('Dashboard');
  const pathname = usePathname();
  const isAr = locale === 'ar';

  const isAuthOrLanding = 
    pathname === `/${locale}` || 
    pathname === `/${locale}/login` || 
    pathname === `/${locale}/register` ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register';

  useEffect(() => {
    if (isAuthOrLanding) {
      document.body.classList.remove('md:ps-64');
    } else {
      document.body.classList.add('md:ps-64');
    }
    return () => {
      document.body.classList.remove('md:ps-64');
    };
  }, [isAuthOrLanding]);

  if (isAuthOrLanding) return null;

  const links = [
    { href: `/${locale}/dashboard`, icon: Wallet, label: isAr ? 'المحفظة' : 'Portfolio' },
    { href: `/${locale}/markets`, icon: LineChart, label: isAr ? 'الأسهم' : 'Stocks' },
    { href: `/${locale}/quant`, icon: Sparkles, label: isAr ? 'الذكاء الكمي' : 'Quant Advisor' },
    { href: `/${locale}/quiz`, icon: BookOpen, label: isAr ? 'التعليم' : 'Quizzes' },
    { href: `/${locale}/profile`, icon: User, label: isAr ? 'حسابي' : 'Profile' },
  ];

  // Subset of links for mobile dock to prevent crowding
  const mobileLinks = [
    { href: `/${locale}/dashboard`, icon: Wallet, label: isAr ? 'المحفظة' : 'Portfolio' },
    { href: `/${locale}/markets`, icon: LineChart, label: isAr ? 'الأسهم' : 'Stocks' },
    { href: `/${locale}/quant`, icon: Sparkles, label: isAr ? 'الذكاء' : 'Quant' },
    { href: `/${locale}/quiz`, icon: BookOpen, label: isAr ? 'التعليم' : 'Quizzes' },
    { href: `/${locale}/profile`, icon: User, label: isAr ? 'حسابي' : 'Profile' },
  ];

  return (
    <>
      {/* Desktop Sidebar - Premium Floating Design */}
      <aside className="hidden md:flex flex-col fixed top-4 bottom-4 start-4 w-64 glass-panel border border-slate-200 dark:border-white/10 z-50 rounded-3xl p-4 justify-between shadow-2xl">
        <div className="space-y-6">
          <div className="px-4 py-2 border-b border-slate-200 dark:border-white/5 pb-4">
            <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent tracking-tight">
              {t('title')}
            </h1>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">Simulated Banking</p>
          </div>
          
          <nav className="space-y-1">
            {links.map((link) => {
              const isActive = pathname.startsWith(link.href);
              return (
                <Link 
                  key={link.href} 
                  href={link.href}
                  className="block relative"
                >
                  <motion.div
                    className={`flex items-center space-x-3 rtl:space-x-reverse px-4 py-3 rounded-xl transition-all ${
                      isActive 
                        ? 'bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-400 font-bold border-l-2 border-emerald-500' 
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                    whileHover={{ x: isAr ? -4 : 4 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  >
                    <link.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
                    <span className="text-sm font-semibold">{link.label}</span>
                  </motion.div>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Desktop Bottom settings and utilities consolidated */}
        <div className="pt-4 border-t border-slate-200 dark:border-white/5 space-y-4">
          <div className="flex items-center justify-between gap-2 px-2">
            <LanguageSwitcher locale={locale} inline={true} />
            <ThemeToggle inline={true} />
          </div>
          <div className="text-[10px] text-gray-500 text-center font-bold font-mono">
            v1.2.0 • GCC SHARIA
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation - Floating iOS Style Dock */}
      <nav className="md:hidden fixed bottom-4 inset-x-4 max-w-lg mx-auto glass-panel border border-slate-200 dark:border-white/10 rounded-full z-50 shadow-2xl h-16 flex items-center justify-around px-2">
        {mobileLinks.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`flex flex-col items-center justify-center space-y-0.5 w-14 h-full relative ${
                isActive ? 'text-emerald-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {isActive && (
                <motion.span 
                  layoutId="activePill"
                  className="absolute inset-0 bg-emerald-500/10 dark:bg-emerald-500/5 rounded-2xl -z-10 border border-emerald-500/20"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
              <link.icon className={`w-5 h-5 transition-transform ${isActive ? 'scale-110 text-emerald-400' : ''}`} />
              <span className="text-[9px] font-bold tracking-tight">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

