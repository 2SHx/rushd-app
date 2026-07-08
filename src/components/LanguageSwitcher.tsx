// src/components/LanguageSwitcher.tsx
'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher({ locale }: { locale: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isAr = locale === 'ar';
  
  const handleLocaleChange = () => {
    const nextLocale = isAr ? 'en' : 'ar';
    const pathSegments = pathname.split('/');
    // pathSegments[0] is empty, pathSegments[1] is the locale (e.g. 'en' or 'ar')
    pathSegments[1] = nextLocale;
    const newPath = pathSegments.join('/');
    
    // Append existing query params
    const queryStr = searchParams.toString();
    const finalUrl = queryStr ? `${newPath}?${queryStr}` : newPath;
    
    window.location.href = finalUrl;
  };

  return (
    <button
      onClick={handleLocaleChange}
      aria-label="Toggle language"
      className="fixed top-4 end-4 z-[999] flex items-center space-x-1.5 rtl:space-x-reverse bg-white/80 dark:bg-black/40 hover:bg-slate-100 dark:hover:bg-[#1D263B] backdrop-blur-md border border-slate-200 dark:border-white/10 px-3.5 py-1.5 h-9 rounded-full shadow-lg transition-all active:scale-95 text-xs font-semibold text-slate-800 dark:text-emerald-400"
    >
      <Globe className="w-3.5 h-3.5" />
      <span>{isAr ? 'English' : 'العربية'}</span>
    </button>
  );
}
