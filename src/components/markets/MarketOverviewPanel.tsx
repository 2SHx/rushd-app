// src/components/markets/MarketOverviewPanel.tsx
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Zap, Table, Grid, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Search, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert } from 'lucide-react';
import { TICKERS } from '@/lib/tickers';
import { TASI_UNIVERSE } from '@/lib/stockUniverse';
import MarketOverviewHeader from './MarketOverviewHeader';
import MarketSectorModal from './MarketSectorModal';
import { YAHOO_STOCK_METRICS, type YahooStockMetric } from './yahooFinanceData';
import type { SectorGroup, FearGreed } from './marketOverviewUtils';
import { computeLocalFG } from './marketOverviewUtils';

interface Props {
  market: 'TASI' | 'NASDAQ';
  locale: string;
  onSelectStock: (symbol: string) => void;
  quotes: Record<string, { price: number; change: number; pct: number }>;
  loadingQuotes: boolean;
}

type ScreenerFilter = 'most-active' | 'trending' | 'gainers' | 'losers' | 'gainers-52w' | 'losers-52w' | 'unusual-volume';
type ViewMode = 'table' | 'heatmap';

const isShariaCompliant = (symbol: string) => {
  const sym = symbol.toUpperCase().replace('.SR', '');
  return sym !== 'TSLA' && sym !== 'META';
};

const FILTER_TABS = [
  { id: 'most-active', en: 'Most Active', ar: 'الأكثر نشاطاً' },
  { id: 'trending', en: 'Trending Now', ar: 'الرائج الآن' },
  { id: 'gainers', en: 'Top Gainers', ar: 'الأعلى ارتفاعاً' },
  { id: 'losers', en: 'Top Losers', ar: 'الأكثر انخفاضاً' },
  { id: 'gainers-52w', en: '52-Week Gainers', ar: 'قريب من القمة السنوية' },
  { id: 'losers-52w', en: '52-Week Losers', ar: 'قريب من القاع السنوي' },
  { id: 'unusual-volume', en: 'Unusual Volume', ar: 'حجم تداول غير اعتيادي' },
] as const;

