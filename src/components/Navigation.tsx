'use client';

import { useTranslations } from 'next-intl';
import { Wallet, LineChart, BookOpen, User, Briefcase } from 'lucide-react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function Navigation({ locale }: { locale: string }) {
  const t = useTranslations('Dashboard');
  const pathname = usePathname();
  const isAr = locale === 'ar';

  const links = [
    { href: `/${locale}/dashboard`, icon: Wallet, label: isAr ? 'المحفظة' : 'Portfolio' },
    { href: `/${locale}/markets`, icon: LineChart, label: isAr ? 'الأسهم' : 'Stocks' },
    { href: `/${locale}/quiz`, icon: BookOpen, label: isAr ? 'التعليم' : 'Quizzes' },
    { href: `/${locale}/profile`, icon: User, label: isAr ? 'حسابي' : 'Profile' },
    { href: `/${locale}/investor`, icon: Briefcase, label: isAr ? 'المستثمرون' : 'Investors' }
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col fixed inset-y-0 start-0 w-64 glass-panel border-y-0 border-s-0 z-50 rounded-none">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-neonBlue bg-clip-text text-transparent">
            {t('title')}
          </h1>
        </div>
        <nav className="flex-1 px-4 space-y-2 mt-8">
          {links.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={`flex items-center space-x-3 rtl:space-x-reverse px-4 py-3 rounded-xl transition-colors ${
                  isActive ? 'bg-emerald-500/10 text-emerald-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <link.icon className="w-5 h-5" />
                <span className="font-medium">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 glass-panel border-x-0 border-b-0 rounded-t-3xl rounded-b-none z-50 pb-safe">
        <div className="flex justify-around items-center h-16 px-2">
          {links.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={`flex flex-col items-center justify-center space-y-1 w-16 h-full ${
                  isActive ? 'text-emerald-400' : 'text-gray-400'
                }`}
              >
                <link.icon className={`w-5 h-5 ${isActive ? 'scale-110' : ''} transition-transform`} />
                <span className="text-[10px] font-medium">{link.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
