'use client';

import { useTranslations } from 'next-intl';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

interface StockListRowProps {
  symbol: string;
  name: string;
  arName: string;
  market: 'TASI' | 'NASDAQ';
  locale: string;
  isSelected: boolean;
  onSelect: () => void;
  priceData?: { price: number; change: number; pct: number } | null;
  loading?: boolean;
}

export default function StockListRow({
  symbol,
  name,
  arName,
  market,
  locale,
  isSelected,
  onSelect,
  priceData,
  loading = false,
}: StockListRowProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  const cleanSymbol = symbol.replace('.SR', '');
  const displayName = isAr && arName ? arName : name;

  const isUp = priceData && priceData.change > 0;
  const isDown = priceData && priceData.change < 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-start flex items-center justify-between px-4 py-3.5 rounded-2xl border transition-all duration-200 group relative overflow-hidden ${
        isSelected
          ? 'bg-emerald-500/8 border-emerald-500/25 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.15)]'
          : 'bg-transparent border-white/[0.04] hover:bg-white/[0.03] hover:border-white/[0.08]'
      }`}
    >
      {/* Selected accent bar */}
      {isSelected && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-400 rounded-r-full" />
      )}

      {/* Left: Symbol avatar + name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black font-mono shrink-0 transition-colors ${
          isSelected
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            : 'bg-white/[0.04] text-gray-400 border border-white/[0.06] group-hover:text-white'
        }`}>
          {cleanSymbol.slice(0, 4)}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-bold tracking-wide truncate transition-colors ${
            isSelected ? 'text-white' : 'text-gray-200'
          }`}>{cleanSymbol}</span>
          <span className="text-[11px] text-gray-500 truncate max-w-[140px] leading-tight">{displayName}</span>
        </div>
      </div>

      {/* Right: Price + change */}
      <div className="flex flex-col items-end gap-0.5 font-mono shrink-0">
        {loading && !priceData ? (
          <Loader2 className="w-4 h-4 text-emerald-400/50 animate-spin" />
        ) : priceData ? (
          <>
            <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-gray-200'}`}>
              {market === 'TASI'
                ? t('formatTasi', { amount: priceData.price.toFixed(2) })
                : t('formatNasdaq', { amount: priceData.price.toFixed(2) })}
            </span>
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
              isUp
                ? 'bg-emerald-500/10 text-emerald-400'
                : isDown
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-white/5 text-gray-500'
            }`}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              <span>{isUp ? '+' : ''}{priceData.pct.toFixed(2)}%</span>
            </div>
          </>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </div>
    </button>
  );
}
