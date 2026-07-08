'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles, ShieldCheck, AlertCircle } from 'lucide-react';
import { TASI_UNIVERSE, NASDAQ_UNIVERSE_FALLBACK } from '@/lib/stockUniverse';
import StockListRow from './StockListRow';

interface StockListProps {
  market: 'TASI' | 'NASDAQ';
  searchResults: any[] | null;
  searchingOnline: boolean;
  selectedSymbol: string | null;
  locale: string;
  onSelectStock: (symbol: string) => void;
}

export default function StockList({
  market,
  searchResults,
  searchingOnline,
  selectedSymbol,
  locale,
  onSelectStock
}: StockListProps) {
  const t = useTranslations('Markets');
  const [category, setCategory] = useState<'all' | 'sharia'>('all');
  void locale;

  // Fallback to featured list if no active search query results are loaded
  const defaultList = market === 'TASI' ? TASI_UNIVERSE : NASDAQ_UNIVERSE_FALLBACK;
  
  // Featured list or live search results
  const listToFilter = searchResults !== null ? searchResults : defaultList;

  // Filter based on Sharia compliance tab
  const filteredList = listToFilter.filter((item: any) => {
    if (category === 'sharia') {
      // Treat known non-compliant tickers as filtered out (TSLA & META are non-compliant in our mock Zoya screening)
      const sym = item.symbol.toUpperCase().replace('.SR', '');
      return sym !== 'TSLA' && sym !== 'META';
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Category Tabs */}
      <div className="flex space-x-2 rtl:space-x-reverse border-b border-white/5 pb-2">
        <button
          onClick={() => setCategory('all')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
            category === 'all'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          {t('allFilter')}
        </button>
        <button
          onClick={() => setCategory('sharia')}
          className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all flex items-center space-x-1 rtl:space-x-reverse ${
            category === 'sharia'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{t('shariaSecureFilter')}</span>
        </button>
      </div>

      {/* List Header */}
      <div className="flex items-center justify-between text-xs text-gray-500 font-bold uppercase tracking-wider px-2">
        <span>{t('companyColumn')}</span>
        <span>{t('marketPriceColumn')}</span>
      </div>

      {/* Rows Container */}
      <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
        {searchingOnline ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 space-y-3">
            <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs">{t('loading')}</span>
          </div>
        ) : filteredList.length > 0 ? (
          filteredList.map((stock: any) => (
            <StockListRow
              key={stock.symbol}
              symbol={stock.symbol}
              name={stock.name}
              arName={stock.arName}
              market={market}
              locale={locale}
              isSelected={selectedSymbol === stock.symbol}
              onSelect={() => onSelectStock(stock.symbol)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-500 space-y-2">
            <AlertCircle className="w-8 h-8 text-gray-600" />
            <span className="text-sm">{t('noMatches')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
