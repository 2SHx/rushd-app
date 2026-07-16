'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Compass, ShieldCheck, TrendingUp, Sparkles } from 'lucide-react';

interface OpportunityMatrixProps {
  symbol: string;
  locale: string;
}

type RatingValue = 'weak' | 'neutral' | 'strong';

interface MatrixDimension {
  id: string;
  labelKey: string;
  icon: any;
}

export default function OpportunityMatrix({ symbol, locale }: OpportunityMatrixProps) {
  const t = useTranslations('Markets');

  const dimensions: MatrixDimension[] = [
    { id: 'quality', labelKey: 'bizQuality', icon: ShieldCheck },
    { id: 'strength', labelKey: 'finStrength', icon: Compass },
    { id: 'valuation', labelKey: 'valRating', icon: Sparkles },
    { id: 'tailwinds', labelKey: 'tailwinds', icon: TrendingUp },
  ];

  const [ratings, setRatings] = useState<Record<string, RatingValue>>({
    quality: 'strong',
    strength: 'strong',
    valuation: 'neutral',
    tailwinds: 'strong',
  });

  const pointsMap: Record<RatingValue, number> = {
    weak: 1,
    neutral: 2,
    strong: 3,
  };

  const totalPoints = Object.values(ratings).reduce((acc, curr) => acc + pointsMap[curr], 0);

  const getAggregateStatus = () => {
    if (totalPoints >= 10) {
      return {
        label: t('strongOpportunity'),
        badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        dotClass: 'bg-emerald-500',
      };
    } else if (totalPoints >= 7) {
      return {
        label: t('neutral'),
        badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
        dotClass: 'bg-indigo-500',
      };
    } else {
      return {
        label: t('cautious'),
        badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
        dotClass: 'bg-amber-500',
      };
    }
  };

  const status = getAggregateStatus();

  const handleRatingChange = (id: string, val: RatingValue) => {
    setRatings((prev) => ({ ...prev, [id]: val }));
  };

  return (
    <div className="glass-panel rounded-3xl p-5 space-y-5 text-start">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-color)] pb-3">
        <div className="flex items-center space-x-2 rtl:space-x-reverse">
          <Sparkles className="w-5 h-5 text-accent" />
          <h3 className="font-extrabold text-sm text-foreground">{t('opportunityMatrixTitle')}</h3>
        </div>

        <div className={`flex items-center space-x-2 rtl:space-x-reverse px-3 py-1 rounded-full text-xs font-bold border ${status.badgeClass}`}>
          <span className={`w-2 h-2 rounded-full ${status.dotClass} animate-pulse`} />
          <span>{status.label}</span>
          <span className="opacity-60 text-[10px]">({totalPoints}/12)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {dimensions.map((dim) => {
          const Icon = dim.icon;
          const currentVal = ratings[dim.id];
          return (
            <div
              key={dim.id}
              className="p-3.5 rounded-2xl bg-foreground/[0.02] dark:bg-white/[0.02] border border-foreground/[0.05] dark:border-white/[0.05] space-y-2.5"
            >
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Icon className="w-4 h-4 text-accent/80" />
                <span className="text-xs font-bold text-foreground">{t(dim.labelKey)}</span>
              </div>

              {/* 3-State Segmented Control */}
              <div className="grid grid-cols-3 gap-1 bg-foreground/[0.05] dark:bg-white/[0.04] p-1 rounded-xl">
                {(['weak', 'neutral', 'strong'] as RatingValue[]).map((val) => {
                  const isActive = currentVal === val;
                  return (
                    <button
                      key={val}
                      onClick={() => handleRatingChange(dim.id, val)}
                      className={`py-1 text-[11px] font-bold rounded-lg transition-all ${
                        isActive
                          ? 'bg-accent text-white shadow-sm scale-[1.02]'
                          : 'text-foreground/50 hover:text-foreground hover:bg-foreground/[0.03]'
                      }`}
                    >
                      {t(val)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
