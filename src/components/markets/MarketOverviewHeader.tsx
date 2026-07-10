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
  // Fear & Greed gauge calculations
  const score = fg?.score ?? 50;
  const ARC_LEN = 125.66;
  const fillLen = (score / 100) * ARC_LEN;
  const angle = 180 - score * 1.8;
  const rad = (angle * Math.PI) / 180;
  const nx = 50 + 30 * Math.cos(rad);
  const ny = 50 - 30 * Math.sin(rad);

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

      <div className="flex overflow-x-auto gap-3.5 no-scrollbar pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-4">
        {/* Card 1: Index Performance */}
        <div className="glass-panel rounded-2xl p-3 shrink-0 w-[180px] md:w-auto flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
              {market === 'NASDAQ' ? 'NASDAQ Composite' : 'TASI'}
            </span>
            <Activity className="w-3.5 h-3.5 text-foreground/30" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={`text-lg font-extrabold font-mono tabular-nums leading-none ${avgPct >= 0 ? 'text-up' : 'text-down'}`}>
              {avgPct >= 0 ? '+' : ''}
              {avgPct.toFixed(2)}%
            </span>
          </div>
          <p className="text-[9px] text-foreground/40 mt-1.5 font-medium">
            {isAr ? 'متوسط أداء اليوم' : "Today's average"}
          </p>
        </div>

        {/* Card 2: Advance / Decline */}
        <div className="glass-panel rounded-2xl p-3 shrink-0 w-[200px] md:w-auto flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
              {isAr ? 'مؤشر الصعود والهبوط' : 'Advance / Decline'}
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-foreground/30" />
          </div>
          
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-up font-mono tabular-nums">↑ {upCount}</span>
            <div className="h-1 flex-1 bg-foreground/5 rounded-full overflow-hidden flex min-w-[50px]">
              <div className="h-full bg-up" style={{ width: `${upPct}%` }} />
              <div className="h-full bg-down" style={{ width: `${100 - upPct}%` }} />
            </div>
            <span className="text-xs font-bold text-down font-mono tabular-nums">↓ {dnCount}</span>
          </div>

          <p className="text-[9px] text-foreground/40 mt-1.5 font-medium flex justify-between">
            <span>{upPct}% {isAr ? 'صعود' : 'up'}</span>
            <span>{100 - upPct}% {isAr ? 'هبوط' : 'down'}</span>
          </p>
        </div>

        {/* Card 3: Sentiment (Fear Index) */}
        <div className="glass-panel rounded-2xl p-3 shrink-0 w-[200px] md:w-auto flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
              {isAr ? 'مؤشر الخوف' : 'Fear Index'}
            </span>
            <Sparkles className="w-3.5 h-3.5 text-foreground/30" />
          </div>
          
          {fg ? (
            <div className="mt-2 flex items-center justify-between gap-1">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-lg font-extrabold font-mono tabular-nums leading-none ${fgInfo(fg.score).textClass}`}>
                    {fg.score}
                  </span>
                  <span className={`text-[9px] font-semibold leading-none ${fgInfo(fg.score).textClass}`}>
                    {isAr ? fgInfo(fg.score).labelAr : fgInfo(fg.score).label.toUpperCase()}
                  </span>
                </div>
                <p className="text-[9px] text-foreground/40 mt-1 font-medium">
                  {isAr ? 'مؤشر الخوف والجشع' : 'Fear & Greed Index'}
                </p>
              </div>

              {/* Mini SVG Gauge */}
              <svg viewBox="0 0 100 60" className="w-14 h-9 shrink-0 overflow-visible self-center">
                <defs>
                  <linearGradient id="fg-grad-mini" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" style={{ stopColor: 'var(--down)' }} />
                    <stop offset="100%" style={{ stopColor: 'var(--up)' }} />
                  </linearGradient>
                </defs>
                <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="url(#fg-grad-mini)" strokeWidth="6" strokeLinecap="round" opacity="0.15" />
                <path
                  d="M 10 50 A 40 40 0 0 1 90 50"
                  fill="none"
                  stroke="url(#fg-grad-mini)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${fillLen} ${ARC_LEN}`}
                />
                <line x1="50" y1="50" x2={nx.toFixed(1)} y2={ny.toFixed(1)} className="stroke-foreground/70" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="50" cy="50" r="3.5" className="fill-foreground/70" />
              </svg>
            </div>
          ) : (
            <div className="h-10 animate-pulse bg-foreground/5 rounded-lg mt-2" />
          )}
        </div>

        {/* Card 4: Consensus Momentum */}
        <div className="glass-panel rounded-2xl p-3 shrink-0 w-[180px] md:w-auto flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/50">
              {isAr ? 'الزخم العام' : 'Consensus Momentum'}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full ${avgPct >= 0 ? 'bg-up' : 'bg-down'} animate-pulse`} />
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded-md ${
              avgPct >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
            }`}>
              {avgPct >= 0 ? (isAr ? 'صعودي' : 'BULLISH') : (isAr ? 'نزولي' : 'BEARISH')}
            </span>
            <span className={`text-sm font-bold font-mono tabular-nums ${avgPct >= 0 ? 'text-up' : 'text-down'}`}>
              {avgPct >= 0 ? '+' : ''}{avgPct.toFixed(2)}%
            </span>
          </div>

          <p className="text-[9px] text-foreground/40 mt-1.5 font-medium">
            {isAr ? 'اتجاه السوق العام' : 'Consensus Market Trend'}
          </p>
        </div>
      </div>
    </>
  );
}
