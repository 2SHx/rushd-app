'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Sparkles, Loader2, Trophy, HelpCircle, ShieldAlert, ShieldCheck } from 'lucide-react';

interface AssistantPanelProps {
  symbol: string;
  market: 'TASI' | 'NASDAQ';
  currentPrice: number;
  locale: string;
}

export default function AssistantPanel({ symbol, market, currentPrice, locale }: AssistantPanelProps) {
  const t = useTranslations('Markets');
  const isAr = locale === 'ar';
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerAnalysis = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: symbol.replace('.SR', ''), market, currentPrice })
      });
      if (!res.ok) {
        throw new Error('Analysis request failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error('AI Analyst error:', err);
      setError(t('searchError'));
    } finally {
      setLoading(false);
    }
  };

  const cleanSymbol = symbol.replace('.SR', '');

  return (
    <div className="bg-[#0F1420]/75 backdrop-blur-xl border border-white/[0.04] rounded-3xl p-5 space-y-4 text-start">
      {/* Mentor Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 rtl:space-x-reverse">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-white">{t('mentorAdvisor')}</h3>
            <p className="text-[10px] text-gray-500">{t('aiAdvisorDesc')}</p>
          </div>
        </div>
        
        {!loading && !result && (
          <button
            onClick={triggerAnalysis}
            className="flex items-center space-x-1.5 rtl:space-x-reverse bg-emerald-500 hover:bg-emerald-600 transition-colors text-black text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isAr ? 'استشر المرشد' : 'Consult Mentor'}</span>
          </button>
        )}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-6 text-gray-500 space-y-2">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          <span className="text-xs">{t('loading')}</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-rose-400 bg-rose-500/5 border border-rose-500/10 p-3 rounded-2xl">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4 mt-2">
          {/* Action & Shield Row */}
          <div className="flex justify-between items-center bg-black/20 p-3 rounded-2xl border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase">{isAr ? 'القرار المقترح' : 'Quest Action'}</span>
              <span className={`text-base font-extrabold font-sans mt-0.5 ${
                result.action === 'BUY' ? 'text-emerald-400' :
                result.action === 'SELL' ? 'text-rose-400' : 'text-gray-400'
              }`}>
                {result.action}
              </span>
            </div>
            
            <div className="flex items-center space-x-2 rtl:space-x-reverse bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
              {result.complianceTag === 'HALAL' || result.complianceTag === 'EDUCATIONAL_ONLY' ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-amber-500" />
              )}
              <span className={`text-xs font-bold ${
                result.complianceTag === 'HALAL' || result.complianceTag === 'EDUCATIONAL_ONLY'
                  ? 'text-emerald-300'
                  : 'text-amber-400'
              }`}>
                {result.complianceTag}
              </span>
            </div>
          </div>

          {/* Mentor Rationale Card */}
          <div className="space-y-2.5">
            <div className="flex items-start gap-2.5">
              <div className="mt-1 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase">{isAr ? 'توجيه المرشد (عربي)' : 'Mentor Guidance (AR)'}</span>
                <p className="text-xs text-gray-300 leading-relaxed font-sans">{result.reasoningArabic}</p>
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="mt-1 w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase">{isAr ? 'توجيه المرشد (إنجليزي)' : 'Mentor Guidance (EN)'}</span>
                <p className="text-xs text-gray-300 leading-relaxed font-sans">{result.reasoningEnglish}</p>
              </div>
            </div>
          </div>

          {/* Educational Concept */}
          {result.educationalConcept && (
            <div className="bg-emerald-500/5 border border-emerald-500/10 p-3.5 rounded-2xl space-y-1">
              <div className="flex items-center space-x-1.5 rtl:space-x-reverse text-emerald-400 text-xs font-bold">
                <HelpCircle className="w-3.5 h-3.5" />
                <span>{isAr ? 'المفهوم التعليمي' : 'Quest Wisdom Concept'}</span>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed font-sans">{result.educationalConcept}</p>
            </div>
          )}

          {/* Gamified Reward */}
          {result.xpReward && (
            <div className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/10 p-3 rounded-2xl">
              <div className="flex items-center space-x-2 rtl:space-x-reverse">
                <Trophy className="w-4 h-4 text-yellow-400" />
                <span className="text-xs font-bold text-yellow-300">{t('questComplete')}</span>
              </div>
              <span className="text-xs font-extrabold text-yellow-400 font-mono">+{result.xpReward} XP</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
