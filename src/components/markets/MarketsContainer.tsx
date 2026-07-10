'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Search, TrendingUp, TrendingDown, Flame, ArrowLeft } from 'lucide-react';
import { TICKERS } from '@/lib/tickers';
import StockSearch from './StockSearch';
import StockList from './StockList';
import StockDetail from './StockDetail';
import MarketOverviewPanel from './MarketOverviewPanel';

import { YAHOO_STOCK_METRICS } from './yahooFinanceData';
import { TASI_UNIVERSE } from '@/lib/stockUniverse';

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
  initialSharesOwned,
}: MarketsContainerProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';

  const [marketTab, setMarketTab] = useState<'TASI' | 'NASDAQ'>('NASDAQ');
  // Overview-first UX: only show a stock if explicitly in the URL
  const [activeSymbol, setActiveSymbol] = useState<string | null>(
    initialActiveSymbol ?? null
  );
  const [currentStockData, setCurrentStockData] = useState(currentData);
  const [loadingStock, setLoadingStock] = useState(false);

  const [jarBalance, setJarBalance] = useState(initialJarBalance ?? 0);
  const [sharesOwned, setSharesOwned] = useState(initialSharesOwned ?? 0);

  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchingOnline, setSearchingOnline] = useState(false);

  // Batch quotes states and fetching hook
  const [quotes, setQuotes] = useState<Record<string, { price: number; change: number; pct: number }>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);

  const allMarketSymbols = useMemo(() => {
    if (marketTab === 'NASDAQ') {
      return Object.keys(YAHOO_STOCK_METRICS);
    } else {
      return TASI_UNIVERSE.map(u => u.symbol);
    }
  }, [marketTab]);

  const visibleSymbols = useMemo(() => {
    const list = searchResults !== null ? searchResults : TICKERS[marketTab];
    return list.map((item: any) => item.symbol);
  }, [searchResults, marketTab]);

  useEffect(() => {
    if (allMarketSymbols.length === 0) return;
    let active = true;
    const fetchBatch = async () => {
      setLoadingQuotes(true);
      try {
        const symbolsQuery = allMarketSymbols.join(',');
        const res = await fetch(`/api/stocks/quotes?symbols=${symbolsQuery}&market=${marketTab}`);
        if (res.ok && active) {
          const data = await res.json();
          setQuotes(prev => ({
            ...prev,
            ...data.quotes
          }));
        }
      } catch (err) {
        console.error('Failed to batch fetch stock quotes:', err);
      } finally {
        if (active) setLoadingQuotes(false);
      }
    };
    fetchBatch();
    return () => { active = false; };
  }, [allMarketSymbols, marketTab]);

  useEffect(() => {
    if (currentData) {
      // Only update active symbol if one was passed from server
      if (initialActiveSymbol) {
        setCurrentStockData(currentData);
        setActiveSymbol(initialActiveSymbol);
      }
    }
  }, [currentData, initialActiveSymbol]);

  const handleSelectSymbol = async (symbol: string, market: 'TASI' | 'NASDAQ') => {
    setLoadingStock(true);
    setActiveSymbol(symbol);
    try {
      const res = await fetch(`/api/market-data?symbol=${symbol}&market=${market}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentStockData(data);
        if (data.sharesOwned !== undefined) setSharesOwned(data.sharesOwned);
        window.history.pushState(null, '', `/${locale}/markets?symbol=${symbol}&market=${market}`);
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
    setActiveSymbol(null); // return to overview on market switch
    window.history.pushState(null, '', `/${locale}/markets`);
  };

  const handleTradeExecuted = (newBalance: number, newShares: number) => {
    setJarBalance(newBalance);
    setSharesOwned(newShares);
  };

  const handleBackToOverview = () => {
    setActiveSymbol(null);
    window.history.pushState(null, '', `/${locale}/markets`);
  };

  // Top movers for sidebar
  const topMovers = useMemo(() => {
    const all = [...TICKERS[marketTab]];
    const gainers  = [...all].sort((a, b) => b.pct - a.pct).slice(0, 5);
    const trending = [...all].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5);
    return { gainers, trending };
  }, [marketTab]);

  const [moversTab, setMoversTab] = useState<'gainers' | 'trending'>('gainers');
  const moversData = moversTab === 'gainers' ? topMovers.gainers : topMovers.trending;

  // ── Loading skeleton ──────────────────────────────────────────
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center h-[500px] text-foreground/50 space-y-4 glass-panel rounded-3xl">
      <div className="relative">
        <div className="w-10 h-10 border-2 border-accent/20 rounded-full" />
        <div className="absolute inset-0 w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground/70">Syncing live data…</p>
        <p className="text-xs text-foreground/40 mt-0.5 font-mono tabular-nums">{activeSymbol || '—'}</p>
      </div>
    </div>
  );

  // ── Left sidebar ──────────────────────────────────────────────
  const renderSidebar = () => (
    <div className="flex flex-col h-full gap-4">


      {/* Market Selector Info Badge */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-foreground/[0.02] border border-[var(--border-color)] text-[11px] font-semibold text-foreground/60">
        <span className="flex items-center gap-1.5">
          <span>🇺🇸</span>
          <span>{isAr ? 'سوق ناسداك الأمريكي' : 'US NASDAQ Market'}</span>
        </span>
        <span className="w-1.5 h-1.5 rounded-full bg-up" />
      </div>

      {/* Top 5 Movers */}
      <div className="rounded-2xl border border-[var(--border-color)] overflow-hidden">
        <div className="flex border-b border-[var(--border-color)]">
          <button
            onClick={() => setMoversTab('gainers')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
              moversTab === 'gainers'
                ? 'text-up bg-up/5 border-b-2 border-up/40'
                : 'text-foreground/40 hover:text-foreground/60'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            {isAr ? 'أعلى 5' : 'Top 5'}
          </button>
          <button
            onClick={() => setMoversTab('trending')}
            className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] font-semibold transition-colors ${
              moversTab === 'trending'
                ? 'text-accent bg-accent/5 border-b-2 border-accent/40'
                : 'text-foreground/40 hover:text-foreground/60'
            }`}
          >
            <Flame className="w-3 h-3" />
            {isAr ? 'الأكثر حركة' : 'Hot'}
          </button>
        </div>
        <div className="divide-y divide-[var(--border-color)]">
          {moversData.map((stock, i) => {
            const isUp = stock.pct >= 0;
            return (
              <button
                key={stock.symbol}
                onClick={() => handleSelectSymbol(stock.symbol, marketTab)}
                className={`w-full flex items-center justify-between px-3 py-2 text-start hover:bg-foreground/[0.03] transition-colors ${
                  activeSymbol === stock.symbol ? 'bg-accent/5' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-4 text-[9px] font-bold font-mono tabular-nums ${i === 0 ? 'text-accent' : 'text-foreground/30'}`}>
                    #{i + 1}
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground leading-tight">{stock.symbol.replace('.SR', '')}</p>
                    <p className="text-[9px] text-foreground/50 truncate max-w-[90px]">{isAr ? stock.arName : stock.name}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1 text-[10px] font-bold font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                  isUp ? 'text-up bg-up/10' : 'text-down bg-down/10'
                }`}>
                  {isUp ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                  {isUp ? '+' : ''}{stock.pct.toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <StockSearch
        market={marketTab}
        onSearchResults={setSearchResults}
        onSearchingChange={setSearchingOnline}
      />

      {/* Stock list */}
      <div className="flex-1 overflow-hidden">
        <StockList
          market={marketTab}
          searchResults={searchResults}
          searchingOnline={searchingOnline}
          selectedSymbol={activeSymbol}
          locale={locale}
          onSelectStock={(sym) => handleSelectSymbol(sym, marketTab)}
          quotes={quotes}
          loadingQuotes={loadingQuotes}
        />
      </div>
    </div>
  );

  return (
    <div className="w-full text-foreground relative pb-24 md:pb-8">

      {/* ── Mobile ── */}
      <div className="block md:hidden max-w-xl mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          {!activeSymbol ? (
            <motion.div key="mobile-overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="p-4 space-y-4">
              {renderSidebar()}
            </motion.div>
          ) : (
            <motion.div key="mobile-detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4 pb-6">
              {loadingStock ? renderLoading() : (
                <div className="p-4">
                  <StockDetail
                    data={currentStockData}
                    locale={locale}
                    jarBalance={jarBalance}
                    sharesOwned={sharesOwned}
                    isParent={isParent}
                    onTradeExecuted={handleTradeExecuted}
                    onBack={handleBackToOverview}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Desktop split ── */}
      <div className="hidden md:flex gap-5 max-w-[1600px] mx-auto min-h-screen items-start px-2">

        {/* Left sidebar */}
        <div className="w-64 lg:w-72 shrink-0 sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto no-scrollbar">
          <div className="rounded-3xl glass-panel p-4">
            {renderSidebar()}
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {loadingStock ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {renderLoading()}
              </motion.div>

            ) : !activeSymbol ? (
              /* ── Market Overview (default) ── */
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                <MarketOverviewPanel
                  market={marketTab}
                  locale={locale}
                  onSelectStock={(sym) => handleSelectSymbol(sym, marketTab)}
                  quotes={quotes}
                  loadingQuotes={loadingQuotes}
                />
              </motion.div>

            ) : (
              /* ── Stock Detail ── */
              <motion.div
                key={`detail-${activeSymbol}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
              >
                {/* Back to overview breadcrumb */}
                <button
                  onClick={handleBackToOverview}
                  className="flex items-center gap-1.5 text-[11px] text-foreground/50 hover:text-foreground transition-colors mb-4 group"
                >
                  <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform rtl:rotate-180" />
                  <span>{isAr ? '← نظرة عامة على السوق' : '← Market Overview'}</span>
                </button>
                <StockDetail
                  data={currentStockData}
                  locale={locale}
                  jarBalance={jarBalance}
                  sharesOwned={sharesOwned}
                  isParent={isParent}
                  onTradeExecuted={handleTradeExecuted}
                  onBack={handleBackToOverview}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
