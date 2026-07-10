'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ThemeToggleProps {
  inline?: boolean;
}

export default function ThemeToggle({ inline = false }: ThemeToggleProps) {
  const t = useTranslations('ThemeToggle');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const isDark = document.documentElement.classList.contains('dark');
    setTheme(isDark ? 'dark' : 'light');
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);

    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const buttonClass = inline
    ? 'flex items-center justify-center bg-surface-raised hover:bg-surface-card border border-[var(--border-color)] w-9 h-9 rounded-xl transition-[background-color,transform] duration-150 active:scale-95 text-accent'
    : 'fixed top-4 end-28 z-[999] flex items-center justify-center bg-surface-raised hover:bg-surface-card border border-[var(--border-color)] w-9 h-9 rounded-full shadow-lg transition-[background-color,transform] duration-150 active:scale-95 text-accent';

  return (
    <button
      onClick={toggleTheme}
      aria-label={t('toggleTheme')}
      className={buttonClass}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}

