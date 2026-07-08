'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronRight, Share2, Heart, Search, HelpCircle, Info, Check, BookOpen, Trophy } from 'lucide-react';
import { TICKERS } from '@/lib/tickers';
import StockSearch from './StockSearch';
import StockList from './StockList';
import StockDetail from './StockDetail';

interface MarketsContainerProps {
  currentData: any;
  locale: string;
  isParent: boolean;
  initialActiveSymbol?: string | null;
  initialJarBalance?: number;
  initialSharesOwned?: number;
}

export default function MarketsContainer({
  currentData,
  locale,
  isParent,
  initialActiveSymbol,
  initialJarBalance,
  initialSharesOwned
}: MarketsContainerProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';

  // State managers
  const [marketTab, setMarketTab] = useState<'TASI' | 'NASDAQ'>(currentData.market);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(
    initialActiveSymbol !== undefined ? initialActiveSymbol : currentData.symbol
  );
  const [currentStockData, setCurrentStockData] = useState(currentData);
  const [loadingStock, setLoadingStock] = useState(false);
  const [isListCollapsed, setIsListCollapsed] = useState(false);

  // Live balance states
  const [jarBalance, setJarBalance] = useState(initialJarBalance ?? 0);
  const [sharesOwned, setSharesOwned] = useState(initialSharesOwned ?? 0);

  // Search status states
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchingOnline, setSearchingOnline] = useState(false);

  useEffect(() => {
    setCurrentStockData(currentData);
    if (currentData) {
      setMarketTab(currentData.market);
      setActiveSymbol(currentData.symbol);
    }
  }, [currentData]);

  // Synchronise stock selection
  const handleSelectSymbol = async (symbol: string, market: 'TASI' | 'NASDAQ') => {
    setLoadingStock(true);
    setActiveSymbol(symbol);
    try {
      const res = await fetch(`/api/market-data?symbol=${symbol}&market=${market}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentStockData(data);
        if (data.sharesOwned !== undefined) {
          setSharesOwned(data.sharesOwned);
        }
        const newUrl = `/${locale}/markets?symbol=${symbol}&market=${market}`;
        window.history.pushState(null, '', newUrl);
      }
    } catch (err) {
      console.error('Failed to fetch stock details:', err);
    } finally {
      setLoadingStock(false);
    }
  };

  const handleMarketTabChange = (tab: 'TASI' | 'NASDAQ') => {
    setMarketTab(tab);
    setSearchResults(null);
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      const firstSymbol = TICKERS[tab][0].symbol;
      handleSelectSymbol(firstSymbol, tab);
    } else {
      setActiveSymbol(null);
    }
  };

  const handleTradeExecuted = (newBalance: number, newShares: number) => {
    setJarBalance(newBalance);
    setSharesOwned(newShares);
  };

  // Featured gainers for horizontal summary bar
  const activeTickers = marketTab === 'TASI' ? TICKERS.TASI : TICKERS.NASDAQ;

  const renderMarketOverview = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold font-sans">
          {t('stocksTab')}
        </h1>
        <div className="flex space-x-3 rtl:space-x-reverse">
          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center border border-slate-200 dark:border-white/10">
            <span className="text-xs font-bold text-emerald-400">R</span>
          </div>
        </div>
      </div>

      {/* AI Advisor Banner */}
      <Link 
        href={`/${locale}/quant`}
        className="flex items-center justify-between p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all duration-300 transform hover:scale-[1.02]"
      >
        <div className="flex items-center space-x-3 rtl:space-x-reverse">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
          </div>
          <div className="text-start">
            <p className="text-sm font-bold text-emerald-300">
              {t('aiCommitteeTab')}
            </p>
            <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
              {t('aiCommitteeSub')}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-emerald-400 shrink-0 rtl:rotate-180" />
      </Link>

      {/* Live search input */}
      <StockSearch
        market={marketTab}
        onSearchResults={setSearchResults}
        onSearchingChange={setSearchingOnline}
      />

      {/* Markets Selector Tabs */}
      <div className="grid grid-cols-2 bg-slate-100 dark:bg-white/[0.03] p-1 rounded-2xl border border-slate-200 dark:border-white/[0.06]">
        <button
          onClick={() => handleMarketTabChange('TASI')}
          className={`py-2.5 rounded-xl text-xs font-bold transition-all duration-300 flex items-center justify-center space-x-2 active:scale-95 ${
            marketTab === 'TASI' 
              ? 'bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white border border-white/[0.08] shadow-lg' 
              : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white'
          }`}
        >
          <span>🇸🇦</span>
          <span>{t('saudiMarket')}</span>
        </button>
        <button
          onClick={() => handleMarketTabChange('NASDAQ')}
          className={`py-2.5 rounded-xl text-xs font-bold transition-all duration-300 flex items-center justify-center space-x-2 active:scale-95 ${
            marketTab === 'NASDAQ' 
              ? 'bg-white dark:bg-white/[0.08] text-slate-900 dark:text-white border border-white/[0.08] shadow-lg' 
              : 'text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white'
          }`}
        >
          <span>🇺🇸</span>
          <span>{t('usMarket')}</span>
        </button>
      </div>

      {/* Market status info bar */}
      <div className="bg-slate-50 dark:bg-white/[0.02] rounded-2xl p-3 border border-slate-200 dark:border-white/[0.04] flex items-center justify-between text-xs text-slate-500 dark:text-gray-400 shadow-sm">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span>
            {marketTab === 'TASI'
              ? t('marketClosedSun')
              : t('marketClosedMon')}
          </span>
        </div>
        <span className="font-mono">10:00 ص / 10:00 AM</span>
      </div>

      {/* Top Gainers Carousel */}
      <div className="space-y-3">
        <div className="flex justify-between items-center text-sm">
          <h3 className="font-bold text-slate-900 dark:text-gray-200">{t('marketSummary')}</h3>
          <span className="text-xs text-emerald-400 font-semibold">{t('topGainers')}</span>
        </div>
        <div className="flex space-x-3 overflow-x-auto pb-2 pr-1 no-scrollbar rtl:space-x-reverse">
          {activeTickers.filter(tk => tk.pct > 0).map((ticker) => (
            <button
              key={ticker.symbol}
              onClick={() => handleSelectSymbol(ticker.symbol, marketTab)}
              className="bg-slate-50 dark:bg-[#121824] border border-slate-200 dark:border-white/5 min-w-[120px] p-4 rounded-2xl text-center space-y-2 hover:bg-slate-100 dark:bg-white/5 transition-all shrink-0 active:scale-95 text-start flex flex-col justify-center"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-xs font-bold text-emerald-400 mx-auto font-mono">
                {ticker.symbol.replace('.SR', '')}
              </div>
              <p className="text-xs font-bold text-slate-800 dark:text-gray-300 truncate w-full text-center">{isAr ? ticker.arName : ticker.name}</p>
              <p className="text-sm font-mono font-bold text-center">
                {marketTab === 'TASI' 
                  ? t('formatTasi', { amount: ticker.price.toFixed(2) })
                  : t('formatNasdaq', { amount: ticker.price.toFixed(2) })
                }
              </p>
              <p className="text-[10px] font-semibold text-emerald-400 text-center">+{ticker.pct.toFixed(2)}%</p>
            </button>
          ))}
        </div>
      </div>

      {/* Stock Watchlist results */}
      <StockList
        market={marketTab}
        searchResults={searchResults}
        searchingOnline={searchingOnline}
        selectedSymbol={activeSymbol}
        locale={locale}
        onSelectStock={(sym) => handleSelectSymbol(sym, marketTab)}
      />
    </div>
  );

  return (
    <div className="w-full text-slate-900 dark:text-white select-none relative pb-24 md:pb-8">
      {/* Mobile-only view: switches between list and details */}
      <div className="block md:hidden max-w-xl mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          {!activeSymbol ? (
            <motion.div
              key="mobile-list"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="p-4 space-y-6"
            >
              {renderMarketOverview()}
            </motion.div>
          ) : (
            <motion.div
              key="mobile-details"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="space-y-6"
            >
              {loadingStock ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-gray-500 space-y-3">
                  <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs">{t('loading')}</span>
                </div>
              ) : (
                <StockDetail
                  data={currentStockData}
                  locale={locale}
                  jarBalance={jarBalance}
                  sharesOwned={sharesOwned}
                  isParent={isParent}
                  onTradeExecuted={handleTradeExecuted}
                  onBack={() => setActiveSymbol(null)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Desktop-only split-screen view */}
      <div className="hidden md:grid grid-cols-12 gap-8 max-w-6xl mx-auto min-h-screen">
        {/* Left Column: Watchlist & Search */}
        {!isListCollapsed && (
          <div className="col-span-5 lg:col-span-4 space-y-6 border-r border-slate-200 dark:border-white/5 pe-6">
            {renderMarketOverview()}
          </div>
        )}

        {/* Right Column: Dynamic Detail Panel */}
        <div className={`space-y-6 transition-all duration-300 ${
          isListCollapsed ? 'col-span-12' : 'col-span-7 lg:col-span-8'
        }`}>
          {/* Workstation Top Bar */}
          <div className="flex items-center justify-between p-3 rounded-2xl glass-panel border border-slate-200 dark:border-white/5 bg-black/10">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsListCollapsed(!isListCollapsed)}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold transition-all border border-slate-200 dark:border-white/10 flex items-center gap-1.5"
              >
                {isListCollapsed ? (
                  <>
                    <span>Show Watchlist</span>
                  </>
                ) : (
                  <>
                    <span>Maximize Detail</span>
                  </>
                )}
              </button>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                Workstation Grid • {marketTab} • {activeSymbol || 'NO STOCK SELECTED'}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-400 uppercase font-mono tracking-wider">
                LIVE TERMINAL
              </span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {loadingStock ? (
              <motion.div
                key="desktop-loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-[500px] text-gray-500 space-y-3 glass-panel bg-black/40 border border-white/5 rounded-3xl p-8"
              >
                <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-mono font-bold text-emerald-400">SYNCING LIVE MARKET TICKER...</span>
              </motion.div>
            ) : currentStockData ? (
              <motion.div
                key={`desktop-detail-${activeSymbol}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <StockDetail
                  data={currentStockData}
                  locale={locale}
                  jarBalance={jarBalance}
                  sharesOwned={sharesOwned}
                  isParent={isParent}
                  onTradeExecuted={handleTradeExecuted}
                  onBack={() => {}}
                />
              </motion.div>
            ) : (
              <motion.div
                key="desktop-empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center h-[500px] text-gray-500 glass-panel bg-black/40 border border-white/5 rounded-3xl p-8 text-center space-y-3"
              >
                <HelpCircle className="w-12 h-12 text-gray-600" />
                <p className="font-bold text-gray-400">Select a stock to begin trading</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
