'use client';

import { useTranslations } from 'next-intl';
import { Sparkles, TrendingUp } from 'lucide-react';

interface RScorePanelProps {
  symbol: string;
  locale: string;
}

function getRScore(symbol: string) {
  const clean = symbol.replace('.SR', '');
  switch (clean) {
    case 'AAPL': return { score: 8.4, growth: 88, value: 72, safety: 95, momentum: 81 };
    case 'NVDA': return { score: 8.9, growth: 96, value: 58, safety: 90, momentum: 94 };
    case 'MSFT': return { score: 8.6, growth: 90, value: 68, safety: 96, momentum: 85 };
    case 'GOOGL': return { score: 8.1, growth: 84, value: 75, safety: 92, momentum: 78 };
    case 'AMZN': return { score: 7.9, growth: 82, value: 64, safety: 90, momentum: 80 };
    case 'TSLA': return { score: 5.6, growth: 72, value: 41, safety: 80, momentum: 62 };
    case '2222': return { score: 8.5, growth: 80, value: 88, safety: 99, momentum: 76 };
    case '1120': return { score: 8.2, growth: 78, value: 85, safety: 98, momentum: 72 };
    case '1180': return { score: 7.8, growth: 75, value: 80, safety: 95, momentum: 69 };
    case '7010': return { score: 7.6, growth: 72, value: 78, safety: 96, momentum: 70 };
    case '2010': return { score: 6.2, growth: 58, value: 66, safety: 90, momentum: 52 };
    case '2280': return { score: 7.4, growth: 70, value: 74, safety: 97, momentum: 68 };
    case '1211': return { score: 6.8, growth: 75, value: 58, safety: 92, momentum: 61 };
    case '4003': return { score: 8.0, growth: 85, value: 78, safety: 96, momentum: 82 };
    case '8250': return { score: 3.2, growth: 38, value: 24, safety: 85, momentum: 45 };
    case '6060': return { score: 3.5, growth: 42, value: 28, safety: 82, momentum: 51 };
    default: return { score: 6.5, growth: 65, value: 60, safety: 90, momentum: 60 };
  }
}

// Ring stroke reads the semantic CSS var directly (SVG accepts var() in inline
// style) — no literal hex, stays on the DR-12 up/noncompliant/down triad.
function scoreColor(score: number) {
  if (score >= 8) return { ring: 'var(--up)', text: 'text-up', label: 'Strong', labelAr: 'قوي' };
  if (score >= 6.5) return { ring: 'var(--noncompliant)', text: 'text-noncompliant', label: 'Moderate', labelAr: 'متوسط' };
  return { ring: 'var(--down)', text: 'text-down', label: 'Weak', labelAr: 'ضعيف' };
}

// Non-directional factor bars are decoration, not up/down/noncompliant signals —
// kept to the single accent hue at descending opacities (ui-craft: one purple accent).
const factors = [
  { key: 'safety' as const, label: 'Sharia Safety', labelAr: 'الأمان الشرعي', barClass: 'bg-accent' },
  { key: 'growth' as const, label: 'Growth', labelAr: 'النمو', barClass: 'bg-accent/80' },
  { key: 'value' as const, label: 'Value', labelAr: 'القيمة', barClass: 'bg-accent/60' },
  { key: 'momentum' as const, label: 'Momentum', labelAr: 'الزخم', barClass: 'bg-accent/40' },
];

export default function RScorePanel({ symbol, locale }: RScorePanelProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  const r = getRScore(symbol);
  const c = scoreColor(r.score);

  const circumference = 2 * Math.PI * 48;
  const dashOffset = circumference - (circumference * r.score) / 10;

  return (
    <div className="rounded-3xl overflow-hidden glass-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-extrabold text-foreground">{t('rScoreTitle')}</h3>
        </div>
        <span className="text-[9px] font-black uppercase tracking-wider bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full">
          AI Powered
        </span>
      </div>

      <div className="flex items-center gap-6 px-5 pb-5">
        {/* Arc Gauge — plain stroke, no glow/blur (ui-craft §0) */}
        <div className="relative flex items-center justify-center w-32 h-32 shrink-0">
          <svg className="w-full h-full -rotate-90 relative z-10">
            {/* Track */}
            <circle cx="64" cy="64" r="48" fill="none" stroke="var(--border-color)" strokeWidth="9" />
            {/* Progress */}
            <circle
              cx="64" cy="64" r="48"
              fill="none"
              stroke={c.ring}
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)' }}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center z-20">
            <span className={`text-3xl font-black font-mono tabular-nums leading-none ${c.text}`}>{r.score}</span>
            <span className="text-[9px] text-foreground/50 font-bold uppercase tracking-wider mt-0.5">{t('outOfTen')}</span>
          </div>
        </div>

        {/* Verdict + Factor Bars */}
        <div className="flex-1 space-y-3">
          <div className={`text-xs font-black uppercase tracking-wider ${c.text}`}>
            {isAr ? c.labelAr : c.label} • R-Score {r.score}/10
          </div>
          {factors.map(f => (
            <div key={f.key}>
              <div className="flex justify-between text-[11px] font-semibold mb-1">
                <span className="text-foreground/60">{isAr ? f.labelAr : f.label}</span>
                <span className="text-foreground font-mono tabular-nums">{r[f.key]}%</span>
              </div>
              <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
                <div
                  className={`h-full ${f.barClass} rounded-full`}
                  style={{ width: `${r[f.key]}%`, transition: 'width 1s ease-out' }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
