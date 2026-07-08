'use client';

import { useState, useEffect } from 'react';
import { Settings, X, Sliders, Play, RefreshCw, Sun, Moon, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThemePreset {
  name: string;
  nameAr: string;
  rgb: string;
  secondaryRgb: string;
}

const COLOR_PRESETS: Record<string, ThemePreset> = {
  emerald: {
    name: 'Apple Emerald',
    nameAr: 'زمردة آبل',
    rgb: '16, 185, 129',
    secondaryRgb: '52, 211, 153',
  },
  cyan: {
    name: 'Tech Cyan',
    nameAr: 'السماوي التقني',
    rgb: '6, 182, 212',
    secondaryRgb: '103, 232, 249',
  },
  gold: {
    name: 'Sunset Gold',
    nameAr: 'الذهبي الغروبي',
    rgb: '245, 158, 11',
    secondaryRgb: '251, 191, 36',
  },
  amethyst: {
    name: 'Royal Amethyst',
    nameAr: 'الأرجواني الملكي',
    rgb: '139, 92, 246',
    secondaryRgb: '167, 139, 250',
  },
};

export default function DesignControlCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Custom design states
  const [blur, setBlur] = useState(16);
  const [opacity, setOpacity] = useState(0.45);
  const [glows, setGlows] = useState(true);
  const [accent, setAccent] = useState('emerald');

  // Simulation states
  const [simSpeed, setSimSpeed] = useState(1);
  const [volatility, setVolatility] = useState(1);

  // Dark/Light theme state
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    setIsMounted(true);
    
    // Load from localStorage if present
    const savedBlur = localStorage.getItem('rushd_blur');
    const savedOpacity = localStorage.getItem('rushd_opacity');
    const savedGlows = localStorage.getItem('rushd_glows');
    const savedAccent = localStorage.getItem('rushd_accent');
    const savedSimSpeed = localStorage.getItem('rushd_simSpeed');
    const savedVolatility = localStorage.getItem('rushd_volatility');
    
    if (savedBlur) setBlur(Number(savedBlur));
    if (savedOpacity) setOpacity(Number(savedOpacity));
    if (savedGlows) setGlows(savedGlows === 'true');
    if (savedAccent && COLOR_PRESETS[savedAccent]) setAccent(savedAccent);
    if (savedSimSpeed) setSimSpeed(Number(savedSimSpeed));
    if (savedVolatility) setVolatility(Number(savedVolatility));

    // Listen to theme status changes
    const isDark = document.documentElement.classList.contains('dark');
    setThemeMode(isDark ? 'dark' : 'light');
    
    // Setup window global object for simulation configs
    const w = window as any;
    w.rushd_settings = {
      simSpeed: savedSimSpeed ? Number(savedSimSpeed) : 1,
      volatility: savedVolatility ? Number(savedVolatility) : 1,
    };
  }, []);

  // Sync variables to CSS
  useEffect(() => {
    if (!isMounted) return;
    
    const root = document.documentElement;
    root.style.setProperty('--glass-blur', `${blur}px`);
    root.style.setProperty('--glass-opacity', `${opacity}`);
    root.style.setProperty('--glow-intensity', glows ? '1' : '0');
    
    const selectedTheme = COLOR_PRESETS[accent];
    if (selectedTheme) {
      root.style.setProperty('--accent-color-rgb', selectedTheme.rgb);
      root.style.setProperty('--accent-secondary-rgb', selectedTheme.secondaryRgb);
    }

    // Save to local storage
    localStorage.setItem('rushd_blur', String(blur));
    localStorage.setItem('rushd_opacity', String(opacity));
    localStorage.setItem('rushd_glows', String(glows));
    localStorage.setItem('rushd_accent', accent);
  }, [blur, opacity, glows, accent, isMounted]);

  // Sync simulation configurations
  useEffect(() => {
    if (!isMounted) return;
    const w = window as any;
    if (!w.rushd_settings) w.rushd_settings = {};
    w.rushd_settings.simSpeed = simSpeed;
    w.rushd_settings.volatility = volatility;

    localStorage.setItem('rushd_simSpeed', String(simSpeed));
    localStorage.setItem('rushd_volatility', String(volatility));

    // Dispatch global event for components to notice
    window.dispatchEvent(new CustomEvent('rushd_settings_changed', {
      detail: { simSpeed, volatility }
    }));
  }, [simSpeed, volatility, isMounted]);

  const toggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);

    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const handleReset = () => {
    setBlur(16);
    setOpacity(themeMode === 'dark' ? 0.45 : 0.75);
    setGlows(true);
    setAccent('emerald');
    setSimSpeed(1);
    setVolatility(1);
  };

  if (!isMounted) return null;

  return (
    <>
      {/* Floating Toggle Button */}
      <motion.button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 end-6 md:bottom-6 z-[9999] flex items-center justify-center bg-gradient-to-r from-emerald-500 to-teal-600 dark:from-emerald-600 dark:to-teal-700 text-white w-12 h-12 rounded-full shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:shadow-[0_6px_25px_rgba(16,185,129,0.5)] active:scale-95 transition-all outline-none border border-white/20"
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        aria-label="Design Controls"
      >
        <Settings className="w-5 h-5 animate-[spin_10s_linear_infinite]" />
      </motion.button>

      {/* Slide-out Settings Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black z-[99998]"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 end-0 h-screen w-full max-w-sm glass-panel bg-white/95 dark:bg-[#080B11]/95 border-y-0 border-e-0 border-s border-slate-200 dark:border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[99999] overflow-y-auto flex flex-col justify-between"
            >
              {/* Header */}
              <div className="p-6 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
                <div className="flex items-center space-x-2 rtl:space-x-reverse">
                  <Sliders className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
                  <h3 className="font-bold text-lg text-slate-800 dark:text-white">Design & Simulation</h3>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-white/5 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5 text-slate-800 dark:text-white" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 p-6 space-y-8">
                {/* 1. Accent Theme Preset */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                    Accent Theme Preset
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(COLOR_PRESETS).map(([key, value]) => {
                      const isActive = accent === key;
                      return (
                        <button
                          key={key}
                          onClick={() => setAccent(key)}
                          style={{
                            backgroundColor: `rgba(${value.rgb}, 0.15)`,
                            borderColor: isActive ? `rgb(${value.rgb})` : 'transparent',
                          }}
                          className={`h-12 rounded-xl border-2 flex flex-col items-center justify-center transition-all ${
                            isActive ? 'scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
                          }`}
                        >
                          <span
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: `rgb(${value.rgb})` }}
                          />
                          <span className="text-[9px] font-bold mt-1 text-slate-800 dark:text-gray-300">
                            {key.toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Glassmorphism Blur */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span>Glassmorphism Blur</span>
                    <span className="font-mono text-emerald-400">{blur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    value={blur}
                    onChange={(e) => setBlur(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* 3. Card Background Opacity */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span>Card Opacity</span>
                    <span className="font-mono text-emerald-400">{Math.round(opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="95"
                    value={opacity * 100}
                    onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>

                {/* 4. Glow Effects */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Neon Glow Shadows
                  </span>
                  <button
                    onClick={() => setGlows(!glows)}
                    className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 focus:outline-none ${
                      glows ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white shadow-md transform duration-200 ${
                        glows ? 'translate-x-6' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Theme Mode Toggle (Consolidated) */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/5">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Color Mode
                  </span>
                  <button
                    onClick={toggleTheme}
                    className="flex items-center space-x-2 rtl:space-x-reverse bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-slate-800 dark:text-emerald-400"
                  >
                    {themeMode === 'dark' ? (
                      <>
                        <Sun className="w-3.5 h-3.5" />
                        <span>Light Mode</span>
                      </>
                    ) : (
                      <>
                        <Moon className="w-3.5 h-3.5" />
                        <span>Dark Mode</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 5. Simulation Speed Controls */}
                <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-white/5">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5 text-emerald-400" />
                      Simulation Delay
                    </span>
                    <span className="font-mono text-emerald-400">
                      {simSpeed === 0 ? 'Instant' : `${simSpeed}s`}
                    </span>
                  </div>
                  <div className="flex bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-slate-200 dark:border-white/5 space-x-1 rtl:space-x-reverse text-xs font-bold">
                    {([0, 0.5, 1, 2, 5] as const).map((s) => (
                      <button
                        key={s}
                        onClick={() => setSimSpeed(s)}
                        className={`flex-1 py-1.5 rounded-lg transition-all ${
                          simSpeed === s
                            ? 'bg-emerald-500 text-black shadow-md'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {s === 0 ? '0s' : `${s}s`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 6. Mock Data Volatility */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                      Mock Volatility
                    </span>
                    <span className="font-mono text-emerald-400">{volatility}x</span>
                  </div>
                  <div className="flex bg-slate-100 dark:bg-black/50 p-1 rounded-xl border border-slate-200 dark:border-white/5 space-x-1 rtl:space-x-reverse text-xs font-bold">
                    {([0.5, 1, 1.5, 2, 3] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setVolatility(v)}
                        className={`flex-1 py-1.5 rounded-lg transition-all ${
                          volatility === v
                            ? 'bg-emerald-500 text-black shadow-md'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {v}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-6 border-t border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-black/20 text-xs">
                <span className="text-gray-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" /> Client Sandbox Mode
                </span>
                <button
                  onClick={handleReset}
                  className="text-emerald-500 dark:text-emerald-400 font-bold hover:underline"
                >
                  Reset Defaults
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
