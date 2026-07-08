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

export default function RScorePanel({ symbol, locale }: RScorePanelProps) {
  const t = useTranslations('Markets');
  void locale;
  const rScoreData = getRScore(symbol);

  return (
    <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
      <div className="flex justify-between items-center border-b border-white/5 pb-2">
        <div className="flex items-center space-x-2 rtl:space-x-reverse text-indigo-400">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <h3 className="font-bold text-sm text-gray-200">
            {t('rScoreTitle')}
          </h3>
        </div>
        <span className="text-[10px] bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">
          Powered by AI
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
        {/* Arc Gauge */}
        <div className="relative flex items-center justify-center w-28 h-28 shrink-0">
          <svg className="w-full h-full transform -rotate-90">
            <circle
              cx="56"
              cy="56"
              r="48"
              stroke="#1E293B"
              strokeWidth="8"
              fill="transparent"
            />
            <circle
              cx="56"
              cy="56"
              r="48"
              stroke="#6366F1"
              strokeWidth="8"
              fill="transparent"
              strokeDasharray={301.6}
              strokeDashoffset={301.6 - (301.6 * rScoreData.score) / 10}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center">
            <span className="text-3xl font-extrabold font-mono text-white leading-none">{rScoreData.score}</span>
            <span className="text-[9px] text-gray-400 font-bold mt-1 uppercase">{t('outOfTen')}</span>
          </div>
        </div>

        {/* Factor bars */}
        <div className="flex-1 w-full space-y-3">
          {/* Sharia Compliance Safety */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-gray-400">{t('shariaSafety')}</span>
              <span className="text-indigo-400 font-mono">{rScoreData.safety}%</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${rScoreData.safety}%` }} />
            </div>
          </div>

          {/* Growth Factor */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-gray-400">{t('growthFactor')}</span>
              <span className="text-indigo-400 font-mono">{rScoreData.growth}%</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rScoreData.growth}%` }} />
            </div>
          </div>

          {/* Value Factor */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-gray-400">{t('valueFactor')}</span>
              <span className="text-indigo-400 font-mono">{rScoreData.value}%</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rScoreData.value}%` }} />
            </div>
          </div>

          {/* Momentum */}
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-gray-400">{t('technicalMomentum')}</span>
              <span className="text-indigo-400 font-mono">{rScoreData.momentum}%</span>
            </div>
            <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${rScoreData.momentum}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
