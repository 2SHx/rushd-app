'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck, AlertCircle } from 'lucide-react';
import { TASI_UNIVERSE, NASDAQ_UNIVERSE_FALLBACK } from '@/lib/stockUniverse';
import StockListRow from './StockListRow';

interface StockListProps {
  market: 'TASI' | 'NASDAQ';
  searchResults: any[] | null;
  searchingOnline: boolean;
  selectedSymbol: string | null;
  locale: string;
  onSelectStock: (symbol: string) => void;
  quotes: Record<string, { price: number; change: number; pct: number }>;
  loadingQuotes: boolean;
}

export default function StockList({
  market,
  searchResults,
  searchingOnline,
  selectedSymbol,
  locale,
  onSelectStock,
  quotes,
  loadingQuotes,
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
      <div className="flex gap-2 border-b border-[var(--border-color)] pb-2">
        <button
          onClick={() => setCategory('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            category === 'all'
              ? 'bg-accent/10 text-accent border border-accent/20'
              : 'text-foreground/50 hover:text-foreground'
          }`}
        >
          {t('allFilter')}
        </button>
        <button
          onClick={() => setCategory('sharia')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1 ${
            category === 'sharia'
              ? 'bg-up/10 text-up border border-up/20'
              : 'text-foreground/50 hover:text-foreground'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>{t('shariaSecureFilter')}</span>
        </button>
      </div>

      {/* List Header */}
      <div className="flex items-center justify-between text-[11px] text-foreground/50 font-semibold uppercase tracking-wider px-2">
        <span>{t('companyColumn')}</span>
        <span>{t('marketPriceColumn')}</span>
      </div>

      {/* Rows Container */}
      <div className="space-y-1 max-h-[500px] overflow-y-auto pe-1 custom-scrollbar">
        {searchingOnline ? (
          <div className="flex flex-col items-center justify-center py-12 text-foreground/50 space-y-3">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
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
              priceData={quotes[stock.symbol]}
              loading={loadingQuotes}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center text-foreground/50 space-y-2">
            <AlertCircle className="w-8 h-8 text-foreground/30" />
            <span className="text-sm">{t('noMatches')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
