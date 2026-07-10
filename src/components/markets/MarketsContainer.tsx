'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
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

  return (
    <div className="w-full text-foreground relative pb-24 md:pb-8">

      {/* ── Mobile View ── */}
      <div className="block md:hidden max-w-xl mx-auto min-h-screen">
        <AnimatePresence mode="wait">
          {!activeSymbol ? (
            <motion.div key="mobile-overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} className="p-4 space-y-4">
              <MarketOverviewPanel
                market={marketTab}
                locale={locale}
                onSelectStock={(sym) => handleSelectSymbol(sym, marketTab)}
                quotes={quotes}
                loadingQuotes={loadingQuotes}
              />
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

      {/* ── Desktop View (Unified Full-Width Page) ── */}
      <div className="hidden md:block max-w-[1400px] mx-auto min-h-screen px-4 py-6">
        <AnimatePresence mode="wait">
          {loadingStock ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {renderLoading()}
            </motion.div>
          ) : !activeSymbol ? (
            /* ── Market Overview Screener (default) ── */
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
  );
}
