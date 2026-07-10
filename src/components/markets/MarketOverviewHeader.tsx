'use client';

import { Activity, Clock, TrendingUp, Sparkles } from 'lucide-react';
import type { FearGreed } from './marketOverviewUtils';
import { fgInfo } from './marketOverviewUtils';

interface Props {
  isAr: boolean;
  locale: string;
  market: 'TASI' | 'NASDAQ';
  avgPct: number;
  upCount: number;
  dnCount: number;
  upPct: number;
  fg: FearGreed | null;
}

// Title strip + the four-card index summary. The numbers lead; everything
// else (labels, live pill) recedes (ui-craft: "numbers are the hero").
export default function MarketOverviewHeader({ isAr, locale, market, avgPct, upCount, dnCount, upPct, fg }: Props) {
  return (
    <>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {isAr ? 'نظرة عامة على السوق' : 'Market Overview'}
          </h2>
          <p className="text-xs text-foreground/50 mt-1 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">
              {new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="text-foreground/15">|</span>
            <Activity className="w-3.5 h-3.5 text-up" />
            <span>{isAr ? 'عضوية معتمدة شرعياً' : 'Sharia-Compliant Screened Universe'}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 glass-panel px-3.5 py-2 rounded-2xl">
          <span className="relative w-1.5 h-1.5 rounded-full bg-up shrink-0" />
          <span className="text-[10px] font-bold tracking-widest text-up uppercase">
            {isAr ? 'اتصال مباشر' : 'Live'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">
            {market === 'NASDAQ' ? 'NASDAQ Composite' : 'TASI'}
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-xl font-bold font-mono tabular-nums ${avgPct >= 0 ? 'text-up' : 'text-down'}`}>
              {avgPct >= 0 ? '+' : ''}
              {avgPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-foreground/50 mt-2 border-t border-[var(--border-color)] pt-2">
            <span>{isAr ? 'متوسط أداء اليوم' : "Today's average"}</span>
            <TrendingUp className="w-3 h-3 text-up" />
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-2">
            {isAr ? 'مؤشر الصعود والهبوط' : 'Advance / Decline'}
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-up">{upPct}% {isAr ? 'صعود' : 'up'}</span>
              <span className="text-down">{100 - upPct}% {isAr ? 'هبوط' : 'down'}</span>
            </div>
            <div className="h-1.5 w-full bg-foreground/5 rounded-full overflow-hidden flex">
              <div className="h-full bg-up" style={{ width: `${upPct}%` }} />
              <div className="h-full bg-down" style={{ width: `${100 - upPct}%` }} />
            </div>
            <div className="flex justify-between text-[10px] text-foreground/50 pt-0.5 font-mono tabular-nums">
              <span>↑ {upCount}</span>
              <span>↓ {dnCount}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-1">
            {isAr ? 'الخوف والجشع' : 'Sentiment'}
          </p>
          {fg ? (
            <div className="flex items-center justify-between mt-1">
              <div>
                <p className={`text-xl font-bold font-mono tabular-nums ${fgInfo(fg.score).textClass}`}>{fg.score}</p>
                <p className={`text-[10px] font-semibold ${fgInfo(fg.score).textClass}`}>
                  {isAr ? fgInfo(fg.score).labelAr : fgInfo(fg.score).label.toUpperCase()}
                </p>
              </div>
              <Sparkles className={`w-4 h-4 ${fgInfo(fg.score).textClass}`} />
            </div>
          ) : (
            <div className="h-8 animate-pulse bg-foreground/5 rounded-lg mt-2" />
          )}
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50 mb-2">
            {isAr ? 'الزخم العام' : 'Consensus Momentum'}
          </p>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-up/10 text-up">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className={`text-base font-bold font-mono tabular-nums ${avgPct >= 0 ? 'text-up' : 'text-down'}`}>
                {avgPct >= 0 ? '+' : ''}
                {avgPct.toFixed(2)}%
              </p>
              <p className="text-[10px] text-foreground/50 uppercase">{isAr ? 'الاتجاه العام' : 'Overall trend'}</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
