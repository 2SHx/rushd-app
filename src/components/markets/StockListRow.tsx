'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

interface StockListRowProps {
  symbol: string;
  name: string;
  arName: string;
  market: 'TASI' | 'NASDAQ';
  locale: string;
  isSelected: boolean;
  onSelect: () => void;
}

export default function StockListRow({
  symbol,
  name,
  arName,
  market,
  locale,
  isSelected,
  onSelect
}: StockListRowProps) {
  const isAr = locale === 'ar';
  const cleanSymbol = symbol.replace('.SR', '');
  const displayName = isAr && arName ? arName : name;

  const [priceData, setPriceData] = useState<{ price: number; change: number; pct: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchQuote = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/market-data?symbol=${symbol}&market=${market}`);
        if (res.ok && active) {
          const data = await res.json();
          const hist = data.history || [];
          const prev = hist.length > 1 ? hist[hist.length - 2]?.close : (hist[0]?.close ?? data.price);
          const change = data.price - prev;
          const pct = prev > 0 ? (change / prev) * 100 : 0;
          setPriceData({ price: data.price, change, pct });
        }
      } catch (err) {
        console.error(`Failed to fetch lazy row quote for ${symbol}:`, err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchQuote();
    return () => { active = false; };
  }, [symbol, market]);

  const currency = market === 'TASI' ? (isAr ? 'ر.س' : 'SAR') : 'USD';
  const isUp = priceData && priceData.change > 0;
  const isDown = priceData && priceData.change < 0;

  return (
    <button
      onClick={onSelect}
      className={`w-full text-start flex items-center justify-between p-4 rounded-2xl border transition-all duration-300 ${
        isSelected 
          ? 'bg-emerald-500/10 border-emerald-500/20 text-white' 
          : 'bg-[#0f1420]/30 border-white/[0.03] hover:bg-white/[0.04] text-gray-300'
      }`}
    >
      <div className="flex flex-col space-y-1">
        <span className="text-sm font-bold tracking-wide font-mono text-white">{cleanSymbol}</span>
        <span className="text-xs text-gray-400 truncate max-w-[200px]">{displayName}</span>
      </div>

      <div className="flex flex-col items-end space-y-1 font-mono">
        {loading && !priceData ? (
          <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
        ) : priceData ? (
          <>
            <span className="text-sm font-bold">
              {market === 'TASI' && isAr ? (
                <span>{priceData.price.toFixed(2)} {currency}</span>
              ) : market === 'TASI' ? (
                <span>{currency} {priceData.price.toFixed(2)}</span>
              ) : (
                <span>${priceData.price.toFixed(2)}</span>
              )}
            </span>
            <div className={`flex items-center space-x-1 rtl:space-x-reverse text-xs font-semibold ${
              isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-gray-400'
            }`}>
              {isUp ? (
                <TrendingUp className="w-3.5 h-3.5" />
              ) : isDown ? (
                <TrendingDown className="w-3.5 h-3.5" />
              ) : (
                <Minus className="w-3.5 h-3.5" />
              )}
              <span>{isUp ? '+' : ''}{priceData.pct.toFixed(2)}%</span>
            </div>
          </>
        ) : (
          <span className="text-xs text-gray-500">-</span>
        )}
      </div>
    </button>
  );
}
