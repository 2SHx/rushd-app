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
      className={`w-full text-start flex items-center justify-between px-4 py-3 rounded-xl border transition-colors duration-150 group relative ${
        isSelected
          ? 'bg-accent/[0.06] border-accent/25'
          : 'bg-transparent border-transparent hover:bg-foreground/[0.03] hover:border-[var(--border-color)]'
      }`}
    >
      {/* Selected accent bar */}
      {isSelected && (
        <span className="absolute start-0 top-2 bottom-2 w-0.5 bg-accent rounded-e-full" />
      )}

      {/* Left: Symbol avatar + name */}
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono shrink-0 transition-colors ${
          isSelected
            ? 'bg-accent/15 text-accent border border-accent/25'
            : 'bg-foreground/[0.04] text-foreground/50 border border-[var(--border-color)] group-hover:text-foreground'
        }`}>
          {cleanSymbol.slice(0, 4)}
        </div>
        <div className="flex flex-col min-w-0">
          <span className={`text-sm font-semibold tracking-wide truncate transition-colors ${
            isSelected ? 'text-foreground' : 'text-foreground/80'
          }`}>{cleanSymbol}</span>
          <span className="text-[11px] text-foreground/50 truncate max-w-[140px] leading-tight">{displayName}</span>
        </div>
      </div>

      {/* Right: Price + change */}
      <div className="flex flex-col items-end gap-0.5 font-mono tabular-nums shrink-0">
        {loading && !priceData ? (
          <Loader2 className="w-4 h-4 text-accent/50 animate-spin" />
        ) : priceData ? (
          <>
            <span className={`text-sm font-semibold ${isSelected ? 'text-foreground' : 'text-foreground/80'}`}>
              {market === 'TASI'
                ? t('formatTasi', { amount: priceData.price.toFixed(2) })
                : t('formatNasdaq', { amount: priceData.price.toFixed(2) })}
            </span>
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
              isUp
                ? 'bg-up/10 text-up'
                : isDown
                ? 'bg-down/10 text-down'
                : 'bg-foreground/5 text-foreground/50'
            }`}>
              {isUp ? <TrendingUp className="w-3 h-3" /> : isDown ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              <span>{isUp ? '+' : ''}{priceData.pct.toFixed(2)}%</span>
            </div>
          </>
        ) : (
          <span className="text-xs text-foreground/40">—</span>
        )}
      </div>
    </button>
  );
}