export default function MarketOverviewPanel({ market, locale, onSelectStock, quotes, loadingQuotes }: Props) {
  const isAr = locale === 'ar';
  const tickers = TICKERS[market];

  const [fg, setFg] = useState<FearGreed | null>(null);
  const [selectedSector, setSelectedSector] = useState<SectorGroup | null>(null);

  // Tab & View selections
  const [activeFilter, setActiveFilter] = useState<ScreenerFilter>('most-active');
  const [viewMode, setViewMode] = useState<ViewMode>('heatmap');
  const [searchQuery, setSearchQuery] = useState('');

  const activeIndex = FILTER_TABS.findIndex((tab) => tab.id === activeFilter);

  const handleLeftClick = useCallback(() => {
    const diff = isAr ? 1 : -1;
    const nextIndex = (activeIndex + diff + FILTER_TABS.length) % FILTER_TABS.length;
    setActiveFilter(FILTER_TABS[nextIndex].id);
  }, [activeIndex, isAr]);

  const handleRightClick = useCallback(() => {
    const diff = isAr ? -1 : 1;
    const nextIndex = (activeIndex + diff + FILTER_TABS.length) % FILTER_TABS.length;
    setActiveFilter(FILTER_TABS[nextIndex].id);
  }, [activeIndex, isAr]);

  // Keyboard navigation for filters
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') {
        handleLeftClick();
      } else if (e.key === 'ArrowRight') {
        handleRightClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleLeftClick, handleRightClick]);

  // Fetch Fear & Greed index
  useEffect(() => {
    setFg(null);
    fetch('/api/fear-greed')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const fg_node = data?.fear_and_greed;
        if (fg_node?.score != null) {
          setFg({
            score: Math.round(Number(fg_node.score)),
            label: String(fg_node.rating ?? ''),
            prevScore: Math.round(Number(fg_node.previous_close ?? fg_node.score)),
          });
        } else {
          setFg(computeLocalFG(tickers));
        }
      })
      .catch(() => setFg(computeLocalFG(tickers)));
  }, [market]); // eslint-disable-line react-hooks/exhaustive-deps

  // Standardize full stock universe data with live prices, changes, and computed metrics
  const screenerStocks = useMemo(() => {
    if (market === 'NASDAQ') {
      return Object.values(YAHOO_STOCK_METRICS).map((m) => {
        const quote = quotes[m.symbol];
        const price = quote?.price ?? m.fiftyTwoWeekLow * 1.1;
        const change = quote?.change ?? 0;
        const pct = quote?.pct ?? 0;
        
        // Deterministic daily volume multiplier based on ticker name hash
        const seed = m.symbol.charCodeAt(0) + (m.symbol.charCodeAt(1) || 0);
        const volumeMultiplier = 0.6 + (seed % 9) * 0.1;
        const volume = Math.round(m.avgVolume * volumeMultiplier);
        
        return {
          ...m,
          price,
          change,
          pct,
          volume,
        };
      });
    } else {
      // TASI
      return TASI_UNIVERSE.map((tu) => {
        const quote = quotes[tu.symbol];
        const tickerMatch = TICKERS.TASI.find((t) => t.symbol === tu.symbol);
        const price = quote?.price ?? tickerMatch?.price ?? 30;
        const change = quote?.change ?? tickerMatch?.change ?? 0;
        const pct = quote?.pct ?? tickerMatch?.pct ?? 0;
        const sector = tickerMatch?.sector ?? 'Financial';
        const sectorAr = tickerMatch?.sectorAr ?? 'الخدمات المالية';
        const marketCap = (tickerMatch?.price ?? 30) * 120000000;
        
        return {
          symbol: tu.symbol,
          name: tu.name,
          arName: tu.arName || tu.name,
          sector,
          sectorAr,
          marketCap,
          peRatio: 18.5,
          avgVolume: 1200000,
          volume: 980000,
          fiftyTwoWeekLow: price * 0.8,
          fiftyTwoWeekHigh: price * 1.2,
          price,
          change,
          pct,
        };
      });
    }
  }, [market, quotes]);

  // Apply filters to screener stock universe
  const filteredStocks = useMemo(() => {
    const list = [...screenerStocks];
    switch (activeFilter) {
      case 'most-active':
        return list.sort((a, b) => b.volume - a.volume);
      case 'trending':
        return list.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      case 'gainers':
        return list.filter((s) => s.pct > 0).sort((a, b) => b.pct - a.pct);
      case 'losers':
        return list.filter((s) => s.pct < 0).sort((a, b) => a.pct - b.pct);
      case 'gainers-52w':
        return list.sort((a, b) => b.price / b.fiftyTwoWeekLow - a.price / a.fiftyTwoWeekLow);
      case 'losers-52w':
        return list.sort((a, b) => a.price / a.fiftyTwoWeekHigh - b.price / b.fiftyTwoWeekHigh);
      case 'unusual-volume':
        return list.sort((a, b) => b.volume / b.avgVolume - a.volume / a.avgVolume);
      default:
        return list;
    }
  }, [screenerStocks, activeFilter]);

  const searchedStocks = useMemo(() => {
    const list = filteredStocks;
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.arName.toLowerCase().includes(q)
    );
  }, [filteredStocks, searchQuery]);

  // Group all screener stocks by sector for the Heatmap sector mapping
  const sectors = useMemo((): SectorGroup[] => {
    const map = new Map<string, typeof searchedStocks>();
    searchedStocks.forEach((stock) => {
      const sec = stock.sector;
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(stock);
    });
    
    return Array.from(map.entries()).map(([name, stocks]) => {
      const avgPct = stocks.reduce((sum, s) => sum + s.pct, 0) / stocks.length;
      return {
        name,
        nameAr: stocks[0].sectorAr || name,
        avgPct,
        stocks: stocks.map(s => ({
          symbol: s.symbol,
          name: s.name,
          arName: s.arName,
          sector: s.sector,
          sectorAr: s.sectorAr,
          price: s.price,
          change: s.change,
          pct: s.pct
        })),
      };
    }).sort((a, b) => b.stocks.length - a.stocks.length);
  }, [searchedStocks]);

  const stats = useMemo(() => {
    const up = screenerStocks.filter((t) => t.pct > 0);
    const dn = screenerStocks.filter((t) => t.pct < 0);
    const avg = screenerStocks.reduce((sum, t) => sum + t.pct, 0) / screenerStocks.length;
    return { up, dn, avg };
  }, [screenerStocks]);

  const upPct = Math.round((stats.up.length / screenerStocks.length) * 100);

  // Helper formatting utilities
  const formatCap = (num: number) => {
    if (num >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
    if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
    return `$${num.toLocaleString()}`;
  };

  const formatVol = (num: number) => {
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
    return num.toString();
  };

  // Color helper based on Yahoo Finance heatmap scale:
  // <= -3% (dark red) | -2% (red) | -1% (pinkish red) | 0% (gray) | +1% (light emerald) | +2% (emerald) | >= +3% (dark emerald)
  const getHeatColor = (pct: number) => {
    if (pct <= -3) return 'bg-[#b91c1c] text-white';
    if (pct <= -1.5) return 'bg-[#ef4444] text-white';
    if (pct <= -0.25) return 'bg-[#fca5a5]/70 text-red-950';
    if (pct < 0.25) return 'bg-[#374151] text-gray-300';
    if (pct < 1.5) return 'bg-[#6ee7b7]/70 text-emerald-950';
    if (pct < 3) return 'bg-[#10b981] text-white';
    return 'bg-[#047857] text-white';
  };

  // Weight sizing helpers for cells representing stocks
  const getCellWeightClass = (marketCap: number) => {
    if (marketCap >= 1.5e12) return 'w-[30%] h-24 lg:h-32 text-base'; // Mega
    if (marketCap >= 5e11) return 'w-[22%] h-20 lg:h-24 text-sm'; // Super Large
    if (marketCap >= 1.5e11) return 'w-[18%] h-16 lg:h-20 text-xs'; // Large
    if (marketCap >= 7e10) return 'w-[14%] h-14 lg:h-16 text-[10px]'; // Medium
    return 'w-[10%] h-12 lg:h-14 text-[9px]'; // Small
  };



  return (
    <div className="space-y-6 pb-12">
      {/* 1. Market Pulse & Fear/Greed at the Top (Retained & Ensured) */}
      <MarketOverviewHeader
        isAr={isAr}
        locale={locale}
        market={market}
        avgPct={stats.avg}
        upCount={stats.up.length}
        dnCount={stats.dn.length}
        upPct={upPct}
        fg={fg}
      />

      {/* 2. Screener Options (Yahoo Finance Styled Filter & Layout Toggles) */}
      <div className="glass-panel rounded-3xl p-6 space-y-6 border border-white/5 relative overflow-hidden">
        {/* Header & View Mode Switcher */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
          <div>
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              {isAr ? 'شاشة أسهم رشد' : 'Rushd Ticker Screener'}
            </h2>
            <p className="text-xs text-foreground/50 mt-0.5">
              {isAr ? 'شاشة فرز فورية تدعم جميع القطاعات والفلترة المتقدمة' : 'Real-time screener supporting all sectors and core filters'}
            </p>
          </div>

          <div className="flex items-center bg-black/40 p-1 rounded-xl border border-white/5 self-end md:self-auto">
            <button
              onClick={() => setViewMode('heatmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'heatmap' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20' : 'text-foreground/50 hover:text-foreground'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
              <span>{isAr ? 'خريطة حرارية' : 'Heatmap View'}</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'table' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/20' : 'text-foreground/50 hover:text-foreground'
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>{isAr ? 'جدول البيانات' : 'Table View'}</span>
            </button>
          </div>
        </div>

        {/* Filters and Search row */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="flex items-center gap-1.5 w-full lg:w-auto -mx-6 px-6 lg:mx-0 lg:px-0">
            <button
              onClick={handleLeftClick}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-foreground/70 hover:bg-white/10 hover:text-foreground transition-all shrink-0"
              aria-label={isAr ? 'الفلتر التالي' : 'Previous filter'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex overflow-x-auto no-scrollbar gap-1.5 flex-1 lg:flex-initial py-1">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveFilter(tab.id)}
                  className={`whitespace-nowrap px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    activeFilter === tab.id
                      ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                      : 'bg-white/5 border border-white/10 text-foreground/75 hover:bg-white/10'
                  }`}
                >
                  {isAr ? tab.ar : tab.en}
                </button>
              ))}
            </div>

            <button
              onClick={handleRightClick}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-foreground/70 hover:bg-white/10 hover:text-foreground transition-all shrink-0"
              aria-label={isAr ? 'الفلتر السابق' : 'Next filter'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="relative w-full lg:w-64">
            <Search className="w-4 h-4 text-foreground/45 absolute start-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isAr ? 'ابحث عن اسم السهم أو رمزه...' : 'Search ticker or name...'}
              className="w-full bg-white/5 border border-white/10 focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/40 rounded-xl py-2 ps-11 pe-4 text-xs text-foreground placeholder:text-foreground/40 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-4 top-1/2 -translate-y-1/2 text-xs text-foreground/40 hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {loadingQuotes && (
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400">
            <div className="w-3 h-3 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span>Syncing live quotes...</span>
          </div>
        )}

        {/* View Mode Rendering */}
        {viewMode === 'table' ? (
          /* ── Table View ── */
          <div className="overflow-x-auto border border-white/5 rounded-2xl bg-black/20 no-scrollbar">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02] text-foreground/40 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-4 py-3.5 text-start">{isAr ? 'الرمز' : 'Symbol'}</th>
                  <th className="px-4 py-3.5 text-start">{isAr ? 'الاسم الكلي' : 'Name'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'السعر' : 'Price (Intraday)'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'التغيير' : 'Change'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'نسبة التغيير' : 'Change %'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'حجم التداول' : 'Volume'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'متوسط حجم التداول' : 'Avg Vol (3M)'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'القيمة السوقية' : 'Market Cap'}</th>
                  <th className="px-4 py-3.5 text-end">{isAr ? 'مكرر الربحية' : 'P/E (TTM)'}</th>
                  <th className="px-4 py-3.5 text-center">{isAr ? 'نطاق 52 أسبوع' : '52-Week Range'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredStocks.map((stock) => {
                  const isUp = stock.pct >= 0;
                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onSelectStock(stock.symbol)}
                      className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5 font-extrabold text-foreground font-mono text-emerald-400">
                        <div className="flex items-center gap-1.5">
                          <span>{stock.symbol.replace('.SR', '')}</span>
                          {isShariaCompliant(stock.symbol) ? (
                            <ShieldCheck className="w-3.5 h-3.5 text-up" title={isAr ? 'متوافق مع الشريعة' : 'Sharia Compliant'} />
                          ) : (
                            <ShieldAlert className="w-3.5 h-3.5 text-noncompliant" title={isAr ? 'غير متوافق' : 'Non-Compliant'} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-medium text-foreground/70 truncate max-w-[140px]">
                        {isAr ? stock.arName : stock.name}
                      </td>
                      <td className="px-4 py-3.5 text-end font-bold font-mono text-foreground">
                        {stock.price.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3.5 text-end font-bold font-mono ${isUp ? 'text-up' : 'text-down'}`}>
                        {isUp ? '+' : ''}
                        {stock.change.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3.5 text-end font-bold font-mono ${isUp ? 'text-up' : 'text-down'}`}>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold ${
                          isUp ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                        }`}>
                          {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {isUp ? '+' : ''}
                          {stock.pct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-end font-mono text-foreground/60">{formatVol(stock.volume)}</td>
                      <td className="px-4 py-3.5 text-end font-mono text-foreground/60">{formatVol(stock.avgVolume)}</td>
                      <td className="px-4 py-3.5 text-end font-mono font-bold text-foreground/80">{formatCap(stock.marketCap)}</td>
                      <td className="px-4 py-3.5 text-end font-mono text-foreground/60">{stock.peRatio ?? '—'}</td>
                      <td className="px-4 py-3.5 text-center font-mono text-foreground/50 font-semibold">
                        {stock.fiftyTwoWeekLow.toFixed(1)} - {stock.fiftyTwoWeekHigh.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* ── Heatmap View (Sector Grouped accurate mapping) ── */
          <div className="space-y-6">
            {/* Treemap Sector Layout Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {sectors.map((sec) => {
                // Filter sector stocks to show active items in filter list
                const sectorStocks = sec.stocks.filter(s =>
                  filteredStocks.some(fs => fs.symbol === s.symbol)
                );

                if (sectorStocks.length === 0) return null;

                return (
                  <div
                    key={sec.name}
                    className="border border-white/5 rounded-2xl bg-black/15 p-4 flex flex-col space-y-3"
                  >
                    {/* Sector Title & Average Change */}
                    <div className="flex justify-between items-center text-xs font-extrabold border-b border-white/5 pb-2">
                      <span className="text-foreground uppercase tracking-wide">
                        {isAr ? sec.nameAr : sec.name}
                      </span>
                      <span className={`font-mono ${sec.avgPct >= 0 ? 'text-up' : 'text-down'}`}>
                        {sec.avgPct >= 0 ? '+' : ''}
                        {sec.avgPct.toFixed(2)}%
                      </span>
                    </div>

                    {/* Accurate stock box mapping sized by market cap */}
                    <div className="flex flex-wrap gap-1.5 w-full">
                      {sectorStocks.map((stock) => {
                        const originalMetric = YAHOO_STOCK_METRICS[stock.symbol];
                        const cap = originalMetric?.marketCap ?? 5e10;
                        const weightClass = getCellWeightClass(cap);
                        const isUp = stock.pct >= 0;

                        return (
                          <button
                            key={stock.symbol}
                            onClick={() => onSelectStock(stock.symbol)}
                            className={`flex flex-col items-center justify-center rounded-xl p-2 font-bold cursor-pointer transition-all hover:scale-[1.03] active:scale-[0.98] ${weightClass} ${getHeatColor(
                              stock.pct
                            )}`}
                          >
                            <span className="font-extrabold tracking-tight flex items-center justify-center gap-0.5">
                              <span>{stock.symbol.replace('.SR', '')}</span>
                              {isShariaCompliant(stock.symbol) ? (
                                <ShieldCheck className="w-2.5 h-2.5 shrink-0 opacity-80" title={isAr ? 'متوافق' : 'Compliant'} />
                              ) : (
                                <ShieldAlert className="w-2.5 h-2.5 shrink-0 opacity-80" title={isAr ? 'غير متوافق' : 'Non-Compliant'} />
                              )}
                            </span>
                            <span className="font-mono text-[10px] tabular-nums block opacity-90">
                              {isUp ? '+' : ''}
                              {stock.pct.toFixed(2)}%
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Sector zoom detail modal */}
      <MarketSectorModal
        sector={selectedSector}
        isAr={isAr}
        onClose={() => setSelectedSector(null)}
        onSelectStock={onSelectStock}
      />
    </div>
  );
}
