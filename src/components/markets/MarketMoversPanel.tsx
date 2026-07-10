'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';
import type { TickerEntry } from '@/lib/tickers';
import MarketSparkline from './MarketSparkline';

interface ListProps {
  title: string;
  badge: string;
  stocks: TickerEntry[];
  isAr: boolean;
  tone: 'up' | 'down';
  onSelectStock: (symbol: string) => void;
}

function MoversList({ title, badge, stocks, isAr, tone, onSelectStock }: ListProps) {
  const toneClass = tone === 'up' ? 'text-up' : 'text-down';
  const Icon = tone === 'up' ? TrendingUp : TrendingDown;

  return (
    <div className="glass-panel rounded-3xl p-5">
      <div className="flex items-center justify-between mb-4 border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-${tone === 'up' ? 'up' : 'down'}/10 ${toneClass}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wide ${toneClass}`}>{title}</span>
        </div>
        <span className="text-[10px] text-foreground/40 font-mono uppercase">{badge}</span>
      </div>

      <div className="space-y-1">
        {stocks.map((stock, idx) => (
          <button
            key={stock.symbol}
            type="button"
            onClick={() => onSelectStock(stock.symbol)}
            className="w-full flex items-center justify-between p-2.5 rounded-2xl hover:bg-foreground/[0.03] transition-colors text-start"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xs font-mono tabular-nums text-foreground/40 w-4 shrink-0">#{idx + 1}</span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground truncate">{stock.symbol}</p>
                <p className="text-[10px] text-foreground/50 truncate max-w-[120px]">
                  {isAr ? stock.arName : stock.name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="hidden sm:block">
                <MarketSparkline pct={stock.pct} />
              </div>
              <div className="text-end">
                <p className={`text-xs font-bold font-mono tabular-nums ${toneClass}`}>
                  {stock.pct >= 0 ? '+' : ''}
                  {stock.pct.toFixed(2)}%
                </p>
                <p className="text-[10px] text-foreground/50 font-mono tabular-nums mt-0.5">${stock.price.toFixed(2)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  top5: TickerEntry[];
  bot5: TickerEntry[];
  isAr: boolean;
  onSelectStock: (symbol: string) => void;
}

export default function MarketMoversPanel({ top5, bot5, isAr, onSelectStock }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <MoversList
        title={isAr ? 'أعلى 5 ارتفاعاً اليوم' : 'Top Gainers'}
        badge="GAINERS"
        stocks={top5}
        isAr={isAr}
        tone="up"
        onSelectStock={onSelectStock}
      />
      <MoversList
        title={isAr ? 'أكبر 5 خسارة اليوم' : 'Top Losers'}
        badge="LOSERS"
        stocks={bot5}
        isAr={isAr}
        tone="down"
        onSelectStock={onSelectStock}
      />
    </div>
  );
}
