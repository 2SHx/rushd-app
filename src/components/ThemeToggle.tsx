'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  inline?: boolean;
}

export default function ThemeToggle({ inline = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

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
    ? 'flex items-center justify-center bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 w-9 h-9 rounded-xl transition-all active:scale-95 text-slate-800 dark:text-yellow-400 border border-slate-200 dark:border-white/10'
    : 'fixed top-4 end-28 z-[999] flex items-center justify-center bg-white/80 dark:bg-black/40 hover:bg-slate-100 dark:hover:bg-[#1D263B] backdrop-blur-md border border-slate-200 dark:border-white/10 w-9 h-9 rounded-full shadow-lg transition-all active:scale-95 text-slate-800 dark:text-yellow-400';

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle theme"
      className={buttonClass}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4 text-indigo-600" />
      )}
    </button>
  );
}

