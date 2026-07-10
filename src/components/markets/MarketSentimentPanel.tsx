'use client';

import { motion } from 'framer-motion';
import type { FearGreed, SectorGroup } from './marketOverviewUtils';
import { fgInfo } from './marketOverviewUtils';

interface GaugeProps {
  fg: FearGreed;
  isAr: boolean;
}

function FearGreedGauge({ fg, isAr }: GaugeProps) {
  const info = fgInfo(fg.score);
  const ARC_LEN = 251.2;
  const fillLen = (fg.score / 100) * ARC_LEN;
  const angle = 180 - fg.score * 1.8;
  const rad = (angle * Math.PI) / 180;
  const nx = 100 + 62 * Math.cos(rad);
  const ny = 100 - 62 * Math.sin(rad);

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 115" className="w-full max-w-[220px]">
        <defs>
          <linearGradient id="fg-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--down)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--up)' }} />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#fg-grad)" strokeWidth="12" strokeLinecap="round" opacity="0.15" />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#fg-grad)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${fillLen} ${ARC_LEN}`}
        />
        <line x1="100" y1="100" x2={nx.toFixed(1)} y2={ny.toFixed(1)} className="stroke-foreground/70" strokeWidth="2" strokeLinecap="round" />
        <circle cx="100" cy="100" r="4" className="fill-foreground/70" />
        <text x="100" y="80" textAnchor="middle" className="fill-foreground font-mono" fontSize="22" fontWeight="700">
          {fg.score}
        </text>
        <text x="100" y="95" textAnchor="middle" className={info.textClass.replace('text-', 'fill-')} fontSize="9" fontWeight="700" letterSpacing="0.5">
          {isAr ? info.labelAr : info.label.toUpperCase()}
        </text>
      </svg>
      <div className="flex items-center gap-2 text-[10px] text-foreground/50 -mt-1">
        <span>{isAr ? 'الإغلاق السابق:' : 'Prev close:'}</span>
        <span className="font-mono tabular-nums text-foreground/70">{fg.prevScore}</span>
        <span className={`flex items-center gap-0.5 ${fg.score >= fg.prevScore ? 'text-up' : 'text-down'}`}>
          {fg.score >= fg.prevScore ? '▲' : '▼'} {Math.abs(fg.score - fg.prevScore)}
        </span>
      </div>
    </div>
  );
}

interface Props {
  fg: FearGreed | null;
  sectors: SectorGroup[];
  isAr: boolean;
}

export default function MarketSentimentPanel({ fg, sectors, isAr }: Props) {
  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-3xl p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60 mb-4">
          {isAr ? 'مؤشر الخوف والجشع' : 'Sentiment Gauge'}
        </p>
        {fg ? (
          <FearGreedGauge fg={fg} isAr={isAr} />
        ) : (
          <div className="h-40 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="w-6 h-6 border-2 border-foreground/10 border-t-accent rounded-full animate-spin" />
              <span className="text-[10px] text-foreground/40 uppercase tracking-wide">{isAr ? 'جارٍ المزامنة' : 'Syncing'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Daily Sector Strength removed in favor of Screener Heatmap */}
    </div>
  );
}
